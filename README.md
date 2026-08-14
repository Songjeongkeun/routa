# ROUTA

서울 여행 조건과 관심 장소를 바탕으로 최적 경로를 추천하는 React·Express 프로젝트입니다.

## 폴더

- `Client/`: React + Vite 프런트엔드
- `Server/`: Express + PostgreSQL 백엔드
- `database/`: 데이터베이스 스키마와 초기 데이터
- `docs/`: 설계 및 역할 분담 문서

자세한 역할은 [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md)를 참고합니다.

## 최초 설정

1. `.env.example`을 복사해 `.env`를 만들고 실제 값을 입력합니다.
2. Supabase 프로젝트의 실제 스키마를 사용하도록 `DATABASE_URL`을 설정합니다. 로컬 스키마 파일은 실행하지 않습니다.
3. `Client`와 `Server`에서 각각 `npm install`을 실행합니다.

## 실행

```bash
cd Server
npm run dev
```

다른 터미널에서 다음을 실행합니다.

```bash
cd Client
npm run dev
```

기본 주소는 프런트엔드 `http://localhost:5173`, API `http://localhost:18765`입니다.

## 환경 변수

- 실제 키와 비밀번호는 루트 `.env`에만 입력합니다. `.env.example`에는 예시값만 유지합니다.
- `DATABASE_URL`, `JWT_SECRET`, Google·Kakao OAuth 키는 서버 실행에 필요합니다.
- `VITE_KAKAO_APP_KEY`는 브라우저에서 Kakao Maps JavaScript SDK를 불러오는 공개 JavaScript 키입니다.
- `ODSAY_SERVER_API_KEY`는 서버에서만 사용합니다. `VITE_` 접두어를 붙이면 브라우저에 노출되므로 사용하지 않습니다.

## 코드 점검

리팩토링이나 병합 뒤에는 아래 명령으로 문법과 핵심 단위 테스트를 확인합니다.

```bash
cd Server
npm run check
npm test
```

추천 기능은 `recommendation.service.mjs`가 전체 흐름을 조정하고, 점수 계산·식사 시간·경로 캐시·주변 식당 후보 탐색은 같은 폴더의 작은 모듈로 분리되어 있습니다.
