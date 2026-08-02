# 팀원 3 작업 명세 — 홈·여행 조건·장소 검색

## 1. 담당 요약

| 항목 | 내용 |
|---|---|
| 담당 기능 | 홈, 여행 계획 입력, 테마·식사 선택, 장소 검색 |
| 난이도 | 중간 |
| 예상 작업량 | 8 |
| 권장 브랜치 | `feature/trip-planner` |

여행 계획을 생성하기 전 사용자가 입력하는 모든 조건을 담당한다. 여러 단계 사이에서 값이 유지돼야 하므로 `PlanProvider`도 함께 관리한다.

## 2. 담당 피그마 화면

```text
SCR_006 · Home
SCR_007 · Plan Step 1 Weekday
SCR_008 · Plan Step 1 상태 변경
SCR_009 · Calendar Overlay
테마 선택 Step
SCR_011 · Plan Step 2 Place Selection
SCR_012 · Place Search Empty
SCR_015 · Edit Condition Alert의 조건 수정 기능
```

## 3. 프론트엔드 작업 범위

```text
client/src/pages/home/
└── HomePage.jsx

client/src/pages/planner/
├── PlanConditionPage.jsx
├── PlanThemePage.jsx
├── PlanPlacesPage.jsx
└── PlanMealsPage.jsx

client/src/features/planner/
├── components/
│   ├── TripTypeSelector.jsx
│   ├── DateSelector.jsx
│   ├── TransitCriterion.jsx
│   ├── ThemeSelector.jsx
│   ├── MealSelector.jsx
│   └── PlanStepper.jsx
└── planner.api.js

client/src/features/place/
├── components/
│   ├── PlaceSearch.jsx
│   ├── PlaceCard.jsx
│   ├── SelectedPlaceList.jsx
│   └── PlaceReorderList.jsx
└── place.api.js

client/src/app/providers/
└── PlanProvider.jsx
```

### PlanProvider 기본 상태

```js
{
  tripPlanId: null,
  tripStyle: "GENERAL",
  travelDate: null,
  trafficBasis: "WEEKDAY",
  startTime: "09:00",
  endTime: "21:00",
  startPlace: null,
  endLocationMode: "RETURN_TO_START",
  petCompanion: false,
  selectedThemes: [],
  selectedPlaces: [],
  lunch: { mode: "NEARBY_RECOMMEND", placeId: null },
  dinner: { mode: "SKIP", placeId: null }
}
```

### 프론트엔드 구현 항목

- 홈에서 새 여행 계획 시작
- 일반 여행·반려동물 동반 선택
- 날짜와 시간 선택
- 주중·주말 교통 기준 설정
- 출발지와 종료 위치 설정
- 테마 복수 선택
- 장소 검색·검색 결과 없음 처리
- 장소 추가·삭제
- 장소 체류시간 변경
- 장소 순서 변경
- 점심·저녁 모드 선택
- 이전·다음 단계 이동 시 입력 유지
- 새로고침 시 초안 복구

## 4. 백엔드 작업 범위

```text
server/src/modules/trips/
├── trip.router.mjs
├── trip.controller.mjs
├── trip.service.mjs
└── trip.repository.mjs

server/src/modules/places/
├── place.router.mjs
├── place.controller.mjs
├── place.service.mjs
└── place.repository.mjs
```

## 5. 담당 API

### 장소

```text
GET /api/places
GET /api/places/:placeId
GET /api/places/:placeId/hours
GET /api/places/themes
```

### 여행 계획

```text
POST   /api/trip-plans
GET    /api/trip-plans/:tripPlanId
PATCH  /api/trip-plans/:tripPlanId/conditions
PUT    /api/trip-plans/:tripPlanId/themes
PUT    /api/trip-plans/:tripPlanId/places
PUT    /api/trip-plans/:tripPlanId/meals
DELETE /api/trip-plans/:tripPlanId
```

API 요청·응답 형식은 [ROUTA API 구조 설계서](../ROUTA_API_STRUCTURE.md)를 따른다.

## 6. 주요 입력 검증

- 종료 시간은 시작 시간보다 늦어야 한다.
- 체류시간은 30분 단위의 양수여야 한다.
- 같은 장소를 중복 추가하지 않는다.
- 선택 장소의 순서는 중복되지 않아야 한다.
- 종료 위치가 `SPECIFIC`이면 종료 장소가 필요하다.
- `SPECIFIED` 식사 모드이면 음식점 `placeId`가 필요하다.
- `SKIP` 식사 모드이면 음식점 `placeId`는 없어야 한다.

## 7. 다른 팀원과의 연결

### 팀원 4에게 제공

- 완성된 `tripPlanId`
- 날짜·시간·교통 기준
- 선택 장소와 체류시간
- 테마와 식사 조건
- 반려동물 동반 여부

### 팀원 5에게 제공

- 조건 수정 함수
- 장소 검색 함수
- 장소 상세 응답 형식
- 여행 계획 조회 함수

`SCR_015 · Edit Condition Alert`의 모달 UI는 팀원 5가 만들고, 실제 조건 데이터와 API 함수는 이 팀원이 제공한다.

## 8. 구현 순서

1. `PlanProvider`와 Mock 상태 작성
2. 조건 입력 화면 구현
3. 테마·식사 화면 구현
4. 장소 검색·선택 화면 구현
5. 장소 검색 API 구현
6. 여행 계획 초안 API 구현
7. 화면과 API 연동
8. 새로고침·이전 단계 복구 처리
9. 팀원 4에게 추천 입력 데이터 전달

## 9. 완료 체크리스트

- [ ] 홈에서 새 여행 계획을 시작할 수 있다.
- [ ] 단계 이동 후에도 입력값이 유지된다.
- [ ] 날짜·시간·교통 기준이 서버에 저장된다.
- [ ] 테마를 복수 선택하고 저장할 수 있다.
- [ ] 장소를 검색하고 선택 목록에 추가할 수 있다.
- [ ] 검색 결과가 없을 때 빈 상태가 표시된다.
- [ ] 장소를 삭제하고 순서를 변경할 수 있다.
- [ ] 체류시간이 30분 단위로 저장된다.
- [ ] 점심·저녁 선택을 저장할 수 있다.
- [ ] 다른 사용자의 여행 계획 초안을 조회할 수 없다.
- [ ] 완성된 `tripPlanId`를 추천 계산 API에 전달할 수 있다.

