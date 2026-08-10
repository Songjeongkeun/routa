import * as tripRepository from "./trip.repository.mjs"
import { MEAL_TIME_WINDOWS, isMealTimeWithinWindow } from "../../utils/mealSchedule.mjs"

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
// 변경: 관광지·카페 방문 장소는 음식점과 별도로 최대 5곳까지만 저장합니다.
const MAX_VISIT_STOPS = 5

function createHttpError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function normalizeId(value, fieldName) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createHttpError(`${fieldName} 값이 올바르지 않습니다.`)
  }
  return id
}

function normalizeCoordinate(value, fieldName) {
  const coordinate = Number(value)
  if (!Number.isFinite(coordinate)) {
    throw createHttpError(`${fieldName} 값이 올바르지 않습니다.`)
  }
  return coordinate
}

// 변경: 출발·종료 위치를 선택하지 않은 계획에는 null을 저장할 수 있도록 좌표의 빈 값을 허용합니다.
// 값이 입력된 경우에는 기존과 동일하게 숫자 좌표인지 엄격히 검증합니다.
function normalizeOptionalCoordinate(value, fieldName) {
  if (value == null || value === "") return null
  return normalizeCoordinate(value, fieldName)
}

function normalizeText(value, fieldName) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw createHttpError(`${fieldName}을(를) 입력해 주세요.`)
  return text
}

// 변경: 위치명은 선택 사항이므로 빈 문자열을 DB의 NULL로 통일합니다.
function normalizeOptionalText(value) {
  const text = typeof value === "string" ? value.trim() : ""
  return text || null
}

// 변경: 위치를 선택했다면 장소명·위도·경도를 한 세트로 저장합니다.
// 일부 값만 저장되면 이후 ODsay 경로 계산이나 지도 표시가 깨질 수 있으므로 API 단계에서 차단합니다.
function normalizeOptionalLocation({ location, latitude, longitude, label }) {
  const normalizedLocation = normalizeOptionalText(location)
  const normalizedLatitude = normalizeOptionalCoordinate(latitude, `${label} 위도`)
  const normalizedLongitude = normalizeOptionalCoordinate(longitude, `${label} 경도`)
  const isCompletelyEmpty = !normalizedLocation
    && normalizedLatitude == null
    && normalizedLongitude == null

  if (isCompletelyEmpty) {
    return { location: null, latitude: null, longitude: null }
  }

  if (!normalizedLocation || normalizedLatitude == null || normalizedLongitude == null) {
    throw createHttpError(`${label}는 장소 검색 결과를 선택하거나 비워 주세요.`)
  }

  return {
    location: normalizedLocation,
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
  }
}

function createTimestamp(date, time, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TIME_PATTERN.test(time)) {
    throw createHttpError(`${fieldName} 형식이 올바르지 않습니다.`)
  }

  // 변경: 사용자가 한국 시간으로 고른 날짜·시간을 명시적으로 +09:00으로 저장해 서버 시간대에 따라 달라지지 않게 합니다.
  const timestamp = new Date(`${date}T${time}:00+09:00`)
  if (Number.isNaN(timestamp.getTime())) throw createHttpError(`${fieldName} 형식이 올바르지 않습니다.`)
  return timestamp.toISOString()
}

function normalizePlaces(selectedPlaces) {
  if (!Array.isArray(selectedPlaces)) return []

  const uniquePlaces = new Map()
  selectedPlaces.forEach((place) => {
    const placeId = normalizeId(place?.placeId, "필수 방문 장소")
    // 변경: PLAN_MANDATORY_PLACE에는 체류 시간 컬럼이 없으므로 추천 생성에 필요한 값을 JSON 설정에도 보존합니다.
    const stayMinutes = Number.isFinite(Number(place?.stayMinutes))
      ? Math.max(30, Number(place.stayMinutes))
      : 90
    uniquePlaces.set(placeId, { placeId, stayMinutes })
  })

  const normalizedPlaces = [...uniquePlaces.values()]
  if (normalizedPlaces.length > MAX_VISIT_STOPS) {
    throw createHttpError(`필수 방문 장소는 최대 ${MAX_VISIT_STOPS}곳까지 선택할 수 있습니다.`)
  }

  return normalizedPlaces
}

