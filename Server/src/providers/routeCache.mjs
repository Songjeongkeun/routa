/**
 * 서버 메모리에만 유지하는 이동 경로 캐시입니다.
 *
 * Branch-and-Bound는 같은 장소 쌍을 여러 탐색 가지에서 반복 비교합니다. 또한 여러 사용자가
 * 같은 구간을 조회할 수도 있으므로, 외부 길찾기 API를 다시 호출하지 않고 최근 결과를 재사용합니다.
 * 이 모듈은 DB를 변경하지 않습니다. 서버를 재시작하면 비워지는 임시 캐시이므로 오래된
 * 대중교통 정보나 경로 결과가 영구적으로 남지 않습니다.
 */

// 변경: 대중교통 경로는 실시간성이 완전히 고정된 정보가 아니므로 15분만 재사용합니다.
// 카카오 실제 도보 API를 추가할 때도 같은 캐시 함수를 호출하되, WALK 키와 적절한 TTL을 전달합니다.
export const TRANSIT_ROUTE_CACHE_TTL_MS = 15 * 60 * 1000
export const TRANSIT_GEOMETRY_CACHE_TTL_MS = 60 * 60 * 1000
// 변경: 도보 길은 대중교통 운행정보보다 변동 폭이 작지만, 지도 데이터 갱신을 반영할 수 있도록
// 실제 카카오 도보 경로는 6시간 후 다시 조회합니다.
export const WALK_ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000

// 변경: 개발 서버가 장시간 실행돼도 캐시가 끝없이 커지지 않도록 최대 항목 수를 제한합니다.
// 가장 오래 저장된 항목부터 제거하며, 제한에 걸려도 길찾기 기능 자체에는 영향이 없습니다.
const MAX_ROUTE_CACHE_ENTRIES = 500
const routeCache = new Map()
const pendingRouteRequests = new Map()

function clone(value) {
  // 변경: 캐시에 저장한 배열·객체가 추천 계산 중에 수정되면 다음 요청의 결과가 오염될 수 있습니다.
  // 따라서 읽을 때마다 복사본을 반환합니다. (예: ODsay 후보에 지도 그래픽을 덧붙이는 경우)
  return structuredClone(value)
}

function removeExpiredEntries(now) {
  for (const [key, entry] of routeCache) {
    if (entry.expiresAt <= now) routeCache.delete(key)
  }
}

function makeRoomForNewEntry() {
  while (routeCache.size >= MAX_ROUTE_CACHE_ENTRIES) {
    const oldestKey = routeCache.keys().next().value
    if (!oldestKey) return
    routeCache.delete(oldestKey)
  }
}

/**
 * 같은 장소라도 좌표가 수정될 수 있으므로 placeId가 아니라 좌표를 캐시 키에 사용합니다.
 * provider와 mode를 함께 넣어 ODsay 대중교통 결과와 향후 카카오 도보 결과가 섞이지 않게 합니다.
 */
export function createRouteCacheKey({ provider, mode, from, to, option = "DEFAULT" }) {
  const formatCoordinate = (value) => Number(value).toFixed(6)

  return [
    provider,
    mode,
    option,
    `${formatCoordinate(from.longitude)},${formatCoordinate(from.latitude)}`,
    `${formatCoordinate(to.longitude)},${formatCoordinate(to.latitude)}`,
  ].join(":")
}

/**
 * 캐시에 결과가 있으면 즉시 복사본을 반환하고, 없을 때만 load 함수를 실행합니다.
 * 동시에 같은 키의 요청이 들어오면 첫 번째 외부 API 호출 Promise를 함께 기다려 중복 호출을 막습니다.
 * 오류 응답은 저장하지 않으므로 일시적인 API 장애가 캐시에 남아 계속 실패하지 않습니다.
 */
export async function getOrCreateRouteCache({ key, ttlMilliseconds, load }) {
  const now = Date.now()
  const cached = routeCache.get(key)

  if (cached && cached.expiresAt > now) {
    return clone(cached.value)
  }

  if (cached) routeCache.delete(key)

  const pendingRequest = pendingRouteRequests.get(key)
  if (pendingRequest) {
    return clone(await pendingRequest)
  }

  // 변경: load는 실제 ODsay/카카오 호출 한 번만 수행합니다.
  // finally에서 진행 중 목록을 비워 다음 실패·만료 이후 요청은 정상적으로 재시도할 수 있습니다.
  const request = Promise.resolve().then(load)
  pendingRouteRequests.set(key, request)

  try {
    const value = await request

    removeExpiredEntries(now)
    makeRoomForNewEntry()
    routeCache.set(key, {
      value: clone(value),
      expiresAt: now + ttlMilliseconds,
    })

    return clone(value)
  } finally {
    pendingRouteRequests.delete(key)
  }
}
