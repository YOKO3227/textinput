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
    console.log(`폰트 이미 등록됨: ${fontFamily}`);
    return; // 이미 등록됨
  }

  try {
    console.log(`[폰트] 등록 시작: ${fontFamily}`);
    console.log(`[폰트] URL: ${fontUrl}`);
    
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
      console.log(`[폰트] 캐시에서 로드: ${fontFamily} (${fontBuffer.length} bytes)`);
    } else {
      console.log(`[폰트] 다운로드 시작: ${fontUrl}`);
      const response = await fetch(fontUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      console.log(`[폰트] Content-Type: ${contentType || 'unknown'}`);
      
      fontBuffer = Buffer.from(await response.arrayBuffer());
      console.log(`[폰트] 다운로드 완료: ${fontBuffer.length} bytes`);
      
      if (fontBuffer.length === 0) {
        throw new Error('폰트 파일이 비어있습니다');
      }
      
      // 캐시 저장
      fs.writeFileSync(cacheFile, fontBuffer);
      console.log(`[폰트] 캐시에 저장: ${cacheFile}`);
    }

    // Canvas에 폰트 등록 (@napi-rs/canvas는 GlobalFonts 사용)
    console.log(`[폰트] Canvas에 등록 중: ${fontFamily}`);
    // @napi-rs/canvas의 GlobalFonts.registerFromPath는 파일 경로와 폰트 패밀리명을 받습니다
    GlobalFonts.registerFromPath(cacheFile, fontFamily);
    registeredFonts.add(fontFamily);
    console.log(`[폰트] 등록 완료: ${fontFamily}`);
    
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
  const words = message.split(' ');
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
    
    console.log(`[디버그] originalUrl: ${req.originalUrl}`);
    console.log(`[디버그] 추출된 pathname: ${pathname}`);

    // 경로 정보 추출
    const { bucketName, imagePath, configDir, configKey } = extractPathInfo(pathname);

    // 쿼리 파라미터에서 baseUrl 확인 (선택사항, 없으면 환경변수 또는 기본값 사용)
    const customBaseUrl = req.query.baseUrl || process.env.BASE_URL || BASE_URL;

    // 이미지 URL과 설정 JSON URL 생성
    const imageUrl = buildResourceUrl(customBaseUrl, bucketName, imagePath);
    const configUrl = buildResourceUrl(customBaseUrl, bucketName, configKey);

    console.log(`[${new Date().toISOString()}] 요청 처리:`);
    console.log(`  이미지 URL: ${imageUrl}`);
    console.log(`  설정 URL: ${configUrl}`);

    // 설정과 이미지 가져오기 (병렬)
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

    // 이미지 로드 (canvas 패키지는 Buffer를 사용)
    const image = await loadImage(Buffer.from(imageBuffer));

    const {
      imageSize = {},
      elements = [],
      defaultStyle = {},
      fonts = [],
      fontSettings = {}
    } = config;

    const width = imageSize.width || image.width || 800;
    const height = imageSize.height || image.height || 600;

    // Canvas 생성
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);

    // 폰트 처리 (Cloudflare Workers 방식 참조)
    if (fontSettings.mode === 'r2' && fontSettings.r2FontFilename) {
      // Cloudflare Workers와 동일한 경로 구조: configDir/fonts/fontFileName
      const fontPath = `${configDir}/fonts/${fontSettings.r2FontFilename}`;
      const fontUrl = buildResourceUrl(customBaseUrl, bucketName, fontPath);
      
      console.log(`  폰트 경로: ${fontPath}`);
      console.log(`  폰트 URL: ${fontUrl}`);
      
      try {
        await registerFontFromUrl(fontUrl, 'CustomR2Font');
        console.log(`  ✓ 폰트 로드 성공: ${fontSettings.r2FontFilename}`);
      } catch (fontError) {
        console.error(`  ✗ 폰트 로드 실패: ${fontError.message}`);
        console.error(`  ✗ 폰트 URL: ${fontUrl}`);
        console.warn(`  ⚠ 기본 폰트를 사용합니다.`);
      }
    }

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

    if (textElements.length === 0 && elements.length > 0) {
      console.warn('  경고: 매칭되는 텍스트 요소가 없습니다.');
      console.warn(`  사용 가능한 쿼리: ${elements.map(e => e.query).join(', ')}`);
      console.warn(`  받은 쿼리: ${Object.keys(queryParams).join(', ')}`);
    }

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
        console.warn(`  경고: ${element.query}에 대한 텍스트가 비어있습니다.`);
        return;
      }

      console.log(`  텍스트 그리기: ${element.query} = "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

      // 텍스트 그리기
      drawTextOnCanvas(ctx, text, style);
    });

    // WebP 변환 (quality: 1 - 최고 품질)
    const buffer = canvas.toBuffer('image/webp', { quality: 1 });

    console.log(`  성공: ${buffer.length} bytes WebP (quality: 1) 생성 완료\n`);

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
