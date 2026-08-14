import * as itineraryService from "./itinerary.service.mjs"

/** 변경: 추천이 끝난 여행 계획의 코스 카드 목록을 소유자에게만 반환합니다. */
export async function getItineraries(req, res) {
  // 변경: 같은 목록 URL에서 status=SAVED를 받으면 저장 일정 관리 화면용 목록·검색·페이지 정보를 반환합니다.
  if (req.query.status === "SAVED") {
    const savedSchedules = await itineraryService.getSavedItineraries({
      userId: req.userId,
      keyword: req.query.keyword,
      courseType: req.query.courseType,
      travelDate: req.query.travelDate,
      // 변경: 저장 일정 화면의 다가오는·지난 여행 탭을 서버 필터로 처리해 페이지 수와 총 건수를 정확히 맞춥니다.
      schedulePeriod: req.query.period,
      page: req.query.page,
      pageSize: req.query.pageSize,
    })
    return res.status(200).json(savedSchedules)
  }

  const itineraries = await itineraryService.getItineraries({
    userId: req.userId,
    tripPlanId: req.query.tripPlanId,
  })
  return res.status(200).json({ itineraries })
}

/** 변경: 지도·타임라인에 필요한 장소 노드와 이동 구간을 포함한 실제 코스 상세입니다. */
export async function getItineraryById(req, res) {
  // 변경: 재계산 직후에는 같은 URL의 이전 시간표가 브라우저 캐시에 남지 않도록 상세 응답을 저장하지 않습니다.
  // 장소 추가 후 새 항목의 도착 시각을 즉시 화면에 반영하기 위한 응답 정책입니다.
  res.set("Cache-Control", "no-store")
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

/** 변경: 결과 화면에서 선택한 DRAFT 추천 코스를 현재 사용자 소유의 SAVED 일정으로 확정합니다. */
export async function saveItinerary(req, res) {
  const itinerary = await itineraryService.saveItinerary({
    userId: req.userId,
    itineraryId: req.params.itineraryId,
    title: req.body?.title,
    saveRequestId: req.body?.saveRequestId,
  })
  return res.status(201).json({ itinerary })
}

/** 변경: 저장 일정 카드 제목을 변경해 목록과 상세 화면이 같은 제목을 표시하게 합니다. */
export async function updateSavedItineraryTitle(req, res) {
  const itinerary = await itineraryService.updateSavedItineraryTitle({
    userId: req.userId,
    itineraryId: req.params.itineraryId,
    title: req.body?.title,
  })
  return res.status(200).json({ itinerary })
}

/** 변경: 삭제 확인을 통과한 SAVED 일정만 삭제하고, 성공 시 본문 없이 204를 반환합니다. */
export async function deleteSavedItinerary(req, res) {
  await itineraryService.deleteSavedItinerary({
    userId: req.userId,
    itineraryId: req.params.itineraryId,
  })
  return res.status(204).end()
}
