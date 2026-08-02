# 조주영 담당 업무 — 홈·단계형 여행 설정·장소 검색

## 1. 한눈에 보기

| 항목 | 내용 |
|---|---|
| 담당 기능 | 홈, 여행 조건 입력, 테마·장소·식사 조건 저장, 장소 검색 |
| 관련 요구사항 | `FR-01~08`, `FR-35`, `FR-43~45`의 입력·검색 부분 |
| 주 담당 화면 | `SCR-006~012` |
| 공동 담당 화면 | `SCR-013`의 여행계획 상태·API, `SCR-015`의 조건 초기화 함수 |
| 권장 브랜치 | `feature/trip-planner` |
| 핵심 완료 조건 | 단계 이동과 새로고침 후에도 입력이 유지되고, 유효한 `tripPlanId`를 추천 계산에 전달함 |

이 담당자는 사용자가 추천 요청을 누르기 전까지의 여행 계획 초안을 만든다. 추천 경로 계산은 하지 않고, 계산에 필요한 입력을 빠짐없이 저장해 이희승에게 전달한다.

## 2. 화면별로 무엇을 만들면 되는가

| 화면 | 구현 내용 | 완료 기준 |
|---|---|---|
| `SCR-006 홈` | 새 여행 계획, 최근 일정, 저장 일정·프로필 이동 | 최근 일정이 없으면 빈 상태와 새 계획 행동 표시 |
| `SCR-007 여행 설정(일반 여행)` | 날짜, 시작·종료 시간, 출발·종료 위치 | 미입력 시간은 `09:00~21:00`, 필수값 누락 시 다음 단계 차단 |
| `SCR-008 여행 설정(반려동물 동반)` | 일반 설정 + 반려동물 동반 조건 | 여행 성격과 반려동물 정보가 이후 검색·추천 요청에 유지됨 |
| `SCR-009 여행 날짜 선택` | 단일 날짜 선택 오버레이 | 취소는 기존 값 유지, 적용은 `SCR-007` 또는 `008`에 반영 |
| `SCR-010 관심 테마 선택` | 6개 테마 복수 선택, 우측 요약 | 이전·다음 이동 후 선택값 유지; 미선택은 전체 테마 의미 |
| `SCR-011 방문지 선택` | 검색·필터·추가·삭제, 30분 단위 체류시간 | 중복 장소 방지, 선택값과 요약 영역 동기화 |
| `SCR-012 장소 검색 결과 없음` | 반경 확대 또는 필터 초기화 | 현재 검색어·필터·반경을 표시하고 재검색 결과 또는 최종 빈 상태 표시 |

공동 화면의 책임은 다음처럼 나눈다.

- `SCR-013 음식점 선택`: 송정근이 화면을 만들고, 조주영은 점심·저녁 선택값을 `tripPlan`에 저장하는 API와 상태를 제공한다.
- `SCR-015 조건 변경 경고`: 송정근이 모달 UI를 만들고, 조주영은 확인 시 기존 추천을 초기화하고 `SCR-007` 또는 `008`로 돌아가는 함수를 제공한다.

## 3. 프론트엔드 담당 파일

```text
Client/src/pages/home/HomePage.jsx

Client/src/pages/planner/
├── PlanConditionPage.jsx
├── PlanThemePage.jsx
├── PlanPlacesPage.jsx
└── PlanMealsPage.jsx

Client/src/features/planner/
├── components/
│   ├── TripTypeSelector.jsx
│   ├── DateSelector.jsx
│   ├── TransitCriterion.jsx
│   ├── ThemeSelector.jsx
│   ├── MealSelector.jsx
│   └── PlanStepper.jsx
└── planner.api.js

Client/src/features/place/
├── components/
│   ├── PlaceSearch.jsx
│   ├── PlaceCard.jsx
│   ├── SelectedPlaceList.jsx
│   └── PlaceReorderList.jsx
└── place.api.js

Client/src/app/providers/PlanProvider.jsx
```

## 4. PlanProvider에서 유지할 값

```js
{
  tripPlanId: null,
  tripStyle: "GENERAL", // GENERAL | WITH_PET
  travelDate: null,
  startTime: "09:00",
  endTime: "21:00",
  startPlace: null,
  endLocationMode: "RETURN_TO_START", // RETURN_TO_START | SPECIFIC | NONE
  endPlace: null,
  pet: {
    companion: false,
    size: null,
    carrierAvailable: null
  },
  selectedThemes: [],
  selectedPlaces: [],
  lunch: { mode: "NEARBY_RECOMMEND", placeId: null, stayMinutes: 90 },
  dinner: { mode: "SKIP", placeId: null, stayMinutes: 90 }
}
```

교통 기준은 여행 날짜와 실제 출발 예정 시각을 기준으로 서버가 조회하도록 하고, 단순한 `WEEKDAY/WEEKEND` 값만으로 경로를 확정하지 않는다.

## 5. 백엔드 담당 파일과 API

