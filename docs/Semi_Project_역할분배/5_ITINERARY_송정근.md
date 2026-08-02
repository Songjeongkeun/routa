# 송정근 담당 업무 — 음식점 선택·추천 결과·일정 편집·저장

## 1. 한눈에 보기

| 항목 | 내용 |
|---|---|
| 담당 기능 | 음식점 선택 화면, 로딩·결과 UI, 일정 편집·재검증, 저장 일정 관리 |
| 관련 요구사항 | `FR-23~34`, `FR-36`, `FR-37`, `FR-46~49`의 화면·일정 관리 부분 |
| 담당 화면 | `SCR-013~023` |
| 권장 브랜치 | `feature/itinerary-editor` |
| 핵심 완료 조건 | 선택 코스의 카드·지도·타임라인·총계가 동기화되고, 편집 후 재검증한 일정을 안전하게 저장·삭제함 |

이 담당자는 추천 요청 직전의 음식점 선택부터 추천 결과를 보고 수정·저장하는 구간을 맡는다. 추천 계산 자체는 이희승이 담당하므로, 합의한 Mock DTO로 화면을 먼저 개발한 뒤 실제 API를 연결한다.

## 2. 화면별로 무엇을 만들면 되는가

| 화면 | 구현 내용 | 완료 기준 |
|---|---|---|
| `SCR-013 음식점 선택` | 음식점 검색·필터·선택·해제, 점심·저녁 선택 목록 | 조주영의 식사 조건 API에 저장되고 경로 생성으로 이동 |
| `SCR-014 추천 경로 결과` | 지도·타임라인·최대 3개 코스 카드·총계·편집·저장 | 코스 변경 시 지도·타임라인·총계가 같은 `itineraryId`로 함께 갱신 |
| `SCR-015 조건 변경 경고` | 기존 추천 초기화 영향 안내 | 변경은 조주영의 조건 화면으로, 유지는 `SCR-014`로 이동 |
| `SCR-016 일정 순서·체류시간 편집` | 드래그 순서 변경, 30분 단위 체류시간, 재계산 | 저장 전 운영시간·이동·종료·반려동물 조건 재검증 |
| `SCR-017 반려동물 제한 정보 미확인` | 확인 필요 경고, 전화 확인·대안 | 확인 불가를 가능·불가로 단정하지 않음 |
| `SCR-018 경로 생성 중` | 진행 단계, 취소, 실패·부분 성공 | 완료는 `SCR-014`, 취소는 `SCR-013` |
| `SCR-019 장소 추가` | 검색·필터·장소 선택 드로어 | 추가 후 재계산하고 불가 시 충돌 이유 표시 |
| `SCR-020 장소 삭제 확인` | 삭제 대상·영향 안내 | 확인 후 재계산, 취소 시 기존 상태 유지 |
| `SCR-021 일정 저장 완료` | 성공 안내, 목록 이동·닫기 | 목록은 `SCR-022`, 닫기는 `SCR-014` |
| `SCR-022 저장 일정` | 검색·필터·목록·상세·수정·삭제 | 본인 일정만 표시하고 완료 후 목록·건수 즉시 갱신 |
| `SCR-023 저장 일정 삭제 확인` | 일정 이름·주요 정보와 복구 불가 안내 | 삭제 후 `SCR-022`, 취소는 기존 목록 유지 |

`travel-route-expanded`, `transit-detail-panel`은 별도 URL 화면이 아니라 `SCR-014` 내부의 펼침 상태로 구현한다.

## 3. 프론트엔드 담당 파일

