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
2. PostgreSQL에서 `database/schema.sql`을 실행합니다.
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
