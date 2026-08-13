import { Navigate, Outlet, useLocation } from "react-router-dom"
import { usePlan } from "../providers/planContext.js"

const TRIP_TYPES = new Set(["GENERAL", "PET"])
const TRANSPORT_TYPES = new Set(["평일", "주말"])

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""))
}

// 변경: 형식만 맞는 날짜가 다음 단계로 넘어가 서버에서 자동 보정되는 일을 막습니다.
// 브라우저가 아닌 URL·sessionStorage 값으로도 진입할 수 있으므로 Guard에서도 같은 달력 검증을 합니다.
function isValidCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

/**
 * 변경: URL을 직접 입력하거나 새로고침해도 여행 설정이 없는 상태로 장소·식사 단계에
 * 들어가지 못하게 합니다. 화면에서만 버튼을 막는 대신 공유 PlanProvider 값을 검사해
 * 모든 진입 경로에서 같은 순서를 보장합니다.
 */
export default function PlannerStepGuard() {
  const { plan } = usePlan()
  const location = useLocation()
  const hasTravelDate = isValidCalendarDate(plan.date)
  const hasValidTimes = isValidTime(plan.startTime)
    && isValidTime(plan.endTime)
    && plan.startTime < plan.endTime
  const hasRequiredCondition = TRIP_TYPES.has(plan.tripType)
    && hasTravelDate
    && TRANSPORT_TYPES.has(plan.transport)
    && hasValidTimes

  if (!hasRequiredCondition) {
    return (
      <Navigate
        to="/planner/condition"
        replace
        state={{
          plannerMessage: "여행 성격과 날짜·시간을 먼저 설정해 주세요.",
          attemptedPath: location.pathname,
        }}
      />
    )
  }

  return <Outlet />
}