```text
Client/src/pages/course/
├── CourseLoadingPage.jsx
└── CourseResultPage.jsx

Client/src/pages/schedule/
└── SavedSchedulesPage.jsx

Client/src/features/course/
├── components/
│   ├── CourseMap.jsx
│   ├── CourseOptionCard.jsx
│   ├── TimelinePanel.jsx
│   ├── TimelineItem.jsx
│   ├── TransitDetail.jsx
│   ├── AddPlaceDrawer.jsx
│   ├── DeletePlaceModal.jsx
│   ├── EditConditionModal.jsx
│   ├── PetRestrictionModal.jsx
│   └── SaveSuccessModal.jsx
└── course.api.js

Client/src/features/restaurant/
├── components/
│   ├── RestaurantCard.jsx
│   ├── RestaurantList.jsx
│   └── RestaurantAddedModal.jsx
└── restaurant.api.js

Client/src/features/schedule/
├── components/
│   ├── ScheduleCard.jsx
│   └── DeleteScheduleModal.jsx
└── schedule.api.js
```

지도는 장소 마커, 방문 순서, 이동 경로와 선택 코스를 명확히 표시한다. 코스 선택 상태를 지도 컴포넌트 안에 따로 두지 말고 결과 페이지의 단일 `selectedItineraryId`로 관리한다.

## 4. 백엔드 담당 파일과 API

```text
Server/src/modules/itineraries/
├── itinerary.router.mjs
├── itinerary.controller.mjs
├── itinerary.service.mjs
└── itinerary.repository.mjs
```

### 결과 조회·편집

```text
GET    /api/itineraries/:itineraryId
POST   /api/itineraries/:itineraryId/items
PATCH  /api/itineraries/:itineraryId/items/:itemId
DELETE /api/itineraries/:itineraryId/items/:itemId
PUT    /api/itineraries/:itineraryId/items/order
POST   /api/itineraries/:itineraryId/recalculate
```

### 음식점

```text
GET  /api/itineraries/:itineraryId/restaurants
GET  /api/places/:placeId
POST /api/itineraries/:itineraryId/items   # kind: MEAL 재사용
```

### 저장 일정

```text
POST   /api/itineraries/:itineraryId/save
GET    /api/itineraries?status=SAVED
GET    /api/itineraries/:itineraryId
PATCH  /api/itineraries/:itineraryId
DELETE /api/itineraries/:itineraryId
```

공통 응답과 오류 형식은 [전체 API 구조 설계서](<./전체_구조_ ROUTA_API_STRUCTURE.md>)를 따른다.

## 5. 일정 편집·저장 규칙

| `kind` | 의미 | 편집 규칙 |
|---|---|---|
| `START` | 출발 지점 | 삭제·순서 변경 불가 |
| `VISIT` | 관광지·카페 등 | 추가·삭제·순서·30분 단위 체류시간 변경 가능 |
| `MEAL` | 점심·저녁 음식점 | 기본 체류시간 90분, 영업·라스트 오더·반려동물 조건 검사 |
| `WAIT` | 운영 시작 대기 | 재계산 결과로만 생성·조정 |
| `END` | 종료 지점 | 삭제·순서 변경 불가 |

- 삭제·조건 초기화는 실행 전에 대상과 영향을 확인한다.
- 삭제 후 빈 시간에 장소를 자동 삽입하지 않고 대체 후보만 제안한다.
- 순서나 체류시간을 변경하면 사용자 선택을 유지한 채 전체 일정을 재검증한다.
- 검증 실패 시 자동으로 원래 순서로 되돌리기보다 오류 위치와 대안을 표시한다.
- 저장 성공 응답을 받은 후에만 `SCR-021`을 표시한다.
- 같은 저장 요청이 반복되어도 일정이 한 번만 저장되도록 요청 식별자를 사용한다.
- 조회·수정·삭제 전에 현재 로그인 사용자의 일정 소유권을 검사한다.

## 6. 화면 상태 동기화 기준

```text
selectedItineraryId
├── 선택된 코스 카드
├── 지도 경로와 마커
├── 타임라인 items
├── 이동 상세 legs
└── 총 이동시간·도보거리·환승·교통비
```

위 항목은 하나의 선택 상태를 공유해야 한다. 코스 카드만 바뀌고 지도나 총계가 이전 코스를 표시하는 상태가 생기면 완료로 보지 않는다.

반드시 구현할 공통 상태:

