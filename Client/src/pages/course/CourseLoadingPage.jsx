import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { createRecommendation } from "../../features/course/course.api.js"
import "./CourseLoadingPage.css"

/**
 * 변경: 식사 선택 다음에 보이는 실제 추천 요청 화면입니다.
 * 요청 중에는 로딩을 유지하고, 성공하면 DB에 생성된 추천 코스의 결과 URL로 교체합니다.
 */
export default function CourseLoadingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState("")
  const tripPlanId = searchParams.get("tripPlanId")

  useEffect(() => {
    let isCancelled = false

    async function requestRecommendation() {
      try {
        const { recommendation } = await createRecommendation(tripPlanId)
        if (isCancelled) return

        // 변경: BALANCED 코스가 세 번째로 생성되므로 기본 선택 코스로 사용하고, 없으면 첫 코스를 사용합니다.
        const itineraryId = recommendation.itineraryIds[2] ?? recommendation.itineraryIds[0]
        if (!itineraryId) throw new Error("생성된 추천 코스를 찾을 수 없습니다.")

        navigate(
          `/course/result?tripPlanId=${recommendation.tripPlanId}&itineraryId=${itineraryId}`,
          { replace: true },
        )
      } catch (requestError) {
        if (!isCancelled) {
          setError(requestError.message || "추천 경로를 계산하지 못했습니다.")
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
    }
  }, [navigate, tripPlanId])

  return (
    <main className="course-loading-page">
      <section className="course-loading-card" aria-live="polite">
        {error ? (
          <>
            <span className="course-loading-icon" aria-hidden="true">!</span>
            <h1>추천 경로를 만들지 못했습니다</h1>
            <p>{error}</p>
            <button type="button" onClick={() => navigate("/planner/meals")}>음식점 선택으로 돌아가기</button>
          </>
        ) : (
          <>
            <span className="course-loading-spinner" aria-hidden="true" />
            <h1>여행 경로를 계산하고 있어요</h1>
            <p>선택한 장소·음식점·여행 시간을 바탕으로 추천 코스 3개를 만들고 있습니다.</p>
          </>
        )}
      </section>
    </main>
  )
}
