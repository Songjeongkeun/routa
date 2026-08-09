# ROUTA API 구조 설계서

## 0. 먼저 읽기 — 담당자와 연결 지점

이 문서는 팀 전체가 공유하는 API 계약이다. 개인별 작업 범위는 아래 문서에서 확인하고, URL·필드명·상태값이 충돌하면 이 문서와 팀 합의로 한 번만 확정한다.

| 담당자 | 주 담당 영역 | 관련 화면 | 주요 요구사항 | 역할 문서 |
|---|---|---|---|---|
| 권민이 | 사용자 문의·관리자 답변 | `SCR-027~029` | `FR-52~54` | [문의 역할](./1_INQUIRY_권민이.md) |
| 박현규 | 인증·프로필·관리자 사용자 관리 | `SCR-001~005`, `024~026` | `FR-38~42`, `50`, `51`, `55` | [인증·관리자 역할](./2_AUTH_USER_ADMIN_박현규.md) |
| 조주영 | 홈·단계형 여행 설정·장소 검색 | `SCR-006~012` | `FR-01~08`, `35`, `43~45` | [여행 설정 역할](./3_PLANNER_PLACE_조주영.md) |
| 이희승 | 외부 API·추천 계산·계산 상태 | `SCR-018` 상태 데이터 | `FR-09~27`, `36`, `37`, `46` 서버 부분 | [추천 계산 역할](./4_RECOMMENDATION_이희승.md) |
| 송정근 | 음식점·결과 UI·일정 편집·저장 | `SCR-013~023` | `FR-23~34`, `36`, `37`, `46~49` 화면·일정 부분 | [일정 역할](./5_ITINERARY_송정근.md) |

### 공동 작업 경계

| 연결 지점 | 담당 구분 |
|---|---|
| `SCR-013 음식점 선택` | 송정근이 화면을 만들고 조주영이 `tripPlan` 식사 조건 저장 API를 제공한다. 이희승은 90분 식사 노드 검증·배치를 담당한다. |
| `SCR-015 조건 변경 경고` | 송정근이 모달을 만들고 조주영이 조건 초기화·설정 화면 복귀 함수를 제공한다. |
| `SCR-018 경로 생성 중` | 송정근이 로딩 화면을 만들고 이희승이 `runId`·상태·취소 API를 제공한다. |
| `SCR-014 추천 경로 결과` | 이희승이 일정 DTO를 만들고 송정근이 카드·지도·타임라인을 동일한 `itineraryId`로 렌더링한다. |
| 인증·소유권 | 박현규가 공통 인증 기반을 제공하고 각 담당자가 자신의 리소스 조회·수정 API에 소유권 검사를 적용한다. |

### 문서 해석 기준

- 화면 공식 명칭은 `서비스 화면 목록 및 사용자 흐름 정의서.docx`를 따른다.
- 기능 범위와 완료 기준은 `요구사항 정의서.docx`의 `FR-01~55`를 따른다.
- 계산·추천 정책은 `기획서 최종안_v3.docx`를 참고하되, 다른 문서와 충돌하면 팀이 확정한 최신 요구사항을 우선한다.
- `SCR-008`은 **여행 설정(반려동물 동반)**, `SCR-014`는 **추천 경로 결과**다. 과거 Figma 프레임명은 공식 화면명으로 사용하지 않는다.
- 장소 체류시간은 30분 단위이며 점심·저녁 식사시간은 모두 **90분**이다.
- 이동 완충시간은 일반 구간 10분, 반려동물 동반 구간 15분, 고정 일정 전 최소 20분이다.
- 실제 저장소 폴더명은 `Client`, `Server`다. 아래 예시의 소문자 경로는 모듈 설명용 표기로 보고 구현할 때 실제 대소문자를 사용한다.

## 1. 문서 목적

이 문서는 ROUTA 피그마 화면과 현재 Node.js·Express·PostgreSQL 구조를 기준으로 프론트엔드와 백엔드가 함께 사용할 API 계약을 정리한다.

대상 기능은 다음과 같다.

- 일반 사용자 및 관리자 인증
- 사용자 프로필
- 장소 및 음식점 검색
- 여행 조건 입력
- 추천 경로 계산
- 추천 일정 조회·편집·저장
- 사용자 문의 등록·조회
- 관리자 사용자 관리 및 문의 답변

## 2. 핵심 데이터 구분

| 데이터 | 역할 |
|---|---|
| `tripPlan` | 사용자가 여행 계획 단계에서 입력하는 날짜·테마·장소·식사 조건 초안 |
| `recommendation` | 입력된 조건을 이용해 추천 경로를 계산하는 실행 작업 |
| `itinerary` | 추천 계산으로 생성된 실제 일정과 타임라인 |
| `place` | 관광지·음식점·카페·역 등 경로에 포함할 수 있는 장소 |
| `inquiry` | 일반 사용자가 작성하고 관리자가 답변하는 문의 |

