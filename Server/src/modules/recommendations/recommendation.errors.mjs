/**
 * 추천 도메인에서 공통으로 사용하는 HTTP 오류 생성 함수입니다.
 * Controller와 errorHandler가 status, conflicts 속성을 읽어 응답을 구성합니다.
 */
export function createHttpError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

/**
 * 영업시간·식사 시간·여행 종료 시간처럼 사용자가 수정할 수 있는 제약 실패를 표현합니다.
 */
export function createConstraintError(conflicts) {
  const error = createHttpError("선택한 일정은 운영 조건 또는 종료 시간 안에 배치할 수 없습니다.", 422)
  error.conflicts = conflicts
  return error
}

export function assertPlaceFeasible(timing) {
  if (!timing.isFeasible) throw createConstraintError(timing.conflicts)
  return timing
}

export function normalizeTripPlanId(value) {
  const tripPlanId = Number(value)
  if (!Number.isSafeInteger(tripPlanId) || tripPlanId <= 0) {
    throw createHttpError("추천할 여행 계획을 선택해 주세요.")
  }
  return tripPlanId
}
