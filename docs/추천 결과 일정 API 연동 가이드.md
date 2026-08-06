# 추천 결과 일정 API 연동 가이드

## 목적

`CourseResultPage`는 현재 `course.mock.js`의 Mock 데이터를 사용한다. 이 문서는 추천 계산, 장소 편집, 음식점 추가, 저장 일정 기능이 준비된 뒤 실제 ROUTA API로 전환하는 순서를 정리한다.

## 연동 전 확정할 API 계약

프런트엔드와 백엔드는 다음 식별자를 같은 의미로 사용한다.

| 이름 | 용도 |
| --- | --- |
| `tripPlanId` | 사용자가 여행 조건을 작성하는 초안 ID |
| `runId` | 추천 또는 재계산 작업 ID |
| `itineraryId` | 실제 일정 하나의 ID |
| `itemId` | 일정 내부의 장소·식사·출발·종료 항목 ID |
| `placeId` | 관광지·음식점·역 등 장소 마스터 ID |

추천 계산 완료 응답에는 코스 3개의 `itineraryId`와 카드 표시용 요약 정보가 반드시 포함되어야 한다.

```text
최단 도보 / 최소 시간 / 추천 코스
각각의 itineraryId, courseKind, 총 이동시간, 총 도보거리, 환승 수
```

## 권장 화면 URL

새로고침 이후에도 선택한 코스를 복구할 수 있도록 React Router의 state에만 의존하지 않는다.

```text
/course/loading?runId={runId}
/course/result?runId={runId}&itineraryId={itineraryId}
/schedules
```

`CourseResultPage`는 URL의 `itineraryId`를 기준으로 일정 상세를 조회한다. 사용자가 코스 카드를 선택하면 URL의 `itineraryId`도 함께 바꾼다.

## API 모듈 구성

실제 요청 코드는 다음 파일에만 둔다.

```text
Client/src/features/course/course.api.js
Client/src/features/restaurant/restaurant.api.js
Client/src/features/schedule/schedule.api.js
```

페이지나 세부 컴포넌트 안에서 `fetch` 또는 `axios`를 직접 호출하지 않는다. `CourseResultPage`는 API 모듈의 함수를 호출하고, 컴포넌트는 props로 받은 데이터와 이벤트만 처리한다.

## 일정 상세 조회

화면 진입 또는 코스 변경 시 아래 API를 호출한다.

```text
GET /api/itineraries/:itineraryId
```

Mock 데이터의 `course` 한 건을 이 응답으로 교체한다.

필수 응답 필드는 다음과 같다.

```text
itineraryId
courseKind
travelDate
startTime
endTime
summary.totalMinutes
summary.walkingDistanceMeters
summary.transferCount
summary.estimatedFare
items[].itemId
items[].kind
items[].placeName
items[].arrivalTime
items[].departureTime
items[].stayMinutes
items[].latitude
items[].longitude
legs[].fromItemId
legs[].toItemId
legs[].durationMinutes
legs[].walkingDistanceMeters
legs[].transferCount
legs[].estimatedFare
legs[].steps
warnings[]
```

현재 화면 요구사항에는 지도·교통비·이동 상세가 있으므로 위도·경도, 교통비, 이동 단계 데이터가 빠지면 결과 화면을 완성할 수 없다.

## 장소 추가

### 프런트엔드 흐름

```text
장소 추가 Drawer 열기
→ 장소 검색
→ 추가 위치와 체류시간 결정
→ 일정 항목 추가 요청
→ 재계산 요청
→ 로딩 상태 표시
→ 최신 일정 조회
```

장소 검색은 팀원 3의 Places API를 사용한다.

```text
GET /api/places?keyword={검색어}&kind={ATTRACTION|RESTAURANT}
```

관광지 추가 요청:

```text
POST /api/itineraries/:itineraryId/items
```

필수 요청 값:

```text
placeId
afterItemId
stayMinutes
kind = VISIT 또는 MEAL
mealSlot = LUNCH 또는 DINNER (음식점인 경우)
```

## 장소 삭제

```text
삭제 버튼
→ 삭제 확인 모달
→ DELETE /api/itineraries/:itineraryId/items/:itemId
→ 재계산
→ 최신 일정 조회
```

`START`, `END` 항목은 프런트엔드와 백엔드 모두 삭제를 막아야 한다. 화면에서 버튼을 숨기는 것만으로는 충분하지 않다.

## 체류시간 변경

체류시간은 30분 단위로만 변경한다.

```text
PATCH /api/itineraries/:itineraryId/items/:itemId
```

프런트엔드는 변경 전·후 값을 임의로 계산해 최종 시간을 확정하지 않는다. 수정 성공 후 재계산 결과를 받아 이후 모든 항목의 도착·출발 시간을 갱신한다.

