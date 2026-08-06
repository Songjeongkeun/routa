# 송정근 담당 업무 상세 분석 및 선행 작업 가이드

> 기준 문서: [`5_ITINERARY_송정근.md`](./5_ITINERARY_송정근.md)
>
> 이 문서는 음식점 선택, 추천 결과, 일정 편집, 일정 저장 담당 범위를 자세히 해석하고, 다른 담당자의 구현을 기다리지 않고 먼저 진행할 수 있는 작업을 구분하기 위해 작성한다.

## 1. 담당 범위 요약

담당 범위는 단순한 추천 결과 화면 하나가 아니라 다음 사용자 흐름 전체다.

```text
음식점 선택
→ 추천 계산 진행
→ 추천 코스 비교
→ 일정 편집·재계산
→ 일정 저장
→ 저장 일정 조회·수정·삭제
```

다만 경로를 계산하는 알고리즘과 외부 API 연동 자체는 추천 담당자의 범위다. 따라서 다른 담당자와 협업하기 전에 먼저 완성할 핵심은 다음 두 가지다.

1. 합의한 형태의 Mock 데이터가 들어오면 모든 화면과 편집 동작을 검증할 수 있는 프런트엔드
2. 나중에 실제 계산 서비스와 DB 구현을 연결할 수 있는 API 및 백엔드 계층 골격

## 2. 화면별 담당 내용

### 2.1 음식점 선택

추천 경로를 만들기 전 사용자가 점심·저녁 음식점을 선택하는 단계다.

구현해야 하는 내용:

- 음식점 검색
- 음식 종류·지역 등의 필터
- 점심과 저녁 구분
- 음식점 선택·선택 해제
- 현재 선택 목록 표시
- 기본 식사시간 90분 적용
- 반려동물 동반 여행이면 이용 가능 여부 표시
- 선택 결과를 여행 계획에 반영
- 선택 완료 후 경로 계산 시작

장소 검색과 여행 계획 초안 저장은 다른 담당자의 범위이므로, 먼저 Mock 음식점으로 UI와 선택 상태를 완성한다.

### 2.2 추천 계산 진행

단순한 스피너가 아니라 계산 작업의 상태를 보여주는 화면이 필요하다.

필요한 상태:

- 계산 요청 전
- 대기 중 `PENDING`
- 계산 중 `RUNNING`
- 일부 코스 생성 `PARTIAL_SUCCESS`
- 완료 `SUCCEEDED`
- 실패 `FAILED`
- 취소 중
- 취소 완료

완료 시 추천 결과로 이동하고, 실패 시에는 재시도 또는 조건 수정 행동을 제공해야 한다.

### 2.3 추천 결과

최대 3개의 코스를 비교하고 하나를 선택하는 화면이다.

하나의 `selectedItineraryId`가 다음 데이터를 모두 결정해야 한다.

```text
selectedItineraryId
├── 선택된 코스 카드
├── 지도 마커와 경로
├── 타임라인 장소
├── 장소 사이의 이동 구간
├── 총 이동시간
├── 총 도보거리
├── 환승 횟수
└── 예상 교통비
```

코스 카드만 변경되고 지도나 타임라인이 이전 코스를 보여주면 잘못된 상태다.

### 2.4 일정 편집

다음 기능을 담당한다.

- 장소 추가
- 장소 삭제
- 방문 순서 변경
- 체류시간 변경
- 음식점 추가
- 이동 상세 펼치기
- 반려동물 제한 경고
- 편집 후 전체 일정 재계산
- 재계산 실패 시 충돌 위치와 이유 표시

일정 항목별 규칙:

| 종류 | 처리 규칙 |
|---|---|
| `START` | 삭제·순서 변경·체류시간 변경 불가 |
| `VISIT` | 추가·삭제·순서 변경·체류시간 변경 가능 |
| `MEAL` | 편집 가능, 기본 90분, 영업시간·라스트 오더 검사 |
| `WAIT` | 서버 재계산 결과로만 생성·조정 |
| `END` | 삭제·순서 변경·체류시간 변경 불가 |

### 2.5 일정 저장 및 관리

추천 결과를 저장 상태로 전환하고 저장된 일정을 관리한다.

