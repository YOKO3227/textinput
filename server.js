require('dotenv').config();
const express = require('express');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fetch = require('node-fetch');
const path = require('path');
const { performance } = require('perf_hooks');

const app = express();
const PORT = process.env.PORT || 3000;

// 환경 변수 또는 기본값 설정
const BASE_URL = process.env.BASE_URL || 'https://o.nfarmer.uk';
const DEBUG = process.env.DEBUG === 'true' || false;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

/**
 * 호감도 값 포맷팅
 */
function formatAffectionValue(value, max, format) {
  switch (format) {
    case 'fraction':
      return `${value}/${max}`;
    case 'percent':
      return `${Math.round((value / max) * 100)}%`;
    default:
      return value.toString();
  }
}

/**
 * 둥근 사각형 그리기
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * 둥근 이미지 그리기
 */
function drawRoundedImage(ctx, image, x, y, width, height, radius) {
  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.clip();
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
}

/**
 * 에러 이미지 생성
 */
function createErrorImage(message) {
  try {
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');
    
    // 배경
    ctx.fillStyle = '#C5C5C5';
    ctx.fillRect(0, 0, 800, 600);
    
    // 에러 텍스트
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Error', 400, 250);
    
    ctx.font = '24px Arial';
    const maxWidth = 700;
    const words = (message || 'Unknown error').split(' ');
    let line = '';
    let y = 320;
    
    words.forEach(word => {
      const testLine = line + (line ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, 400, y);
        line = word;
        y += 30;
      } else {
        line = testLine;
      }
    });
    if (line) {
      ctx.fillText(line, 400, y);
    }
    
    // WebP 변환 시도, 실패하면 PNG로 fallback
    try {
      return canvas.toBuffer('image/webp', { quality: 1 });
    } catch (webpError) {
      console.error('[에러 이미지] WebP 변환 실패, PNG로 fallback:', webpError.message);
      return canvas.toBuffer('image/png');
    }
  } catch (error) {
    console.error('[에러 이미지] 생성 실패:', error.message);
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#C5C5C5';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Error', 400, 300);
    return canvas.toBuffer('image/png');
  }
}

/**
 * 호감도 창 렌더링
 */