여행 조건과 생성된 일정을 분리하는 이유는 사용자가 같은 조건으로 여러 추천 코스를 생성하거나, 생성된 일정만 별도로 수정·저장할 수 있기 때문이다.

## 3. 기본 API 경로

```text
/api
├── /auth                       인증
├── /users                      사용자 프로필
├── /places                     관광지·음식점 검색
├── /trip-plans                 여행 조건 초안
├── /recommendations            추천 계산 작업
├── /itineraries                결과 일정 조회·편집·저장
├── /inquiries                  일반 사용자 문의
└── /admin                      관리자 전용 기능
```

## 4. 공통 응답 규칙

### 4.1 단일 데이터 성공 응답

```json
{
  "data": {
    "id": "resource-id"
  }
}
```

### 4.2 목록 성공 응답

```json
{
  "data": {
    "items": [],
    "page": 1,
    "size": 20,
    "totalCount": 0
  }
}
```

### 4.3 오류 응답

```json
{
  "error": {
    "code": "TRIP_PLAN_NOT_FOUND",
    "message": "여행 계획을 찾을 수 없습니다.",
    "details": null
  }
}
```

### 4.4 HTTP 상태 코드

| 상태 | 사용 상황 |
|---:|---|
| `200 OK` | 조회·수정 성공 |
| `201 Created` | 회원·여행 계획·문의 생성 성공 |
| `202 Accepted` | 추천 경로 계산 작업 접수 |
| `204 No Content` | 삭제·로그아웃 성공 |
| `400 Bad Request` | 입력값 오류 |
| `401 Unauthorized` | 로그인 필요 또는 토큰 만료 |
| `403 Forbidden` | 관리자 권한 없음 또는 다른 사용자 데이터 접근 |
| `404 Not Found` | 대상 데이터 없음 |
| `409 Conflict` | 아이디·이메일 중복 또는 상태 충돌 |
| `500 Internal Server Error` | 서버 내부 오류 |

## 5. 인증 API

담당 백엔드 모듈:

```text
server/src/modules/auth/
```