function normalizeMeals(meals, mealTimes, mealModes) {
  const normalizedMeals = []
  const slotMap = { lunch: "LUNCH", dinner: "DINNER" }

  Object.entries(slotMap).forEach(([slot, mealSlot]) => {
    const meal = meals?.[slot]
    // 변경: 지정 식당·주변 음식점 추천·식사 제외를 하나의 저장 구조로 표현합니다.
    // 이전 sessionStorage 값에는 mealModes가 없을 수 있으므로 음식점이 있으면 지정, 없으면 제외로 호환합니다.
    const mode = mealModes?.[slot] ?? (meal ? "DESIGNATED" : "SKIP")
    if (!["DESIGNATED", "NEARBY", "SKIP"].includes(mode)) {
      throw createHttpError(`${mealSlot === "LUNCH" ? "점심" : "저녁"} 식사 방식을 확인해 주세요.`)
    }

    if (mode === "SKIP") {
      normalizedMeals.push({ mealSlot, mode: "SKIP" })
      return
    }

    const scheduledTime = mealTimes?.[slot]
    if (!TIME_PATTERN.test(scheduledTime ?? "")) {
      throw createHttpError(`${mealSlot === "LUNCH" ? "점심" : "저녁"} 시간을 확인해 주세요.`)
    }

    // 변경: 기획서의 점심 11:00~14:00, 저녁 17:00~20:00 시간 창을 벗어난
    // 지정 음식점은 실제 추천 단계에서 맞출 수 없으므로 여행 계획 저장 시 미리 막습니다.
    if (!isMealTimeWithinWindow(mealSlot, scheduledTime)) {
      const window = MEAL_TIME_WINDOWS[mealSlot]
      throw createHttpError(
        `${mealSlot === "LUNCH" ? "점심" : "저녁"} 시간은 ${window.start}~${window.end} 사이로 선택해 주세요.`,
      )
    }

    const normalizedMeal = {
      mealSlot,
      scheduledTime,
      mode,
      stayMinutes: 90,
    }

    if (mode === "DESIGNATED") {
      normalizedMeal.placeId = normalizeId(
        meal?.placeId,
        `${mealSlot === "LUNCH" ? "점심" : "저녁"} 음식점`,
      )
      normalizedMeal.isFixedReservation = meal?.isFixedReservation === true
    }

    // 변경: NEARBY는 아직 장소 ID를 정하지 않습니다. 추천 계산 시 이전·다음 장소 반경에서
    // 실제 영업·휴무·반려동물 조건을 통과한 음식점을 골라 COURSE_NODE에만 기록합니다.
    normalizedMeals.push(normalizedMeal)
  })

  // 변경: 화면에서는 같은 음식점을 두 슬롯에 넣지 않지만, API를 직접 호출한 경우까지 막기 위해
  // 서버에서도 점심·저녁 지정 음식점 중복을 저장 단계에서 차단합니다.
  const designatedPlaceIds = normalizedMeals
    .filter((meal) => meal.mode === "DESIGNATED")
    .map((meal) => Number(meal.placeId))
  if (new Set(designatedPlaceIds).size !== designatedPlaceIds.length) {
    throw createHttpError("점심과 저녁에는 서로 다른 지정 음식점을 선택해 주세요.")
  }

  return normalizedMeals
}

function normalizePlanPayload(payload) {
  const tripType = payload.tripType === "PET" ? "PET" : "GENERAL"
  const date = normalizeText(payload.date, "여행 날짜")
  const startTime = normalizeText(payload.startTime, "출발 시간")
  const endTime = normalizeText(payload.endTime, "종료 시간")
  const startTimestamp = createTimestamp(date, startTime, "출발 시간")
  const endTimestamp = createTimestamp(date, endTime, "종료 시간")

  if (new Date(startTimestamp) >= new Date(endTimestamp)) {
    throw createHttpError("종료 시간은 출발 시간보다 늦어야 합니다.")
  }

  // 변경: 출발·종료 위치를 비워도 여행 계획을 만들 수 있게 하고,
  // 입력한 경우에만 이름과 좌표를 함께 저장합니다.
  const start = normalizeOptionalLocation({
    location: payload.startLocation,
    latitude: payload.startLatitude,
    longitude: payload.startLongitude,
    label: "출발 위치",
  })
  const end = normalizeOptionalLocation({
    location: payload.endLocation,
    latitude: payload.endLatitude,
    longitude: payload.endLongitude,
    label: "종료 위치",
  })

  return {
    tripType,
    startTimestamp,
    endTimestamp,
    startLocation: start.location,
    startLatitude: start.latitude,
    startLongitude: start.longitude,
    endLocation: end.location,
    endLatitude: end.latitude,
    endLongitude: end.longitude,
    // 변경: 실제 스키마에 별도 식사 테이블이 없으므로 기존 meal_preference 컬럼에 JSON으로 식사 계획을 저장합니다.
    mealPreference: JSON.stringify({
      transport: typeof payload.transport === "string" ? payload.transport : "",
      meals: normalizeMeals(payload.meals, payload.mealTimes, payload.mealModes),
    }),
    // 변경: 테마와 장소별 체류 시간 역시 기존 preferred_themes 컬럼의 JSON에 함께 보존합니다.
    preferredThemes: JSON.stringify({
      themes: Array.isArray(payload.themes) ? payload.themes : [],
      selectedPlaces: normalizePlaces(payload.selectedPlaces),
    }),
    selectedPlaces: normalizePlaces(payload.selectedPlaces),
  }
}

async function saveTripPlan(userId, tripPlanId, payload) {
  const plan = normalizePlanPayload(payload)
  await tripRepository.assertPlacesExist([
    ...plan.selectedPlaces.map(({ placeId }) => placeId),
    // 변경: NEARBY·SKIP 식사에는 저장 시점에 placeId가 없으므로 실제 ID가 있는 지정 식당만 검증합니다.
    ...JSON.parse(plan.mealPreference).meals
      .map(({ placeId }) => placeId)
      .filter(Boolean),
  ])

  const savedPlan = tripPlanId
    ? await tripRepository.updateTripPlan({ userId, tripPlanId, plan })
    : await tripRepository.createTripPlan({ userId, plan })

  return savedPlan
}

export function createTripPlan(userId, payload) {
  return saveTripPlan(userId, null, payload)
}

export function updateTripPlan(userId, tripPlanId, payload) {
  return saveTripPlan(userId, normalizeId(tripPlanId, "여행 계획"), payload)
}

export async function getTripPlanById(userId, tripPlanId) {
  const plan = await tripRepository.findTripPlanById({
    userId,
    tripPlanId: normalizeId(tripPlanId, "여행 계획"),
  })
  if (!plan) throw createHttpError("여행 계획을 찾을 수 없거나 접근 권한이 없습니다.", 404)
  return plan
}