## 순서 변경

드래그 앤 드롭으로 변경한 순서는 전체 `itemId` 목록을 보낸다.

```text
PUT /api/itineraries/:itineraryId/items/order
```

`START`, `END`는 위치 변경을 막고, 서버도 잘못된 순서를 거부해야 한다.

## 재계산

일정 항목 추가·삭제·순서 변경·체류시간 변경 후 아래 API를 호출한다.

```text
POST /api/itineraries/:itineraryId/recalculate
```

재계산 방식은 팀원 4와 반드시 하나로 합의한다.

### 즉시 응답 방식

```text
200 OK + 최신 itinerary 응답
```

프런트엔드는 응답 데이터를 즉시 화면에 반영한다.

### 비동기 작업 방식 권장

```text
202 Accepted + runId 응답
```

프런트엔드는 `CourseLoadingPage`로 이동한 뒤 아래 API를 일정 간격으로 조회한다.

```text
GET /api/recommendations/:runId
```

상태가 `SUCCEEDED`면 새 `itineraryId`로 결과 화면을 다시 연다. `FAILED`면 오류 원인과 조건 수정 또는 재시도 행동을 제공한다.

## 음식점 처리

음식점은 화면 위치에 따라 두 가지 API 흐름이 있다.

| 시점 | 데이터 기준 | 처리 |
| --- | --- | --- |
| 추천 전 음식점 선택 | `tripPlanId` | Places 검색 후 여행 조건의 식사 설정 저장 |
| 추천 결과에서 음식점 추가 | `itineraryId` | 현재 경로 주변 음식점 추천 후 `MEAL` 항목으로 추가 |

결과 화면의 경로 주변 음식점 조회:

```text
GET /api/itineraries/:itineraryId/restaurants?mealSlot=LUNCH
```

음식점 추가는 별도 API가 아니라 장소 추가 API를 재사용한다.

```text
POST /api/itineraries/:itineraryId/items
kind = MEAL
stayMinutes = 90
mealSlot = LUNCH 또는 DINNER
```

## 일정 저장과 목록

저장 버튼은 중복 요청을 막기 위해 요청 중 비활성화한다.

```text
POST /api/itineraries/:itineraryId/save
```

성공한 경우에만 `SaveSuccessModal`을 열고, 목록 보기 행동은 `/schedules`로 이동한다.

저장 목록:

```text
GET /api/itineraries?status=SAVED&page=1&size=12
```

삭제:

```text
DELETE /api/itineraries/:itineraryId
```

삭제 성공 후에는 현재 목록을 다시 조회하거나 해당 카드만 목록 상태에서 제거한다.

## 지도 SDK 연결

현재 `CourseMapPlaceholder`는 지도 영역 레이아웃을 검증하기 위한 임시 컴포넌트다. 실제 연결 시 `CourseMap`으로 교체한다.

지도 컴포넌트가 받을 props:

```text
items: 위도·경도를 포함한 일정 항목
legs: 구간별 경로 좌표 또는 경로 정보
selectedItemId: 선택된 타임라인 항목 ID
```

카카오 지도 SDK 키는 프런트엔드 환경변수로 관리하되, 카카오·Google·ODsay의 서버용 비밀 키는 절대 프런트엔드에 넣지 않는다.

## 보안과 오류 처리

- 모든 일정 API는 로그인 인증이 필요하다.
- 서버는 현재 사용자가 해당 일정의 소유자인지 확인한다.
- 다른 사용자의 `itineraryId`를 URL에 입력해도 조회·수정·삭제하면 안 된다.
- `401`은 로그인 화면 이동 또는 토큰 갱신 처리한다.
- `403`은 권한 없음 안내를 표시한다.
- `404`는 삭제되었거나 존재하지 않는 일정 안내를 표시한다.
- `FAILED` 재계산은 기존 화면을 유지하고 오류 원인과 재시도 행동을 표시한다.

## Mock 제거 전 체크리스트

- [ ] URL의 `itineraryId`로 일정 상세를 조회한다.
- [ ] 코스 선택 시 지도·타임라인·통계가 함께 변경된다.
- [ ] 장소 추가·삭제·순서 변경·체류시간 수정 후 재계산한다.
- [ ] `START`, `END`는 수정·삭제·순서 변경할 수 없다.
- [ ] 음식점은 `MEAL` 항목으로 추가된다.
- [ ] 저장 완료 응답 이후에만 완료 모달을 표시한다.
- [ ] 저장 일정은 현재 로그인한 사용자의 일정만 조회한다.
- [ ] 모든 로딩·빈 상태·오류 상태가 화면에 표시된다.
