import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../../app/providers/authContext.js"
import { usePlan } from "../../app/providers/planContext.js"
import { getSavedItineraries } from "../../features/schedule/schedule.api.js"
import styles from "./HomePage.module.css"

// 메인 홈페이지
// 여행 생성 URL로 가는 버튼

export default function HomePage() {
  const { user } = useAuth()
  const { resetPlan } = usePlan()
  const navigate = useNavigate()
  const location = useLocation()
  const hasHandledLoginAlert = useRef(false)

  // 변경: 홈에서도 저장된 일정 일부를 조회해, 빈 화면 대신 실제 최근 일정을 보여 줍니다.
  const [recentSchedules, setRecentSchedules] = useState([])
  const [isRecentSchedulesLoading, setIsRecentSchedulesLoading] = useState(false)

  useEffect(() => {
    if (!user || !location.state?.loginSucceeded || hasHandledLoginAlert.current) return

    // 로그인 성공 표시를 먼저 지워 홈에 다시 와도 알림이 반복되지 않게 한다.
    hasHandledLoginAlert.current = true
    navigate(location.pathname, { replace: true, state: null })
    const userName = user?.nickname ?? user?.loginId
    window.alert(userName ? `${userName}님, 로그인에 성공했습니다.` : "로그인에 성공했습니다.")
  }, [location.pathname, location.state, navigate, user])

  useEffect(() => {
    // 로그인하지 않은 사용자는 본인 일정 API를 호출할 수 없으므로 빈 상태를 보여 줍니다.
    if (!user) {
      // 기존 상태를 굳이 다시 설정하지 않습니다. 아래 렌더링 조건에서 빈 상태만 표시합니다.
      // 이 방식은 Effect 안에서 불필요한 동기 렌더를 발생시키지 않습니다.
      return undefined
    }

    let isMounted = true

    const loadRecentSchedules = async () => {
      setIsRecentSchedulesLoading(true)

      try {
        // savedAt 내림차순으로 정렬되는 API에서 최신 3개만 받아 홈을 가볍게 유지합니다.
        const response = await getSavedItineraries({ page: 1, pageSize: 3 })
        // SAVED 목록 API의 응답 키는 itineraries이며, 카드에는 목록 DTO의 summary를 그대로 사용합니다.
        if (isMounted) setRecentSchedules(response.itineraries ?? [])
      } catch {
        // 홈은 일정 작성의 진입 화면이므로, 조회 실패가 전체 화면을 막지는 않게 합니다.
        if (isMounted) setRecentSchedules([])
      } finally {
        if (isMounted) setIsRecentSchedulesLoading(false)
      }
    }

    loadRecentSchedules()

    return () => {
      // 화면 이동 뒤 늦게 끝난 요청이 상태를 바꾸지 않게 합니다.
      isMounted = false
    }
  }, [user])

  // Plan 생성 페이지
  const handlePlanClick = () => {
    // 변경: 홈의 "여행 일정 생성"은 기존 초안 수정이 아니라 새 계획 시작입니다.
    // tripPlanId를 초기화해야 다음 저장이 POST로 새 TRIP_PLAN을 생성합니다.
    resetPlan()
    navigate("/planner/condition")
  }

  return (
    <div className={styles.page}>
      <main className={styles.content}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <h1 id="hero-title">서울 하루 여행을 시작해 볼까요?</h1>
            <p>원하는 장소와 시간을 입력하면 나에게 맞는 이동 경로를 추천해 드려요</p>
            <button className={styles.planButton} type="button" onClick={handlePlanClick}>
              <span className={styles.calendarIcon} aria-hidden="true">＋</span>
              여행 일정 생성
            </button>
          </div>
        </section>

        <section className={styles.featureGrid} aria-label="ROUTA 여행 계획 특징">
          <article className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden="true">♟</div>
            <div>
              <h2>최단 도보</h2>
              <p>불필요한 이동을 줄여<br />가장 짧은 도보 경로를 추천해요</p>
            </div>
          </article>

          <article className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden="true">◷</div>
            <div>
              <h2>최소 시간</h2>
              <p>이동 시간과 대기 시간을 고려해<br />가장 효율적인 경로를 찾아드려요</p>
            </div>
          </article>

          <article className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden="true">★</div>
            <div>
              <h2>추천 코스</h2>
              <p>지금 인기 있는 명소와 테마를 반영한<br />맞춤 코스를 제안해 드려요</p>
            </div>
          </article>
        </section>

        <section className={styles.savedSection} aria-labelledby="saved-title">
          <h2 id="saved-title">최근 저장한 일정</h2>
          {isRecentSchedulesLoading ? (
            <p className={styles.savedLoading}>최근 저장 일정을 불러오는 중입니다.</p>
          ) : user && recentSchedules.length > 0 ? (
            <div className={styles.recentScheduleList}>
              {recentSchedules.map((schedule) => (
                <button
                  className={styles.recentScheduleCard}
                  key={schedule.itineraryId}
                  type="button"
                  // 변경: 목록에서 클릭한 일정의 고정 스냅샷 결과 화면으로 바로 이동합니다.
                  onClick={() => navigate(`/course/result?tripPlanId=${schedule.tripPlanId}&itineraryId=${schedule.itineraryId}&saved=1`)}
                >
                  <strong>{schedule.title}</strong>
                  <span>{schedule.travelDate} · {schedule.courseKind === "SHORTEST_WALK" ? "최소 도보" : schedule.courseKind === "FASTEST_TRANSIT" ? "최소 시간" : "추천 코스"}</span>
                  <small>{schedule.summary.totalMinutes}분 · 도보 {(schedule.summary.walkingDistanceMeters / 1000).toFixed(1)}km</small>
                </button>
              ))}
              <button className={styles.savedMoreButton} type="button" onClick={() => navigate("/schedules")}>전체 보기</button>
            </div>
          ) : (
            <div className={styles.savedEmpty}>
              <div className={styles.savedIcon} aria-hidden="true">＋</div>
              <p>저장한 일정이 없으면<br />새 일정을 만들어 보세요</p>
              {/* 변경: 저장 일정 API가 아니라 프론트 목록 화면으로 이동합니다. */}
              <button type="button" onClick={() => navigate("/schedules")}>저장 일정 보기</button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
