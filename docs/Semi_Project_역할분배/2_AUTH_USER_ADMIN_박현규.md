# 박현규 담당 업무 — 인증·프로필·관리자 사용자 관리

## 1. 한눈에 보기

| 항목 | 내용 |
|---|---|
| 담당 기능 | 로그인·회원가입·세션, 프로필, 관리자 권한, 사용자 관리 |
| 관련 요구사항 | `FR-38~42`, `FR-50`, `FR-51`, `FR-55` |
| 담당 화면 | `SCR-001~005`, `SCR-024~026` |
| 권장 브랜치 | `feature/auth-user-admin` |
| 핵심 완료 조건 | 사용자와 관리자의 인증·권한이 서버와 화면에서 모두 일관되게 적용됨 |

이 담당자는 다른 기능이 공통으로 사용하는 인증 기반을 만든다. `AuthProvider`, 보호 Route, 인증 미들웨어와 공통 `401/403` 처리를 먼저 제공해야 다른 담당자들이 API를 안전하게 연결할 수 있다.

## 2. 화면별로 무엇을 만들면 되는가

| 화면 | 구현 내용 | 완료 기준 |
|---|---|---|
| `SCR-001 로그인` | 아이디·비밀번호, 비밀번호 표시, 로그인 유지, 비밀번호 재설정 진입, Google·카카오 로그인 | 유효 계정은 `SCR-006`, 실패는 필드 오류 또는 `SCR-003`으로 이동 |
| `SCR-002 관리자 로그인` | 일반 사용자와 분리된 관리자 인증 진입점 | 관리자만 `SCR-026`으로 이동하고 일반 사용자 접근은 차단 |
| `SCR-003 로그인 오류` | 인증 실패·세션 만료·네트워크 오류 구분, 재시도 | 비밀번호는 보존·노출하지 않고 오류별 복귀 행동 제공 |
| `SCR-004 회원가입` | 필수 정보, 중복·형식 검사, 약관 동의 | 검증 통과 시 `SCR-005` 표시 |
| `SCR-005 회원가입 완료` | 가입 완료와 로그인 이동 | 로그인 버튼으로 `SCR-001` 이동 |
| `SCR-024 내 프로필` | 기본 정보·여행 선호, 보안, 로그아웃, 탈퇴 | 로그아웃은 세션 종료 후 `SCR-001`; 탈퇴는 재확인 후 처리 |
| `SCR-025 프로필 편집` | 허용된 기본 정보와 선호 수정 | 검증 성공 시 저장, 취소 시 기존 값 유지 |
| `SCR-026 사용자 관리` | 회원 지표, 검색·상태 필터, 월별 추이, 상태 변경, 문의 관리 진입 | 기준일 표시, 허용된 변경만 처리하고 이력 기록 |

## 3. 프론트엔드 담당 파일

```text
Client/src/pages/auth/
├── LoginPage.jsx
├── SignupPage.jsx
└── SignupSuccessPage.jsx

Client/src/pages/profile/
├── ProfilePage.jsx
└── ProfileEditPage.jsx

Client/src/pages/admin/
├── AdminLoginPage.jsx
└── UserManagementPage.jsx

Client/src/features/auth/
├── components/
│   ├── LoginForm.jsx
│   ├── SignupForm.jsx
│   └── SocialLoginButtons.jsx
└── auth.api.js

Client/src/features/profile/
├── components/
│   ├── ProfileCard.jsx
│   └── ProfileEditForm.jsx
└── profile.api.js

Client/src/features/admin/
├── components/
│   ├── AdminKpiCards.jsx
│   ├── UserFilter.jsx
│   ├── UserTable.jsx
│   └── UserStatusModal.jsx
└── admin.api.js

Client/src/app/providers/AuthProvider.jsx
Client/src/app/router/router.jsx
Client/src/app/router/ProtectedRoute.jsx
Client/src/app/router/AdminRoute.jsx
Client/src/shared/api/httpClient.js
```

## 4. 백엔드 담당 파일

```text
Server/src/modules/auth/
├── auth.router.mjs
├── auth.controller.mjs
├── auth.service.mjs
└── auth.repository.mjs

Server/src/modules/users/
├── user.router.mjs
├── user.controller.mjs
├── user.service.mjs
└── user.repository.mjs

Server/src/modules/admin/
├── admin.router.mjs
├── admin.controller.mjs
└── admin.service.mjs

Server/src/middleware/auth.mjs
Server/src/middleware/requireAdmin.mjs
Server/src/utils/jwt.mjs
Server/src/utils/cookie.mjs
```

관리자 사용자 조회 쿼리는 새로 중복 작성하지 말고 `user.repository.mjs`에서 공용 함수를 제공해 재사용한다.

## 5. 담당 API

### 인증

```text
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
GET  /api/auth/google
GET  /api/auth/google/callback
GET  /api/auth/kakao
GET  /api/auth/kakao/callback
```