```text
Server/src/modules/trips/
├── trip.router.mjs
├── trip.controller.mjs
├── trip.service.mjs
└── trip.repository.mjs

Server/src/modules/places/
├── place.router.mjs
├── place.controller.mjs
├── place.service.mjs
└── place.repository.mjs
```

### 장소 API

```text
GET /api/places
GET /api/places/:placeId
GET /api/places/:placeId/hours
GET /api/places/themes
```

### 여행 계획 API

```text
POST   /api/trip-plans
GET    /api/trip-plans/:tripPlanId
PATCH  /api/trip-plans/:tripPlanId/conditions
PUT    /api/trip-plans/:tripPlanId/themes
PUT    /api/trip-plans/:tripPlanId/places
PUT    /api/trip-plans/:tripPlanId/meals
DELETE /api/trip-plans/:tripPlanId
```

공통 응답과 오류 형식은 [전체 API 구조 설계서](<./전체_구조_ ROUTA_API_STRUCTURE.md>)를 따른다.

## 6. 입력·검색 규칙

- 여행 날짜는 필수이며 과거 날짜 처리 정책을 화면과 서버에서 동일하게 적용한다.
- 시작·종료 시간 미입력 시 `09:00~21:00`을 저장하고, 기본값 적용 여부도 결과에 전달한다.
- 종료 시간은 시작 시간보다 늦어야 한다.
- 종료 방식이 `SPECIFIC`이면 종료 장소가 필수다.
- 장소 체류시간은 30분 단위의 양수다.
- 같은 장소를 중복 추가하지 않는다.
- 검색 결과에는 현재 검색어·카테고리·반경을 함께 반환하거나 화면 상태로 유지한다.
- 장소 결과가 없으면 반경 확대 또는 필터 초기화를 제안한다.
- 식사 모드는 `SPECIFIED`, `NEARBY_RECOMMEND`, `SKIP` 중 하나다.
- `SPECIFIED`에는 음식점 `placeId`가 필요하고 `SKIP`에는 없어야 한다.
- 점심과 저녁의 기본 식사시간은 모두 **90분**이다.
- `WITH_PET`이면 후보 조회 요청에 반려동물 조건을 반드시 포함한다.

## 7. 다른 담당자와 맞춰야 할 내용

| 담당자 | 받을 것 | 내가 제공할 것 |
|---|---|---|
| 박현규 | 현재 사용자·인증 상태, 보호 Route | 사용자별 `tripPlan` 소유권 검사 결과 |
| 이희승 | 외부 API로 보완한 장소 정보 형식 | 완성된 `tripPlanId`, 날짜·시간·장소·테마·식사·반려동물 조건 |
| 송정근 | `SCR-013`, `SCR-015` UI 이벤트 | 식사 조건 저장 함수, 장소 검색 함수, 조건 초기화·재진입 함수 |

추천 담당자에게 넘기는 `tripPlan`에는 최소한 다음 값이 있어야 한다.

```text
travelDate, startTime, endTime
startPlace, endLocationMode, endPlace
tripStyle, pet
selectedThemes
selectedPlaces(placeId, stayMinutes, required, order)
lunch, dinner
```

## 8. 구현 순서

1. `tripPlan` 요청·응답과 `PlanProvider` 필드명을 먼저 확정한다.
2. `SCR-007~010`을 Mock 상태로 구현한다.
3. `SCR-011~012`의 검색·필터·반경·빈 상태를 구현한다.
4. 여행 계획 초안 저장·조회 API를 구현한다.
5. 장소 검색 API와 화면을 연결한다.
6. 단계 이동·뒤로가기·새로고침 복구를 확인한다.
7. 송정근에게 식사 선택·조건 초기화 함수를 전달한다.
8. 이희승에게 추천 요청용 `tripPlanId`와 Mock 데이터를 전달한다.

## 9. 완료 체크리스트

- [ ] 홈의 각 카드와 내비게이션이 정의된 화면으로 이동한다.
- [ ] 일반 여행과 반려동물 동반 설정이 각각 올바른 상태로 저장된다.
- [ ] 필수값이 없으면 다음 단계로 이동하지 않고 누락 필드가 표시된다.
- [ ] 이전 단계와 새로고침 후에도 허용된 입력값이 유지된다.
- [ ] 테마 미선택은 전체 테마 검색으로 처리된다.
- [ ] 장소 검색어·필터·반경이 화면에 표시된다.
- [ ] 빈 결과에서 반경 확대 또는 필터 초기화 후 결과가 갱신된다.
- [ ] 장소 중복을 막고 체류시간을 30분 단위로 저장한다.
- [ ] 점심·저녁 조건과 90분 식사시간이 저장된다.
- [ ] 다른 사용자의 `tripPlan`은 조회·수정할 수 없다.
- [ ] 유효한 `tripPlanId`와 전체 입력을 추천 API에 전달할 수 있다.

## 10. 담당하지 않는 범위

- 외부 관광·대중교통 API 호출과 추천 알고리즘
- 지도·타임라인을 포함한 추천 결과 화면
- 일정 편집·저장·삭제
- `SCR-013` 음식점 카드 UI와 `SCR-015` 모달 UI
