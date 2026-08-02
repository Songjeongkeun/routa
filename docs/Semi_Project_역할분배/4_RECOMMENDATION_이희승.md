# 팀원 4 작업 명세 — 추천 경로 계산·외부 API

## 1. 담당 요약

| 항목 | 내용 |
|---|---|
| 담당 기능 | 추천 경로 계산, 외부 API 연동, 계산 상태 관리 |
| 난이도 | 어려움 |
| 예상 작업량 | 8 |
| 권장 브랜치 | `feature/route-recommendation` |

화면 수는 적지만 외부 API, 이동시간 계산, 운영시간 검증과 실패 처리가 포함된 백엔드 중심 업무다. 외부 API 또는 알고리즘 경험이 있는 팀원이 맡는 것을 권장한다.

## 2. 담당 피그마 화면·데이터

```text
SCR_018 · Route Loading
최단 도보 코스 데이터
최소 시간 코스 데이터
추천 코스 데이터
반려동물 출입 제한 판단 데이터
```

추천 결과의 화면 구성은 팀원 5가 담당한다. 이 팀원은 화면이 요구하는 계산 결과와 상태 API를 제공한다.

## 3. 백엔드 작업 범위

```text
server/src/modules/recommendations/
├── recommendation.router.mjs
├── recommendation.controller.mjs
├── recommendation.service.mjs
├── recommendation.repository.mjs
└── recommendation.scorer.mjs

server/src/providers/
├── tourApi.mjs                # 관광지·운영정보
├── odsay.mjs                  # 대중교통 경로·시간
├── kakao.mjs                  # 좌표·장소 보완
└── google.mjs                 # 장소 데이터 보완
```

구글·카카오 OAuth 인증 부분은 팀원 2와 분리하고, 이 담당자는 장소·좌표·경로 관련 호출만 관리한다.

## 4. 담당 API

```text
POST /api/trip-plans/:tripPlanId/recommendations
GET  /api/recommendations/:runId
POST /api/recommendations/:runId/cancel
```

API 요청·응답 형식은 [ROUTA API 구조 설계서](../ROUTA_API_STRUCTURE.md)를 따른다.

### 계산 시작 응답

```json
{
  "data": {
    "runId": "recommendation-run-uuid",
    "status": "QUEUED"
  }
}
```

### 계산 완료 응답

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

## 5. 추천 계산 규칙

### 입력 데이터

- 여행 날짜
- 시작·종료 시각
- 출발·종료 위치
- 필수 방문 장소
- 각 장소 체류시간
- 관심 테마
- 점심·저녁 조건
- 주중·주말 교통 기준
- 반려동물 동반 여부

### 처리 항목

1. 장소 좌표와 운영시간 조회
2. 휴무·운영시간 충돌 장소 확인
3. 장소별 이동 경로와 이동시간 계산
4. 전체 여행시간을 초과하는 조합 제외
5. 식사시간과 체류시간 반영
6. 반려동물 제한 정보 검증
7. 후보 경로 점수 계산
8. 코스 종류별 결과 생성
9. itinerary와 이동 구간 저장

### 코스 종류

| 값 | 설명 |
|---|---|
| `SHORTEST_WALK` | 도보 이동 거리가 가장 짧은 코스 |
| `FASTEST_TRANSIT` | 전체 이동시간이 가장 짧은 코스 |
| `BALANCED` | 필수 장소·테마·시간·도보를 균형 있게 반영한 추천 코스 |

## 6. 계산 상태

```text
QUEUED       계산 대기
RUNNING      계산 진행 중
SUCCEEDED    전체 계산 성공
PARTIAL      일부 외부 데이터 실패, 사용 가능한 결과 존재
FAILED       결과 생성 실패
CANCELLED    사용자 또는 서버가 계산 취소
```

외부 API 하나가 실패했다고 전체 추천을 반드시 실패시키지 말고, 다른 데이터로 결과를 만들 수 있으면 `PARTIAL`로 처리한다.

## 7. 외부 API 규칙

- API 키를 프론트엔드로 전달하지 않는다.
- 모든 API 키는 서버 환경변수에서 읽는다.
- 외부 응답을 controller로 직접 전달하지 않는다.
- provider가 외부 응답을 ROUTA 내부 형식으로 변환한다.
- timeout과 재시도 횟수를 제한한다.
- 동일 장소·경로 요청은 가능한 경우 캐시한다.
- 요청 실패 원인을 로그에 남긴다.

## 8. 다른 팀원과의 연결

### 팀원 3에게 받을 것

- `tripPlanId`
- 여행 조건 DB 구조
- 장소·테마·식사 선택 형식
- 장소 좌표와 운영시간 조회 함수

### 팀원 5에게 제공할 것

- 추천 계산 상태
- 세 가지 코스의 `itineraryId`
- 코스 요약 정보
- 반려동물 제한·운영시간 충돌 정보
- 경로 재계산 서비스 함수

## 9. 구현 순서

1. 외부 API 키와 테스트 환경 확인
2. 각 provider 단독 호출 테스트
3. 외부 응답의 내부 데이터 형식 정의
4. recommendation run 생성·조회 API 구현
5. 장소 간 이동시간 계산 구현
6. 후보 경로 생성과 점수 계산
7. itinerary 및 이동 구간 저장
8. 실패·부분 성공·취소 처리
9. 팀원 5용 Mock 응답과 실제 응답 일치 확인
10. 외부 API timeout·rate limit 테스트

## 10. 완료 체크리스트

- [ ] 여행 계획 ID로 추천 계산을 시작할 수 있다.
- [ ] 계산 요청이 `202 Accepted`와 `runId`를 반환한다.
- [ ] 로딩 화면이 계산 상태를 조회할 수 있다.
- [ ] 세 가지 코스 종류가 생성된다.
- [ ] 장소 체류시간과 운영시간이 반영된다.
- [ ] 전체 여행시간을 초과하는 경로가 제외된다.
- [ ] 반려동물 제한 정보를 결과에 포함한다.
- [ ] 외부 API timeout이 전체 서버를 멈추지 않는다.
- [ ] 일부 API 실패 시 가능한 경우 `PARTIAL` 결과를 제공한다.
- [ ] 생성된 `itineraryId`를 팀원 5가 조회할 수 있다.

