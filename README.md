# Canvas 이미지 텍스트 오버레이 서비스

Cloudflare Workers의 JSON 설정 형식을 사용하여 이미지에 텍스트를 오버레이하는 Node.js 서비스입니다.

## 기능

- ✅ Cloudflare Workers와 동일한 URL 패턴 지원
- ✅ 동적 경로 추출 (버킷명, 이미지 경로 자동 파싱)
- ✅ JSON 설정 파일 자동 로드
- ✅ 여러 텍스트 요소 지원
- ✅ 텍스트 정렬 (좌/중앙/우, 상/중/하)
- ✅ 줄바꿈 및 자동 줄바꿈
- ✅ 커스텀 폰트 지원 (R2 또는 HTTP URL)
- ✅ 텍스트 테두리 (stroke) 지원
- ✅ 폰트 캐싱 (성능 최적화)

## 설치

```bash
npm install
```

## 설정

프로젝트 루트에 `.env` 파일을 생성하세요:

```env
BASE_URL=https://i.nfarmer.uk
PORT=3000
```

## 실행

```bash
npm start
```

서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## 사용 방법

### URL 패턴

```
http://localhost:3000/{버킷명}/{경로}/{이미지파일}?{쿼리파라미터}
```

### 예시

#### 1. 기본 사용

```
http://localhost:3000/kbd/A/A/EMO/A/1.webp?text=Hello%20World
```

이 URL에서:
- **버킷명**: `kbd`
- **이미지 경로**: `A/A/EMO/A/1.webp`
- **JSON 설정 경로**: `A/A/EMO/A.json` (자동 추출)
- **폰트 경로**: `A/A/EMO/fonts/...` (JSON 설정에서)
- **텍스트 쿼리**: `text=Hello World`

#### 2. 여러 텍스트 요소

```
http://localhost:3000/kbd/A/A/EMO/A/1.webp?title=제목&subtitle=부제목
```

#### 3. 다른 버킷/경로

```
http://localhost:3000/mybucket/B/C/D/E/2.jpg?title=제목&subtitle=부제목
```

- **버킷명**: `mybucket`
- **이미지**: `B/C/D/E/2.jpg`
- **JSON**: `B/C/D/E.json`
- **텍스트**: `title`, `subtitle`

#### 4. 커스텀 BASE_URL

```
http://localhost:3000/kbd/A/A/EMO/A/1.webp?text=테스트&baseUrl=https://custom-domain.com
```

## JSON 설정 파일 형식

이미지와 같은 폴더 구조에 JSON 설정 파일이 있어야 합니다.

### 예시: `A/A/EMO/A.json`

```json
{
  "imageSize": {
    "width": 800,
    "height": 600
  },
  "defaultStyle": {
    "fontFamily": "Arial",
    "fontSize": 24,
    "fill": "#FFFFFF",
    "textAlign": "left",
    "verticalAlign": "top",
    "strokeWidth": 0,
    "stroke": "#000000",
    "lineHeight": 1.2,
    "fontWeight": "normal"
  },
  "elements": [
    {
      "query": "text",
      "x": 50,
      "y": 100,
      "width": 700,
      "height": 100,
      "style": {
        "fontSize": 48,
        "fill": "#FF0000",
        "textAlign": "center",
        "verticalAlign": "middle"
      },
      "useR2Font": false
    },
    {
      "query": "subtitle",
      "x": 50,
      "y": 250,
      "width": 700,
      "height": 50,
      "style": {
        "fontSize": 24,
        "fill": "#000000",
        "textAlign": "left"
      }
    }
  ],
  "fonts": [],
  "fontSettings": {
    "mode": "r2",
    "r2FontFilename": "NanumGothic.ttf"
  }
}
```

### 설정 옵션

#### imageSize
- `width`: 캔버스 너비 (픽셀)
- `height`: 캔버스 높이 (픽셀)
- 생략 시 원본 이미지 크기 사용

#### defaultStyle
모든 요소에 적용될 기본 스타일

- `fontFamily`: 폰트 패밀리 (기본값: "sans-serif")
- `fontSize`: 폰트 크기 (기본값: 24)
- `fill`: 텍스트 색상 (기본값: "#000000")
- `textAlign`: 수평 정렬 - "left", "center", "right" (기본값: "left")
- `verticalAlign`: 수직 정렬 - "top", "middle"/"center", "bottom" (기본값: "top")
- `strokeWidth`: 테두리 두께 (기본값: 0)
- `stroke`: 테두리 색상 (기본값: "#ffffff")
- `lineHeight`: 줄 간격 배율 (기본값: 1.2)
- `fontWeight`: 폰트 굵기 - "normal", "bold" 등 (기본값: "normal")

#### elements
텍스트 요소 배열

- `query`: URL 쿼리 파라미터 이름 (필수)
- `x`: X 위치 (픽셀)
- `y`: Y 위치 (픽셀)
- `width`: 텍스트 영역 너비 (픽셀)
- `height`: 텍스트 영역 높이 (픽셀)
- `style`: 이 요소에만 적용될 스타일 (defaultStyle과 병합)
- `useR2Font`: R2 폰트 사용 여부 (boolean)

#### fontSettings
폰트 설정

- `mode`: "r2" 또는 기타
- `r2FontFilename`: R2에 있는 폰트 파일명
  - 경로: `{configDir}/fonts/{r2FontFilename}`
  - 예: `A/A/EMO/fonts/NanumGothic.ttf`

## 폴더 구조 예시

```
버킷 (kbd)/
├── A/
│   ├── A/
│   │   └── EMO/
│   │       ├── A.json          (설정 파일)
│   │       ├── fonts/
│   │       │   └── NanumGothic.ttf
│   │       └── A/
│   │           └── 1.webp      (이미지 파일)
```

## API 엔드포인트

### GET `/*` (와일드카드)

이미지에 텍스트 오버레이를 추가하여 PNG로 반환합니다.

**URL 패턴**: `/{버킷명}/{경로}/{이미지파일}?{쿼리}`

**쿼리 파라미터**:
- `baseUrl` (선택): 기본 URL 오버라이드
- 기타: JSON 설정의 `elements[].query`에 해당하는 텍스트 값들

**응답**: PNG 이미지 (Content-Type: image/png)

### GET `/health`

서버 상태 확인

**응답**: JSON
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "baseUrl": "https://i.nfarmer.uk",
  "port": 3000
}
```

## 주의사항

1. **Canvas 패키지 설치**: Windows에서 `canvas` 패키지 설치 시 네이티브 빌드가 필요할 수 있습니다.
   - Python 3.x
   - Visual Studio Build Tools
   
   또는 `@napi-rs/canvas` 사용 (더 쉬운 설치):
   ```bash
   npm install @napi-rs/canvas
   ```
   그리고 `server.js`에서 import 변경:
   ```javascript
   const { createCanvas, loadImage, registerFont } = require('@napi-rs/canvas');
   ```

2. **폰트 캐싱**: 다운로드한 폰트는 `.font_cache` 디렉토리에 캐시됩니다.

3. **에러 처리**: 오류 발생 시 에러 이미지(PNG)를 반환합니다.

## 개발

```bash
# 개발 모드로 실행
npm run dev
```

## 라이선스

MIT

## githud 푸시 할 때 
Initial commit for Railway deployment