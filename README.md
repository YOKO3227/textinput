# 호감도 창 Canvas 생성 서비스

Cloudflare에 저장된 JSON 설정 파일을 사용하여 호감도 창을 Canvas로 그려 WebP 이미지로 반환하는 Node.js 서비스입니다.

## 기능

- ✅ Cloudflare에서 JSON 설정 파일 자동 로드
- ✅ URL 파라미터로 호감도 값 동적 변경
- ✅ Canvas를 사용한 호감도 창 렌더링
  - 배경 컨테이너 (색상, 테두리, 둥근 모서리)
  - 캐릭터 이미지 (둥근 모서리, 테두리)
  - 캐릭터 이름 텍스트
  - 호감도 수치 텍스트 (다양한 포맷 지원)
  - 호감도 바 (배경 + 채움)
- ✅ WebP 형식으로 출력
- ✅ 에러 처리 및 로깅

## 설치

```bash
npm install
```

## 설정

프로젝트 루트에 `.env` 파일을 생성하세요:

```env
BASE_URL=https://your-domain.com
PORT=3000
DEBUG=false
```

- `BASE_URL`: Cloudflare에 올라간 JSON 파일의 기본 URL
- `PORT`: 서버 포트 (기본값: 3000)
- `DEBUG`: 디버그 모드 활성화 (true/false)

## 실행

```bash
npm start
```

서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## 사용 방법

### URL 패턴

```
http://localhost:3000/{이름}.json?Value={호감도}
```

### 예시

#### 1. 기본 사용

```
http://localhost:3000/character1.json?Value=75
```

이 URL에서:
- **이름**: `character1`
- **JSON 파일**: `https://your-domain.com/character1.json`
- **호감도 값**: `75`

#### 2. 다른 캐릭터

```
http://localhost:3000/heroine.json?Value=50
```

#### 3. 최대값 확인

호감도 값은 JSON의 `maxAffection` 값과 비교되어 비율로 계산됩니다.

## JSON 설정 파일 형식

Cloudflare에 업로드할 JSON 파일 형식입니다.

### 예시: `character1.json`

```json
{
  "characterName": "캐릭터 이름",
  "imageUrl": "https://example.com/character1.png",
  "maxAffection": 100,
  "container": {
    "styles": {
      "backgroundColor": "#f0f0f0",
      "borderWidth": 2,
      "borderColor": "#333",
      "borderRadius": 10,
      "padding": 15
    },
    "layout": {
      "width": 400,
      "height": 200
    }
  },
  "characterName": {
    "styles": {
      "fontSize": 20,
      "color": "#000000",
      "fontWeight": "bold",
      "textAlign": "left"
    },
    "layout": {
      "x": 10,
      "y": 10
    }
  },
  "characterImage": {
    "styles": {
      "borderRadius": 50,
      "borderWidth": 2,
      "borderColor": "#cccccc"
    },
    "layout": {
      "width": 100,
      "height": 100,
      "x": 10,
      "y": 50
    }
  },
  "affectionValue": {
    "styles": {
      "fontSize": 18,
      "color": "#333",
      "fontWeight": "normal"
    },
    "layout": {
      "x": 200,
      "y": 100
    },
    "format": "number"
  },
  "affectionBar": {
    "styles": {
      "backgroundColor": "#e0e0e0",
      "fillColor": "#4CAF50",
      "borderRadius": 10
    },
    "layout": {
      "width": 180,
      "height": 20,
      "x": 200,
      "y": 120
    }
  }
}
```

### 설정 옵션

#### 최상위 필드

- `characterName` (string): 캐릭터 이름
- `imageUrl` (string): 캐릭터 이미지 URL
- `maxAffection` (number): 최대 호감도 값

#### container

전체 창 스타일 및 레이아웃

- `styles.backgroundColor` (string): 배경색 (기본값: "#f0f0f0")
- `styles.borderWidth` (number): 테두리 두께 (기본값: 2)
- `styles.borderColor` (string): 테두리 색상 (기본값: "#333")
- `styles.borderRadius` (number): 둥근 모서리 (기본값: 10)
- `styles.padding` (number): 패딩 (기본값: 15)
- `layout.width` (number): 창 너비 (기본값: 400)
- `layout.height` (number): 창 높이 (기본값: 200)

#### characterName

캐릭터 이름 텍스트 스타일

