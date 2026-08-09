import * as placeRepository from "./place.repository.mjs"
import * as kakaoLocal from "../../providers/kakaoLocal.mjs"

const DEFAULT_PAGE_SIZE = 6
const MAX_PAGE_SIZE = 50
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

function normalizeCoordinate(value, fieldName) {
  if (value == null || value === "") return null
  const coordinate = Number(value)
  if (!Number.isFinite(coordinate)) {
    const error = new Error(`${fieldName} 형식이 올바르지 않습니다.`)
    error.status = 400
    throw error
  }
  return coordinate
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
  startLocation,
  startLatitude,
  startLongitude,
  startTime,
  endTime,
}) {
  const normalizedKeyword = keyword?.trim() || null
  // 변경: 빈 문자열은 필터 없음으로 처리하고, 값이 있을 때만 PLACE.place_category와 정확히 비교합니다.
  // 음식점 화면은 이 값으로 "음식점"을 보내므로 카페·관광명소 등이 섞이지 않습니다.
  const normalizedPlaceCategory = placeCategory?.trim() || null
  const petOnly = tripType === "PET"
  const closedWeekday = getKoreanWeekday(travelDate)
  const normalizedStartTime = normalizeTime(startTime, "시작 시간")
  const normalizedEndTime = normalizeTime(endTime, "종료 시간")
  const normalizedStartLocation = startLocation?.trim() || null
  const normalizedStartLatitude = normalizeCoordinate(startLatitude, "출발지 위도")
  const normalizedStartLongitude = normalizeCoordinate(startLongitude, "출발지 경도")
  const normalizedPage = toPositiveInteger(page, 1)
  const normalizedPageSize = Math.min(
    toPositiveInteger(pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  )

  const hasResolvedCoordinates = normalizedStartLatitude != null && normalizedStartLongitude != null
  const origin = normalizedStartLocation && !hasResolvedCoordinates
    ? await placeRepository.findCoordinatesByLocation(normalizedStartLocation)
    : null

  if (normalizedStartLocation && !hasResolvedCoordinates && !origin) {
    const error = new Error("출발 위치의 좌표를 찾을 수 없습니다.")
    error.status = 400
    throw error
  }

  const { places, totalItems } = await placeRepository.findPlaces({
    keyword: normalizedKeyword,
    placeCategory: normalizedPlaceCategory,
    petOnly,
    closedWeekday,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    originLatitude: normalizedStartLatitude ?? origin?.latitude ?? null,
    originLongitude: normalizedStartLongitude ?? origin?.longitude ?? null,
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
