# 팀원 2 작업 명세 — 인증·프로필·관리자 사용자 관리

## 1. 담당 요약

| 항목 | 내용 |
|---|---|
| 담당 기능 | 인증, 프로필, 관리자 권한, 사용자 관리 |
| 난이도 | 중간 |
| 예상 작업량 | 8 |
| 권장 브랜치 | `feature/auth-user-admin` |

일반 사용자와 관리자의 로그인·권한 체계를 한 사람이 통합해서 담당한다. 다른 팀원들이 사용할 인증 미들웨어와 프론트 Router Guard도 이 담당자가 제공한다.

## 2. 담당 피그마 화면

```text
SCR_001 · Login
SCR_002 · Login_admin
SCR_003 · Login Error
SCR_004 · Signup
SCR_005 · Signup Success
SCR_024 · My Profile
SCR_025 · Profile Edit
SCR_026 · User Management
```

로그인 오류와 회원가입 성공은 별도 업무 기능이 아니라 로그인·회원가입의 상태 화면으로 구현한다.

## 3. 프론트엔드 작업 범위

```text
client/src/pages/auth/
├── LoginPage.jsx
├── SignupPage.jsx
└── SignupSuccessPage.jsx

client/src/pages/profile/
├── ProfilePage.jsx
└── ProfileEditPage.jsx

client/src/pages/admin/
├── AdminLoginPage.jsx
└── UserManagementPage.jsx

client/src/features/auth/
├── components/
│   ├── LoginForm.jsx
│   ├── SignupForm.jsx
│   └── SocialLoginButtons.jsx
└── auth.api.js

client/src/features/profile/
├── components/
│   ├── ProfileCard.jsx
│   └── ProfileEditForm.jsx
└── profile.api.js

client/src/features/admin/
├── components/
│   ├── AdminKpiCards.jsx
│   ├── UserFilter.jsx
│   ├── UserTable.jsx
│   └── UserStatusModal.jsx
└── admin.api.js

client/src/app/providers/
└── AuthProvider.jsx

client/src/app/router/
├── router.jsx
├── ProtectedRoute.jsx
└── AdminRoute.jsx
```

### 프론트엔드 구현 항목

- 일반 사용자 로그인
- 관리자 로그인 화면
- 로그인 실패 메시지
- 회원가입 입력 검증
- 회원가입 성공 화면
- 구글·카카오 로그인 버튼 연결
- 현재 사용자 정보 전역 관리
- 새로고침 시 로그인 상태 복원
- 일반 사용자 보호 Route
- 관리자 전용 Route
- 프로필 조회·수정
- 사용자 KPI·검색·상태 필터
- 관리자 사용자 상태 변경

## 4. 백엔드 작업 범위

```text
server/src/modules/auth/
├── auth.router.mjs
├── auth.controller.mjs
├── auth.service.mjs
└── auth.repository.mjs

server/src/modules/users/
├── user.router.mjs
├── user.controller.mjs
├── user.service.mjs
└── user.repository.mjs

server/src/modules/admin/
├── admin.router.mjs
├── admin.controller.mjs
└── admin.service.mjs

server/src/middleware/
├── auth.mjs
└── requireAdmin.mjs

server/src/utils/
├── jwt.mjs
└── cookie.mjs
```

관리자 서비스는 사용자 DB 쿼리를 새로 중복 작성하지 않고 `user.repository.mjs`를 재사용한다.

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

### 프로필

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

API 요청·응답 형식은 [ROUTA API 구조 설계서](../ROUTA_API_STRUCTURE.md)를 따른다.

## 6. 권한 규칙

```text
USER    일반 사용자 기능만 접근 가능
ADMIN   관리자 기능과 일반 기능 접근 가능
```

- 프론트 `AdminRoute`는 화면 접근을 제어한다.
- 백엔드 `requireAdmin`은 실제 데이터 접근을 제어한다.
- 프론트 검사만으로 관리자 보안을 구현하면 안 된다.
- 일반 사용자는 자신의 `role`과 `accountStatus`를 수정할 수 없다.
- `SUSPENDED`, `WITHDRAWN` 사용자는 로그인할 수 없다.

## 7. 다른 팀원에게 제공해야 하는 기능

### 모든 팀원에게 제공

- `httpClient.js`의 인증 쿠키 설정
- `AuthProvider` 사용 방법
- 보호 Route 사용 방법
- 로그인 사용자 식별 방식
- 공통 `401`, `403` 처리 방식

### 팀원 1에게 제공

- `isAuth`
- `requireAdmin`
- 관리자 Router 구조

### 팀원 3·5에게 제공

- 현재 사용자 `userId`
- 로그인하지 않은 사용자의 여행 데이터 접근 차단

## 8. 공통 파일 담당

```text
client/src/app/router/router.jsx
client/src/shared/api/httpClient.js
```

다른 팀원이 Route를 추가할 때 이 파일을 동시에 직접 수정하지 않도록, Route 등록 요청을 모아서 반영한다.

## 9. 구현 순서

1. 사용자 테이블과 기존 인증 코드 확인
2. 로그인·회원가입 API 완성
3. `isAuth`와 `requireAdmin` 구현
4. `AuthProvider`와 `httpClient` 구현
5. 로그인·회원가입 화면 연동
6. 프로필 API와 화면 구현
7. 관리자 사용자 통계·목록 API 구현
8. 관리자 사용자 관리 화면 구현
9. OAuth 연결
10. 권한 및 보안 테스트

## 10. 완료 체크리스트

- [ ] 일반 사용자가 회원가입하고 로그인할 수 있다.
- [ ] 관리자도 같은 로그인 API를 사용할 수 있다.
- [ ] 로그인 응답에 DB의 `role`이 포함된다.
- [ ] 새로고침 후 로그인 상태가 복원된다.
- [ ] 로그아웃 후 보호 페이지에 접근할 수 없다.
- [ ] 일반 사용자는 `/admin/*` 화면에 접근할 수 없다.
- [ ] 일반 사용자는 `/api/admin/*` API를 호출할 수 없다.
- [ ] 관리자가 사용자 통계를 조회할 수 있다.
- [ ] 관리자가 사용자 상태를 변경할 수 있다.
- [ ] 일반 사용자는 자신의 `role`을 변경할 수 없다.
- [ ] 정지·탈퇴한 사용자는 로그인할 수 없다.

