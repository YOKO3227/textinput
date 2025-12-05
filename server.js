require('dotenv').config();
const express = require('express');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 환경 변수 또는 기본값 설정
const BASE_URL = process.env.BASE_URL || 'https://o.nfarmer.uk';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 폰트 캐시 디렉토리
const FONT_CACHE_DIR = path.join(__dirname, '.font_cache');
if (!fs.existsSync(FONT_CACHE_DIR)) {
  fs.mkdirSync(FONT_CACHE_DIR, { recursive: true });
}

const registeredFonts = new Set();

/**
 * URL에서 폰트 다운로드 및 등록
 */
/**
 * URL에서 폰트 다운로드 및 등록 (Cloudflare Workers 방식 참조)
 */
async function registerFontFromUrl(fontUrl, fontFamily) {
  if (registeredFonts.has(fontFamily)) {
    return; // 이미 등록됨
  }

  try {
    
    const urlHash = crypto.createHash('md5').update(fontUrl).digest('hex');
    let urlPath;
    try {
      urlPath = new URL(fontUrl).pathname;
    } catch (urlError) {
      throw new Error(`잘못된 폰트 URL: ${fontUrl} - ${urlError.message}`);
    }
    
    // 확장자 추출 (Cloudflare Workers 방식과 유사)
    const ext = path.extname(urlPath) || '.ttf';
    const cacheFile = path.join(FONT_CACHE_DIR, `${urlHash}${ext}`);

    let fontBuffer;
    if (fs.existsSync(cacheFile)) {
      fontBuffer = fs.readFileSync(cacheFile);
    } else {
      const response = await fetch(fontUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      fontBuffer = Buffer.from(await response.arrayBuffer());
      
      if (fontBuffer.length === 0) {
        throw new Error('폰트 파일이 비어있습니다');
      }
      
      // 캐시 저장
      fs.writeFileSync(cacheFile, fontBuffer);
    }

    // Canvas에 폰트 등록 (@napi-rs/canvas는 GlobalFonts 사용)
    // @napi-rs/canvas의 GlobalFonts.registerFromPath는 파일 경로와 폰트 패밀리명을 받습니다
    GlobalFonts.registerFromPath(cacheFile, fontFamily);
    registeredFonts.add(fontFamily);
    
  } catch (error) {
    console.error(`[폰트] 등록 실패 (${fontFamily}):`, error.message);
    console.error(`[폰트] 스택:`, error.stack);
    throw error; // 에러를 다시 던져서 상위에서 처리할 수 있도록
  }
}

/**
 * 텍스트 디코딩 (Cloudflare Workers 로직과 동일)
 */
function decodeText(text) {
  if (!text) return '';
  return decodeURIComponent(String(text))
    .replace(/_/g, ' ')
    .replace(/%0A/gi, '\n');
}

/**
 * Canvas에 텍스트 그리기 (여러 줄 지원, 정렬 지원)
 */
function drawTextOnCanvas(ctx, text, style) {
  const {
    x = 0,
    y = 0,
    width: w = ctx.canvas.width,
    height: h = ctx.canvas.height,
    verticalAlign = 'top',
    fontSize = 24,
    fontFamily = 'sans-serif',
    fill = '#000000',
    stroke = '#ffffff',
    strokeWidth = 0,
    textAlign = 'left',
    lineHeight = 1.2,
    fontWeight = 'normal'
  } = style;

  ctx.save();

  // 폰트 설정
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = fill;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'top';

  // 줄바꿈 처리
  const lines = text.split('\n');
  const lineHeightPx = fontSize * lineHeight;

  // 자동 줄바꿈 처리
  const measuredLines = [];
  lines.forEach(line => {
    const metrics = ctx.measureText(line);
    if (metrics.width > w && w > 0) {
      // 자동 줄바꿈
      const words = line.split(' ');
      let currentLine = '';
      words.forEach(word => {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const testMetrics = ctx.measureText(testLine);
        if (testMetrics.width > w && currentLine) {
          measuredLines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      });
      if (currentLine) measuredLines.push(currentLine);
    } else {
      measuredLines.push(line);
    }
  });

  const totalHeight = measuredLines.length * lineHeightPx;

  // 수직 정렬
  let startY = y;
  if (verticalAlign === 'middle' || verticalAlign === 'center') {
    startY = y + Math.max(0, (h - totalHeight) / 2);
  } else if (verticalAlign === 'bottom') {
    startY = y + Math.max(0, h - totalHeight);
  }

  // 수평 정렬
  let textX = x;
  if (textAlign === 'center') {
    textX = x + w / 2;
  } else if (textAlign === 'right') {
    textX = x + w;
  }

  // 각 줄 그리기
  measuredLines.forEach((line, index) => {
    const lineY = startY + (index * lineHeightPx);

    // Stroke (테두리)
    if (strokeWidth > 0 && stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(line, textX, lineY);
    }

    // Fill (텍스트)
    ctx.fillText(line, textX, lineY);
  });

  ctx.restore();
}

/**
 * URL 경로에서 경로 정보 추출 (Cloudflare Workers 로직과 동일)
 */
function extractPathInfo(urlPathname) {
  // 앞의 슬래시 제거
  let path = urlPathname;
  if (path.startsWith('/')) {
    path = path.substring(1);
  }
  
  const pathParts = path.split('/').filter(Boolean);

  if (pathParts.length < 3) {
    throw new Error(`경로 형식이 올바르지 않습니다. 최소 3개의 경로 요소가 필요합니다. (버킷명/경로/이미지파일) 현재 경로: "${urlPathname}", 추출된 요소: ${pathParts.length}개 [${pathParts.join(', ')}]`);
  }

  const bucketName = pathParts[0]; // 예: 'kbd'
  const imagePath = pathParts.slice(1).join('/'); // 예: 'A/A/EMO/A/1.webp'

  // 이미지 파일의 디렉토리 경로 추출
  const imagePathParts = imagePath.split('/');
  
  if (imagePathParts.length < 2) {
    throw new Error(`이미지 경로가 올바르지 않습니다. 최소 폴더명/파일명 구조가 필요합니다. 현재 경로: "${imagePath}"`);
  }

  // A/A/EMO/A/1.webp에서:
  // - 마지막 2개 제거: 파일명(1.webp)과 바로 위 폴더(A)
  // - configDir: A/A/EMO
  // - folderName: A
  const configDir = imagePathParts.slice(0, -2).join('/');
  const folderName = imagePathParts[imagePathParts.length - 2];

  // JSON 파일 경로: A/A/EMO/A.json
  const configKey = `${configDir}/${folderName}.json`;

  return {
    bucketName,
    imagePath,
    configDir,
    folderName,
    configKey
  };
}

/**
 * 리소스 URL 생성
 */
function buildResourceUrl(baseUrl, bucketName, resourcePath) {
  // baseUrl이 전체 URL인지 확인
  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return `${baseUrl}/${bucketName}/${resourcePath}`;
  } else {
    return `https://${baseUrl}/${bucketName}/${resourcePath}`;
  }
}

/**
 * 에러 이미지 생성
 */
function createErrorImage(message) {
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');
  
  // 배경 (밝은 회색)
  ctx.fillStyle = '#C5C5C5';
  ctx.fillRect(0, 0, 800, 600);
  
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  
  // 큰 "404" 텍스트
  ctx.font = 'bold 120px Arial';
  ctx.fillText('404', 400, 200);
  
  // "Not Found" 텍스트
  ctx.font = 'bold 48px Arial';
  ctx.fillText('Not Found', 400, 280);
  
  // 한국어 설명 텍스트
  ctx.font = '24px Arial';
  ctx.fillText('이 이미지는 오류가 발생했을 때 출력되는 이미지입니다.', 400, 360);
  ctx.fillText('!디버깅 필요.', 400, 400);
  
  // 에러 메시지 (있는 경우)
  if (message && message.length > 0) {
    ctx.font = '18px Arial';
    const maxWidth = 750;
    const words = message.split(' ');
    let line = '';
    let y = 450;
    
    words.forEach(word => {
      const testLine = line + (line ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, 400, y);
        line = word;
        y += 25;
      } else {
        line = testLine;
      }
    });
    if (line) {
      ctx.fillText(line, 400, y);
    }
  }
  
  return canvas.toBuffer('image/webp', { quality: 1 });
}

