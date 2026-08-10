import { apiRequest } from "../../shared/api/httpClient.js"

const pendingLocationSearches = new Map()

export async function searchPlaces({
  keyword = "",
  placeCategory = "",
  page = 1,
  pageSize = 6,
  tripType = "",
  travelDate = "",
  startLocation = "",
  startLatitude = null,
  startLongitude = null,
  startTime = "",
  endTime = "",
  visitOnly = false,
} = {}) {
  const params = new URLSearchParams()
  const normalizedKeyword = keyword.trim()

  if (normalizedKeyword) params.set("keyword", normalizedKeyword)
  // 변경: 장소명 검색과 대분류 필터를 분리해 음식점 목록을 정확하게 요청합니다.
  if (placeCategory) params.set("placeCategory", placeCategory)
  if (tripType) params.set("tripType", tripType)
  if (travelDate) params.set("travelDate", travelDate)
  if (startLocation.trim()) params.set("startLocation", startLocation.trim())
  if (startLatitude != null) params.set("startLatitude", String(startLatitude))
  if (startLongitude != null) params.set("startLongitude", String(startLongitude))
  if (startTime) params.set("startTime", startTime)
  if (endTime) params.set("endTime", endTime)
  // 변경: 장소 선택 단계에서는 관광지(관광명소·문화시설)와 카페만 조회해 식당·편의점 등이 섞이지 않게 합니다.
  if (visitOnly) params.set("visitOnly", "true")
  params.set("page", String(page))
  params.set("pageSize", String(pageSize))

  return apiRequest(`/places?${params.toString()}`)
}

// 변경: 사용자가 선택하지 않은 필수 방문 장소 수만큼 추천받는 API입니다.
// 음식점은 별도 식사 선택 상태에서 관리하므로 이 요청에는 포함하지 않습니다.
export function recommendVisitPlaces({
  selectedPlaceIds = [],
  tripType = "",
  travelDate = "",
  startLatitude = null,
  startLongitude = null,
  endLatitude = null,
  endLongitude = null,
  startTime = "",
  endTime = "",
  themes = [],
} = {}) {
  return apiRequest("/places/recommendations", {
    method: "POST",
    body: JSON.stringify({
      selectedPlaceIds,
      tripType,
      travelDate,
      startLatitude,
      startLongitude,
      endLatitude,
      endLongitude,
      startTime,
      endTime,
      themes,
    }),
  })
}

export function searchLocation(keyword) {
  const normalizedKeyword = keyword.trim()
  const pendingSearch = pendingLocationSearches.get(normalizedKeyword)
  if (pendingSearch) return pendingSearch

  const params = new URLSearchParams({ keyword: normalizedKeyword })
  const request = apiRequest(`/places/location-search?${params.toString()}`)
    .then((data) => data.location)
    .finally(() => pendingLocationSearches.delete(normalizedKeyword))

  pendingLocationSearches.set(normalizedKeyword, request)
  return request
}