### 프로필·계정

```text
GET    /api/users/me
PATCH  /api/users/me
PATCH  /api/users/me/password
DELETE /api/users/me
```

### 관리자 사용자 관리

```text
GET   /api/admin/users/stats
GET   /api/admin/users
PATCH /api/admin/users/:userId/status
```

공통 응답과 오류 형식은 [전체 API 구조 설계서](<./전체_구조_ ROUTA_API_STRUCTURE.md>)를 따른다.

## 6. 반드시 지킬 인증·권한 규칙

- 프론트 `ProtectedRoute`와 `AdminRoute`는 화면 이동을 제어한다.
- 백엔드 `auth.mjs`와 `requireAdmin.mjs`는 실제 데이터 접근을 다시 검사한다.
- 프론트의 관리자 표시 여부만으로 보안을 구현하면 안 된다.
- 일반 사용자는 자신의 `role`, `accountStatus`를 수정할 수 없다.
- `SUSPENDED`, `WITHDRAWN` 상태의 로그인·토큰 갱신 정책을 동일하게 적용한다.
- 인증 실패, 세션 만료, 네트워크 오류를 서로 다른 오류 코드로 구분한다.
- 오류 발생 시 아이디 등 안전한 입력만 보존하고 비밀번호는 항상 제거한다.
- 비밀번호는 해시로 저장하고 토큰·비밀번호를 로그에 기록하지 않는다.
- 상태 변경 성공 시 관리자 ID, 대상 사용자 ID, 변경 전후 상태, 변경 시각을 기록한다.

## 7. 다른 담당자에게 먼저 제공할 공통 기능

| 제공 대상 | 제공 항목 |
|---|---|
| 모든 담당자 | `httpClient` 사용법, 인증 쿠키 또는 토큰 전달 방식, 공통 `401/403` 처리 |
| 권민이 | `isAuth`, `requireAdmin`, 관리자 Router 연결 방식 |
| 조주영·이희승·송정근 | 현재 사용자 `userId`, 비로그인 접근 차단, 리소스 소유권 검사 방식 |

공통 파일 충돌을 막기 위해 `router.jsx`와 `httpClient.js`는 박현규가 최종 병합한다. 다른 담당자는 필요한 Route 목록과 API 옵션을 PR 설명에 적는다.

## 8. 구현 순서

1. 사용자 상태·역할·로그인 유지 정책과 오류 코드를 합의한다.
2. 일반 로그인·회원가입·로그아웃·토큰 갱신 API를 구현한다.
3. `auth.mjs`, `requireAdmin.mjs`와 소유권 검사 사용법을 공유한다.
4. `AuthProvider`, `httpClient`, 보호 Route를 구현한다.
5. `SCR-001~005`를 API와 연결한다.
6. 프로필 조회·수정·로그아웃·탈퇴를 구현한다.
7. 관리자 통계·목록·상태 변경과 이력 기록을 구현한다.
8. `SCR-026`과 관리자 권한을 연결한다.
9. Google·카카오 OAuth를 연결하고 취소·실패 흐름을 확인한다.
10. 일반 사용자·관리자·정지·탈퇴 계정으로 권한 회귀 테스트를 한다.

## 9. 완료 체크리스트

- [ ] 일반 로그인 성공 시 `SCR-006`, 관리자 로그인 성공 시 `SCR-026`으로 이동한다.
- [ ] 미입력·불일치·세션 만료·네트워크 오류가 구분되어 표시된다.
- [ ] 오류 후 비밀번호가 저장되거나 화면에 다시 노출되지 않는다.
- [ ] Google·카카오 인증 성공·취소·실패 흐름을 모두 재현할 수 있다.
- [ ] 회원가입 중복·형식·약관 검사를 통과해야만 가입된다.
- [ ] 새로고침과 토큰 갱신 후 로그인 상태가 정책대로 복원된다.
- [ ] 로그아웃 후 보호 화면과 보호 API에 접근할 수 없다.
- [ ] 일반 사용자는 `/admin/*` 및 `/api/admin/*`에 접근할 수 없다.
- [ ] 프로필 편집 취소 시 기존 값이 유지된다.
- [ ] 탈퇴는 재확인과 서버 정책 검사를 통과해야 실행된다.
- [ ] 사용자 관리 화면의 검색·필터·지표 기준일이 표시된다.
- [ ] 상태 변경 권한이 검사되고 변경 이력이 기록된다.

## 10. 담당하지 않는 범위

- 사용자 문의 내용과 답변 처리
- 여행 조건·장소 검색·추천 알고리즘
- 일정 지도·타임라인·저장 기능
- 장소 정보용 Kakao·Google API 연동

Google·카카오 OAuth는 담당하지만, 장소·좌표 검색에 쓰는 Kakao·Google API는 이희승 담당이다.