- 일정 저장
- 저장 목록 조회
- 검색·필터·페이지네이션
- 일정 상세 조회
- 제목 등 일정 정보 수정
- 일정 삭제
- 삭제 확인
- 빈 목록 상태
- 삭제 후 목록과 총건수 즉시 반영
- 본인 일정만 조회·수정·삭제

## 3. 현재 구현 상태

현재 담당 부분의 실질적인 구현은 추천 결과 Mock 화면에 집중되어 있다.

| 영역 | 현재 상태 |
|---|---|
| 추천 결과 코스 카드 | 구현됨 |
| 코스 전환 동기화 | 기본 구현됨 |
| 카카오 지도 | 구현됨 |
| 지도 마커·장소 라벨 | 구현됨 |
| 실제 교통 경로선 | 미구현, 장소 좌표를 직선 연결 |
| 타임라인 | 구현됨 |
| 이동 상세 | 구현됨 |
| 장소 추가·삭제 | 로컬 상태로 구현됨 |
| 체류시간 변경 | 로컬 상태로 구현됨 |
| 순서 변경 | HTML Drag & Drop으로 구현됨 |
| 재계산 | 0.7초짜리 가짜 로딩 |
| 일정 저장 | API 없이 즉시 성공 모달 표시 |
| 음식점 선택 화면 | 미구현 |
| 계산 중 화면 | 미구현 |
| 반려동물 경고 | 미구현 |
| 조건 변경 경고 | 미구현 |
| 저장 일정 화면 | 미구현 |
| itinerary 프런트 API | 빈 파일 |
| itinerary 백엔드 | 빈 파일 |
| itinerary DB 테이블 | 없음 |

현재 `CourseResultPage.jsx`는 약 600줄이며 타임라인, 통계, 모달이 페이지 안에 모두 들어 있다. 반면 문서에서 계획한 `TimelineItem`, `CourseOptionCard`, `SaveSuccessModal` 등의 컴포넌트 파일은 비어 있다.

기능을 더 추가하기 전에 현재 페이지를 계획된 구조로 분리하는 작업이 우선이다.

## 4. 협업 없이 바로 할 수 있는 프런트엔드 작업

### 4.1 일정 데이터 모델 정리

현재 Mock 데이터 구조를 한 곳에서 명확히 정의한다.

권장 일정 구조:

```js
{
  itineraryId,
  courseKind,
  title,
  travelDate,
  startTime,
  endTime,
  status,
  summary,
  items,
  legs,
  warnings
}
```

일정 항목:

```js
{
  itemId,
  placeId,
  kind,
  placeName,
  arrivalTime,
  departureTime,
  stayMinutes,
  order,
  mealSlot,
  latitude,
  longitude
}
```

이동 구간:

```js
{
  fromItemId,
  toItemId,
  durationMinutes,
  walkingDistanceMeters,
  transferCount,
  estimatedFare,
  path,
  steps
}
```

경고:

```js
{
  warningId,
  type,
  severity,
  itemId,
  message,
  alternatives
}
```

협업 없이 정리할 수 있는 내용:

- 프런트엔드 내부 데이터 정규화 방식
- `START`, `VISIT`, `MEAL`, `WAIT`, `END` 상수
- `SHORTEST_WALK`, `FASTEST_TRANSIT`, `BALANCED` 상수
- UI가 요구하는 필수 필드
- 누락된 값에 대한 기본값
- Mock 데이터 생성 함수
- 테스트용 정상·부분 성공·실패 데이터

다른 담당자와 최종 계약을 확정하기 전까지는 API의 최종 DTO라고 선언하지 않고 `Mock contract` 또는 `normalized model`로 관리한다.

### 4.2 추천 결과 페이지 컴포넌트 분리

다음 구조로 분리한다.

```text
CourseResultPage
├── CourseOptionCard
├── KakaoCourseMap 또는 CourseMap
├── TimelinePanel
│   ├── TimelineItem
│   └── TransitDetail
├── AddPlaceDrawer
├── DeletePlaceModal
├── EditConditionModal
├── PetRestrictionModal
├── SaveSuccessModal
└── SummaryStats
```

#### `CourseResultPage`

