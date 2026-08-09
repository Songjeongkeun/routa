# ROUTA 프로젝트 구조 안내

이 문서는 ROUTA 프로젝트의 주요 폴더와 파일이 담당하는 역할을 설명합니다.
새 기능을 추가하거나 기존 코드를 수정할 때, 어떤 위치에서 작업해야 하는지 판단하는 기준으로 사용합니다.

## 전체 구조

```text
routa/
├── Client/                 # React 기반 프론트엔드
├── Server/                 # Node.js·Express 기반 백엔드
├── database/               # PostgreSQL 스키마와 초기 데이터
├── docs/                   # 프로젝트 문서와 팀 역할 자료
├── .env.example            # 환경 변수 작성 예시
├── PROJECT_STRUCTURE.md    # 프로젝트 폴더 구조 설명
└── README.md               # 프로젝트 소개와 실행 방법
```

> macOS와 Linux에서는 폴더명의 대소문자가 구분될 수 있습니다. 경로를 작성할 때 `Client`, `Server`의 대소문자를 그대로 사용합니다.

## `Client/` — 프론트엔드

사용자가 브라우저에서 보는 화면과 사용자 상호작용을 담당합니다. React와 Vite를 사용하며, 화면 단위 코드와 기능 단위 코드를 분리합니다.

```text
Client/
├── public/                 # 빌드 과정 없이 그대로 제공되는 정적 파일
├── src/                    # 프론트엔드 소스 코드
│   ├── app/                # 앱 전체에 적용되는 설정
│   ├── pages/              # URL과 직접 연결되는 페이지
│   ├── features/           # 도메인별 기능, 컴포넌트, API 요청
│   ├── shared/             # 여러 기능에서 공통으로 사용하는 코드
│   └── main.jsx            # React 애플리케이션 진입점
├── index.html              # Vite가 사용하는 기본 HTML
├── vite.config.js          # Vite 개발 서버와 빌드 설정
└── package.json            # 프론트엔드 의존성과 실행 명령
```

### `Client/public/`

파비콘처럼 파일 이름과 경로를 유지한 채 웹에서 제공해야 하는 정적 파일을 둡니다. React 코드에서 import하여 사용하는 이미지나 아이콘은 `src/shared/assets/`에 둡니다.

### `Client/src/app/`

특정 화면 하나가 아니라 애플리케이션 전체에 영향을 주는 설정을 관리합니다.

- `router/`: URL과 페이지 연결, 로그인 및 관리자 접근 제어
- `providers/`: 인증 정보, 여행 계획처럼 여러 화면이 공유하는 전역 상태

### `Client/src/pages/`

라우터가 직접 렌더링하는 페이지 컴포넌트를 기능 영역별로 관리합니다.

| 폴더 | 역할 |
| --- | --- |
| `auth/` | 로그인, 회원가입, 가입 완료 화면 |
| `home/` | 로그인 후 메인 화면 |
| `planner/` | 여행 조건, 테마, 장소, 식사 선택 단계 |
| `course/` | 추천 경로 계산 중 화면과 결과 화면 |
| `schedule/` | 저장한 일정 조회 및 관리 화면 |
| `profile/` | 사용자 프로필 조회 및 수정 화면 |
| `inquiry/` | 사용자 문의 작성과 문의 내역 화면 |
| `admin/` | 관리자 로그인, 사용자 관리, 문의 관리 화면 |

페이지 컴포넌트는 화면의 전체 배치와 데이터 흐름을 조정합니다. 재사용 가능한 UI와 실제 기능 로직은 가급적 `features/` 또는 `shared/`로 분리합니다.

### `Client/src/features/`

업무 기능을 도메인별로 모아 둡니다. 각 기능 폴더에는 해당 기능에서만 사용하는 컴포넌트와 서버 API 호출 코드가 들어갑니다.

