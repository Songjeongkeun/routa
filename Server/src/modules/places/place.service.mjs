import * as placeRepository from "./place.repository.mjs"
import * as kakaoLocal from "../../providers/kakaoLocal.mjs"

const DEFAULT_PAGE_SIZE = 6
const MAX_PAGE_SIZE = 50
// 변경: 관광지(관광명소·문화시설)와 카페를 합쳐 사용자가 선택하거나 추천받을 수 있는 방문 장소는 최대 5곳입니다.
const MAX_VISIT_STOPS = 5
const KOREAN_WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]

function toPositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10)
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

function getKoreanWeekday(travelDate) {
  if (!travelDate) return null

  const date = new Date(`${travelDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== travelDate) {
    const error = new Error("여행 날짜 형식이 올바르지 않습니다.")
    error.status = 400
    throw error
  }

  return KOREAN_WEEKDAYS[date.getUTCDay()]
}

function normalizeTime(value, fieldName) {
  if (!value) return null
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    const error = new Error(`${fieldName} 형식이 올바르지 않습니다.`)
    error.status = 400
    throw error
  }
  return value
}

function normalizeOptionalCoordinate(value, fieldName) {
  if (value == null || value === "") return null
  const coordinate = Number(value)
  if (!Number.isFinite(coordinate)) {
    const error = new Error(`${fieldName} 형식이 올바르지 않습니다.`)
    error.status = 400
    throw error
  }
  return coordinate
}

function normalizePlaceIds(placeIds) {
  if (!Array.isArray(placeIds)) return []

  return [...new Set(placeIds.map(Number))]
    .filter((placeId) => Number.isSafeInteger(placeId) && placeId > 0)
}

function normalizeThemes(themes) {
  if (!Array.isArray(themes)) return []

  return [...new Set(themes
    .filter((theme) => typeof theme === "string")
    .map((theme) => theme.trim())
    .filter(Boolean))]
}

export async function searchLocation(keyword) {
  const normalizedKeyword = keyword?.trim()
  if (!normalizedKeyword) {
    const error = new Error("검색할 위치를 입력해 주세요.")
    error.status = 400
    throw error
  }

  const location = await kakaoLocal.searchKeyword(normalizedKeyword)
  if (!location) {
    const error = new Error("검색 결과가 없는 위치입니다.")
    error.status = 404
    throw error
  }

  return location
}

export async function searchPlaces({
  keyword,
  placeCategory,
  page,
  pageSize,
  tripType,
  travelDate,
  startTime,
  endTime,
  visitOnly,
}) {
  const normalizedKeyword = keyword?.trim() || null
  // 변경: 빈 문자열은 필터 없음으로 처리하고, 값이 있을 때만 PLACE.place_category와 정확히 비교합니다.
  // 음식점 화면은 이 값으로 "음식점"을 보내므로 카페·관광명소 등이 섞이지 않습니다.
  const normalizedPlaceCategory = placeCategory?.trim() || null
  const petOnly = tripType === "PET"
  const closedWeekday = getKoreanWeekday(travelDate)
  const normalizedStartTime = normalizeTime(startTime, "시작 시간")
  const normalizedEndTime = normalizeTime(endTime, "종료 시간")
  const normalizedPage = toPositiveInteger(page, 1)
  const normalizedPageSize = Math.min(
    toPositiveInteger(pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  )

  const { places, totalItems } = await placeRepository.findPlaces({
    keyword: normalizedKeyword,
    placeCategory: normalizedPlaceCategory,
    // 변경: 장소 선택 화면에서 음식점이 섞여 식사 선택과 중복되지 않도록 분류합니다.
    visitOnly: visitOnly === true || visitOnly === "true",
    petOnly,
    closedWeekday,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    limit: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  })

  return {
    places,
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / normalizedPageSize),
    },
  }
}

/**
 * 변경: 사용자가 직접 선택한 방문 장소를 보존하고, 최대 5곳이 되도록 부족한 수만 추천합니다.
 * 음식점·숙박·편의점 등은 SQL에서 제외하므로 점심·저녁 지정/주변 추천 로직은 이 API의 영향을 받지 않습니다.
 */
export async function recommendVisitPlaces({
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
}) {
  const normalizedSelectedPlaceIds = normalizePlaceIds(selectedPlaceIds)
  if (normalizedSelectedPlaceIds.length > MAX_VISIT_STOPS) {
    const error = new Error(`필수 방문 장소는 최대 ${MAX_VISIT_STOPS}곳까지 선택할 수 있습니다.`)
    error.status = 400
    throw error
  }

  // 변경: 프론트가 개수를 전달하지 않고, 서버가 직접 부족한 추천 수를 계산해 최대 5곳을 보장합니다.
  const requestedCount = MAX_VISIT_STOPS - normalizedSelectedPlaceIds.length
  if (requestedCount === 0) {
    return { places: [], requestedCount, recommendedCount: 0 }
  }

  const places = await placeRepository.findRecommendedVisitPlaces({
    excludePlaceIds: normalizedSelectedPlaceIds,
    petOnly: tripType === "PET",
    closedWeekday: getKoreanWeekday(travelDate),
    startTime: normalizeTime(startTime, "시작 시간"),
    endTime: normalizeTime(endTime, "종료 시간"),
    startLatitude: normalizeOptionalCoordinate(startLatitude, "출발지 위도"),
    startLongitude: normalizeOptionalCoordinate(startLongitude, "출발지 경도"),
    endLatitude: normalizeOptionalCoordinate(endLatitude, "종료지 위도"),
    endLongitude: normalizeOptionalCoordinate(endLongitude, "종료지 경도"),
    themes: normalizeThemes(themes),
    limit: requestedCount,
  })

  return {
    places,
    requestedCount,
    recommendedCount: places.length,
  }
}