- 선택된 `itineraryId` 관리
- 코스 데이터 관리
- API 또는 Mock 호출 조정
- 장소 편집 요청 조정
- 재계산 상태 관리
- 모달·드로어 열림 상태 관리

#### `CourseOptionCard`

- 카드 정보 표시
- 선택 여부 표시
- 클릭 이벤트 전달
- 내부적으로 선택 상태를 갖지 않음

#### `TimelinePanel`

- 항목 목록 렌더링
- 펼친 항목 ID 전달
- 순서 변경 이벤트 연결
- 장소 추가 버튼 표시

#### `TimelineItem`

- 장소·시간·체류시간 표시
- 편집 가능 여부 계산
- 체류시간 변경 이벤트
- 삭제 이벤트
- 드래그 이벤트
- 이동 상세 열기

#### `TransitDetail`

- 버스·지하철·도보 단계 표시
- 구간 시간·거리·요금 표시
- 데이터가 없을 때 빈 상태 표시

#### Modal과 Drawer

- 내용을 표시하고 이벤트만 부모에게 전달
- 서버 요청을 직접 하지 않음
- 확인 전에는 일정 상태를 변경하지 않음

이 구조를 유지하면 실제 API를 연결할 때 페이지의 이벤트 함수만 변경할 수 있다.

### 4.3 로컬 일정 편집 규칙 구현

실제 재계산 없이도 다음 순수 로직을 완성할 수 있다.

- 체류시간은 30분 단위
- 최소 체류시간 설정
- `START`, `END` 수정 방지
- `WAIT` 사용자 편집 방지
- 순서 변경 시 `START`는 첫 번째 유지
- 순서 변경 시 `END`는 마지막 유지
- 전체 `itemId` 순서 배열 생성
- 동일 장소 중복 추가 처리
- 점심·저녁 음식점 중복 처리
- 삭제 전 확인
- 취소 시 기존 데이터 유지
- 편집 중 버튼 중복 클릭 방지

이 로직은 React 컴포넌트 안에 흩어놓지 말고 별도 유틸리티로 분리한다.

권장 파일:

```text
features/course/course.constants.js
features/course/course.model.js
features/course/course.utils.js
```

필요한 함수 예시:

```js
reorderItems(items, sourceItemId, targetItemId)
changeStayMinutes(items, itemId, difference)
insertItemAfter(items, afterItemId, newItem)
removeEditableItem(items, itemId)
validateItemOrder(items)
createOrderRequest(items)
```

### 4.4 화면 상태 완성

API가 없어도 모든 화면 상태를 Mock으로 만들 수 있다.

추천 결과 화면에서 준비할 상태:

- 최초 로딩
- 정상 결과
- 결과 없음
- 코스 하나만 성공
- 일부 코스 실패
- API 오류
- 재시도 중
- 재계산 중
- 재계산 실패
- 지도만 로드 실패
- 일정 항목 없음
- 경고 있음
- 반려동물 확인 필요
- 저장 중
- 저장 성공
- 저장 실패

Mock 데이터에 상태를 바꿀 수 있는 개발용 옵션을 추가하면 백엔드 없이도 전체 UX를 검증할 수 있다.

### 4.5 추천 계산 중 화면 구현

`CourseLoadingPage.jsx`에 다음 내용을 구현한다.

- 현재 계산 단계
- 진행 안내
- 취소 버튼
- 실패 메시지
- 재시도 버튼
- 조건 수정 버튼
- 일부 결과 확인 버튼
- 완료 시 결과 화면 이동

Mock 상태 전환 예시:

```text
PENDING
→ VALIDATING_PLACES
→ FETCHING_ROUTES
→ SCORING_COURSES
→ BUILDING_ITINERARIES
→ SUCCEEDED
```

컴포넌트는 다음처럼 데이터와 이벤트만 받도록 만든다.

```jsx
<CourseLoadingView
  status={status}
  stage={stage}
  progress={progress}
  error={error}
  onCancel={handleCancel}
  onRetry={handleRetry}
/>
```

### 4.6 조건 변경 경고 구현

`EditConditionModal`은 API 없이 구현할 수 있다.

사용자 선택:

- 기존 추천 유지
- 조건 수정으로 이동
- 취소

안내 내용:

- 조건을 변경하면 현재 추천 결과가 무효화될 수 있음
- 아직 저장하지 않은 편집 내용이 사라질 수 있음
- 저장된 일정에 미치는 영향

실제 조건 초기화 함수는 다른 담당자와 연결하더라도 `onConfirmEdit`, `onKeepCurrent`, `onClose` 이벤트 구조까지는 먼저 완성할 수 있다.

### 4.7 반려동물 경고 UI 구현

외부 데이터가 없어도 경고 표시 규칙은 먼저 만들 수 있다.

반려동물 가능 여부는 단순한 `true`, `false`보다 다음처럼 구분한다.

```text
ALLOWED
NOT_ALLOWED
REQUIRES_CONFIRMATION
UNKNOWN
```

특히 `UNKNOWN`이나 `REQUIRES_CONFIRMATION`을 이용 가능 또는 이용 불가로 단정하면 안 된다.

경고 모달에서 제공할 내용:

- 확인이 필요한 장소
- 확인되지 않은 항목
- 전화번호가 있으면 전화 확인 행동
- 장소 삭제
- 대체 장소 검색
- 현재 일정 유지

### 4.8 음식점 UI Mock 구현

검색 API 없이 Mock 데이터로 다음을 완성할 수 있다.

- `RestaurantCard`
- `RestaurantList`
- 점심·저녁 탭
- 음식 종류 필터
- 선택·해제
- 선택된 음식점 표시
- 기본 체류시간 90분
- 한 끼당 하나만 선택하는 규칙
- 동일 음식점 중복 선택 방지
- 검색 결과 없음
- 로딩 스켈레톤
- 오류 및 재시도
- `RestaurantAddedModal`

음식점 선택 화면의 정확한 URL과 `tripPlanId` 전달 방식은 나중에 협의하더라도 화면과 이벤트 계약은 먼저 구현할 수 있다.

### 4.9 저장 일정 화면 Mock 구현

`SavedSchedulesPage.jsx`에 다음 상태를 구현한다.

- 저장 일정 목록
- 검색어
- 날짜 또는 상태 필터
- 페이지 번호
- 상세 보기
- 삭제 대상
- 삭제 확인
- 삭제 진행
- 삭제 성공
- 삭제 실패
- 빈 목록
- 검색 결과 없음

권장 컴포넌트 구조:

```text
SavedSchedulesPage
├── ScheduleFilter
├── ScheduleCard
├── Pagination
└── DeleteScheduleModal
```

Mock 삭제 시에도 다음 흐름을 구현한다.

```text
삭제 확인
→ 목록에서 일정 제거
→ totalCount 감소
→ 현재 페이지가 비면 이전 페이지로 이동
→ 삭제 모달 닫기
```

### 4.10 프런트엔드 API 모듈 작성

백엔드가 없어도 요청 함수의 인터페이스를 먼저 만들 수 있다.

#### `course.api.js`

```js
getRecommendationStatus(runId)
cancelRecommendation(runId)
getItinerary(itineraryId)
addItineraryItem(itineraryId, payload)
updateItineraryItem(itineraryId, itemId, payload)
deleteItineraryItem(itineraryId, itemId)
reorderItineraryItems(itineraryId, itemIds)
recalculateItinerary(itineraryId)
saveItinerary(itineraryId, requestId)
```

#### `restaurant.api.js`

```js
getRouteRestaurants(itineraryId, filters)
getPlaceDetail(placeId)
```

음식점 추가는 별도 함수 대신 `addItineraryItem()`을 재사용한다.

#### `schedule.api.js`

```js
getSavedSchedules(params)
getSavedSchedule(itineraryId)
updateSchedule(itineraryId, payload)
deleteSchedule(itineraryId)
```

페이지에서 직접 `fetch()`를 호출하지 않고 API 모듈만 호출하도록 유지한다.

### 4.11 비동기 작업 상태 구조

버튼마다 각각 `isLoading`을 두기보다 현재 작업 종류를 구분한다.

```js
const [pendingAction, setPendingAction] = useState(null)
```

예상 값:

```text
FETCH_ITINERARY
ADD_ITEM
DELETE_ITEM
UPDATE_STAY
REORDER_ITEMS
RECALCULATE
SAVE
DELETE_SCHEDULE
```