- `styles.fontSize` (number): 폰트 크기 (기본값: 20)
- `styles.color` (string): 텍스트 색상 (기본값: "#000000")
- `styles.fontWeight` (string): 폰트 굵기 (기본값: "bold")
- `styles.textAlign` (string): 정렬 - "left", "center", "right" (기본값: "left")
- `layout.x` (number): X 위치 (기본값: 10)
- `layout.y` (number): Y 위치 (기본값: 10)

#### characterImage

캐릭터 이미지 스타일

- `styles.borderRadius` (number): 둥근 모서리 (기본값: 50)
- `styles.borderWidth` (number): 테두리 두께 (기본값: 2)
- `styles.borderColor` (string): 테두리 색상 (기본값: "#cccccc")
- `layout.width` (number): 이미지 너비 (기본값: 100)
- `layout.height` (number): 이미지 높이 (기본값: 100)
- `layout.x` (number): X 위치 (기본값: 10)
- `layout.y` (number): Y 위치 (기본값: 50)

#### affectionValue

호감도 수치 텍스트 스타일

- `styles.fontSize` (number): 폰트 크기 (기본값: 18)
- `styles.color` (string): 텍스트 색상 (기본값: "#333")
- `styles.fontWeight` (string): 폰트 굵기 (기본값: "normal")
- `layout.x` (number): X 위치 (기본값: 200)
- `layout.y` (number): Y 위치 (기본값: 100)
- `format` (string): 표시 형식
  - `"number"`: 숫자만 (예: "75")
  - `"fraction"`: 분수 형식 (예: "75/100")
  - `"percent"`: 퍼센트 형식 (예: "75%")

#### affectionBar

호감도 바 스타일

- `styles.backgroundColor` (string): 배경 바 색상 (기본값: "#e0e0e0")
- `styles.fillColor` (string): 채움 바 색상 (기본값: "#4CAF50")
- `styles.borderRadius` (number): 둥근 모서리 (기본값: 10)
- `layout.width` (number): 바 너비 (기본값: 180)
- `layout.height` (number): 바 높이 (기본값: 20)
- `layout.x` (number): X 위치 (기본값: 200)
- `layout.y` (number): Y 위치 (기본값: 120)

## API 엔드포인트

### GET `/{name}.json`

호감도 창을 WebP 이미지로 반환합니다.

**URL 패턴**: `/{이름}.json?Value={호감도}`

**쿼리 파라미터**:
- `Value` (필수): 현재 호감도 값 (0 이상의 정수)

**응답**: WebP 이미지 (Content-Type: image/webp)

**예시**:
```
GET /character1.json?Value=75
```

### GET `/health`

서버 상태 확인

**응답**: JSON
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "baseUrl": "https://your-domain.com",
  "port": 3000
}
```

### GET `/`

서비스 정보 및 사용법

**응답**: JSON
```json
{
  "service": "Affection Window Canvas Generator",
  "usage": "GET /{name}.json?Value={affection_value}",
  "example": "GET /character1.json?Value=75",
  "baseUrl": "https://your-domain.com"
}
```

## 배포

### Cloudflare에 JSON 파일 업로드

1. JSON 설정 파일을 생성합니다 (위의 형식 참고)
2. Cloudflare R2 또는 Pages에 업로드합니다
3. 파일명은 `{이름}.json` 형식으로 저장합니다

### 서버 배포

Railway, Heroku, 또는 다른 Node.js 호스팅 서비스에 배포할 수 있습니다.

**Railway 배포 예시**:
1. GitHub에 프로젝트 푸시
2. Railway에서 프로젝트 연결
3. 환경 변수 설정:
   - `BASE_URL`: Cloudflare 도메인
   - `PORT`: Railway가 자동 설정
   - `DEBUG`: `false` (프로덕션)

## 주의사항

1. **이미지 URL**: `imageUrl`은 CORS가 활성화된 공개 URL이어야 합니다.
2. **JSON 파일**: Cloudflare에 업로드된 JSON 파일은 공개 접근 가능해야 합니다.
3. **호감도 값**: `Value` 파라미터는 0 이상의 정수여야 합니다. 최대값은 JSON의 `maxAffection`으로 제한됩니다.

## 개발

```bash
# 개발 모드로 실행
npm run dev
```

디버그 모드를 활성화하려면 `.env` 파일에 `DEBUG=true`를 설정하세요.

## 라이선스

MIT