| 폴더 | 역할 |
| --- | --- |
| `auth/` | 로그인, 회원가입, 소셜 로그인 |
| `planner/` | 여행 조건, 날짜, 테마, 이동 기준 선택 |
| `place/` | 장소 검색, 선택, 추가, 순서 변경 |
| `course/` | 추천 경로 지도, 타임라인, 일정 편집 |
| `restaurant/` | 음식점 조회, 선택, 일정 추가 |
| `schedule/` | 저장 일정 조회 및 삭제 |
| `profile/` | 프로필 조회 및 수정 |
| `inquiry/` | 사용자 문의 등록 및 조회 |
| `admin/` | 사용자 및 문의 관리자 기능 |

일반적인 구성은 다음과 같습니다.

```text
features/<기능명>/
├── components/             # 해당 기능에서만 사용하는 UI
└── <기능명>.api.js          # 백엔드 API 요청 함수
```

### `Client/src/shared/`

둘 이상의 페이지나 기능에서 함께 사용하는 공통 코드를 관리합니다.

- `api/`: 서버 주소, 쿠키, 공통 오류 처리 등 HTTP 통신 설정
- `components/`: Button, Input, Modal 등 공통 UI 컴포넌트
- `layouts/`: 일반 사용자, 인증, 관리자 화면의 공통 레이아웃
- `assets/icons/`: 공통 아이콘
- `assets/images/`: 공통 이미지
- `styles/`: CSS 초기화, 디자인 토큰, 전역 스타일

특정 기능에서만 사용하는 코드를 편의상 `shared/`에 넣지 않습니다. 실제로 여러 기능에서 재사용되는 경우에만 공통 코드로 이동합니다.

## `Server/` — 백엔드

클라이언트의 API 요청을 처리하고, 인증·업무 규칙·데이터베이스 접근·외부 API 연동을 담당합니다.

```text
Server/
├── src/
│   ├── server.mjs          # 데이터베이스 연결 후 서버 실행
│   ├── app.mjs             # Express 앱, 미들웨어, 라우터 구성
│   ├── config.mjs          # 환경 변수 읽기와 설정 검증
│   ├── db/                 # 데이터베이스 연결 관리
│   ├── modules/            # 업무 도메인별 API 구현
│   ├── providers/          # 외부 서비스 API 연동
│   ├── middleware/         # 요청 처리 전후의 공통 로직
│   └── utils/              # 범용 보조 함수
└── package.json            # 백엔드 의존성과 실행 명령
```

### `Server/src/modules/`

API를 업무 도메인별로 분리합니다.

| 폴더 | 역할 |
| --- | --- |
| `auth/` | 로그인, 로그아웃, 인증 처리 |
| `users/` | 사용자 정보와 프로필 관리 |
| `places/` | 관광지와 음식점 데이터 조회 |
| `trips/` | 여행 조건, 선택 장소, 테마 관리 |
| `recommendations/` | 여행 경로 추천과 점수 계산 |
| `itineraries/` | 일정 조회, 편집, 저장 |
| `inquiries/` | 문의 등록, 조회, 답변 데이터 처리 |
| `admin/` | 관리자용 사용자 및 문의 관리 |

각 도메인은 보통 다음 계층으로 구성합니다.

```text
modules/<도메인>/
├── <도메인>.router.mjs       # HTTP 경로와 메서드 정의
├── <도메인>.controller.mjs   # 요청값과 응답 처리
├── <도메인>.service.mjs      # 업무 규칙과 처리 흐름
└── <도메인>.repository.mjs   # SQL 실행과 데이터베이스 접근
```

요청 처리 흐름은 다음과 같습니다.

```text
Client 요청
  → Router
  → Middleware
  → Controller
  → Service
  → Repository
  → PostgreSQL
```

- Router에는 URL 연결만 작성합니다.
- Controller에는 요청값 추출과 HTTP 응답 처리를 작성합니다.
- Service에는 실제 업무 규칙을 작성합니다.
- Repository에는 SQL과 데이터베이스 접근 코드만 작성합니다.

`recommendations/recommendation.scorer.mjs`는 추천 대상의 점수를 계산하는 도메인 로직을 별도로 관리합니다.

### `Server/src/providers/`

프로젝트 외부 서비스와 통신하는 코드를 관리합니다.

