# 권민이 담당 업무 — 사용자 문의·관리자 답변

## 1. 한눈에 보기

| 항목 | 내용 |
|---|---|
| 담당 기능 | 사용자의 문의 작성·조회, 관리자의 문의 조회·답변 |
| 관련 요구사항 | `FR-52`, `FR-53`, `FR-54` |
| 담당 화면 | `SCR-027`, `SCR-028`, `SCR-029` |
| 권장 브랜치 | `feature/inquiry` |
| 핵심 완료 조건 | 사용자는 본인 문의만 보고, 관리자는 답변을 등록하며, 양쪽 화면의 상태와 답변이 동일하게 갱신됨 |

이 업무는 문의를 등록하고 답변하는 CRUD 기능이다. 경로 추천 알고리즘이나 지도 기능은 만들지 않는다. 다만 로그인 사용자와 관리자 권한 정보가 반드시 필요하므로 박현규 담당 기능과 연결해야 한다.

## 2. 화면별로 무엇을 만들면 되는가

| 화면 | 구현 내용 | 완료 기준 |
|---|---|---|
| `SCR-027 내 문의` | 내 문의 목록, 검색, 답변 상태 필터, 문의 상세와 답변 표시 | 로그인한 사용자가 작성한 문의만 표시되고, `답변 대기`·`답변 완료`가 텍스트와 배지로 구분됨 |
| `SCR-028 새 문의 작성` | 제목·내용 입력, 취소·등록 | 제목은 필수·최대 50자, 내용은 필수이며 등록 후 `SCR-027`에서 새 문의가 보임 |
| `SCR-029 문의 답변 관리` | 관리자용 목록·상태 필터·상세·답변 입력 | 답변 등록 후 관리자와 사용자 화면 모두 `답변 완료`와 같은 답변 내용을 표시함 |

대표 흐름은 다음과 같다.

```text
사용자: SCR-027 → SCR-028 → 등록 → SCR-027
관리자: SCR-026 → SCR-029 → 답변 등록 → SCR-029
동기화: 관리자 답변 완료 → 사용자 SCR-027의 상태·답변 갱신
```

## 3. 프론트엔드 담당 파일

```text
Client/src/pages/inquiry/
├── MyInquiriesPage.jsx
└── NewInquiryPage.jsx

Client/src/pages/admin/
└── InquiryManagementPage.jsx

Client/src/features/inquiry/
├── components/
│   ├── InquiryStats.jsx
│   ├── InquiryList.jsx
│   ├── InquiryStatusBadge.jsx
│   └── InquiryForm.jsx
└── inquiry.api.js

Client/src/features/admin/components/
├── InquiryAdminList.jsx
├── InquiryDetail.jsx
└── InquiryReplyForm.jsx
```

반드시 처리할 화면 상태:

- 목록 로딩 중
- 문의가 없는 빈 상태
- 검색·필터 결과가 없는 상태
- 등록·조회·답변 실패 상태와 재시도
- 답변 등록 성공 상태
- 권한이 없는 접근 상태

## 4. 백엔드 담당 파일

```text
Server/src/modules/inquiries/
├── inquiry.router.mjs
├── inquiry.controller.mjs
├── inquiry.service.mjs
└── inquiry.repository.mjs
```

- `router`: URL과 인증·관리자 미들웨어 연결
- `controller`: 요청값을 받고 공통 응답 형식으로 반환
- `service`: 문의 소유권, 제목 길이, 답변 상태 변경 규칙 처리
- `repository`: 문의 목록·상세·등록·답변 SQL 처리

관리자 URL은 `admin.router.mjs`에 연결하되, 문의 조회·답변 규칙은 `inquiry.service.mjs`를 재사용한다.

## 5. 담당 API

| 사용자 | Method | URL | 설명 |
|---|---|---|---|
| 일반 사용자 | `GET` | `/api/inquiries` | 내 문의 목록 조회; 검색어·상태 필터 지원 |
| 일반 사용자 | `POST` | `/api/inquiries` | 새 문의 등록 |
| 일반 사용자 | `GET` | `/api/inquiries/:inquiryId` | 내 문의 상세와 답변 조회 |
| 관리자 | `GET` | `/api/admin/inquiries` | 전체 문의 목록 조회 |
| 관리자 | `GET` | `/api/admin/inquiries/:inquiryId` | 문의 상세 조회 |
| 관리자 | `POST` | `/api/admin/inquiries/:inquiryId/reply` | 답변 등록 및 상태 변경 |

