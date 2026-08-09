import * as itineraryService from "./itinerary.service.mjs"

/** 변경: 추천이 끝난 여행 계획의 코스 카드 목록을 소유자에게만 반환합니다. */
export async function getItineraries(req, res) {
  const itineraries = await itineraryService.getItineraries({
    userId: req.userId,
    tripPlanId: req.query.tripPlanId,
  })
  return res.status(200).json({ itineraries })
}

/** 변경: 지도·타임라인에 필요한 장소 노드와 이동 구간을 포함한 실제 코스 상세입니다. */
export async function getItineraryById(req, res) {
  const itinerary = await itineraryService.getItineraryById({
    userId: req.userId,
    itineraryId: req.params.itineraryId,
  })
  return res.status(200).json({ itinerary })
}

/** 변경: 수정 가능한 전체 노드 순서를 받아 서버가 이동 시간과 운영 조건을 다시 계산합니다. */
export async function updateItineraryNodes(req, res) {
  const itinerary = await itineraryService.updateItineraryNodes({
    userId: req.userId,
    itineraryId: req.params.itineraryId,
    nodes: req.body?.nodes,
  })
  return res.status(200).json({ itinerary })
}
