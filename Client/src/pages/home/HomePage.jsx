import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../app/providers/authContext.js"
import styles from "./HomePage.module.css"

// 메인 홈페이지
// 여행 생성 URL로 가는 버튼

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // 로그인 성공을 alert으로 띄우기
  // useRef(false)는 처음에는 알림을 보여주지 않음
  /*
    false -> 아직 알림을 보여주지 않음
    true -> 이미 알림을 보여줌
  */
  const hasShownLoginAlert = useRef(false)

  useEffect(() => {
    // hasShownLoginAlert.current가 true이면 이미 알림을 보여줬으므로 return
    if (!user || hasShownLoginAlert.current) return

    // 알림을 띄우기 직전에 "이제 알림을 표시했다"라고 기록 > 중복 제거
    hasShownLoginAlert.current = true
    const userName = user?.nickname ?? user?.loginId
    window.alert(userName ? `${userName}님, 로그인에 성공했습니다.` : "로그인에 성공했습니다.")
  }, [user])
  // 의존성이 user라 user값이 변경될 때 실행

  // Plan 생성 페이지
  const handlePlanClick = () => {
    navigate("/planner/condition")
  }

  // 저장된 일정 페이지
  const handleSaveScheduleClick = () => {
    navigate("api/itineraries?status=SAVED")
  }

  // 프로필 페이지
  const handleProfileClick = () => {
    navigate("/api/users/me")
  }

  // 내문의 페이지
  const handleInquiryClick = () => {
    navigate("/api/inquiries")
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
          <div className={styles.savedEmpty}>
            <div className={styles.savedIcon} aria-hidden="true">＋</div>
            <p>저장한 일정이 없으면<br />새 일정을 만들어 보세요</p>
          </div>
        </section>
      </main>
    </div>
  )
}
