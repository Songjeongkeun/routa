import { addMinutes, createKoreanDateTime, maxDate } from "./mealSchedule.mjs"

const KOREAN_WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]

function getKoreanWeekday(referenceTime) {
  // 변경: 여행 날짜의 요일을 서버 실행 시간대와 무관하게 KST 기준으로 계산합니다.
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "long",
  }).format(new Date(referenceTime))

  return KOREAN_WEEKDAYS.includes(weekday) ? weekday : null
}

function getBusinessTime(planStartTime, time, openingTime = null) {
  if (!time) return null

  const businessTime = createKoreanDateTime(planStartTime, time)
  // 변경: 18:00~00:30처럼 자정을 넘기는 영업시간은 종료시각을 다음 날로 해석합니다.
  if (openingTime && businessTime <= openingTime) return addMinutes(businessTime, 24 * 60)
  return businessTime
}

function hasClosedDay(place, referenceTime) {
  const closedDays = String(place.closedDays ?? "")
    .split(",")
    .map((day) => day.trim())
    .filter(Boolean)

  const weekday = getKoreanWeekday(referenceTime)
  return weekday && closedDays.includes(weekday)
}

/**
 * 변경: 관광지·지정 음식점·주변 추천 음식점이 같은 운영 제약을 사용하도록 공통화했습니다.
 * 데이터가 비어 있는 영업시간은 "정보 없음"이지 "휴무"가 아니므로 제한하지 않습니다.
 * 이 함수는 실패 이유를 코드와 함께 반환해 API와 화면 모두 같은 안내를 사용할 수 있습니다.
 */
export function evaluatePlaceVisit({
  plan,
  place,
  travelArrivalTime,
  stayMinutes,
  requestedStart = null,
  enforceLastOrder = false,
}) {
  const conflicts = []
  const arrivalTime = new Date(travelArrivalTime)
  const visitMinutes = Math.max(0, Number(stayMinutes) || 0)

  if (plan.withPet && place.petIsAllowed !== true) {
    conflicts.push({
      code: "PET_NOT_ALLOWED",
      placeId: place.placeId,
      placeName: place.placeName,
      message: `${place.placeName}은(는) 반려동물 동반이 불가능합니다.`,
    })
  }

  if (hasClosedDay(place, arrivalTime)) {
    conflicts.push({
      code: "CLOSED_DAY",
      placeId: place.placeId,
      placeName: place.placeName,
      message: `${place.placeName}은(는) 여행 날짜에 휴무입니다.`,
    })
  }

  const openingTime = getBusinessTime(plan.startTime, place.startTime)
  const closingTime = getBusinessTime(plan.startTime, place.endTime, openingTime)
  const lastOrderTime = getBusinessTime(plan.startTime, place.lastOrder, openingTime)
  const visitStart = maxDate(arrivalTime, requestedStart, openingTime)
  const departureTime = addMinutes(visitStart, visitMinutes)

  if (closingTime && departureTime > closingTime) {
    conflicts.push({
      code: "CLOSING_TIME",
      placeId: place.placeId,
      placeName: place.placeName,
      message: `${place.placeName}의 영업 종료 전까지 체류 시간을 확보할 수 없습니다.`,
    })
  }

  if (enforceLastOrder && lastOrderTime && visitStart > lastOrderTime) {
    conflicts.push({
      code: "LAST_ORDER",
      placeId: place.placeId,
      placeName: place.placeName,
      message: `${place.placeName}의 라스트오더 이후에는 식사를 시작할 수 없습니다.`,
    })
  }

  return {
    isFeasible: conflicts.length === 0,
    visitStart,
    departureTime,
    waitMinutes: Math.max(0, Math.round((visitStart.getTime() - arrivalTime.getTime()) / 60_000)),
    conflicts,
  }
}
