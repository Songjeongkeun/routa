import { apiRequest } from "../../shared/api/httpClient.js"

const pendingLocationSearches = new Map()

export async function searchPlaces({
  keyword = "",
  page = 1,
  pageSize = 6,
  tripType = "",
  travelDate = "",
  startLocation = "",
  startLatitude = null,
  startLongitude = null,
  startTime = "",
  endTime = "",
} = {}) {
  const params = new URLSearchParams()
  const normalizedKeyword = keyword.trim()

  if (normalizedKeyword) params.set("keyword", normalizedKeyword)
  if (tripType) params.set("tripType", tripType)
  if (travelDate) params.set("travelDate", travelDate)
  if (startLocation.trim()) params.set("startLocation", startLocation.trim())
  if (startLatitude != null) params.set("startLatitude", String(startLatitude))
  if (startLongitude != null) params.set("startLongitude", String(startLongitude))
  if (startTime) params.set("startTime", startTime)
  if (endTime) params.set("endTime", endTime)
  params.set("page", String(page))
  params.set("pageSize", String(pageSize))

  return apiRequest(`/places?${params.toString()}`)
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