- `kakao.mjs`: Kakao API 연동
- `google.mjs`: Google API 연동
- `tourApi.mjs`: 한국관광공사 TourAPI 연동
- `odsay.mjs`: ODsay 대중교통 API 연동

외부 API 키는 코드에 직접 작성하지 않고 환경 변수로 관리합니다.

### `Server/src/middleware/`

여러 API 요청에 공통으로 적용되는 전처리와 후처리를 담당합니다.

- `auth.mjs`: 로그인 사용자 인증
- `requireAdmin.mjs`: 관리자 권한 확인
- `validate.mjs`: 요청 데이터 검증
- `errorHandler.mjs`: 공통 오류 응답 처리
- `notFound.mjs`: 존재하지 않는 API의 404 처리

### `Server/src/db/`와 `Server/src/utils/`

- `db/`: PostgreSQL 연결 Pool과 연결 설정
- `utils/`: JWT, 쿠키, 날짜, 로그처럼 특정 도메인에 속하지 않는 보조 기능

## 데이터베이스 스키마

현재 애플리케이션은 Supabase의 실제 PostgreSQL 스키마를 사용합니다. 로컬 `database/schema.sql` 파일은 사용하지 않습니다.

DB 구조를 변경할 때는 서버의 Repository 코드와 API 응답에 미치는 영향도 함께 확인해야 합니다. 향후 스키마 변경은 Supabase migration으로 버전 관리하고, 실제 비밀번호나 운영 데이터를 seed 파일에 넣지 않습니다.

## `docs/` — 프로젝트 문서

코드만으로 설명하기 어려운 설계, 협업 규칙, API 명세, 팀 역할 자료를 관리합니다.

- `Semi_Project_역할분배/`: 팀원별 담당 기능과 역할 문서
- 이후 API 명세, 회의 결정 사항, 개발 가이드 등도 이 폴더에서 관리

문서 파일명만 보고 용도를 알 수 있도록 명확한 이름을 사용합니다.

## 루트 파일

### `.env.example`

프로젝트 실행에 필요한 환경 변수의 이름과 예시 형식을 공유합니다. 실제 비밀값이 들어가는 `.env` 파일은 Git에 커밋하지 않습니다.

### `README.md`

프로젝트를 처음 보는 사람이 가장 먼저 읽는 문서입니다. 프로젝트 소개, 기술 스택, 설치 방법, 실행 명령, 환경 변수 설정, 팀 협업 규칙의 링크를 작성합니다.

### `PROJECT_STRUCTURE.md`

현재 읽고 있는 문서입니다. 폴더가 추가되거나 책임이 변경되면 실제 코드 구조와 함께 갱신합니다.

## 새 코드를 추가할 위치

| 추가하려는 코드 | 권장 위치 |
| --- | --- |
| 새로운 URL 화면 | `Client/src/pages/<기능>/` |
| 특정 기능 전용 UI | `Client/src/features/<기능>/components/` |
| 여러 기능이 쓰는 UI | `Client/src/shared/components/` |
| 프론트엔드 API 요청 | `Client/src/features/<기능>/<기능>.api.js` |
| 새로운 백엔드 API | `Server/src/modules/<도메인>/` |
| 외부 API 연동 | `Server/src/providers/` |
| 공통 인증·검증 처리 | `Server/src/middleware/` |
| SQL과 DB 조회 | 각 모듈의 `repository.mjs` |
| 테이블 및 초기 데이터 변경 | `database/` |
| 설계와 협업 문서 | `docs/` |

## 구조 관리 원칙

1. 페이지는 화면 조합에 집중하고, 재사용 가능한 로직은 `features/`로 분리합니다.
2. 한 기능에서만 사용하는 코드는 해당 기능 폴더 안에 둡니다.
3. 여러 기능에서 실제로 공유되는 코드만 `shared/` 또는 `utils/`에 둡니다.
4. Controller에서 SQL을 직접 실행하지 않고 Repository를 거칩니다.
5. API 키, 비밀번호, 토큰은 소스 코드와 Git 저장소에 커밋하지 않습니다.
6. 폴더 구조를 변경하면 이 문서도 함께 수정합니다.
