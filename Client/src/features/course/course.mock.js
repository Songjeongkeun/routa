/**
 * 추천 결과 화면을 API 없이 구현·검증하기 위한 Mock 데이터입니다.
 *
 * 실제 API 연동 시에는 `mockCourses`를 GET /api/itineraries/:itineraryId
 * 응답으로 교체합니다. 현재 필드명은 API 연동 시 바꾸는 양을 줄이기 위해
 * API 구조 설계서의 itinerary 응답 형태를 최대한 따릅니다.
 */

/**
 * 코스별로 독립적인 itemId를 만들기 위한 함수입니다.
 * 같은 장소라도 코스마다 다른 일정 항목이므로, prefix로 ID 충돌을 막습니다.
 */
const createItems = (prefix) => [
  {
    itemId: `${prefix}-start`,
    kind: "START",
    placeName: "서울역",
    arrivalTime: "09:00",
    stayMinutes: 0,
    // Mock 화면에서 카카오 지도 마커를 확인하기 위한 위도·경도입니다.
    latitude: 37.5547,
    longitude: 126.9707,
  },
  {
    itemId: `${prefix}-palace`,
    kind: "VISIT",
    placeName: "경복궁",
    arrivalTime: "09:25",
    // 변경: 실제 장소의 기본 체류시간 정책(90분)과 Mock 일정도 동일하게 맞춥니다.
    stayMinutes: 90,
    latitude: 37.5796,
    longitude: 126.977,
  },
  {
    itemId: `${prefix}-hanok`,
    kind: "VISIT",
    placeName: "북촌 한옥마을",
    arrivalTime: "11:45",
    stayMinutes: 90,
    latitude: 37.5826,
    longitude: 126.984,
  },
  {
    itemId: `${prefix}-meal`,
    kind: "MEAL",
    placeName: "북촌담",
    arrivalTime: "13:15",
    stayMinutes: 90,
    mealSlot: "LUNCH",
    // 북촌담은 UI 검증을 위한 Mock 장소이므로 실제 장소 API 좌표로 교체해야 합니다.
    latitude: 37.5818,
    longitude: 126.9828,
  },
  {
    itemId: `${prefix}-seongsu`,
    kind: "VISIT",
    placeName: "성수 카페거리",
    arrivalTime: "15:00",
    stayMinutes: 90,
    latitude: 37.5445,
    longitude: 127.0557,
  },
  {
    itemId: `${prefix}-end`,
    kind: "END",
    // 시안의 마지막 방문지에 맞춘 고정 도착 지점입니다.
    // 장소 추가 시에는 이 항목 바로 앞에 새 장소가 들어갑니다.
    placeName: "한강공원",
    arrivalTime: "18:00",
    stayMinutes: 0,
    latitude: 37.5293,
    longitude: 127.0677,
  },
];

/**
 * `legs`는 두 일정 항목 사이의 이동 구간입니다.
 * Timeline에서 특정 장소를 펼쳤을 때, 해당 장소에 도착하기 전의 이동 상세를
 * 표시하는 데 사용합니다. 실제 API에서는 ODsay 등의 결과를 변환해 받습니다.
 */
const createLegs = (prefix) => [
  {
    fromItemId: `${prefix}-start`,
    toItemId: `${prefix}-palace`,
    durationMinutes: 25,
    steps: [
      "서울역 정류장까지 도보 3분",
      "버스 272번 탑승",
      "안국역 정류장 하차 후 도보 2분",
    ],
  },
  {
    fromItemId: `${prefix}-palace`,
    toItemId: `${prefix}-hanok`,
    durationMinutes: 20,
    steps: [
      "경복궁역까지 도보 6분",
      "지하철 3호선 이용",
      "안국역 하차 후 도보 4분",
    ],
  },
  {
    fromItemId: `${prefix}-hanok`,
    toItemId: `${prefix}-meal`,
    durationMinutes: 15,
    steps: ["북촌 한옥마을에서 도보 15분"],
  },
  {
    fromItemId: `${prefix}-meal`,
    toItemId: `${prefix}-seongsu`,
    durationMinutes: 45,
    steps: [
      "안국역까지 도보 이동",
      "지하철 3호선과 2호선 환승",
      "성수역 하차 후 도보 5분",
    ],
  },
  {
    fromItemId: `${prefix}-seongsu`,
    toItemId: `${prefix}-end`,
    durationMinutes: 55,
    steps: [
      "성수역까지 도보 8분",
      "지하철 2호선 이용",
      "서울역 하차",
    ],
  },
];

/**
 * Figma의 코스 비교 카드에 표시할 세 가지 추천 코스입니다.
 * CourseResultPage는 선택된 course 한 건을 기준으로 지도, 타임라인,
 * 하단 통계를 동시에 렌더링합니다.
 */
export const mockCourses = [
  {
    itineraryId: "mock-shortest-walk",
    courseKind: "SHORTEST_WALK",
    title: "최단 도보",
    description: "총 도보 5.4km",
    travelDate: "2026. 08. 15",
    startTime: "09:00",
    endTime: "20:30",
    summary: {
      totalMinutes: 480,
      walkingDistanceMeters: 5400,
      transferCount: 3,
      estimatedFare: 4100,
    },
    items: createItems("walk"),
    legs: createLegs("walk"),
  },
  {
    itineraryId: "mock-fastest-transit",
    courseKind: "FASTEST_TRANSIT",
    title: "최소 시간",
    description: "총 이동 7시간 40분",
    travelDate: "2026. 08. 15",
    startTime: "09:00",
    endTime: "20:10",
    summary: {
      totalMinutes: 460,
      walkingDistanceMeters: 6300,
      transferCount: 4,
      estimatedFare: 4550,
    },
    items: createItems("fast"),
    legs: createLegs("fast"),
  },
  {
    itineraryId: "mock-balanced",
    courseKind: "BALANCED",
    title: "추천 코스",
    description: "필수 방문지 모두 포함",
    travelDate: "2026. 08. 15",
    startTime: "09:00",
    endTime: "20:30",
    summary: {
      totalMinutes: 480,
      walkingDistanceMeters: 6800,
      transferCount: 3,
      estimatedFare: 4100,
    },
    items: createItems("balanced"),
    legs: createLegs("balanced"),
  },
];

/**
 * 장소 추가 Drawer에서만 사용하는 임시 검색 결과입니다.
 * 실제 연동 시 GET /api/places 검색 결과로 교체합니다.
 */
export const mockPlaceCandidates = [
  {
    placeId: "mock-ddp",
    name: "동대문디자인플라자",
    kind: "VISIT",
    defaultStayMinutes: 90,
    description: "전시, 야경, 디자인 산책을 즐길 수 있는 복합문화공간",
    latitude: 37.5672,
    longitude: 127.0094,
  },
  {
    placeId: "mock-seoul-forest",
    name: "서울숲",
    kind: "VISIT",
    // 변경: Mock 장소를 추가했을 때도 90분을 기본값으로 사용합니다.
    defaultStayMinutes: 90,
    description: "산책과 휴식을 즐길 수 있는 도심 공원",
    latitude: 37.5444,
    longitude: 127.0374,
  },
  {
    placeId: "mock-restaurant",
    name: "을지로 한식당",
    kind: "MEAL",
    defaultStayMinutes: 90,
    description: "점심 또는 저녁 식사로 추가할 수 있는 한식당",
    latitude: 37.5665,
    longitude: 126.991,
  },
];