async function renderAffectionWindow(config, value, imageBuffer = null) {
  const startTime = performance.now();
  const timings = {};
  
  try {
    // Canvas 크기 설정
    const canvasStart = performance.now();
    const containerWidth = config.container?.layout?.width || 400;
    const containerHeight = config.container?.layout?.height || 200;
    const padding = config.container?.styles?.padding || 15;
    
    const canvas = createCanvas(containerWidth, containerHeight);
    const ctx = canvas.getContext('2d');
    timings.canvasCreate = performance.now() - canvasStart;
    
    // 배경 그리기
    const bgStart = performance.now();
    const bgColor = config.container?.styles?.backgroundColor || '#f0f0f0';
    const borderWidth = config.container?.styles?.borderWidth || 2;
    const borderColor = config.container?.styles?.borderColor || '#333';
    const borderRadius = config.container?.styles?.borderRadius || 10;
    
    ctx.fillStyle = bgColor;
    drawRoundedRect(ctx, 0, 0, containerWidth, containerHeight, borderRadius);
    ctx.fill();
    
    // 테두리 그리기
    if (borderWidth > 0) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      drawRoundedRect(ctx, borderWidth / 2, borderWidth / 2, 
                     containerWidth - borderWidth, containerHeight - borderWidth, 
                     borderRadius - borderWidth / 2);
      ctx.stroke();
    }
    timings.background = performance.now() - bgStart;
    
    // 이미지 로드 및 그리기
    if (config.imageUrl) {
      try {
        const imgLoadStart = performance.now();
        
        // 이미지 버퍼가 있으면 사용, 없으면 URL에서 로드
        let image;
        if (imageBuffer) {
          // 이미 다운로드된 버퍼 사용
          image = await loadImage(imageBuffer);
          timings.imageLoad = performance.now() - imgLoadStart;
          console.log(`[이미지] 파싱 완료: ${timings.imageLoad.toFixed(2)}ms`);
        } else {
          // URL에서 직접 로드 (fallback)
          image = await loadImage(config.imageUrl);
          timings.imageLoad = performance.now() - imgLoadStart;
        }
        
        const imgDrawStart = performance.now();
        const imgConfig = config.characterImage || {};
        const imgLayout = imgConfig.layout || {};
        const imgStyles = imgConfig.styles || {};
        
        const imgX = imgLayout.x || 10;
        const imgY = imgLayout.y || 50;
        const imgWidth = imgLayout.width || 100;
        const imgHeight = imgLayout.height || 100;
        const imgRadius = imgStyles.borderRadius || 50;
        const imgBorderWidth = imgStyles.borderWidth || 2;
        const imgBorderColor = imgStyles.borderColor || '#cccccc';
        
        // 이미지 그리기 (둥근 모서리)
        drawRoundedImage(ctx, image, imgX, imgY, imgWidth, imgHeight, imgRadius);
        
        // 이미지 테두리 그리기
        if (imgBorderWidth > 0) {
          ctx.strokeStyle = imgBorderColor;
          ctx.lineWidth = imgBorderWidth;
          drawRoundedRect(ctx, imgX, imgY, imgWidth, imgHeight, imgRadius);
          ctx.stroke();
        }
        timings.imageDraw = performance.now() - imgDrawStart;
      } catch (imgError) {
        console.error('[이미지] 로드 실패:', imgError.message);
        // 이미지 로드 실패해도 계속 진행
      }
    }
    
    // 캐릭터 이름 그리기
    const nameStart = performance.now();
    const characterNameText = config.characterName || ''; // 최상위 문자열
    const nameConfig = config.characterNameStyle || {}; // 스타일 객체
    const nameLayout = nameConfig.layout || {};
    const nameStyles = nameConfig.styles || {};
    
    // characterName이 문자열인지 확인
    const nameText = typeof characterNameText === 'string' ? characterNameText : '';
    
    if (nameText) {
      ctx.save();
      ctx.font = `${nameStyles.fontWeight || 'bold'} ${nameStyles.fontSize || 20}px "Noto Sans CJK KR", "DejaVu Sans", "Liberation Sans", sans-serif`;
      ctx.fillStyle = nameStyles.color || '#000000';
      ctx.textAlign = nameStyles.textAlign || 'left';
      ctx.textBaseline = 'top';
      
      const nameX = nameLayout.x || 10;
      const nameY = nameLayout.y || 10;
      
      ctx.fillText(nameText, nameX, nameY);
      ctx.restore();
    }
    timings.characterName = performance.now() - nameStart;
    
    // 호감도 수치 그리기
    const valueStart = performance.now();
    const valueConfig = config.affectionValue || {};
    const valueLayout = valueConfig.layout || {};
    const valueStyles = valueConfig.styles || {};
    const valueFormat = valueConfig.format || 'number';
    const maxAffection = config.maxAffection || 100;
    
    ctx.save();
    ctx.font = `${valueStyles.fontWeight || 'normal'} ${valueStyles.fontSize || 18}px "Noto Sans CJK KR", "DejaVu Sans", "Liberation Sans", sans-serif`;
    ctx.fillStyle = valueStyles.color || '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    const valueX = valueLayout.x || 200;
    const valueY = valueLayout.y || 100;
    const valueText = formatAffectionValue(value, maxAffection, valueFormat);
    
    ctx.fillText(valueText, valueX, valueY);
    ctx.restore();
    timings.affectionValue = performance.now() - valueStart;
    
    // 호감도 바 그리기
    const barStart = performance.now();
    const barConfig = config.affectionBar || {};
    const barLayout = barConfig.layout || {};
    const barStyles = barConfig.styles || {};
    
    const barX = barLayout.x || 200;
    const barY = barLayout.y || 120;
    const barWidth = barLayout.width || 180;
    const barHeight = barLayout.height || 20;
    const barRadius = barStyles.borderRadius || 10;
    const barBgColor = barStyles.backgroundColor || '#e0e0e0';
    const barFillColor = barStyles.fillColor || '#4CAF50';
    
    // 배경 바 그리기
    ctx.fillStyle = barBgColor;
    drawRoundedRect(ctx, barX, barY, barWidth, barHeight, barRadius);
    ctx.fill();
    
    // 채움 바 그리기
    const fillPercent = Math.min(100, Math.max(0, (value / maxAffection) * 100));
    const fillWidth = (barWidth * fillPercent) / 100;
    
    if (fillWidth > 0) {
      ctx.fillStyle = barFillColor;
      drawRoundedRect(ctx, barX, barY, fillWidth, barHeight, barRadius);
      ctx.fill();
    }
    timings.affectionBar = performance.now() - barStart;
    
    const renderTime = performance.now() - startTime;
    timings.total = renderTime;
    
    // 성능 로그 출력
    console.log('[성능] 렌더링 시간:');
    if (timings.canvasCreate) console.log(`  - Canvas 생성: ${timings.canvasCreate.toFixed(2)}ms`);
    if (timings.background) console.log(`  - 배경 그리기: ${timings.background.toFixed(2)}ms`);
    if (timings.imageLoad) console.log(`  - 이미지 로드: ${timings.imageLoad.toFixed(2)}ms`);
    if (timings.imageDraw) console.log(`  - 이미지 그리기: ${timings.imageDraw.toFixed(2)}ms`);
    if (timings.characterName) console.log(`  - 캐릭터 이름: ${timings.characterName.toFixed(2)}ms`);
    if (timings.affectionValue) console.log(`  - 호감도 수치: ${timings.affectionValue.toFixed(2)}ms`);
    if (timings.affectionBar) console.log(`  - 호감도 바: ${timings.affectionBar.toFixed(2)}ms`);
    console.log(`  - 총 렌더링 시간: ${timings.total.toFixed(2)}ms`);
    
    return canvas;
  } catch (error) {
    console.error('[렌더링] 오류:', error.message);
    throw error;
  }
}

