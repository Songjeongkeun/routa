import { apiRequest } from "../../../shared/api/httpClient.js"

/**
 * 변경: PlanProvider의 임시 상태를 추천 전에 실제 TRIP_PLAN으로 저장합니다.
 * tripPlanId가 있으면 같은 초안을 갱신하고, 없으면 새 초안을 생성합니다.
 */
export function saveTripPlan(plan) {
  const path = plan.tripPlanId
    ? `/trip-plans/${plan.tripPlanId}`
    : "/trip-plans"

  return apiRequest(path, {
    method: plan.tripPlanId ? "PUT" : "POST",
    body: JSON.stringify(plan),
  })
}