이 구조를 사용하면 다음을 처리하기 쉽다.

- 중복 클릭 차단
- 현재 어떤 작업이 진행 중인지 표시
- 작업별 오류 메시지
- 저장 중 다른 편집 방지
- 재계산 중 코스 전환 방지 여부 결정

### 4.12 접근성·반응형·사용성 개선

다른 담당자의 API와 관계없이 개선할 수 있다.

- 모달에 `role="dialog"`와 `aria-modal`
- 모달이 열릴 때 포커스 이동
- ESC로 모달 닫기
- 모달 배경 스크롤 차단
- 키보드로 순서 변경 가능한 대체 UI
- 드래그 앤 드롭 이외의 위·아래 버튼
- 지도 로드 실패 시에도 타임라인 유지
- 모바일에서 지도·타임라인 세로 배치
- 버튼에 `type="button"` 명시
- 저장·삭제 중 버튼 비활성화
- 색상 이외의 선택 상태 표시
- 이모지 아이콘에 적절한 접근성 속성 적용

HTML Drag & Drop만 사용하면 모바일과 키보드 접근성이 부족하므로 위·아래 이동 버튼을 함께 제공하는 편이 좋다.

## 5. 백엔드에서 먼저 할 수 있는 작업

DB 테이블과 추천 서비스가 없어 전체 API를 완성할 수는 없지만 계층과 업무 규칙은 준비할 수 있다.

### 5.1 Router 골격

문서 기준 경로와 HTTP 메서드:

```text
GET    /
GET    /:itineraryId
POST   /:itineraryId/items
PATCH  /:itineraryId/items/:itemId
DELETE /:itineraryId/items/:itemId
PUT    /:itineraryId/items/order
POST   /:itineraryId/recalculate
POST   /:itineraryId/save
DELETE /:itineraryId
GET    /:itineraryId/restaurants
```

현재 서버의 인증 경로와 설계서의 `/api` prefix가 일치하지 않으므로 `app.use()` 최종 등록은 공통 경로 규칙이 확정된 뒤 처리하는 것이 안전하다.

### 5.2 Controller 골격

Controller의 책임:

- URL 파라미터 추출
- 쿼리 파라미터 추출
- 요청 body 추출
- Service 호출
- HTTP 상태 코드와 응답
- `next(error)` 처리

소유권이나 일정 편집 규칙을 Controller에 작성하지 않는다.

### 5.3 Service 순수 업무 규칙

DB 없이도 다음 규칙을 함수로 설계할 수 있다.

- `START`, `END` 삭제 금지
- `WAIT` 직접 수정 금지
- 체류시간 30분 단위 검증
- 음식점 기본 90분 적용
- `mealSlot` 검증
- 전체 순서에 누락·중복 ID가 없는지 검증
- 시작·종료 위치 고정
- 저장된 일정 중복 저장 방지
- 일정 소유자 비교
- 일정 상태 전이 검증

### 5.4 Repository는 인터페이스만 준비

현재 DB에는 itinerary 관련 테이블이 없다. 따라서 다음 SQL을 스키마 확정 전에 최종 구현하면 안 된다.

- 일정 조회 SQL
- 일정 항목 추가·삭제 SQL
- 순서 일괄 변경 트랜잭션
- 일정 저장 SQL
- 저장 목록 페이지네이션 SQL
- 일정과 사용자 소유권 조인
- 추천 실행 결과 연결 SQL

Repository 함수 이름과 입력·출력 인터페이스까지만 만들고 실제 SQL은 DB 구조가 확정된 뒤 구현한다.

## 6. 협업 없이 최종 확정하면 안 되는 부분

### 6.1 추천 DTO 최종 계약

추천 담당자와 다음 내용을 맞춰야 한다.

- `runId` 형식
- 추천 상태 값
- 부분 성공 표현 방식
- 세 코스 요약 응답
- `legs.steps` 구조
- 지도 경로 좌표 구조
- 경고 타입
- 재계산 응답이 즉시 일정인지 새로운 `runId`인지
- 실패 이유와 대안 구조

현재 Mock의 `steps`는 문자열 배열이지만 API 설계서 예시는 객체 배열이다.

