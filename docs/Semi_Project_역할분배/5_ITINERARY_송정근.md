# 팀원 5 작업 명세 — 결과 일정·음식점·저장 일정

## 1. 담당 요약

| 항목 | 내용 |
|---|---|
| 담당 기능 | 추천 결과 화면, 일정 편집, 음식점 추가, 저장 일정 |
| 난이도 | 중상 |
| 예상 작업량 | 8 |
| 권장 브랜치 | `feature/itinerary-editor` |

추천 계산이 끝난 후 사용자가 보는 지도·타임라인과 장소 추가·삭제·순서 변경·저장 기능을 담당한다. 화면은 많지만 공통 타임라인·Modal·Drawer를 재사용한다.

## 2. 담당 피그마 화면

```text
SCR_013 · Restaurant Selection
SCR_014 · Restaurant Added
SCR_015 · Edit Condition Alert의 모달 UI
SCR_016 · Schedule Edit Reorder
SCR_017 · Pet Restriction Unknown
SCR_019 · Add Place Drawer
SCR_020 · Delete Place Confirm
SCR_021 · Schedule Save Success
SCR_022 · Saved Schedules
SCR_023 · Delete Saved Schedule Confirm
travel-route-expanded
```

`SCR_018 · Route Loading`의 상태 데이터는 팀원 4가 담당하고, 완료 후 이 담당자의 결과 화면으로 이동한다.

## 3. 프론트엔드 작업 범위

```text
client/src/pages/course/
├── CourseLoadingPage.jsx
└── CourseResultPage.jsx

client/src/pages/schedule/
└── SavedSchedulesPage.jsx

client/src/features/course/
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

client/src/features/restaurant/
├── components/
│   ├── RestaurantCard.jsx
│   ├── RestaurantList.jsx
│   └── RestaurantAddedModal.jsx
└── restaurant.api.js

client/src/features/schedule/
├── components/
│   ├── ScheduleCard.jsx
│   └── DeleteScheduleModal.jsx
└── schedule.api.js
```

### 프론트엔드 구현 항목

- 추천 코스 세 가지 요약 표시
- 선택 코스 변경
- 지도에 장소와 이동 경로 표시
- 타임라인 목록 표시
- 이동 구간 상세 펼치기·접기
- 장소 추가 Drawer
- 장소 삭제 확인 Modal
- 장소 순서 Drag & Drop
- 체류시간 변경
- 경로 재계산 상태 표시
- 음식점 추천 목록
- 음식점 일정 추가
- 반려동물 제한 경고
- 일정 저장 성공 Modal
- 저장 일정 목록과 삭제

## 4. 백엔드 작업 범위

```text
server/src/modules/itineraries/
├── itinerary.router.mjs
├── itinerary.controller.mjs
├── itinerary.service.mjs
└── itinerary.repository.mjs
```

음식점의 기본 장소 정보는 팀원 3의 `places` 모듈을 사용한다. 음식점 추천과 경로 재계산의 계산 로직은 팀원 4의 recommendation 서비스를 재사용한다.

## 5. 담당 API

### 결과 일정

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
POST /api/itineraries/:itineraryId/items
```

음식점 추가는 별도 API를 만들지 않고 `kind: "MEAL"`로 일정 항목 추가 API를 재사용한다.

### 저장 일정

```text
POST   /api/itineraries/:itineraryId/save
GET    /api/itineraries?status=SAVED
GET    /api/itineraries/:itineraryId
DELETE /api/itineraries/:itineraryId
```

API 요청·응답 형식은 [ROUTA API 구조 설계서](../ROUTA_API_STRUCTURE.md)를 따른다.

## 6. 일정 항목 규칙

| kind | 설명 |
|---|---|
| `START` | 여행 출발 지점 |
| `VISIT` | 관광지·카페 등 방문 장소 |
| `MEAL` | 점심·저녁 음식점 |
| `WAIT` | 운영시간 대기를 위한 일정 |
| `END` | 여행 종료 지점 |

- `START`와 `END`는 일반 장소처럼 삭제할 수 없다.
- 체류시간은 30분 단위로 수정한다.
- 항목 순서 변경 후 경로를 재계산한다.
- 장소 삭제 후 남은 장소 사이의 이동 경로를 재계산한다.
- 일정 수정 전 현재 로그인 사용자의 소유권을 검사한다.

## 7. 다른 팀원과의 연결

### 팀원 3에게 받을 것

- 장소 검색 API
- 장소 상세 응답
- 여행 조건 조회·수정 함수
- `EditConditionModal` 저장 함수

### 팀원 4에게 받을 것

- 추천 결과의 `itineraryId`
- 추천 계산 상태 응답
- 세 가지 코스 요약 데이터
- 이동 경로 재계산 서비스
- 반려동물·운영시간 충돌 데이터

### 팀원 1에게 제공할 것

- 문의와 연결할 수 있는 `itineraryId`
- 저장 일정 제목과 대표 장소 정보

## 8. Mock 데이터 우선 개발

팀원 4의 추천 계산이 끝날 때까지 기다리지 말고 다음 형태의 Mock 데이터로 화면을 먼저 구현한다.

```js
{
  itineraryId: "mock-itinerary-1",
  courseKind: "BALANCED",
  summary: {
    totalMinutes: 690,
    walkingDistanceMeters: 5400,
    transferCount: 4
  },
  items: [
    {
      itemId: "item-1",
      kind: "START",
      placeName: "서울역",
      arrivalTime: "09:00",
      stayMinutes: 0,
      order: 1
    }
  ],
  legs: []
}
```

Mock 데이터 필드명은 실제 API 계약과 동일하게 유지한다.

## 9. 구현 순서

1. 결과 일정 Mock 데이터 작성
2. 추천 코스 카드와 타임라인 구현
3. 지도 표시 구현
4. 장소 추가·삭제·순서 변경 UI 구현
5. 음식점 추천·추가 UI 구현
6. 저장 일정 목록·삭제 UI 구현
7. itinerary 조회·편집 API 구현
8. 팀원 4의 재계산 서비스 연결
9. 실제 API 응답 연동
10. 일정 소유권과 편집 흐름 테스트

## 10. 완료 체크리스트

- [ ] 세 가지 추천 코스를 선택할 수 있다.
- [ ] 선택한 코스의 지도와 타임라인이 표시된다.
- [ ] 이동 구간 상세를 펼치고 닫을 수 있다.
- [ ] 새로운 장소를 일정에 추가할 수 있다.
- [ ] 장소를 삭제할 수 있다.
- [ ] 장소 순서를 변경할 수 있다.
- [ ] 체류시간을 수정할 수 있다.
- [ ] 변경 후 이동시간과 도착 시각이 다시 계산된다.
- [ ] 경로 주변 음식점을 조회할 수 있다.
- [ ] 음식점을 `MEAL` 항목으로 일정에 추가할 수 있다.
- [ ] 일정을 저장하고 저장 목록에서 확인할 수 있다.
- [ ] 저장 일정을 삭제할 수 있다.
- [ ] 다른 사용자의 일정을 조회·수정·삭제할 수 없다.

