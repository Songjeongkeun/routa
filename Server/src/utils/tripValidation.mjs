const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Date 객체가 2월 30일을 3월 2일로 자동 보정하는 문제를 막기 위한 달력 날짜 검증입니다.
 * 문자열을 UTC 기준으로 비교하므로 서버가 어느 시간대에서 실행돼도 선택한 날짜 자체는 바뀌지 않습니다.
 */
export function isValidCalendarDate(value) {
  if (!DATE_PATTERN.test(String(value ?? ""))) return false

  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

/**
 * 교통 기준은 화면에서 사용자가 임의로 고르는 값이 아니라 여행 날짜로부터 같은 규칙으로 계산합니다.
 * 클라이언트는 표시용으로, 서버는 API 직접 호출로 값이 어긋나는 일을 막는 저장용으로 사용합니다.
 */
export function getTransportCriterionByDate(value) {
  if (!isValidCalendarDate(value)) return null

  const [year, month, day] = value.split("-").map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 || weekday === 6 ? "주말" : "평일"
}