| Method | URL | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/api/auth/signup` | 불필요 | 일반 회원가입 |
| `POST` | `/api/auth/login` | 불필요 | 일반 사용자·관리자 공통 로그인 |
| `POST` | `/api/auth/logout` | 필요 | 로그아웃 및 인증 쿠키 제거 |
| `POST` | `/api/auth/refresh` | Refresh Token | Access Token 재발급 |
| `GET` | `/api/auth/google` | 불필요 | 구글 OAuth 시작 |
| `GET` | `/api/auth/google/callback` | 불필요 | 구글 OAuth 결과 처리 |
| `GET` | `/api/auth/kakao` | 불필요 | 카카오 OAuth 시작 |
| `GET` | `/api/auth/kakao/callback` | 불필요 | 카카오 OAuth 결과 처리 |

### 5.1 회원가입

```http
POST /api/auth/signup
```

```json
{
  "loginId": "traveler01",
  "email": "traveler@example.com",
  "password": "password123!",
  "nickname": "김여행"
}
```

```json
{
  "data": {
    "userId": 1,
    "loginId": "traveler01",
    "email": "traveler@example.com",
    "nickname": "김여행",
    "role": "USER"
  }
}
```

### 5.2 로그인

일반 사용자 로그인 화면과 관리자 로그인 화면은 동일한 API를 사용한다. 로그인 성공 후 DB의 `role` 값으로 이동 경로와 권한을 결정한다.

```http
POST /api/auth/login 
```

```json
{
  "loginId": "admin",
  "password": "admin-password"
}
```

```json
{
  "data": {
    "user": {
      "userId": 1,
      "nickname": "관리자",
      "role": "ADMIN"
    }
  }
}
```

프론트엔드는 응답의 `role`을 확인해 일반 화면 또는 관리자 화면으로 이동한다. 관리자 권한의 최종 검증은 반드시 백엔드의 `requireAdmin` 미들웨어에서 수행한다.

## 6. 사용자 프로필 API

담당 백엔드 모듈:

```text
server/src/modules/users/
```

| Method | URL | 설명 |
|---|---|---|
| `GET` | `/api/users/me` | 현재 로그인 사용자 정보 조회 |
| `PATCH` | `/api/users/me` | 닉네임·이메일 등 프로필 수정 |
| `PATCH` | `/api/users/me/password` | 비밀번호 변경 |
| `DELETE` | `/api/users/me` | 회원 탈퇴 |

### 6.1 내 정보 조회

```http
GET /api/users/me
```

```json
{
  "data": {
    "userId": 25,
    "loginId": "traveler01",
    "email": "traveler@example.com",
    "nickname": "김여행",
    "profileImageUrl": null,
    "signupType": "LOCAL",
    "role": "USER",
    "createdAt": "2026-08-02T09:00:00Z"
  }
}
```

### 6.2 프로필 수정

```http
PATCH /api/users/me
```

```json
{
  "nickname": "서울여행자",
  "email": "new-email@example.com"
}
```

`userId`, `role`, `accountStatus`는 일반 사용자가 수정할 수 없다. 요청 body에 해당 필드가 포함돼도 서버가 무시하거나 입력 오류로 처리해야 한다.

## 7. 장소 검색 API

담당 백엔드 모듈:

```text
server/src/modules/places/
```

관광지와 음식점은 모두 `place`로 관리한다. 장소 종류는 `kind`로 구분한다.

| Method | URL | 설명 |
|---|---|---|
| `GET` | `/api/places` | 장소 검색·필터·페이지 조회 |
| `GET` | `/api/places/:placeId` | 장소 상세 조회 |
| `GET` | `/api/places/:placeId/hours` | 운영시간 조회 |
| `GET` | `/api/places/themes` | 선택 가능한 여행 테마 목록 |

### 7.1 장소 검색

```http
GET /api/places?keyword=서울숲&kind=ATTRACTION&page=1&size=20
```

| Query | 설명 |
|---|---|
| `keyword` | 장소명 검색어 |
| `kind` | `ATTRACTION`, `RESTAURANT`, `CAFE` 등 |
| `theme` | `HISTORY_TRADITION`, `VIEW_NIGHT` 등 |
| `district` | 성동구·종로구 등 지역 필터 |
| `page` | 페이지 번호 |
| `size` | 한 페이지 결과 수 |

```json
{
  "data": {
    "items": [
      {
        "placeId": "place-uuid",
        "name": "서울숲",
        "kind": "ATTRACTION",
        "address": "서울특별시 성동구 뚝섬로 273",
        "latitude": 37.5444,
        "longitude": 127.0374,
        "defaultStayMinutes": 90,
        "thumbnailUrl": "/images/seoul-forest.jpg",
        "themes": ["VIEW_NIGHT", "CAFE_MOOD"]
      }
    ],
    "page": 1,
    "size": 20,
    "totalCount": 1
  }
}
```

## 8. 여행 계획 입력 API

담당 백엔드 모듈:

```text
server/src/modules/trips/
```

| Method | URL | 설명 |
|---|---|---|
| `POST` | `/api/trip-plans` | 여행 계획 초안 생성 |
| `GET` | `/api/trip-plans/:tripPlanId` | 작성 중인 초안 조회 |
| `PATCH` | `/api/trip-plans/:tripPlanId/conditions` | 날짜·시간·여행 성격 수정 |
| `PUT` | `/api/trip-plans/:tripPlanId/themes` | 관심 테마 전체 저장 |
| `PUT` | `/api/trip-plans/:tripPlanId/places` | 필수 방문 장소 전체 저장 |
| `PUT` | `/api/trip-plans/:tripPlanId/meals` | 점심·저녁 조건 전체 저장 |
| `DELETE` | `/api/trip-plans/:tripPlanId` | 여행 계획 초안 삭제 |

### 8.1 여행 계획 생성

```http
POST /api/trip-plans
```

```json
{
  "tripStyle": "GENERAL",
  "travelDate": "2026-08-19",
  "startTime": "09:00",
  "endTime": "21:00",
  "trafficBasis": "WEEKDAY",
  "startPlaceName": "서울역",
  "endLocationMode": "RETURN_TO_START",
  "petCompanion": false
}
```

```json
{
  "data": {
    "tripPlanId": "trip-plan-uuid",
    "status": "DRAFT"
  }
}
```

### 8.2 테마 저장

선택된 테마 목록 전체를 교체하므로 `PUT`을 사용한다.

```http
PUT /api/trip-plans/:tripPlanId/themes
```

```json
{
  "themeCodes": [
    "HISTORY_TRADITION",
    "CAFE_MOOD"
  ]
}
```

### 8.3 필수 방문 장소 저장

```http
PUT /api/trip-plans/:tripPlanId/places
```

```json
{
  "places": [
    {
      "placeId": "place-palace",
      "order": 1,
      "stayMinutes": 120
    },
    {
      "placeId": "place-bukchon",
      "order": 2,
      "stayMinutes": 90
    }
  ]
}
```

### 8.4 식사 조건 저장

```http
PUT /api/trip-plans/:tripPlanId/meals
```

```json
{
  "lunch": {
    "mode": "NEARBY_RECOMMEND",
    "placeId": null
  },
  "dinner": {
    "mode": "SKIP",
    "placeId": null
  }
}
```

식사 모드는 다음 값으로 통일한다.

| 값 | 설명 |
|---|---|
| `SPECIFIED` | 사용자가 음식점을 직접 지정 |
| `NEARBY_RECOMMEND` | 경로 주변 음식점 추천 요청 |
| `SKIP` | 해당 식사를 일정에서 제외 |

## 9. 추천 경로 생성 API

담당 백엔드 모듈:

```text
server/src/modules/recommendations/
```

| Method | URL | 설명 |
|---|---|---|
| `POST` | `/api/trip-plans/:tripPlanId/recommendations` | 추천 경로 계산 시작 |
| `GET` | `/api/recommendations/:runId` | 계산 상태와 결과 확인 |
| `POST` | `/api/recommendations/:runId/cancel` | 진행 중인 계산 취소 |

### 9.1 추천 계산 시작

```http
POST /api/trip-plans/:tripPlanId/recommendations
```

```json
{
  "data": {
    "runId": "recommendation-run-uuid",
    "status": "QUEUED"
  }
}
```

추천 계산은 즉시 완료되지 않을 수 있으므로 `202 Accepted`로 응답한다.

### 9.2 추천 계산 상태 조회

피그마의 경로 계산 로딩 화면에서 주기적으로 호출한다.

```http
GET /api/recommendations/:runId
```

계산 중 응답:

```json
{
  "data": {
    "runId": "recommendation-run-uuid",
    "status": "RUNNING",
    "progress": 60
  }
}
```

완료 응답:

```json
{
  "data": {
    "runId": "recommendation-run-uuid",
    "status": "SUCCEEDED",
    "itineraries": [
      {
        "itineraryId": "itinerary-1",
        "courseKind": "SHORTEST_WALK",
        "totalMinutes": 520,
        "walkingDistanceMeters": 4200
      },
      {
        "itineraryId": "itinerary-2",
        "courseKind": "FASTEST_TRANSIT",
        "totalMinutes": 460,
        "walkingDistanceMeters": 5700
      },
      {
        "itineraryId": "itinerary-3",
        "courseKind": "BALANCED",
        "totalMinutes": 490,
        "walkingDistanceMeters": 4800
      }
    ]
  }
}
```

## 10. 추천 일정 조회·편집 API

담당 백엔드 모듈:

```text
server/src/modules/itineraries/
```

| Method | URL | 설명 |
|---|---|---|
| `GET` | `/api/itineraries/:itineraryId` | 일정·경로·타임라인 조회 |
| `POST` | `/api/itineraries/:itineraryId/items` | 일정에 관광지·음식점 추가 |
| `PATCH` | `/api/itineraries/:itineraryId/items/:itemId` | 체류시간 등 항목 수정 |
| `DELETE` | `/api/itineraries/:itineraryId/items/:itemId` | 일정에서 항목 삭제 |
| `PUT` | `/api/itineraries/:itineraryId/items/order` | 일정 항목 순서 일괄 변경 |
| `POST` | `/api/itineraries/:itineraryId/recalculate` | 변경된 일정의 이동 경로 재계산 |
| `POST` | `/api/itineraries/:itineraryId/save` | 일정을 저장 상태로 변경 |

### 10.1 일정 결과 조회

```http
GET /api/itineraries/:itineraryId
```

```json
{
  "data": {
    "itineraryId": "itinerary-uuid",
    "courseKind": "BALANCED",
    "travelDate": "2026-08-19",
    "startTime": "09:00",
    "endTime": "20:30",
    "summary": {
      "totalMinutes": 690,
      "walkingDistanceMeters": 5400,
      "transferCount": 4
    },
    "items": [
      {
        "itemId": "item-1",
        "kind": "START",
        "placeId": "seoul-station",
        "placeName": "서울역",
        "arrivalTime": "09:00",
        "stayMinutes": 0,
        "order": 1
      },
      {
        "itemId": "item-2",
        "kind": "VISIT",
        "placeId": "gyeongbokgung",
        "placeName": "경복궁",
        "arrivalTime": "09:25",
        "stayMinutes": 120,
        "order": 2
      }
    ],
    "legs": [
      {
        "fromItemId": "item-1",
        "toItemId": "item-2",
        "durationMinutes": 25,
        "steps": [
          {
            "mode": "WALK",
            "description": "서울역 정류장까지 도보 3분"
          },
          {
            "mode": "BUS",
            "routeName": "272",
            "description": "버스 272번 탑승"
          }
        ]
      }
    ]
  }
}
```

### 10.2 장소 추가

```http
POST /api/itineraries/:itineraryId/items
```

```json
{
  "placeId": "new-place-uuid",
  "afterItemId": "item-2",
  "stayMinutes": 90,
  "kind": "VISIT"
}
```

### 10.3 체류시간 수정

```http
PATCH /api/itineraries/:itineraryId/items/:itemId
```

```json
{
  "stayMinutes": 120
}
```

### 10.4 순서 변경

```http
PUT /api/itineraries/:itineraryId/items/order
```

```json
{
  "itemIds": [
    "item-1",
    "item-3",
    "item-2",
    "item-4"
  ]
}
```

장소 추가·삭제·순서 변경 후에는 `/recalculate`를 호출해 도착 시각과 이동 경로를 갱신한다.

## 11. 음식점 추천 API

음식점 기본 정보는 `places`, 경로 주변 추천은 `recommendations`, 일정 추가는 `itineraries`가 담당한다.

| Method | URL | 설명 |
|---|---|---|
| `GET` | `/api/itineraries/:itineraryId/restaurants` | 현재 경로 주변 음식점 추천 |
| `GET` | `/api/places/:placeId` | 음식점 상세 조회 |
| `POST` | `/api/itineraries/:itineraryId/items` | 선택한 음식점을 일정에 추가 |

### 11.1 경로 주변 음식점 추천

```http
GET /api/itineraries/:itineraryId/restaurants?mealSlot=LUNCH&foodCategory=KOREAN
```

```json
{
  "data": {
    "items": [
      {
        "placeId": "restaurant-uuid",
        "name": "북촌담",
        "kind": "RESTAURANT",
        "foodCategory": "KOREAN",
        "rating": 4.7,
        "walkingMinutesFromRoute": 5,
        "recommendedStayMinutes": 90,
        "thumbnailUrl": "/images/restaurant.jpg"
      }
    ]
  }
}
```

### 11.2 음식점 일정 추가

```http
POST /api/itineraries/:itineraryId/items
```

```json
{
  "placeId": "restaurant-uuid",
  "afterItemId": "item-bukchon",
  "stayMinutes": 90,
  "kind": "MEAL",
  "mealSlot": "LUNCH"
}
```

음식점 전용 추가 API를 만들지 않고 일정 항목 추가 API를 재사용한다.

## 12. 저장 일정 API

저장 일정도 별도 테이블이나 모듈로 분리하지 않고 `itineraries.status = SAVED`로 관리한다.

| Method | URL | 설명 |
|---|---|---|
| `GET` | `/api/itineraries?status=SAVED` | 내 저장 일정 목록 조회 |
| `GET` | `/api/itineraries/:itineraryId` | 저장 일정 상세 조회 |
| `POST` | `/api/itineraries/:itineraryId/save` | 일정 저장 |
| `DELETE` | `/api/itineraries/:itineraryId` | 저장 일정 삭제 |

### 12.1 저장 일정 목록

```http
GET /api/itineraries?status=SAVED&page=1&size=12
```

```json
{
  "data": {
    "items": [
      {
        "itineraryId": "itinerary-uuid",
        "title": "서울 역사와 성수 여행",
        "travelDate": "2026-08-19",
        "placeCount": 6,
        "startTime": "09:00",
        "endTime": "20:30",
        "thumbnailUrl": "/images/trip.jpg",
        "savedAt": "2026-08-02T10:30:00Z"
      }
    ],
    "page": 1,
    "size": 12,
    "totalCount": 1
  }
}
```

일정 상세·수정·삭제 요청마다 현재 로그인 사용자가 해당 일정의 소유자인지 확인해야 한다.

## 13. 일반 사용자 문의 API

담당 백엔드 모듈:

```text
server/src/modules/inquiries/
```

| Method | URL | 설명 |
|---|---|---|
| `GET` | `/api/inquiries` | 내가 작성한 문의 목록 조회 |
| `POST` | `/api/inquiries` | 새 문의 등록 |
| `GET` | `/api/inquiries/:inquiryId` | 내 문의와 답변 상세 조회 |

### 13.1 문의 등록

```http
POST /api/inquiries
```

```json
{
  "title": "경로가 우회하는 문제가 있어요",
  "content": "서울숲에서 성수 카페거리로 이동할 때 경로가 크게 우회합니다.",
  "itineraryId": "related-itinerary-uuid"
}
```

```json
{
  "data": {
    "inquiryId": "inquiry-uuid",
    "status": "WAITING",
    "createdAt": "2026-08-02T11:00:00Z"
  }
}
```

현재 피그마에는 문의 수정·삭제 화면이 없으므로 해당 API는 MVP 범위에서 제외한다.

## 14. 관리자 API

담당 백엔드 모듈:

```text
server/src/modules/admin/
```

모든 관리자 API는 `isAuth`와 `requireAdmin` 미들웨어를 통과해야 한다.

| Method | URL | 설명 |
|---|---|---|
| `GET` | `/api/admin/users/stats` | 전체·신규·활성 사용자 통계 |
| `GET` | `/api/admin/users` | 사용자 검색·필터·페이지 조회 |
| `PATCH` | `/api/admin/users/:userId/status` | 사용자 상태 변경 |
| `GET` | `/api/admin/inquiries` | 전체 문의 목록 조회 |
| `GET` | `/api/admin/inquiries/:inquiryId` | 문의 상세 조회 |
| `POST` | `/api/admin/inquiries/:inquiryId/reply` | 관리자 답변 등록 |

### 14.1 사용자 목록

```http
GET /api/admin/users?keyword=김여행&status=ACTIVE&page=1&size=20
```

### 14.2 사용자 상태 변경

```http
PATCH /api/admin/users/:userId/status
```

```json
{
  "status": "SUSPENDED"
}
```

관리자가 자신의 계정 또는 마지막 남은 관리자 계정을 정지하지 못하도록 검사하는 것을 권장한다.

### 14.3 문의 답변 등록

```http
POST /api/admin/inquiries/:inquiryId/reply
```

```json
{
  "content": "경로 우회 현상을 확인했으며 해당 구간의 경로 데이터를 수정 중입니다."
}
```

답변 등록 시 서버는 다음 값을 함께 변경한다.

```text
status = ANSWERED
answered_by = 현재 관리자 user_id
answered_at = 현재 시각
```

## 15. Express Router 등록 예시

```js
app.use("/api/auth", authRouter);
app.use("/api/users", isAuth, userRouter);
app.use("/api/places", isAuth, placeRouter);
app.use("/api/trip-plans", isAuth, tripPlanRouter);
app.use("/api/recommendations", isAuth, recommendationRouter);
app.use("/api/itineraries", isAuth, itineraryRouter);
app.use("/api/inquiries", isAuth, inquiryRouter);

