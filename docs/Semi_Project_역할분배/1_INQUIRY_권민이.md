# 팀원 1 작업 명세 — 사용자 문의·관리자 답변

## 1. 담당 요약

| 항목 | 내용 |
|---|---|
| 담당 기능 | 사용자 문의 등록·조회, 관리자 문의 답변 |
| 난이도 | 쉬움 |
| 예상 작업량 | 5 |
| 권장 브랜치 | `feature/inquiry` |

이 기능은 폼·목록·상세·답변 등록 위주의 독립적인 CRUD 기능이다. 추천 경로 계산이나 지도 기능과 직접 연결되지 않아 비교적 쉽게 개발할 수 있다.

## 2. 담당 피그마 화면

```text
SCR_027 · 내 문의
SCR_028 · 새 문의 작성
SCR_029 · 문의 답변 관리
```

## 3. 프론트엔드 작업 범위

```text
client/src/pages/inquiry/
├── MyInquiriesPage.jsx          # 내가 작성한 문의 목록과 답변 상태
└── NewInquiryPage.jsx           # 새 문의 작성 폼

client/src/pages/admin/
└── InquiryManagementPage.jsx    # 관리자의 문의 목록·상세·답변 화면

client/src/features/inquiry/
├── components/
│   ├── InquiryStats.jsx         # 전체·답변 완료·답변 대기 건수
│   ├── InquiryList.jsx          # 일반 사용자 문의 목록
│   ├── InquiryStatusBadge.jsx   # WAITING·ANSWERED 상태 표시
│   └── InquiryForm.jsx          # 문의 제목·내용 입력 폼
└── inquiry.api.js               # 사용자 문의 API 요청

client/src/features/admin/components/
├── InquiryAdminList.jsx         # 관리자용 전체 문의 목록
├── InquiryDetail.jsx            # 선택한 문의 상세
└── InquiryReplyForm.jsx         # 관리자 답변 작성 폼
```

### 프론트엔드 구현 항목

- 문의 제목 최대 50자 검사
- 문의 내용 필수 입력 검사
- 문의 등록 성공 후 내 문의 목록으로 이동
- 문의 상태를 `답변 대기` 또는 `답변 완료`로 표시
- 목록에서 문의를 선택하면 상세 내용과 답변 표시
- 관리자 화면에서 미답변 문의 건수 표시
- 관리자 답변 등록 후 목록과 상세 상태 갱신
- 로딩·빈 목록·오류 상태 처리

## 4. 백엔드 작업 범위

```text
server/src/modules/inquiries/
├── inquiry.router.mjs           # 사용자 문의 API 주소
├── inquiry.controller.mjs       # 요청값 수신 및 HTTP 응답
├── inquiry.service.mjs          # 문의 소유권·상태·답변 규칙
└── inquiry.repository.mjs       # 문의 관련 PostgreSQL 쿼리
```

관리자 문의 API는 `admin.router.mjs`에 연결하되, 실제 문의 조회와 답변 로직은 `inquiry.service.mjs`를 재사용한다.

## 5. 담당 API

### 일반 사용자 API

| Method | URL | 설명 |
|---|---|---|
| `GET` | `/api/inquiries` | 내가 작성한 문의 목록 |
| `POST` | `/api/inquiries` | 새 문의 등록 |
| `GET` | `/api/inquiries/:inquiryId` | 내 문의와 답변 상세 |

### 관리자 API

| Method | URL | 설명 |
|---|---|---|
| `GET` | `/api/admin/inquiries` | 전체 사용자 문의 목록 |
| `GET` | `/api/admin/inquiries/:inquiryId` | 문의 상세 |
| `POST` | `/api/admin/inquiries/:inquiryId/reply` | 관리자 답변 등록 |

API 요청·응답 형식은 [ROUTA API 구조 설계서](../ROUTA_API_STRUCTURE.md)를 따른다.

## 6. 필요한 DB 데이터

```text
inquiries
├── inquiry_id
├── user_id
├── itinerary_id           선택값
├── title
├── content
├── status                 WAITING 또는 ANSWERED
├── answer_content
├── answered_by            관리자 user_id
├── created_at
├── answered_at
└── updated_at
```

## 7. 다른 팀원에게 받아야 하는 기능

### 팀원 2에게 받을 것

- `isAuth` 인증 미들웨어
- `requireAdmin` 관리자 권한 미들웨어
- `AuthProvider`의 로그인 사용자 정보
- 공통 `httpClient.js`
- 관리자 Router와 `AdminLayout`

### 팀원 5와 맞출 것

문의 작성 시 관련 일정을 선택적으로 연결할 경우 `itineraryId` 필드 형식을 협의한다. 일정 연결은 필수가 아니므로 초기 구현에서는 `null`을 허용한다.

## 8. 담당하지 않는 작업

- JWT 생성·검증
- 로그인과 관리자 권한 구현
- 추천 경로 계산
- 지도 및 장소 검색
- 공통 DB 연결 설정
- 문의 첨부파일 업로드
- 문의 수정·삭제

첨부파일·문의 수정·삭제는 현재 피그마에 명확한 기능이 없으므로 MVP에서 제외한다.

## 9. 구현 순서

1. 문의 목록·등록용 Mock 데이터 작성
2. `MyInquiriesPage`와 `NewInquiryPage` UI 구현
3. 관리자 문의 목록·상세·답변 UI 구현
4. 문의 테이블 및 repository 구현
5. 사용자 문의 API 구현
6. 관리자 문의 API 구현
7. 인증·관리자 미들웨어 연결
8. 프론트 API 연동
9. 소유권과 관리자 권한 테스트

## 10. 완료 체크리스트

- [ ] 로그인 사용자가 새 문의를 등록할 수 있다.
- [ ] 사용자는 자신의 문의만 조회할 수 있다.
- [ ] 다른 사용자의 문의 ID로 접근하면 `403` 또는 `404`가 반환된다.
- [ ] 관리자는 전체 문의를 조회할 수 있다.
- [ ] 일반 사용자는 관리자 문의 API를 호출할 수 없다.
- [ ] 관리자가 답변하면 상태가 `ANSWERED`로 변경된다.
- [ ] 답변 내용과 답변 시각이 일반 사용자 화면에 표시된다.
- [ ] 문의가 없을 때 빈 목록 화면이 표시된다.
- [ ] 모든 API 오류가 공통 오류 형식으로 표시된다.

