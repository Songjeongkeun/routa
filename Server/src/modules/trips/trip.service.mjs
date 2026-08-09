import * as tripRepository from "./trip.repository.mjs"
import { MEAL_TIME_WINDOWS, isMealTimeWithinWindow } from "../../utils/mealSchedule.mjs"

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

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

function normalizeText(value, fieldName) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw createHttpError(`${fieldName}을(를) 입력해 주세요.`)
  return text
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

  return [...uniquePlaces.values()]
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

  return {
    tripType,
    startTimestamp,
    endTimestamp,
    startLocation: normalizeText(payload.startLocation, "출발 위치"),
    startLatitude: normalizeCoordinate(payload.startLatitude, "출발지 위도"),
    startLongitude: normalizeCoordinate(payload.startLongitude, "출발지 경도"),
    endLocation: normalizeText(payload.endLocation, "종료 위치"),
    endLatitude: normalizeCoordinate(payload.endLatitude, "종료지 위도"),
    endLongitude: normalizeCoordinate(payload.endLongitude, "종료지 경도"),
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
