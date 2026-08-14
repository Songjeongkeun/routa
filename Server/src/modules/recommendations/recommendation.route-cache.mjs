import * as recommendationRepository from "./recommendation.repository.mjs"
import { selectRouteAlternative } from "./recommendation.scorer.mjs"
import { createHttpError } from "./recommendation.errors.mjs"
import { parseStoredJson } from "./recommendation.schedule.mjs"
import {
  loadPublicTransitRouteGeometry,
  searchPublicTransitRoutes,
} from "../../providers/odsay.mjs"

/** 대중교통은 방향에 따라 달라질 수 있으므로 A→B와 B→A를 구분합니다. */
export function createRoutePairKey(from, to) {
  return `${from.placeId}:${to.placeId}`
}

/**
 * ROUTE_SECTION의 현재 JSON 형식과 예전 대표 수치 형식을 모두 탐색 후보 배열로 복원합니다.
 */
function getStoredRouteAlternatives(routeSection) {
  const storedPath = parseStoredJson(routeSection?.pathDetails, null)
  const alternatives = Array.isArray(storedPath?.alternatives)
    ? storedPath.alternatives
    : []

  if (alternatives.length > 0) return alternatives
  if (!routeSection) return []

  const source = routeSection.transportMode === "WALK_REAL"
    ? "KAKAO_WALK"
    : (routeSection.transportMode === "WALK_FALLBACK" ? "WALK_FALLBACK" : "ODSAY")

  return [{
    durationMinutes: Number(routeSection.durationMinutes) || 0,
    walkingDistanceMeters: Number(routeSection.walkingDistanceMeters) || 0,
    transferCount: Number(routeSection.transferCount) || 0,
    estimatedFare: Number(routeSection.estimatedFare) || 0,
    source,
    steps: [],
    geometrySegments: [],
    mapObject: null,
  }]
}

async function persistRouteAlternatives({ from, to, alternatives }) {
  const representativeRoute = selectRouteAlternative(alternatives, "BALANCED")
  if (!representativeRoute) return

  await recommendationRepository.upsertRouteSection({
    originPlaceId: from.placeId,
    destinationPlaceId: to.placeId,
    route: { ...representativeRoute, alternatives },
  })
}

/**
 * B&B 탐색이 끝난 뒤 선택된 ODsay 구간에만 지도용 좌표를 보강하고 DB 캐시를 갱신합니다.
 */
export async function enrichSelectedRouteGeometry({ routeLegs, routeAlternativesByPlacePair }) {
  const uniqueLegs = new Map()
  for (const routeLeg of routeLegs) {
    if (routeLeg.route.source !== "ODSAY" || !routeLeg.route.mapObject) continue
    uniqueLegs.set(routeLeg.pairKey, routeLeg)
  }

  const selectedLegs = [...uniqueLegs.values()]
  const workerCount = Math.min(3, selectedLegs.length)
  let nextIndex = 0

  async function enrichNextLeg() {
    while (nextIndex < selectedLegs.length) {
      const routeLeg = selectedLegs[nextIndex]
      nextIndex += 1

      if (!Object.hasOwn(routeLeg.route, "geometrySegments")) {
        routeLeg.route.geometrySegments = await loadPublicTransitRouteGeometry(routeLeg.route.mapObject)
      }

      const alternatives = routeAlternativesByPlacePair.get(routeLeg.pairKey)
      if (alternatives) {
        await persistRouteAlternatives({ from: routeLeg.from, to: routeLeg.to, alternatives })
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => enrichNextLeg()))
}

/**
 * 메모리 → DB ROUTE_SECTION → ODsay 순으로 이동 후보를 조회하고, 코스 기준별 최적 후보를 반환합니다.
 */
export async function getRouteLeg({
  from,
  to,
  courseType,
  routeAlternativesByPlacePair,
  selectedRouteByPair = null,
}) {
  const pairKey = createRoutePairKey(from, to)
  const selectedRouteKey = `${courseType}:${pairKey}`
  const selectedRoute = selectedRouteByPair?.get(selectedRouteKey)
  if (selectedRoute) return selectedRoute

  let alternatives = routeAlternativesByPlacePair.get(pairKey)
  if (!alternatives) {
    const storedRouteSection = await recommendationRepository.findRouteSection({
      originPlaceId: from.placeId,
      destinationPlaceId: to.placeId,
    })
    alternatives = getStoredRouteAlternatives(storedRouteSection)

    if (alternatives.length === 0) {
      alternatives = await searchPublicTransitRoutes({ from, to })
      await persistRouteAlternatives({ from, to, alternatives })
    }
    routeAlternativesByPlacePair.set(pairKey, alternatives)
  }

  const route = selectRouteAlternative(alternatives, courseType)
  if (!route) throw createHttpError("대중교통 경로 후보를 선택하지 못했습니다.", 422)

  selectedRouteByPair?.set(selectedRouteKey, route)
  return route
}
