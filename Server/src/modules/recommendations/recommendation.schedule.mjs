import {
  MEAL_TIME_WINDOWS,
  addMinutes,
  createKoreanDateTime,
  maxDate,
} from "../../utils/mealSchedule.mjs"
import { createHttpError } from "./recommendation.errors.mjs"

/** 과거 문자열 데이터와 현재 JSON 데이터를 모두 안전하게 읽습니다. */
export function parseStoredJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function minDate(...values) {
  const dates = values.filter(Boolean).map((value) => new Date(value))
  return dates.length > 0 ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null
}

export function hasCoordinates(place) {
  if (place?.latitude == null || place?.longitude == null) return false
  return Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude))
}

export function createInitialLeg() {
  return {
    durationMinutes: 0,
    walkingDistanceMeters: 0,
    transferCount: 0,
    estimatedFare: 0,
    source: "NO_START_LOCATION",
  }
}

export function formatTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

export function getMealLabel(mealSlot) {
  return mealSlot === "DINNER" ? "저녁" : "점심"
}

export function getMealStayMinutes(meal) {
  const storedStayMinutes = Number(meal?.stayMinutes)
  if (Number.isFinite(storedStayMinutes) && storedStayMinutes > 0) return storedStayMinutes
  return MEAL_TIME_WINDOWS[meal?.mealSlot]?.defaultStayMinutes ?? 60
}

export function getTravelBufferMinutes({ route, withPet }) {
  if (route.source !== "ODSAY") return 0
  return withPet ? 15 : 10
}

function getPlaceBusinessTime(planStartTime, time, openingTime = null) {
  if (!time) return null
  const businessTime = createKoreanDateTime(planStartTime, time)
  return openingTime && businessTime <= openingTime
    ? addMinutes(businessTime, 24 * 60)
    : businessTime
}

export function createMealConstraint({ plan, meal }) {
  const mealWindow = MEAL_TIME_WINDOWS[meal.mealSlot]
  if (!mealWindow) throw createHttpError("식사 구분 정보가 올바르지 않습니다.")

  const windowStart = createKoreanDateTime(plan.startTime, mealWindow.start)
  const windowEnd = createKoreanDateTime(plan.startTime, mealWindow.end)
  const preferredStart = createKoreanDateTime(plan.startTime, meal.scheduledTime)
  const openingTime = getPlaceBusinessTime(plan.startTime, meal.startTime)
  const closingTime = getPlaceBusinessTime(plan.startTime, meal.endTime, openingTime)
  const lastOrderTime = getPlaceBusinessTime(plan.startTime, meal.lastOrder, openingTime)
  const latestByClosing = closingTime ? addMinutes(closingTime, -meal.stayMinutes) : null

  return {
    mealWindow,
    preferredStart,
    earliestStart: maxDate(windowStart, openingTime),
    latestStart: minDate(windowEnd, lastOrderTime, latestByClosing),
    reservationArrivalDeadline: meal.isFixedReservation
      ? addMinutes(preferredStart, -20)
      : null,
  }
}

export function evaluateMealArrival({ travelArrivalTime, constraint, meal }) {
  const visitStart = meal.isFixedReservation
    ? maxDate(travelArrivalTime, constraint.preferredStart, constraint.earliestStart)
    : maxDate(travelArrivalTime, constraint.earliestStart)
  const reservationOnTime = !constraint.reservationArrivalDeadline
    || travelArrivalTime <= constraint.reservationArrivalDeadline
  const reservationStartsOnTime = !meal.isFixedReservation
    || visitStart.getTime() === constraint.preferredStart.getTime()
  const withinLatestStart = !constraint.latestStart || visitStart <= constraint.latestStart

  return {
    visitStart,
    isFeasible: reservationOnTime && reservationStartsOnTime && withinLatestStart,
    waitMinutes: Math.max(0, Math.round((visitStart.getTime() - travelArrivalTime.getTime()) / 60_000)),
  }
}