app.use(
  "/api/admin",
  isAuth,
  requireAdmin,
  adminRouter,
);
```

`app.mjs`는 미들웨어와 Router 등록까지만 담당한다. 실제 기능은 각 모듈의 controller·service·repository에서 처리한다.

## 16. 백엔드 계층 책임

```text
HTTP 요청
   ↓
router
   ↓
controller
   ↓
service
   ↓
repository 또는 provider
   ↓
PostgreSQL 또는 외부 API
```

| 계층 | 책임 |
|---|---|
| `router` | URL, HTTP Method, 인증·검증 미들웨어 연결 |
| `controller` | `req`에서 입력값을 받고 HTTP 응답 생성 |
| `service` | 여행 계획·경로 추천·상태 변경 등 업무 규칙 처리 |
| `repository` | PostgreSQL 쿼리 실행 |
| `provider` | 카카오·구글·Tour API·ODsay 등 외부 API 호출 |

외부 API는 프론트엔드에서 직접 호출하지 않는다. 프론트엔드는 ROUTA 백엔드만 호출하고 백엔드의 `providers/`가 외부 서비스와 통신해야 API 키를 보호하고 응답 형식을 통일할 수 있다.

## 17. DB 확인 사항

로컬 스키마 파일은 제거됐으며, 현재 Supabase `public` 스키마가 기준이다. 스키마 변경은 향후 Supabase migration으로 관리한다.

현재 사용자 권한은 `public."USER".is_admin` boolean 컬럼으로 구분한다.

문의 기능을 위해 최소한 다음 데이터가 필요하다.

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

## 18. 구현 우선순위

1. 인증 및 `users/me`
2. 장소 검색
3. 여행 계획 초안 생성·수정
4. 추천 계산 요청·상태 조회
5. 일정 결과 조회
6. 일정 장소 추가·삭제·순서 변경
7. 일정 저장·목록·삭제
8. 사용자 문의 등록·조회
9. 관리자 사용자 관리·문의 답변

프론트와 백엔드가 동시에 개발할 때는 이 문서의 URL, Method, 요청 필드, 응답 필드를 먼저 확정한 후 구현한다.

## 19. 권장 프로젝트 폴더 구조

아래 구조는 현재 피그마의 일반 사용자 화면, 관리자 사용자 관리, 사용자 문의, 관리자 문의 답변 기능을 기준으로 한다. 초기 개발에서는 실제 파일이 없는 빈 `hooks`, `constants`, `validation` 폴더를 미리 만들지 않고, 필요할 때 추가한다.

```text
routa/finding_path/                         # ROUTA 애플리케이션 루트
│
├── client/                                 # React 사용자·관리자 프론트엔드
│   ├── public/                             # favicon 등 그대로 공개할 정적 파일
│   │
│   ├── src/                                # 프론트엔드 소스 코드
│   │   ├── app/                            # 앱 전체에서 한 번만 설정하는 코드
│   │   │   ├── router/                     # React Router와 접근 권한 관리
│   │   │   │   ├── router.jsx              # 사용자·관리자 URL 등록
│   │   │   │   ├── ProtectedRoute.jsx      # 로그인 사용자 접근 검사
│   │   │   │   └── AdminRoute.jsx          # ADMIN 권한 접근 검사
│   │   │   │
│   │   │   └── providers/                  # 여러 페이지에서 공유하는 상태
│   │   │       ├── AuthProvider.jsx         # 로그인 사용자·role 상태
│   │   │       └── PlanProvider.jsx         # 여행 계획 단계별 입력 상태
│   │   │
│   │   ├── pages/                          # Router가 직접 렌더링하는 페이지
│   │   │   ├── auth/                       # 로그인·회원가입 페이지
│   │   │   │   ├── LoginPage.jsx
│   │   │   │   ├── SignupPage.jsx
│   │   │   │   └── SignupSuccessPage.jsx
│   │   │   │
│   │   │   ├── home/                       # 로그인 후 홈
│   │   │   │   └── HomePage.jsx
│   │   │   │
│   │   │   ├── planner/                    # 여행 조건 입력 단계
│   │   │   │   ├── PlanConditionPage.jsx   # 날짜·시간·여행 성격
│   │   │   │   ├── PlanThemePage.jsx       # 관심 테마 선택
│   │   │   │   ├── PlanPlacesPage.jsx      # 필수 방문 장소 선택
│   │   │   │   └── PlanMealsPage.jsx       # 점심·저녁 조건
│   │   │   │
│   │   │   ├── course/                     # 추천 경로 계산·결과
│   │   │   │   ├── CourseLoadingPage.jsx
│   │   │   │   └── CourseResultPage.jsx
│   │   │   │
│   │   │   ├── schedule/                   # 저장 일정 목록
│   │   │   │   └── SavedSchedulesPage.jsx
│   │   │   │
│   │   │   ├── profile/                    # 내 정보 조회·수정
│   │   │   │   ├── ProfilePage.jsx
│   │   │   │   └── ProfileEditPage.jsx
│   │   │   │
│   │   │   ├── inquiry/                    # 일반 사용자 문의
│   │   │   │   ├── MyInquiriesPage.jsx
│   │   │   │   └── NewInquiryPage.jsx
│   │   │   │
│   │   │   └── admin/                      # 관리자 전용 페이지
│   │   │       ├── AdminLoginPage.jsx
│   │   │       ├── UserManagementPage.jsx
│   │   │       └── InquiryManagementPage.jsx
│   │   │
│   │   ├── features/                       # 페이지에서 사용하는 실제 기능
│   │   │   ├── auth/                       # 로그인·회원가입·로그아웃
│   │   │   │   ├── components/
│   │   │   │   └── auth.api.js
│   │   │   │
│   │   │   ├── planner/                    # 여행 조건·테마·식사 선택
│   │   │   │   ├── components/
│   │   │   │   └── planner.api.js
│   │   │   │
│   │   │   ├── place/                      # 장소 검색·선택·정렬
│   │   │   │   ├── components/
│   │   │   │   └── place.api.js
│   │   │   │
│   │   │   ├── course/                     # 지도·타임라인·일정 편집
│   │   │   │   ├── components/
│   │   │   │   └── course.api.js
│   │   │   │
│   │   │   ├── restaurant/                 # 음식점 추천·일정 추가
│   │   │   │   ├── components/
│   │   │   │   └── restaurant.api.js
│   │   │   │
│   │   │   ├── schedule/                   # 저장 일정 조회·삭제
│   │   │   │   ├── components/
│   │   │   │   └── schedule.api.js
│   │   │   │
│   │   │   ├── profile/                    # 프로필 조회·수정
│   │   │   │   ├── components/
│   │   │   │   └── profile.api.js
│   │   │   │
│   │   │   ├── inquiry/                    # 사용자 문의 등록·조회
│   │   │   │   ├── components/
│   │   │   │   └── inquiry.api.js
│   │   │   │
│   │   │   └── admin/                      # 사용자 관리·문의 답변
│   │   │       ├── components/
│   │   │       └── admin.api.js
│   │   │
│   │   ├── shared/                         # 두 기능 이상에서 사용하는 공통 코드
│   │   │   ├── api/
│   │   │   │   └── httpClient.js           # 서버 주소·쿠키·공통 오류 처리
│   │   │   ├── components/                 # Button·Input·Modal·Drawer 등
│   │   │   ├── layouts/
│   │   │   │   ├── AuthLayout.jsx          # 로그인·회원가입 화면 틀
│   │   │   │   ├── AppLayout.jsx           # 일반 사용자 화면 틀
│   │   │   │   └── AdminLayout.jsx         # 관리자 화면 틀
│   │   │   ├── assets/                     # 피그마 이미지·SVG 아이콘
│   │   │   │   ├── icons/
│   │   │   │   └── images/
│   │   │   └── styles/                     # 전역 디자인 규칙
│   │   │       ├── reset.css
│   │   │       ├── tokens.css
│   │   │       └── global.css
│   │   │
│   │   └── main.jsx                        # React 앱과 Router 실행
│   │
│   ├── index.html                          # Vite HTML 진입점
│   ├── vite.config.js                      # Vite 개발·빌드 설정
│   └── package.json                        # 프론트엔드 의존성·명령어
│
├── server/                                 # Node.js·Express 백엔드
│   ├── src/                                # 백엔드 소스 코드
│   │   ├── app.mjs                         # 미들웨어·Router 등록
│   │   ├── server.mjs                      # DB 연결 후 서버 실행
│   │   ├── config.mjs                      # 환경변수·서버 설정
│   │   │
│   │   ├── db/
│   │   │   └── database.mjs                # PostgreSQL Pool과 DB 연결
│   │   │
│   │   ├── modules/                        # 업무 기능별 백엔드 코드
│   │   │   ├── auth/                       # 로그인·회원가입·OAuth
│   │   │   ├── users/                      # 프로필·사용자 데이터
│   │   │   ├── places/                     # 관광지·음식점 검색
│   │   │   ├── trips/                      # 여행 계획 초안
│   │   │   ├── recommendations/            # 추천 경로 계산 작업
│   │   │   ├── itineraries/                # 결과 일정·편집·저장
│   │   │   ├── inquiries/                  # 문의 등록·조회·답변 데이터
│   │   │   └── admin/                      # 사용자 관리·관리자 문의 API
│   │   │
│   │   ├── providers/                      # 외부 서비스 호출
│   │   │   ├── kakao.mjs                   # 카카오 인증·장소 데이터
│   │   │   ├── google.mjs                  # 구글 인증·장소 데이터
│   │   │   ├── tourApi.mjs                 # 관광 데이터
│   │   │   └── odsay.mjs                   # 대중교통 경로 데이터
│   │   │
│   │   ├── middleware/                     # 여러 API에 공통 적용
│   │   │   ├── auth.mjs                    # 로그인 검사
│   │   │   ├── requireAdmin.mjs            # 관리자 권한 검사
│   │   │   ├── validate.mjs                # 요청 입력값 검사
│   │   │   ├── errorHandler.mjs            # 공통 오류 응답
│   │   │   └── notFound.mjs                # 존재하지 않는 API의 404
│   │   │
│   │   └── utils/                          # 특정 도메인에 속하지 않는 도구
│   │       ├── jwt.mjs
│   │       ├── cookie.mjs
│   │       ├── date.mjs
│   │       └── logger.mjs
│   │
│   └── package.json                        # 백엔드 의존성·명령어
│
├── docs/                                   # API·협업·팀원 작업 문서
│   └── team-Project/
│       ├── ROUTA_API_STRUCTURE.md           # 전체 API와 폴더 구조
│       └── *_담당자.md                      # 팀원별 작업 명세
│
├── .env.example                            # 필요한 환경변수 예시
└── README.md                               # 설치·실행·협업 방법
```

### 19.1 주요 폴더 책임

| 폴더 | 책임 |
|---|---|
| `pages` | URL과 직접 연결되는 화면 조립 |
| `features` | 각 화면에서 실제로 수행하는 기능과 전용 UI |
| `shared` | 두 개 이상의 기능에서 공통으로 사용하는 코드 |
| `server/src/modules` | 업무 기능별 Router·Controller·Service·Repository |
| `server/src/providers` | 카카오·구글·Tour API·ODsay 호출 |
| `middleware` | 인증·관리자 권한·검증·오류 처리 |
| `database` | 팀이 공통으로 사용하는 최종 DB 스키마 |

### 19.2 백엔드 모듈 내부 구조

각 백엔드 모듈은 가능한 한 동일한 구조를 사용한다.

```text
modules/places/
├── place.router.mjs             # URL과 미들웨어 연결
├── place.controller.mjs         # 요청값 수신·HTTP 응답
├── place.service.mjs            # 업무 규칙 처리
└── place.repository.mjs         # PostgreSQL 쿼리
```

관리자 모듈은 사용자와 문의 데이터를 새로 중복 저장하지 않는다. `users.repository`와 `inquiries.repository`를 재사용하고 관리자 전용 권한과 처리 흐름만 담당한다.

### 19.3 폴더 생성 원칙

- 실제 코드가 없는 빈 폴더를 미리 만들지 않는다.
- 페이지에서 직접 `fetch`를 호출하지 않고 각 feature의 `*.api.js`를 사용한다.
- 공통으로 두 번 이상 사용하는 UI만 `shared/components`로 이동한다.
- 음식점은 DB에서 장소의 한 종류이므로 백엔드 `restaurants` 모듈을 별도로 만들지 않는다.
- 저장 일정은 `itineraries`의 저장 상태이므로 백엔드 `schedules` 모듈을 별도로 만들지 않는다.
- 관리자 화면은 공통 인증·디자인을 재사용하므로 별도 `admin-client` 프로젝트로 분리하지 않는다.
