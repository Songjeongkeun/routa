/**
 * 기획서 9.2의 권장 식사 시작 시간과 기본 식사 시간을 한곳에서 관리합니다.
 * 시간은 모두 사용자가 여행 계획에서 입력하는 한국 시간(KST)을 기준으로 합니다.
 */
export const MEAL_TIME_WINDOWS = {
  // 변경: 점심·저녁의 신규 기본 체류 시간을 90분에서 60분으로 통일합니다.
  // 이 값은 여행 계획 저장 시 사용되며, 추천 단계의 누락된 과거 설정에도 기본값으로 쓰입니다.
  LUNCH: { start: "11:00", end: "14:00", defaultStayMinutes: 60 },
  DINNER: { start: "17:00", end: "20:00", defaultStayMinutes: 60 },
}

export function timeToMinutes(time) {
  const [hours, minutes] = String(time ?? "").slice(0, 5).split(":").map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  return hours * 60 + minutes
}

export function isMealTimeWithinWindow(mealSlot, time) {
  const window = MEAL_TIME_WINDOWS[mealSlot]
  const minutes = timeToMinutes(time)
  if (!window || minutes == null) return false

  return minutes >= timeToMinutes(window.start) && minutes <= timeToMinutes(window.end)
}

/**
 * 변경: Date 생성 시 서버가 어느 시간대에서 실행되더라도 여행 날짜가 흔들리지 않게
 * 기준 시각의 KST 날짜와 HH:mm을 명시적인 +09:00 ISO 시각으로 결합합니다.
 */
export function createKoreanDateTime(referenceTime, time) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(referenceTime))
  const getPart = (type) => parts.find((part) => part.type === type)?.value
  const year = getPart("year")
  const month = getPart("month")
  const day = getPart("day")

  return new Date(`${year}-${month}-${day}T${String(time).slice(0, 5)}:00+09:00`)
}

export function addMinutes(time, minutes) {
  return new Date(new Date(time).getTime() + minutes * 60_000)
}

export function maxDate(...values) {
  return new Date(Math.max(...values.filter(Boolean).map((value) => new Date(value).getTime())))
}