공통 응답과 오류 형식은 [전체 API 구조 설계서](<./전체_구조_ ROUTA_API_STRUCTURE.md>)를 따른다.

## 6. 데이터와 업무 규칙

```text
inquiries
├── inquiry_id
├── user_id
├── itinerary_id       선택값, 초기에는 null 허용
├── title              필수, 최대 50자
├── content            필수
├── status             WAITING | ANSWERED
├── answer_content
├── answered_by        답변한 관리자 user_id
├── created_at
├── answered_at
└── updated_at
```

- 새 문의는 `WAITING`으로 생성한다.
- 일반 사용자 목록·상세 쿼리에는 반드시 현재 로그인 사용자의 `user_id` 조건을 넣는다.
- 존재하지 않거나 다른 사용자의 문의는 프로젝트에서 정한 한 가지 방식(`404` 권장)으로 일관되게 응답한다.
- 답변 내용은 비어 있을 수 없다.
- 답변 등록 성공 시 `answer_content`, `answered_by`, `answered_at`, `status=ANSWERED`를 한 번에 갱신한다.
- 중복 답변을 허용할지 수정으로 처리할지는 팀 합의가 필요하다. MVP에서는 이미 답변된 문의에 재등록을 막는 방식을 권장한다.

## 7. 다른 담당자와 맞춰야 할 내용

| 담당자 | 받을 것 | 내가 제공할 것 |
|---|---|---|
| 박현규 | `isAuth`, `requireAdmin`, 현재 사용자 정보, 공통 `httpClient`, 관리자 Route | 문의 화면 Route와 관리자 문의 API 연결 요청 |
| 송정근 | 선택적으로 연결할 `itineraryId` 형식 | 문의 상세에서 사용할 일정 ID 필드 규칙 |

인수인계 전에 다음을 문서나 Mock 응답으로 공유한다.

- 문의 목록·상세·등록·답변 요청/응답 예제
- `WAITING`, `ANSWERED` 값과 사용자 표시 문구
- `401`, `403`, `404`, 입력 오류 코드
- 목록 검색어·상태 필터 파라미터 이름

## 8. 구현 순서

1. 문의 데이터 구조와 Mock 응답을 먼저 확정한다.
2. `SCR-027`, `SCR-028`, `SCR-029`를 Mock 데이터로 구현한다.
3. 문의 테이블·repository·service를 구현한다.
4. 일반 사용자 API를 연결하고 소유권 검사를 테스트한다.
5. 관리자 API를 연결하고 관리자 권한을 테스트한다.
6. 답변 후 사용자·관리자 화면 동기화를 확인한다.
7. 로딩·빈 상태·오류·재시도까지 확인한다.

## 9. 완료 체크리스트

- [ ] 제목 미입력·50자 초과와 내용 미입력 시 정확한 필드 오류가 표시된다.
- [ ] 문의 등록 성공 후 `SCR-027`에 신규 문의와 `답변 대기` 상태가 표시된다.
- [ ] 사용자는 본인이 작성한 문의만 목록과 상세에서 조회할 수 있다.
- [ ] 다른 사용자의 문의 ID 직접 접근은 차단된다.
- [ ] 일반 사용자는 관리자 문의 API와 `SCR-029`에 접근할 수 없다.
- [ ] 관리자는 문의 목록·상세를 보고 답변을 등록할 수 있다.
- [ ] 답변 등록 후 상태가 `ANSWERED`로 바뀌고 사용자 화면에서도 같은 답변이 보인다.
- [ ] 목록·검색 결과가 없을 때 오류 대신 빈 상태가 표시된다.
- [ ] 모든 실패 응답이 공통 오류 형식이며 화면에 재시도 행동이 있다.

## 10. 담당하지 않는 범위

- 로그인·JWT·관리자 권한 자체 구현
- 추천 경로 계산, 지도, 장소 검색
- 문의 첨부파일, 문의 수정·삭제

첨부파일과 문의 수정·삭제는 현재 요구사항과 화면에 없으므로 MVP 범위에서 제외한다.
