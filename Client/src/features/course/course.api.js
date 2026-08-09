import { apiRequest } from "../../shared/api/httpClient.js"

/** 변경: 로딩 화면에서 저장된 여행 계획을 기준으로 실제 추천 코스 생성을 요청합니다. */
export function createRecommendation(tripPlanId) {
  return apiRequest("/recommendations", {
    method: "POST",
    body: JSON.stringify({ tripPlanId }),
  })
}

/** 변경: 추천 완료된 계획의 코스 카드 목록을 가져옵니다. */
export function getItineraries(tripPlanId) {
  const params = new URLSearchParams({ tripPlanId: String(tripPlanId) })
  return apiRequest(`/itineraries?${params.toString()}`)
}

/** 변경: 지도·타임라인에 필요한 선택 코스의 실제 장소 노드를 가져옵니다. */
export function getItinerary(itineraryId) {
  return apiRequest(`/itineraries/${itineraryId}`)
}

/**
 * 변경: 결과 화면의 편집 목록을 서버로 보내 실제 ODsay 이동시간과 운영 조건으로 재계산합니다.
 * 서버가 422를 반환하면 기존 DB 일정은 유지되고, 호출 화면은 conflicts를 안내할 수 있습니다.
 */
export function updateItineraryNodes(itineraryId, nodes) {
  return apiRequest(`/itineraries/${itineraryId}/nodes`, {
    method: "PUT",
    body: JSON.stringify({ nodes }),
  })
}