- 로딩·계산 단계·취소 중
- 결과 없음·저장 일정 없음·검색 결과 없음
- 부분 성공과 확인 필요 경고
- API 오류와 재시도
- 저장·삭제·재계산 중 버튼 중복 클릭 방지

## 7. 다른 담당자와 맞춰야 할 내용

| 담당자 | 받을 것 | 내가 제공할 것 |
|---|---|---|
| 박현규 | 현재 사용자·보호 Route·소유권 검사 방식 | 일정 Route와 API 연결 요청 |
| 조주영 | 음식점 선택 저장, 장소 검색, 조건 초기화·복귀 함수 | `SCR-013`, `SCR-015`의 UI 이벤트와 필요한 API 필드 |
| 이희승 | `runId`, 상태, itinerary summary/items/legs/warnings, 재계산 함수 | 결과 화면 Mock DTO, 편집 요청 형식, 재계산 결과 표시 요구사항 |
| 권민이 | 선택적 문의 연결 규칙 | `itineraryId`, 일정 제목, 대표 장소 요약 |

## 8. Mock 데이터 우선 개발

```js
{
  itineraryId: "mock-itinerary-1",
  courseKind: "BALANCED",
  summary: {
    totalMinutes: 690,
    walkingDistanceMeters: 5400,
    transferCount: 4,
    estimatedFare: 6500
  },
  items: [
    {
      itemId: "item-1",
      kind: "START",
      placeId: "place-seoul-station",
      placeName: "서울역",
      arrivalTime: "09:00",
      startTime: "09:00",
      endTime: "09:00",
      stayMinutes: 0,
      order: 1
    }
  ],
  legs: [],
  warnings: []
}
```

Mock과 실제 API의 필드명을 동일하게 유지해 화면 코드를 다시 작성하지 않도록 한다.

## 9. 구현 순서

1. 이희승과 결과 DTO·계산 상태·편집 요청 형식을 확정한다.
2. Mock으로 `SCR-018`, `SCR-014`의 코스·지도·타임라인을 구현한다.
3. `SCR-013`, `SCR-015~020`의 선택·편집·경고 흐름을 구현한다.
4. `SCR-021~023`의 저장·목록·삭제 흐름을 구현한다.
5. itinerary 조회·편집·저장 API와 소유권 검사를 구현한다.
6. 조주영의 장소·식사 조건 API를 연결한다.
7. 이희승의 계산 상태·결과·재계산 서비스를 연결한다.
8. 코스 전환 동기화와 중복 요청 방지를 회귀 테스트한다.

## 10. 완료 체크리스트

- [ ] 음식점 선택이 여행 계획의 점심·저녁 조건과 90분 식사시간으로 저장된다.
- [ ] 계산 진행 단계·취소·실패·부분 성공·완료가 구분된다.
- [ ] 선택 코스 변경 시 카드·지도·타임라인·총계가 동시에 갱신된다.
- [ ] 이동 구간 상세와 반려동물 이용 유의사항을 펼쳐 볼 수 있다.
- [ ] 장소 추가·삭제·순서·체류시간 변경 후 전체 일정이 재검증된다.
- [ ] 파괴적 변경 전에 대상과 영향을 확인하고 취소 시 기존 상태를 유지한다.
- [ ] 반려동물 정보 미확인은 확인 필요로 표시하고 연락 또는 대안을 제공한다.
- [ ] 저장 성공 후에만 완료 모달이 표시된다.
- [ ] 중복 저장 요청에도 일정이 한 번만 저장된다.
- [ ] 저장 일정 검색·필터·상세·수정·삭제가 동작한다.
- [ ] 삭제 후 목록과 표시 건수가 즉시 갱신된다.
- [ ] 다른 사용자의 일정은 조회·수정·삭제할 수 없다.

## 11. 담당하지 않는 범위

- 외부 API 호출과 경로 탐색 알고리즘
- 여행 조건·장소 초안 저장 로직
- 로그인·JWT·관리자 권한 구현
- 문의 내용·관리자 답변 기능