/**
 * 메인 라우트: /{버킷}/{이름}.json?Value={호감도}
 */
app.get('/:bucket/:name.json', async (req, res) => {
  const requestStart = performance.now();
  const timings = {};
  
  try {
    const bucket = req.params.bucket;
    const name = req.params.name;
    const value = parseInt(req.query.Value) || 0;
    
    console.log(`[요청] 버킷: ${bucket}, 이름: ${name}, 호감도: ${value}`);
    
    // JSON 파일 URL 생성
    const jsonUrl = `${BASE_URL}/${bucket}/${name}.json`;
    
    // JSON과 이미지를 병렬로 가져오기 (JSON 먼저 가져와서 imageUrl 확인)
    const fetchStart = performance.now();
    console.log(`[JSON] 로드 시작: ${jsonUrl}`);
    
    const jsonRes = await fetch(jsonUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    if (!jsonRes.ok) {
      throw new Error(`JSON 파일을 가져올 수 없습니다: ${jsonUrl} (${jsonRes.status})`);
    }
    
    const config = await jsonRes.json();
    timings.jsonLoad = performance.now() - fetchStart;
    const jsonSize = JSON.stringify(config).length;
    console.log(`[JSON] 로드 완료: ${timings.jsonLoad.toFixed(2)}ms (크기: ${jsonSize} bytes)`);
    
    // 이미지 URL이 있으면 이미지도 미리 가져오기
    let imageBuffer = null;
    if (config.imageUrl) {
      const imgFetchStart = performance.now();
      console.log(`[이미지] 다운로드 시작: ${config.imageUrl}`);
      
      try {
        const imgRes = await fetch(config.imageUrl, {
          headers: {
            'Accept': 'image/*',
            'User-Agent': 'Mozilla/5.0'
          }
        });
        
        if (!imgRes.ok) {
          throw new Error(`이미지를 가져올 수 없습니다: ${config.imageUrl} (${imgRes.status})`);
        }
        imageBuffer = Buffer.from(await imgRes.arrayBuffer());
        timings.imageFetch = performance.now() - imgFetchStart;
        console.log(`[이미지] 다운로드 완료: ${timings.imageFetch.toFixed(2)}ms (크기: ${(imageBuffer.length / 1024).toFixed(2)}KB)`);
      } catch (imgFetchError) {
        console.error(`[이미지] 다운로드 실패: ${imgFetchError.message}`);
        // 이미지 다운로드 실패해도 계속 진행 (렌더링에서 처리)
      }
    }
    
    // 호감도 창 렌더링 (이미지 버퍼 전달)
    const renderStart = performance.now();
    const canvas = await renderAffectionWindow(config, value, imageBuffer);
    timings.render = performance.now() - renderStart;
    
    // WebP로 변환
    const webpStart = performance.now();
    const buffer = canvas.toBuffer('image/webp', { quality: 1 });
    timings.webpConvert = performance.now() - webpStart;
    console.log(`[WebP] 변환 완료: ${timings.webpConvert.toFixed(2)}ms (크기: ${buffer.length} bytes)`);
    
    const totalTime = performance.now() - requestStart;
    console.log(`[완료] 총 처리 시간: ${totalTime.toFixed(2)}ms`);
    console.log('─'.repeat(60));

    // 응답 전송
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] 오류 발생:`, error.message);
    if (DEBUG) {
    console.error(error.stack);
    }
    
    // 에러 이미지 반환
    const errorBuffer = createErrorImage(error.message);
    res.status(500);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', errorBuffer.length);
    res.send(errorBuffer);
  }
});

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    port: PORT
  });
});

// 루트 경로
app.get('/', (req, res) => {
  res.json({
    service: 'Affection Window Canvas Generator',
    usage: `GET /{bucket}/{name}.json?Value={affection_value}`,
    example: `GET /mybucket/character1.json?Value=75`,
    baseUrl: BASE_URL
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('호감도 창 Canvas 생성 서비스 시작');
  console.log('='.repeat(60));
  console.log(`서버 주소: http://localhost:${PORT}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`예시 URL: http://localhost:${PORT}/mybucket/character1.json?Value=75`);
  console.log('='.repeat(60));
  console.log('');
});
