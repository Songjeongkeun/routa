import * as recommendationRepository from "./recommendation.repository.mjs"
import { calculateDistanceKm, sortByDistanceFrom } from "./recommendation.scorer.mjs"
import { createConstraintError } from "./recommendation.errors.mjs"
import { getMealLabel } from "./recommendation.schedule.mjs"
import { evaluatePlaceVisit } from "../../utils/placeSchedule.mjs"

const MAX_NEARBY_RESTAURANT_CANDIDATES = 20
const MAX_NEARBY_MEAL_BRANCHES = 3

/**
 * 현재·다음 방문 장소 반경에서 자동 식당 후보를 찾습니다.
 * 식사별 실제 도착 시각 검증은 B&B 분기에서 다시 수행하므로, 여기서는 후보 수만 제한합니다.
 */
export async function findNearbyMealCandidates({
  meal,
  currentPlace,
  currentTime,
  remainingVisits,
  plan,
  usedMealPlaceIds,
  nearbyRestaurantCandidatesByQuery,
}) {
  const nextPlace = currentPlace
    ? sortByDistanceFrom(currentPlace, remainingVisits)[0] ?? null
    : remainingVisits[0] ?? null
  const anchors = [currentPlace, nextPlace].filter(Boolean)

  if (anchors.length === 0) {
    throw createConstraintError([{
      code: "NEARBY_MEAL_ANCHOR_MISSING",
      message: "출발 위치와 방문 장소가 없어 주변 음식점을 추천할 기준이 없습니다. 지정 음식점을 선택하거나 방문 장소를 추가해 주세요.",
    }])
  }

  for (const radiusKm of [0.5, 1, 2]) {
    const candidatesById = new Map()
    for (const anchor of anchors) {
      const cacheKey = `${anchor.placeId}:${radiusKm}:${plan.withPet ? "PET" : "ALL"}`
      let candidates = nearbyRestaurantCandidatesByQuery.get(cacheKey)

      if (!candidates) {
        candidates = await recommendationRepository.findNearbyRestaurants({
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          radiusKm,
          withPet: plan.withPet,
          excludePlaceIds: [],
          limit: MAX_NEARBY_RESTAURANT_CANDIDATES,
        })
        nearbyRestaurantCandidatesByQuery.set(cacheKey, candidates)
      }

      candidates
        .filter((candidate) => !usedMealPlaceIds.has(Number(candidate.placeId)))
        .forEach((candidate) => candidatesById.set(Number(candidate.placeId), candidate))
    }

    const candidates = [...candidatesById.values()]
      .filter((candidate) => evaluatePlaceVisit({
        plan,
        place: candidate,
        travelArrivalTime: currentTime,
        stayMinutes: meal.stayMinutes,
        enforceLastOrder: true,
      }).isFeasible)
      .sort((first, second) => {
        const firstDistance = Math.min(...anchors.map((anchor) => calculateDistanceKm(anchor, first)))
        const secondDistance = Math.min(...anchors.map((anchor) => calculateDistanceKm(anchor, second)))
        return firstDistance - secondDistance || (second.averageRating ?? 0) - (first.averageRating ?? 0)
      })

    if (candidates.length > 0) {
      return candidates.slice(0, MAX_NEARBY_MEAL_BRANCHES).map((candidate) => ({
        ...candidate,
        ...meal,
        nodeType: "MEAL",
        mode: "NEARBY",
      }))
    }
  }

  throw createConstraintError([{
    code: "NEARBY_MEAL_NOT_FOUND",
    message: `${getMealLabel(meal.mealSlot)} 시간에 이용 가능한 주변 음식점을 2km 안에서 찾지 못했습니다. 지정 음식점을 선택하거나 식사를 제외해 주세요.`,
  }])
}
