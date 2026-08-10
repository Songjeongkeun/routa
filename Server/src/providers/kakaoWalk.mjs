import { config } from "../config.mjs"
import {
  createRouteCacheKey,
  getOrCreateRouteCache,
  WALK_ROUTE_CACHE_TTL_MS,
} from "./routeCache.mjs"

const KAKAO_WALK_ROUTE_URL = "https://dapi.kakao.com/v2/routing/walk"

function createProviderError(message, status = 502) {
  const error = new Error(message)
  error.status = status
  return error
}

function normalizeRoutePoints(route) {
  const points = []

  // 변경: 카카오 응답의 좌표는 [경도(x), 위도(y)] 배열입니다.
  // ROUTA 지도 컴포넌트가 사용하는 { latitude, longitude } 객체로 통일합니다.
  for (const leg of route?.legs ?? []) {
    for (const step of leg?.steps ?? []) {
      for (const point of step?.path?.points ?? []) {
        const longitude = Number(point?.[0])
        const latitude = Number(point?.[1])
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue

        const previousPoint = points.at(-1)
        // 각 안내 단계의 끝 좌표와 다음 단계의 시작 좌표가 중복될 수 있어,
        // 지도 Polyline에 같은 좌표를 연속해서 넣지 않도록 한 번만 남깁니다.
        if (previousPoint?.latitude === latitude && previousPoint?.longitude === longitude) continue
        points.push({ latitude, longitude })
      }
    }
  }

  return points
}

function normalizeWalkingRoute({ payload, from, to }) {
  const properties = payload?.route?.properties ?? {}
  const walkingDistanceMeters = Number(properties.totalDistance)
  const totalTimeSeconds = Number(properties.totalTime)

  if (!Number.isFinite(walkingDistanceMeters) || !Number.isFinite(totalTimeSeconds)) {
    throw createProviderError("카카오 도보 길찾기 결과에 거리 또는 시간이 없습니다.")
  }

  const durationMinutes = totalTimeSeconds === 0
    ? 0
    : Math.max(1, Math.ceil(totalTimeSeconds / 60))
  const points = normalizeRoutePoints(payload.route)

  return {
    durationMinutes,
    walkingDistanceMeters: Math.max(0, Math.round(walkingDistanceMeters)),
    transferCount: 0,
    estimatedFare: 0,
    // 변경: 직선거리로 계산한 WALK_FALLBACK과 실제 보행 네트워크를 조회한 결과를 구분합니다.
    source: "KAKAO_WALK",
    steps: [{
      type: "WALK",
      description: `${from.placeName || "출발지"}에서 ${to.placeName || "도착지"}까지 실제 도보 경로 이동`,
      durationMinutes,
      distanceMeters: Math.max(0, Math.round(walkingDistanceMeters)),
    }],
    // 변경: 실제 보행로 좌표가 두 개 이상일 때만 지도 선으로 전달합니다.
    // 좌표가 없거나 불완전한 API 응답이어도 거리·시간 정보는 사용할 수 있습니다.
    geometrySegments: points.length >= 2 ? [{ type: "WALK", points }] : [],
    landingUrl: properties.landingUrl || null,
  }
}

/**
 * 카카오맵 REST 도보 경로 API로 실제 보행 네트워크 기준 거리·시간·좌표를 조회합니다.
 * REST API 키는 브라우저에 노출하지 않고 Server 환경 변수에서만 읽습니다.
 */
export async function searchWalkingRoute({ from, to }) {
  const fromLongitude = Number(from?.longitude)
  const fromLatitude = Number(from?.latitude)
  const toLongitude = Number(to?.longitude)
  const toLatitude = Number(to?.latitude)

  if (![fromLongitude, fromLatitude, toLongitude, toLatitude].every(Number.isFinite)) {
    throw createProviderError("실제 도보 길찾기에 필요한 장소 좌표가 없습니다.", 422)
  }

  const url = new URL(KAKAO_WALK_ROUTE_URL)
  url.searchParams.set("start_x", String(fromLongitude))
  url.searchParams.set("start_y", String(fromLatitude))
  url.searchParams.set("end_x", String(toLongitude))
  url.searchParams.set("end_y", String(toLatitude))

  // 변경: 같은 출발·도착 좌표의 실제 도보 경로는 6시간 동안 Server 메모리에서 재사용합니다.
  // Branch-and-Bound의 반복 비교가 카카오 일일 무료 쿼터를 소진하지 않도록 합니다.
  return getOrCreateRouteCache({
    key: createRouteCacheKey({
      provider: "KAKAO",
      mode: "WALK",
      from,
      to,
    }),
    ttlMilliseconds: WALK_ROUTE_CACHE_TTL_MS,
    load: async () => {
      let response
      try {
        response = await fetch(url, {
          headers: {
            Authorization: `KakaoAK ${config.oauth.kakao.restApiKey}`,
          },
          signal: AbortSignal.timeout(10_000),
        })
      } catch (error) {
        if (error?.name === "TimeoutError") {
          throw createProviderError("카카오 도보 길찾기 요청 시간이 초과되었습니다.", 504)
        }
        throw createProviderError("카카오 도보 길찾기 API에 연결하지 못했습니다.")
      }

      let payload
      try {
        payload = await response.json()
      } catch {
        throw createProviderError("카카오 도보 길찾기 API가 읽을 수 없는 응답을 반환했습니다.")
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw createProviderError("카카오 REST API 키와 카카오맵 API 사용 설정을 확인해 주세요.", 503)
        }
        if (response.status === 429) {
          throw createProviderError("카카오 도보 길찾기 무료 쿼터를 초과했습니다.", 429)
        }
        throw createProviderError("카카오 도보 길찾기 요청이 거절되었습니다.")
      }

      // 변경: TOO_FAR_AWAY·ROUTE_RESULT_NOT_FOUND처럼 실제 보행 경로가 없는 상태는
      // 호출 오류와 구분합니다. 호출한 쪽은 이 오류를 받아 최후의 직선거리 fallback을 사용합니다.
      if (payload?.status !== "OK" || !payload?.route) {
        throw createProviderError("카카오에서 실제 도보 경로를 찾지 못했습니다.", 422)
      }

      return normalizeWalkingRoute({ payload, from, to })
    },
  })
}
