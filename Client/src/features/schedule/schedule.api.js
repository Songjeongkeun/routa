import { apiRequest } from "../../shared/api/httpClient.js"

/** 변경: 저장 일정 목록·홈 최근 일정은 같은 SAVED 목록 API를 페이지 크기만 달리해 사용합니다. */
export function getSavedItineraries({
  keyword = "",
  courseType = "",
  travelDate = "",
  page = 1,
  pageSize = 12,
} = {}) {
  const params = new URLSearchParams({
    status: "SAVED",
    page: String(page),
    pageSize: String(pageSize),
  })
  if (keyword.trim()) params.set("keyword", keyword.trim())
  if (courseType) params.set("courseType", courseType)
  if (travelDate) params.set("travelDate", travelDate)

  return apiRequest(`/itineraries?${params.toString()}`)
}

/** 변경: 제목 수정은 저장된 일정에만 허용됩니다. */
export function updateSavedItineraryTitle(itineraryId, title) {
  return apiRequest(`/itineraries/${itineraryId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  })
}

/** 변경: 삭제 확인 이후 호출하며, 204 성공 응답에는 본문이 없습니다. */
export function deleteSavedItinerary(itineraryId) {
  return apiRequest(`/itineraries/${itineraryId}`, {
    method: "DELETE",
  })
}