```js
// 현재 Mock
steps: ["서울역 정류장까지 도보 3분"]

// 설계서 예시
steps: [{
  mode: "WALK",
  description: "서울역 정류장까지 도보 3분"
}]
```

실제 연결 전에 반드시 하나로 통일해야 한다.

### 6.2 음식점·장소 API 최종 연결

장소·여행 계획 담당자와 다음 내용을 맞춰야 한다.

- 검색 응답 필드
- 음식점과 관광지 `kind`
- 운영시간 표현 방식
- `tripPlanId` 보관 위치
- 점심·저녁 조건 저장 방식
- 장소 상세 API
- 음식점 선택 완료 후 다음 경로

### 6.3 인증과 API prefix

인증 담당자와 다음 내용을 맞춰야 한다.

- `/auth`와 `/api/auth` 중 최종 규칙
- itinerary Router에 적용할 인증 미들웨어
- `req.userId` 사용 규칙
- 401·403 처리
- 정지·탈퇴 사용자의 일정 접근
- 소유권 실패를 403 또는 404로 응답할지

### 6.4 실제 재계산

다음은 추천 담당자의 범위이므로 중복 구현하지 않는다.

- ODsay 호출
- 대중교통 경로 탐색
- 코스 점수 계산
- 운영시간 기반 방문 가능성 계산
- 추천 코스 생성 알고리즘
- 경로 주변 음식점 계산

이 담당 역할은 편집 요청을 전달하고 재계산 결과를 화면에 정확히 표시하는 것이다.

## 7. 현재 코드에서 먼저 개선할 지점

### 7.1 페이지가 지나치게 큼

현재 추천 결과 페이지 안에 코스 선택, 타임라인, 이동 상세, 통계, 장소 추가 드로어, 삭제 모달, 저장 모달, 편집 로직이 모두 들어 있다.

기능을 추가하기 전에 계획된 컴포넌트 파일로 분리한다.

### 7.2 재계산이 실제 데이터를 바꾸지 않음

현재 재계산은 로딩만 보여준다. 장소 순서나 체류시간을 바꿔도 다음 값은 그대로다.

- 도착시간
- 종료시간
- 이동 구간
- 총 이동시간
- 총 도보거리
- 환승 수
- 교통비

Mock 단계에서도 재계산 전후 데이터 세트를 따로 준비하면 실제 흐름을 더 정확히 검증할 수 있다.

### 7.3 저장 성공 시점이 잘못됨

현재는 저장 버튼을 누르면 바로 성공 모달이 열린다. 최종 구조는 다음과 같아야 한다.

```text
저장 버튼
→ 저장 요청 중
→ 성공 응답
→ 성공 모달
```

실패하면 성공 모달을 열지 않고 기존 화면을 유지한다.

### 7.4 장소 검색 입력이 동작하지 않음

장소 추가 드로어에 검색 입력은 있지만 Mock 후보를 필터링하지 않는다. API 없이도 이름과 설명을 기준으로 클라이언트 검색을 먼저 구현할 수 있다.

### 7.5 편집 결과와 이동 구간 불일치

장소를 추가하거나 삭제해도 기존 `legs`는 그대로다. 그 결과 새 장소는 이동 상세가 없고 삭제된 장소를 참조하는 이동 구간이 남을 수 있다.

로컬 편집 직후에는 다음 중 하나가 필요하다.

- 재계산 응답이 올 때까지 이동 상세를 숨김
- 편집 결과용 Mock `legs`로 교체
- `needsRecalculation` 상태 표시

### 7.6 저장 일정 화면 라우트가 없음

헤더는 API처럼 보이는 경로로 이동하지만 저장 일정 화면 라우트가 등록되어 있지 않다. `/schedules` 화면을 만들고 해당 라우트로 연결해야 한다.

## 8. 권장 작업 순서

다른 담당자 작업을 기다리지 않고 진행할 때의 권장 순서다.