/**
 * 메인 오버레이 핸들러 - 동적 경로 추출
 */
app.get('/*', async (req, res) => {
  try {
    // originalUrl에서 쿼리 파라미터를 제외한 경로만 추출
    let pathname = req.originalUrl || req.url;
    
    // 쿼리 파라미터 제거
    if (pathname.includes('?')) {
      pathname = pathname.split('?')[0];
    }
    
    // 특수 경로 필터링 (경로 검증 전에 처리)
    if (pathname === '/health') {
      return res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        baseUrl: BASE_URL,
        port: PORT
      });
    }
    
    // favicon.ico 및 기타 브라우저 자동 요청 무시
    if (pathname === '/favicon.ico' || pathname.startsWith('/favicon')) {
      return res.status(404).end();
    }
    
    // robots.txt 등 기타 자동 요청도 무시
    if (pathname === '/robots.txt') {
      return res.status(404).end();
    }
    
    // .well-known 경로 (Chrome DevTools 등) 무시
    if (pathname.startsWith('/.well-known')) {
      return res.status(404).end();
    }
    

    // 경로 정보 추출
    const { bucketName, imagePath, configDir, configKey } = extractPathInfo(pathname);

    // 쿼리 파라미터에서 baseUrl 확인 (선택사항, 없으면 환경변수 또는 기본값 사용)
    const customBaseUrl = req.query.baseUrl || process.env.BASE_URL || BASE_URL;

    // 성능 측정 시작
    const startTime = performance.now();

    // 이미지 URL과 설정 JSON URL 생성
    const imageUrl = buildResourceUrl(customBaseUrl, bucketName, imagePath);
    const configUrl = buildResourceUrl(customBaseUrl, bucketName, configKey);

    // 설정과 이미지 가져오기 (병렬)
    const fetchStart = performance.now();
    const [configRes, imageRes] = await Promise.all([
      fetch(configUrl).then(r => {
        if (!r.ok) throw new Error(`설정 파일을 가져올 수 없습니다: ${configUrl} (${r.status})`);
        return r;
      }),
      fetch(imageUrl).then(r => {
        if (!r.ok) throw new Error(`이미지를 가져올 수 없습니다: ${imageUrl} (${r.status})`);
        return r;
      })
    ]);

    const [config, imageBuffer] = await Promise.all([
      configRes.json(),
      imageRes.arrayBuffer()
    ]);
    const fetchTime = performance.now() - fetchStart;
    console.log(`[성능] HTTP 요청: ${fetchTime.toFixed(2)}ms`);

    // config 파싱 (폰트 URL 계산을 위해 먼저 처리)
    const {
      imageSize = {},
      elements = [],
      defaultStyle = {},
      fonts = [],
      fontSettings = {}
    } = config;

    const width = imageSize.width || 800;
    const height = imageSize.height || 600;

    // 폰트 URL 미리 계산 (폰트가 필요한 경우)
    const fontPath = fontSettings.mode === 'r2' && fontSettings.r2FontFilename
      ? `${configDir}/fonts/${fontSettings.r2FontFilename}`
      : null;
    const fontUrl = fontPath ? buildResourceUrl(customBaseUrl, bucketName, fontPath) : null;

    // 이미지 로드와 폰트 로드를 병렬 처리
    const loadStart = performance.now();
    const [image, fontLoaded] = await Promise.all([
      loadImage(Buffer.from(imageBuffer)),
      fontUrl ? registerFontFromUrl(fontUrl, 'CustomR2Font').catch(err => {
        console.error(`[폰트] 로드 실패: ${err.message}`);
        console.error(`[폰트] URL: ${fontUrl}`);
        console.warn(`[폰트] 기본 폰트를 사용합니다.`);
        return null; // 폰트 로드 실패해도 계속 진행
      }) : Promise.resolve(null)
    ]);
    const loadTime = performance.now() - loadStart;
    console.log(`[성능] 이미지/폰트 로드: ${loadTime.toFixed(2)}ms`);

    // Canvas 생성
    const canvasStart = performance.now();
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);

    // 외부 폰트 처리 (Google Fonts 등)
    // 실제로는 폰트를 다운로드해야 하지만, 여기서는 시스템 폰트 사용

    // 쿼리 파라미터 추출
    const queryParams = {};
    if (req.query) {
      Object.keys(req.query).forEach(key => {
        // baseUrl은 제외
        if (key !== 'baseUrl') {
          queryParams[key] = req.query[key];
        }
      });
    }

    // 텍스트 요소 필터링
    const textElements = elements.filter(el => {
      return el?.query && queryParams.hasOwnProperty(el.query);
    });


    // 텍스트 그리기
    textElements.forEach(element => {
      const style = { ...defaultStyle, ...element.style };

      // R2 폰트 사용 여부
      if (element.useR2Font && fontSettings.mode === 'r2') {
        style.fontFamily = 'CustomR2Font';
      }

      // 텍스트 가져오기 및 디코딩
      const text = decodeText(queryParams[element.query]);
      if (!text) {
        return;
      }

      // 텍스트 그리기
      drawTextOnCanvas(ctx, text, style);
    });
    const canvasTime = performance.now() - canvasStart;
    console.log(`[성능] Canvas 작업: ${canvasTime.toFixed(2)}ms`);

    // WebP 변환 (quality: 1 - 최고 품질)
    const webpStart = performance.now();
    const buffer = canvas.toBuffer('image/webp', { quality: 1 });
    const webpTime = performance.now() - webpStart;
    console.log(`[성능] WebP 변환: ${webpTime.toFixed(2)}ms`);

    const totalTime = performance.now() - startTime;
    console.log(`[성능] 총 처리 시간: ${totalTime.toFixed(2)}ms (${buffer.length} bytes)\n`);

    // 응답 전송
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] 오류 발생:`, error.message);
    console.error(error.stack);
    console.log('');
    
    // 에러 이미지 생성 및 반환
    const errorBuffer = createErrorImage(error.message);
    
    res.status(500);
    res.setHeader('Content-Type', 'image/webp');
    res.send(errorBuffer);
  }
});

// 헬스 체크 (명시적 라우트)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    port: PORT
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('이미지 텍스트 오버레이 서비스 시작');
  console.log('='.repeat(60));
  console.log(`서버 주소: http://localhost:${PORT}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`예시 URL: http://localhost:${PORT}/kbd/A/A/EMO/A/1.webp?txt=테스트`);
  console.log('='.repeat(60));
  console.log('');
});
