import { config } from "../config.mjs"
import {
  createRouteCacheKey,
  getOrCreateRouteCache,
  TRANSIT_GEOMETRY_CACHE_TTL_MS,
  TRANSIT_ROUTE_CACHE_TTL_MS,
} from "./routeCache.mjs"
import { searchWalkingRoute } from "./kakaoWalk.mjs"

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

/**
 * 변경: ODsay가 근거리 또는 대중교통 불가 구간을 반환하면 먼저 카카오의 실제 보행 경로를 사용합니다.
 * 카카오 API 설정·쿼터·네트워크 문제가 있어도 추천 기능을 멈추지 않도록, 그때만 기존 직선거리 추정으로
 * 안전하게 되돌아갑니다. WALK_FALLBACK은 결과 경고와 지도 점선으로 사용자에게 구분됩니다.
 */
async function createWalkingRouteOrFallback(from, to) {
  try {
    return await searchWalkingRoute({ from, to })
  } catch {
    return createWalkingFallback(from, to)
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

function getRouteNames(subPath, transitType) {
  if (!Array.isArray(subPath?.lane)) return []

  // 변경: 버스 단계는 ODsay lane의 busNo를 우선 사용해 화면에 실제 버스 번호를 표시합니다.
  // 일부 응답에는 busNo가 없고 name만 있으므로 기존 노선명을 보조값으로 사용합니다.
  const routeNames = subPath.lane
    .map((lane) => transitType === "BUS" ? lane?.busNo || lane?.name : lane?.name)
    .map((name) => String(name ?? "").trim())
    .filter(Boolean)

  // 변경: 같은 버스 번호가 중복 제공되어도 화면에는 한 번만 나타나도록 순서를 유지하며 제거합니다.
  return [...new Set(routeNames)]
}

function createStep(subPath) {
  const type = getTransitType(subPath?.trafficType)
  const startName = subPath?.startName || "출발지"
  const endName = subPath?.endName || "도착지"
  const routeNames = getRouteNames(subPath, type)
  const transportName = type === "WALK"
    ? "도보"
    : routeNames.join(", ") || (type === "SUBWAY" ? "지하철" : "버스")

  return {
    type,
    // 변경: 설명 문구를 다시 파싱하지 않아도 버스 번호·지하철 노선명을 별도 배지로 그릴 수 있게 보존합니다.
    routeNames,
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

  try {
    // 변경: 노선 그래픽도 외부 ODsay 호출이므로, 같은 mapObject를 다시 그릴 때는
    // 1시간 동안 서버 메모리의 좌표 배열을 재사용합니다. mapObject 자체가 ODsay 경로의 식별자입니다.
    return await getOrCreateRouteCache({
      key: `ODSAY:TRANSIT_GEOMETRY:${mapObject}`,
      ttlMilliseconds: TRANSIT_GEOMETRY_CACHE_TTL_MS,
      load: async () => {
        const params = new URLSearchParams({
          // ODsay 공식 가이드의 loadLane 호출 형식입니다. mapObj 앞에 경로 선택 접두어를 붙입니다.
          mapObject: `0:0@${mapObject}`,
          apiKey: config.odsay.serverApiKey,
        })
        const response = await fetch(`${ODSAY_LOAD_LANE_URL}?${params.toString()}`, {
          signal: AbortSignal.timeout(10_000),
        })
        // 변경: HTTP 실패는 캐시에 저장하지 않습니다. 다음 추천 요청에서 다시 조회할 수 있습니다.
        if (!response.ok) throw new Error("ODsay 노선 그래픽 요청 실패")

        const payload = await response.json()
        if (payload?.error) return []
        return normalizeLaneGeometry(payload)
      },
    })
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

  // ODsay는 출발·도착지가 700m 이내이면 -98 오류를 반환합니다.
  // 가까운 장소는 대중교통보다 도보가 자연스러우므로, 카카오 실제 보행 경로를 먼저 조회합니다.
  // 카카오도 사용할 수 없는 상황에만 기존 직선거리 추정으로 안전하게 처리합니다.
  if (calculateDistanceMeters(from, to) < 700) {
    return [await createWalkingRouteOrFallback(from, to)]
  }

  const params = new URLSearchParams({
    SX: String(fromLongitude),
    SY: String(fromLatitude),
    EX: String(toLongitude),
    EY: String(toLatitude),
    OPT: "0",
    apiKey: config.odsay.serverApiKey,
  })

  // 출발·도착 좌표와 ODsay 탐색 옵션이 같은 요청은 15분 동안 재사용합니다.
  // 추천 계산이 여러 갈래를 비교하거나 여러 코스가 같은 구간을 사용해도 ODsay 호출은 한 번뿐입니다.
  return getOrCreateRouteCache({
    key: createRouteCacheKey({
      provider: "ODSAY",
      mode: "TRANSIT",
      from,
      to,
      option: "OPT_0",
    }),
    ttlMilliseconds: TRANSIT_ROUTE_CACHE_TTL_MS,
    load: async () => {
      let response
      try {
        // API 키가 URL에 포함되지만 URL 자체는 로그에 남기지 않아 키가 노출되지 않게 합니다.
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
        // API 요청 직전 거리 계산의 경계값 차이로 ODsay가 -98을 반환할 수도 있으므로,
        // 이 경우도 카카오 실제 도보 경로를 먼저 사용하고 추천 전체를 중단하지 않습니다.
        if (isNearbyPlaceError(payload.error)) {
          return [await createWalkingRouteOrFallback(from, to)]
        }

        // 인증·입력 오류를 '대중교통 경로 없음'으로 오인해 도보로 숨기지 않습니다.
        throw createProviderError("ODsay 길찾기 API가 오류를 반환했습니다. Server 키, 등록 IP, 좌표를 확인해 주세요.")
      }

      const alternatives = Array.isArray(payload?.result?.path)
        ? payload.result.path.map(normalizePath).filter((path) => path.durationMinutes > 0)
        : []

      if (alternatives.length === 0) {
        // 대중교통 후보가 없는 구간은 카카오 실제 도보 경로로 이어 붙입니다.
        return [await createWalkingRouteOrFallback(from, to)]
      }

      return alternatives
    },
  })
}