1. 현재 변경 사항을 별도 커밋 단위로 정리한다.
2. `course.constants.js`, `course.model.js`, `course.utils.js`를 작성한다.
3. Mock DTO의 필드 구조를 통일한다.
4. `CourseResultPage`의 하위 컴포넌트를 분리한다.
5. 장소 추가·삭제·체류시간·순서 변경 로직을 순수 함수로 분리한다.
6. 로딩·오류·부분 성공·경고 상태를 추가한다.
7. `CourseLoadingPage`를 Mock으로 구현한다.
8. 음식점 선택 컴포넌트를 Mock으로 구현한다.
9. 저장 일정 목록·삭제 화면을 Mock으로 구현한다.
10. `/course/loading`, `/course/result`, `/schedules` 라우트를 정리한다.
11. `course.api.js`, `restaurant.api.js`, `schedule.api.js`를 작성한다.
12. Router·Controller·Service 백엔드 골격을 작성한다.
13. 소유권·편집 규칙을 순수 Service 함수로 구현한다.
14. 프런트엔드 빌드와 lint 오류를 정리한다.
15. 팀 API 계약이 확정되면 Repository와 실제 재계산을 연결한다.

## 9. 협업 전에 도달할 수 있는 완료 지점

다른 담당자의 구현을 기다리지 않고도 다음 수준까지 완성할 수 있다.

- 모든 담당 화면을 Mock으로 탐색 가능
- 추천 결과 컴포넌트 분리 완료
- 코스 선택 동기화 완료
- 편집 UI와 확인 모달 완료
- 로딩·오류·빈 상태 완료
- 반려동물 경고 완료
- 음식점 선택 UI 완료
- 저장 일정 UI 완료
- API 호출 모듈의 함수 인터페이스 완료
- 백엔드 Router·Controller·Service 골격 완료
- 편집 규칙 순수 함수 완료
- 실제 API 대신 Mock adapter로 전체 사용자 흐름 시연 가능

반대로 DB 저장, 실제 추천 계산, 실제 장소 검색, 실제 음식점 추천까지 혼자 완성하려고 하면 다른 담당자의 코드를 중복 구현하게 된다.

현재 가장 적절한 선행 목표는 **Mock으로 전체 흐름을 완성하고 실제 연동 지점을 좁게 만드는 것**이다.

## 10. 선행 작업 체크리스트

### 데이터와 구조

- [ ] 일정, 항목, 이동 구간, 경고 Mock 구조 정리
- [ ] 일정 종류와 상태 상수 분리
- [ ] 정상·부분 성공·실패 Mock 데이터 준비
- [ ] `CourseResultPage` 하위 컴포넌트 분리
- [ ] 편집 로직을 순수 유틸리티 함수로 분리

### 추천 결과와 편집

- [ ] 코스 카드·지도·타임라인·통계 동기화
- [ ] 장소 추가·삭제
- [ ] 순서 변경
- [ ] 체류시간 30분 단위 변경
- [ ] `START`, `WAIT`, `END` 편집 제한
- [ ] 편집 후 재계산 필요 상태 표시
- [ ] 재계산 로딩·실패·재시도 처리
- [ ] 저장 요청 중 중복 클릭 방지
- [ ] 성공 응답 이후에만 저장 완료 모달 표시

### 부가 화면

- [ ] 추천 계산 중 화면
- [ ] 조건 변경 경고
- [ ] 반려동물 확인 필요 경고
- [ ] 장소 추가 드로어 검색·필터
- [ ] 음식점 선택 Mock UI
- [ ] 저장 일정 목록·검색·필터
- [ ] 저장 일정 삭제 확인
- [ ] 빈 상태와 검색 결과 없음 상태

### API 연결 준비

- [ ] `course.api.js` 함수 인터페이스 작성
- [ ] `restaurant.api.js` 함수 인터페이스 작성
- [ ] `schedule.api.js` 함수 인터페이스 작성
- [ ] itinerary Router 골격 작성
- [ ] Controller 요청·응답 골격 작성
- [ ] Service 편집·소유권 규칙 작성
- [ ] Repository 인터페이스만 정의

### 품질 확인

- [ ] 모바일 레이아웃 확인
- [ ] 모달 키보드 접근성 확인
- [ ] 드래그 외 순서 이동 방법 제공
- [ ] 지도 실패 시 타임라인 유지
- [ ] 빌드 통과
- [ ] lint 통과
- [ ] Mock 전체 사용자 흐름 수동 검증
