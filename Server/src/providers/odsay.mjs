import { config } from "../config.mjs"

const ODSAY_PUBLIC_TRANSIT_URL = "https://api.odsay.com/v1/api/searchPubTransPathT"
const ODSAY_LOAD_LANE_URL = "https://api.odsay.com/v1/api/loadLane"

function createProviderError(message, status = 502) {
  const error = new Error(message)
  error.status = status
  return error
}

function toNonNegativeInteger(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180
}

function calculateDistanceMeters(from, to) {
  const latitudeDifference = degreesToRadians(Number(to.latitude) - Number(from.latitude))
  const longitudeDifference = degreesToRadians(Number(to.longitude) - Number(from.longitude))
  const latitudeFrom = degreesToRadians(Number(from.latitude))
  const latitudeTo = degreesToRadians(Number(to.latitude))
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(latitudeFrom) * Math.cos(latitudeTo) * Math.sin(longitudeDifference / 2) ** 2

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) * 1000
}

/**
 * 변경: 대중교통 API가 정상 응답했지만 해당 장소 쌍의 경로 후보가 없을 때만 사용합니다.
 * ODsay의 도로 보행 경로 좌표를 받는 기능은 아직 연결하지 않았으므로, 직선거리의 1.2배와
 * 분당 약 77m(시속 약 4.6km) 보행 속도로 도보 수치를 추정하고 source로 명확히 구분합니다.
 */
function createWalkingFallback(from, to) {
  const walkingDistanceMeters = Math.round(calculateDistanceMeters(from, to) * 1.2)
  const durationMinutes = walkingDistanceMeters === 0
    ? 0
    : Math.max(1, Math.ceil(walkingDistanceMeters / 77))

  return {
    durationMinutes,
    walkingDistanceMeters,
    transferCount: 0,
    estimatedFare: 0,
    source: "WALK_FALLBACK",
    // 변경: ODsay는 대중교통 노선의 그래픽 좌표만 제공하므로, 도보 대체 경로에는
    // 실제 도로선이 없습니다. 빈 배열을 명시해 프론트가 점선 추정선으로 구분하게 합니다.
    geometrySegments: [],
    steps: [{
      type: "WALK",
      description: `${from.placeName || "출발지"}에서 ${to.placeName || "도착지"}까지 도보 이동 (추정)`,
      durationMinutes,
      distanceMeters: walkingDistanceMeters,
    }],
  }
}

function isNearbyPlaceError(error) {
  const errors = Array.isArray(error) ? error : [error]
  return errors.some((item) => (
    String(item?.code) === "-98"
    || String(item?.msg ?? item?.message ?? "").includes("700m이내")
  ))
}

function getTransitType(trafficType) {
  if (Number(trafficType) === 1) return "SUBWAY"
  if (Number(trafficType) === 2) return "BUS"
  return "WALK"
}

function getLaneNames(subPath) {
  if (!Array.isArray(subPath?.lane)) return ""

  return subPath.lane
    .map((lane) => lane?.name)
    .filter(Boolean)
    .join(", ")
}

function createStep(subPath) {
  const type = getTransitType(subPath?.trafficType)
  const startName = subPath?.startName || "출발지"
  const endName = subPath?.endName || "도착지"
  const laneNames = getLaneNames(subPath)
  const transportName = type === "WALK" ? "도보" : laneNames || (type === "SUBWAY" ? "지하철" : "버스")

  return {
    type,
    // 변경: 화면은 ODsay 원본 응답에 의존하지 않고 이 공통 문구만 사용합니다.
    description: `${startName}에서 ${endName}까지 ${transportName} 이동`,
    durationMinutes: toNonNegativeInteger(subPath?.sectionTime),
    distanceMeters: toNonNegativeInteger(subPath?.distance),
  }
}

function getGeometryTransportType(laneType) {
  // ODsay loadLane의 lane.type은 1=지하철, 2=버스입니다.
  if (Number(laneType) === 1) return "SUBWAY"
  if (Number(laneType) === 2) return "BUS"
  return "TRANSIT"
}

/**
 * ODsay의 graphPos는 x=경도, y=위도입니다. Kakao Maps의 LatLng 생성에는
 * (위도, 경도) 순서가 필요하므로 서버에서 공통 좌표 객체로 변환합니다.
 */
function normalizeGeometryPoints(graphPositions) {
  if (!Array.isArray(graphPositions)) return []

  return graphPositions
    .map((position) => ({
      latitude: Number(position?.y),
      longitude: Number(position?.x),
    }))
    .filter((position) => Number.isFinite(position.latitude) && Number.isFinite(position.longitude))
}

/**
 * 변경: loadLane의 노선 그래픽 응답을 프론트엔드가 지도에 바로 그릴 수 있는 구간 배열로 정리합니다.
 * 한 경로 안에도 버스·지하철 구간이 섞일 수 있어 lane.section 단위로 분리해 보존합니다.
 */
function normalizeLaneGeometry(payload) {
  const lanes = Array.isArray(payload?.result?.lane) ? payload.result.lane : []

  return lanes.flatMap((lane) => {
    const sections = Array.isArray(lane?.section) ? lane.section : []

    return sections
      .map((section) => ({
        type: getGeometryTransportType(lane?.type),
        points: normalizeGeometryPoints(section?.graphPos),
      }))
      // Polyline은 최소 두 좌표가 있어야 하므로 불완전한 그래픽 데이터는 제외합니다.
      .filter((segment) => segment.points.length >= 2)
  })
}

