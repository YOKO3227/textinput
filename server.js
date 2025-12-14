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
 * RGBA 문자열 파싱 (예: "rgba(255, 0, 0, 0.7)" -> {r, g, b, a})
 */
function parseRgba(rgbaString) {
  if (!rgbaString) return null;
  const match = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
      a: match[4] ? parseFloat(match[4]) : 1
    };
  }
  return null;
}

/**
 * Padding 문자열 파싱 (예: "12px 16px" -> {top: 12, right: 16, bottom: 12, left: 16})
 */
function parsePadding(paddingString) {
  if (!paddingString) return { top: 0, right: 0, bottom: 0, left: 0 };
  const values = paddingString.match(/(\d+)px/g);
  if (!values || values.length === 0) return { top: 0, right: 0, bottom: 0, left: 0 };
  
  const nums = values.map(v => parseInt(v));
  if (nums.length === 1) {
    return { top: nums[0], right: nums[0], bottom: nums[0], left: nums[0] };
  } else if (nums.length === 2) {
    return { top: nums[0], right: nums[1], bottom: nums[0], left: nums[1] };
  } else if (nums.length === 4) {
    return { top: nums[0], right: nums[1], bottom: nums[2], left: nums[3] };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

/**
 * BorderRadius 파싱 (예: "8px" -> 8)
 */
function parseBorderRadius(borderRadiusString) {
  if (!borderRadiusString) return 0;
  const match = borderRadiusString.match(/(\d+)px/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * 둥근 사각형 그리기
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (radius <= 0) {
    ctx.rect(x, y, width, height);
    return;
  }
  
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
 * Canvas에 요소 그리기 (배경, 필터, 테두리, 텍스트 지원)
 */
function drawElementOnCanvas(ctx, text, style) {
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
    fontWeight = 'normal',
    backgroundColor,
    padding,
    borderRadius,
    borderWidth,
    borderColor = '#000000',
    filter,
    whiteSpace = 'pre-wrap'
  } = style;

  ctx.save();

  // 배경/테두리/필터를 위한 별도 Canvas 생성
  let bgCanvas = null;
  let bgCtx = null;
  const needsBgCanvas = filter || backgroundColor || borderRadius || borderWidth;
  
  if (needsBgCanvas) {
    bgCanvas = createCanvas(w, h);
    bgCtx = bgCanvas.getContext('2d');
    
    // 1. 배경색 먼저 그리기 (필터보다 먼저)
    if (backgroundColor) {
      const rgba = parseRgba(backgroundColor);
      if (rgba) {
        bgCtx.fillStyle = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
      } else {
        bgCtx.fillStyle = backgroundColor;
      }
      
      if (borderRadius) {
        const radius = parseBorderRadius(borderRadius);
        drawRoundedRect(bgCtx, 0, 0, w, h, radius);
        bgCtx.fill();
      } else {
        bgCtx.fillRect(0, 0, w, h);
      }
    }
    
    // 2. 필터 효과 처리 (배경색 위에 필터 적용된 이미지 합성)
    if (filter && ctx.canvas) {
      try {
        const mainCanvas = ctx.canvas;
        const originalCtx = mainCanvas.getContext('2d');
        
        // 원본 Canvas에서 이미지 영역 추출
        const imageData = originalCtx.getImageData(x, y, w, h);
        const filterCanvas = createCanvas(w, h);
        const filterCtx = filterCanvas.getContext('2d');
        filterCtx.putImageData(imageData, 0, 0);
        
        // 필터 적용
        if (filterCtx.filter !== undefined) {
          const tempCanvas = createCanvas(w, h);
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(filterCanvas, 0, 0);
          
          filterCtx.clearRect(0, 0, w, h);
          filterCtx.filter = filter;
          filterCtx.drawImage(tempCanvas, 0, 0);
          
          // 배경색 위에 필터 적용된 이미지 합성
          bgCtx.globalCompositeOperation = 'source-over';
          bgCtx.drawImage(filterCanvas, 0, 0);
        }
      } catch (e) {
        console.warn('[필터] 이미지 추출 실패:', e.message);
      }
    }
    
    // 3. 테두리 그리기 (항상 solid)
    if (borderWidth) {
      const borderW = parseFloat(String(borderWidth).replace('px', '')) || 0;
      if (borderW > 0) {
        bgCtx.strokeStyle = borderColor || '#000000';
        bgCtx.lineWidth = borderW;
        bgCtx.setLineDash([]);
        
        if (borderRadius) {
          const radius = parseBorderRadius(borderRadius);
          drawRoundedRect(bgCtx, borderW / 2, borderW / 2, w - borderW, h - borderW, Math.max(0, radius - borderW / 2));
          bgCtx.stroke();
        } else {
          bgCtx.strokeRect(borderW / 2, borderW / 2, w - borderW, h - borderW);
        }
      }
    }
    
    // 배경을 메인 Canvas에 복사
    ctx.filter = 'none';
    ctx.drawImage(bgCanvas, x, y);
  } else {
    // bgCanvas가 없는 경우 (배경색만 있거나 아무것도 없는 경우)
    if (backgroundColor) {
      const rgba = parseRgba(backgroundColor);
      if (rgba) {
        ctx.fillStyle = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
      } else {
        ctx.fillStyle = backgroundColor;
      }
      
      if (borderRadius) {
        const radius = parseBorderRadius(borderRadius);
        drawRoundedRect(ctx, x, y, w, h, radius);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  // 패딩 계산
  const paddingValues = parsePadding(padding);
  const textX = x + paddingValues.left;
  const textY = y + paddingValues.top;
  const textWidth = w - paddingValues.left - paddingValues.right;
  const textHeight = h - paddingValues.top - paddingValues.bottom;

  // 텍스트 그리기
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = fill;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'top';

  // 줄바꿈 처리
  let lines;
  if (whiteSpace === 'pre' || whiteSpace === 'pre-wrap') {
    lines = text.split('\n');
  } else if (whiteSpace === 'nowrap') {
    lines = [text];
  } else {
    lines = text.split('\n');
  }
  
  const lineHeightPx = fontSize * lineHeight;

  // 자동 줄바꿈 처리
  const measuredLines = [];
  lines.forEach(line => {
    if (whiteSpace === 'nowrap' || whiteSpace === 'pre') {
      measuredLines.push(line);
    } else {
      const metrics = ctx.measureText(line);
      if (metrics.width > textWidth && textWidth > 0) {
        // 자동 줄바꿈
        const words = line.split(' ');
        let currentLine = '';
        words.forEach(word => {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const testMetrics = ctx.measureText(testLine);
          if (testMetrics.width > textWidth && currentLine) {
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
    }
  });

  const totalHeight = measuredLines.length * lineHeightPx;

  // 수직 정렬
  let startY = textY;
  if (verticalAlign === 'middle' || verticalAlign === 'center') {
    startY = textY + Math.max(0, (textHeight - totalHeight) / 2);
  } else if (verticalAlign === 'bottom') {
    startY = textY + Math.max(0, textHeight - totalHeight);
  }

  // 수평 정렬
  let textXPos = textX;
  if (textAlign === 'center') {
    textXPos = textX + textWidth / 2;
  } else if (textAlign === 'right') {
    textXPos = textX + textWidth;
  }

  // 각 줄 그리기
  measuredLines.forEach((line, index) => {
    const lineY = startY + (index * lineHeightPx);

    // Stroke (테두리)
    if (strokeWidth > 0 && stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(line, textXPos, lineY);
    }

    // Fill (텍스트)
    ctx.fillText(line, textXPos, lineY);
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
    // 에러 이미지 생성 자체가 실패한 경우 기본 PNG 반환
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
    if (DEBUG) {
      console.log(`[성능] HTTP 요청: ${fetchTime.toFixed(2)}ms`);
    }

    // config 파싱
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
    if (DEBUG) {
      console.log(`[성능] 이미지/폰트 로드: ${loadTime.toFixed(2)}ms`);
    }
    
    // R2 폰트가 성공적으로 로드되었는지 확인
    const r2FontAvailable = fontUrl && fontLoaded !== null && registeredFonts.has('CustomR2Font');
    if (fontUrl) {
      if (r2FontAvailable) {
        console.log(`[폰트] R2 폰트 사용 가능: CustomR2Font`);
      } else {
        console.warn(`[폰트] R2 폰트를 사용할 수 없습니다. 기본 폰트를 사용합니다.`);
      }
    }

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

    if (textElements.length === 0 && elements.length > 0) {
      console.warn('  경고: 매칭되는 텍스트 요소가 없습니다.');
      console.warn(`  사용 가능한 쿼리: ${elements.map(e => e.query).join(', ')}`);
      console.warn(`  받은 쿼리: ${Object.keys(queryParams).join(', ')}`);
    }

    // 텍스트 그리기
    textElements.forEach(element => {
      const style = { ...defaultStyle, ...element.style };

      // R2 폰트 사용 여부 (폰트가 실제로 등록되었을 때만)
      if (element.useR2Font && fontSettings.mode === 'r2' && r2FontAvailable) {
        style.fontFamily = 'CustomR2Font';
        console.log(`[폰트] R2 폰트 사용: ${element.query}`);
      } else if (element.useR2Font && fontSettings.mode === 'r2' && !r2FontAvailable) {
        console.warn(`[폰트] R2 폰트를 사용하려고 했지만 사용할 수 없습니다. 기본 폰트 사용: ${element.query}`);
        // style.fontFamily는 원래 값(JSON의 fontFamily 또는 defaultStyle)을 유지
      }

      // 텍스트 가져오기 및 디코딩
      const text = decodeText(queryParams[element.query]);
      if (!text) {
        console.warn(`  경고: ${element.query}에 대한 텍스트가 비어있습니다.`);
        return;
      }

      console.log(`  텍스트 그리기: ${element.query} = "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

      // 요소 그리기 (배경, 필터, 테두리, 텍스트 모두 포함)
      drawElementOnCanvas(ctx, text, style);
    });
    const canvasTime = performance.now() - canvasStart;
    if (DEBUG) {
      console.log(`[성능] Canvas 작업: ${canvasTime.toFixed(2)}ms`);
    }

    // WebP로 변환 (PNG 단계 건너뛰기)
    const webpStart = performance.now();
    const buffer = canvas.toBuffer('image/webp', { quality: 1 });
    const webpTime = performance.now() - webpStart;
    if (DEBUG) {
      console.log(`[성능] WebP 변환: ${webpTime.toFixed(2)}ms`);
    }

    const totalTime = performance.now() - startTime;
    if (DEBUG) {
      console.log(`[성능] 총 처리 시간: ${totalTime.toFixed(2)}ms (${buffer.length} bytes)\n`);
    }

    // 응답 전송
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] 오류 발생:`, error.message);
    console.error(error.stack);
    console.log('');
    
    // 에러 이미지 URL에서 가져오기
    const errorImageUrl = 'https://pub-45268c10da744ce58e66952c8d0c50ba.r2.dev/404.webp';
    const errorImageRes = await fetch(errorImageUrl);
    const errorBuffer = Buffer.from(await errorImageRes.arrayBuffer());
    
    res.status(500);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', errorBuffer.length);
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
