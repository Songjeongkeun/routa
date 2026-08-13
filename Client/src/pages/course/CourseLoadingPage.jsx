import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { createRecommendation } from "../../features/course/course.api.js"
import RouteCalculationLoader from "../../features/course/components/RouteCalculationLoader.jsx"
import "./CourseLoadingPage.css"

/**
 * 변경: 식사 선택 다음에 보이는 실제 추천 요청 화면입니다.
 * 요청 중에는 로딩을 유지하고, 성공하면 DB에 생성된 추천 코스의 결과 URL로 교체합니다.
 */
export default function CourseLoadingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState("여행 조건을 확인하고 있어요.")
  const tripPlanId = searchParams.get("tripPlanId")

  useEffect(() => {
    let isCancelled = false
    const controller = new AbortController()

    async function requestRecommendation() {
      try {
        setError("")
        setLoadingMessage("장소·음식점·운영시간을 확인하고 있어요.")
        const { recommendation } = await createRecommendation(tripPlanId, { signal: controller.signal })
        if (isCancelled) return

        setLoadingMessage("추천 경로를 저장하고 있어요.")
        // 변경: 부분 성공이면 코스 생성 순서가 고정되지 않습니다. 성공 목록에서 BALANCED를 찾아
        // 기본으로 열고, 균형 코스가 실패한 경우에만 첫 번째 성공 코스를 표시합니다.
        const itineraryId = recommendation.courses?.find((course) => course.courseType === "BALANCED")?.itineraryId
          ?? recommendation.itineraryIds[0]
        if (!itineraryId) throw new Error("생성된 추천 코스를 찾을 수 없습니다.")

        navigate(
          `/course/result?tripPlanId=${recommendation.tripPlanId}&itineraryId=${itineraryId}`,
          {
            replace: true,
            // 변경: 일부 코스만 성공한 경우에도 성공 결과를 먼저 보여 주되,
            // 사용자가 세 가지 모두 생성된 것으로 오해하지 않도록 결과 화면에 짧은 안내를 전달합니다.
            state: buildPartialRecommendationNotice(recommendation),
          },
        )
      } catch (requestError) {
        // 변경: 입력 단계로 돌아가면서 취소한 브라우저 요청은 실패 메시지로 표시하지 않습니다.
        if (!isCancelled && requestError.name !== "AbortError") {
          setError(getRecommendationErrorMessage(requestError))
        }
      }
    }

    // 변경: URL에 계획 ID가 없으면 서버 요청을 보내지 않고 식사 선택으로 되돌아갈 수 있게 안내합니다.
    // 상태 변경은 다음 이벤트 루프에서 실행해 React Effect의 동기 state 갱신 경고를 피합니다.
    const requestTimer = window.setTimeout(() => {
      if (tripPlanId) requestRecommendation()
      else setError("저장된 여행 계획이 없습니다. 음식점 선택부터 다시 진행해 주세요.")
    }, 0)

    return () => {
      isCancelled = true
      window.clearTimeout(requestTimer)
      controller.abort()
    }
  }, [attempt, navigate, tripPlanId])

  return (
    error ? (
      <main className="course-loading-page">
        <section className="course-loading-card" aria-live="polite">
          <span className="course-loading-icon" aria-hidden="true">!</span>
          <h1>추천 경로를 만들지 못했습니다</h1>
          <p>{error}</p>
          <div className="course-loading-actions">
            <button type="button" onClick={() => setAttempt((previous) => previous + 1)}>다시 시도</button>
            <button type="button" onClick={() => navigate("/planner/meals")}>음식점 선택으로 돌아가기</button>
          </div>
        </section>
      </main>
    ) : (
      <RouteCalculationLoader
        title="여행 경로를 계산하고 있어요"
        description={loadingMessage}
        detail="선택한 장소·음식점·여행 시간을 바탕으로 추천 코스 3개를 만들고 있습니다."
      />
    )
  )
}

/** 변경: 부분 성공 응답의 실패 코스 이름만 사용자용 안내 문구로 바꿉니다. */
function buildPartialRecommendationNotice(recommendation) {
  if (recommendation?.status !== "PARTIAL") return null

  const labels = {
    SHORTEST_WALK: "도보 최소",
    FASTEST_TRANSIT: "대중교통 최단",
    BALANCED: "균형",
  }
  const failedLabels = (recommendation.failedCourses ?? [])
    .map((course) => labels[course.courseType] ?? "일부")
    .join(", ")

  return {
    recommendationNotice: `${failedLabels || "일부"} 코스는 현재 조건을 만족하지 못해 제외했어요. 생성된 코스를 확인하거나 조건을 조정해 다시 추천할 수 있습니다.`,
  }
}

/** 변경: 상태 코드별로 사용자가 다음 행동을 알 수 있는 안내 문구를 제공합니다. */
function getRecommendationErrorMessage(error) {
  if (error.status === 422) {
    // 변경: 서버가 모은 장소별 제약 사유를 최대 세 개까지 함께 보여 줍니다.
    // 사용자는 "경로 없음" 대신 어떤 장소·식사 시간이 문제인지 보고 바로 수정할 수 있습니다.
    const details = Array.isArray(error.conflicts) ? error.conflicts.slice(0, 3) : []
    const detailMessage = details.map((conflict) => `• ${conflict.message}`).join("\n")
    return [
      "선택한 장소·식사 시간·영업시간 조건으로는 일정을 만들 수 없습니다.",
      detailMessage,
      "장소를 줄이거나 식사 시간·체류 시간을 조정해 주세요.",
    ].filter(Boolean).join("\n\n")
  }
  if (error.status === 429) return "길찾기 API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
  if (error.status === 502 || error.status === 504) return "외부 길찾기 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
  return error.message || "추천 경로를 계산하지 못했습니다."
}