function normalizePath(path) {
  const info = path?.info ?? {}
  const steps = Array.isArray(path?.subPath) ? path.subPath.map(createStep) : []

  return {
    durationMinutes: toNonNegativeInteger(info.totalTime),
    walkingDistanceMeters: toNonNegativeInteger(info.totalWalk),
    // 변경: ODsay가 제공하는 버스·지하철 환승 수를 합쳐 ROUTA의 단일 환승 수로 통일합니다.
    transferCount: toNonNegativeInteger(info.busTransitCount) + toNonNegativeInteger(info.subwayTransitCount),
    estimatedFare: toNonNegativeInteger(info.payment),
    source: "ODSAY",
    steps,
    // 변경: mapObj는 선택된 대중교통 경로의 실제 노선 그래픽(loadLane)을 조회할 때만 사용합니다.
    // API 키와 함께 서버에만 남기고, 프론트에는 변환된 geometrySegments만 전달합니다.
    mapObject: info.mapObj || null,
  }
}

/**
 * 변경: 대중교통 길찾기 결과의 mapObj로 실제 버스·지하철 노선 좌표를 가져옵니다.
 * 그래픽 조회 실패는 경로 계산 자체의 실패가 아니므로 빈 배열을 반환하고, 화면에서는 점선 추정선으로 보입니다.
 */
export async function loadPublicTransitRouteGeometry(mapObject) {
  if (!mapObject || !config.odsay.serverApiKey) return []

  const params = new URLSearchParams({
    // ODsay 공식 가이드의 loadLane 호출 형식입니다. mapObj 앞에 경로 선택 접두어를 붙입니다.
    mapObject: `0:0@${mapObject}`,
    apiKey: config.odsay.serverApiKey,
  })

  try {
    const response = await fetch(`${ODSAY_LOAD_LANE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return []

    const payload = await response.json()
    if (payload?.error) return []
    return normalizeLaneGeometry(payload)
  } catch {
    // 변경: 지도 그래픽은 부가 정보이므로 API 일시 오류가 추천 코스 생성 전체를 중단시키지 않게 합니다.
    return []
  }
}

/**
 * ODsay 대중교통 길찾기 결과를 ROUTA가 사용하는 공통 구간 형식으로 변환합니다.
 *
 * 좌표의 X는 경도(longitude), Y는 위도(latitude)입니다. PLACE 테이블도 같은 WGS84
 * 좌표를 저장하므로 별도 좌표계 변환 없이 전달할 수 있습니다.
 */
export async function searchPublicTransitRoutes({ from, to }) {
  if (!config.odsay.serverApiKey) {
    throw createProviderError(
      "ODsay Server API 키가 없습니다. routa/.env에 ODSAY_SERVER_API_KEY를 설정하고 서버를 다시 시작해 주세요.",
      503,
    )
  }

  const fromLongitude = Number(from?.longitude)
  const fromLatitude = Number(from?.latitude)
  const toLongitude = Number(to?.longitude)
  const toLatitude = Number(to?.latitude)

  if (![fromLongitude, fromLatitude, toLongitude, toLatitude].every(Number.isFinite)) {
    throw createProviderError("실제 길찾기에 필요한 장소 좌표가 없습니다.", 422)
  }

  // 변경: ODsay는 출발·도착지가 700m 이내이면 -98 오류를 반환합니다.
  // 가까운 장소는 대중교통보다 도보가 자연스럽고, 동일 장소는 이동 자체가 없으므로
  // 외부 API를 호출하지 않고 바로 도보 대체 경로(동일 장소는 0분·0m)를 반환합니다.
  if (calculateDistanceMeters(from, to) < 700) {
    return [createWalkingFallback(from, to)]
  }

  const params = new URLSearchParams({
    SX: String(fromLongitude),
    SY: String(fromLatitude),
    EX: String(toLongitude),
    EY: String(toLatitude),
    OPT: "0",
    apiKey: config.odsay.serverApiKey,
  })

  let response
  try {
    // 변경: API 키가 URL에 포함되지만 URL 자체는 로그에 남기지 않아 키가 노출되지 않게 합니다.
    response = await fetch(`${ODSAY_PUBLIC_TRANSIT_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    if (error?.name === "TimeoutError") {
      throw createProviderError("ODsay 길찾기 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", 504)
    }
    throw createProviderError("ODsay 길찾기 API에 연결하지 못했습니다. Server 키와 등록 IP를 확인해 주세요.")
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw createProviderError("ODsay 길찾기 API가 읽을 수 없는 응답을 반환했습니다.")
  }

  if (!response.ok) {
    throw createProviderError("ODsay 길찾기 요청이 거절되었습니다. Server 키와 등록 IP를 확인해 주세요.")
  }

  if (payload?.error) {
    // 변경: API 요청 직전 거리 계산의 경계값 차이로 ODsay가 -98을 반환할 수도 있으므로,
    // 이 경우도 추천 전체를 실패시키지 않고 같은 도보 대체 경로로 처리합니다.
    if (isNearbyPlaceError(payload.error)) {
      return [createWalkingFallback(from, to)]
    }

    // 변경: 인증·입력 오류를 '대중교통 경로 없음'으로 오인해 도보로 숨기지 않습니다.
    throw createProviderError("ODsay 길찾기 API가 오류를 반환했습니다. Server 키, 등록 IP, 좌표를 확인해 주세요.")
  }

  const alternatives = Array.isArray(payload?.result?.path)
    ? payload.result.path.map(normalizePath).filter((path) => path.durationMinutes > 0)
    : []

  if (alternatives.length === 0) {
    // 변경: 근거리 장소처럼 대중교통 후보가 없는 경우에도 추천 전체가 실패하지 않게 도보 구간을 만듭니다.
    return [createWalkingFallback(from, to)]
  }

  return alternatives
}
