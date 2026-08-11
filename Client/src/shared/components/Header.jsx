import { Link, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../../app/providers/authContext.js"
import { usePlan } from "../../app/providers/planContext.js"
import styles from "./Header.module.css"

export default function Header() {
  const { user, logout } = useAuth()
  const { resetPlan } = usePlan()
  const navigate = useNavigate()
  const location = useLocation()

  // 변경: 어느 화면에 있는지와 무관하게 "여행 계획"만 선택되어 보이던 문제를 해결합니다.
  // 추천 로딩·결과도 여행 계획 흐름에 포함해 같은 메뉴를 활성화합니다.
  const isPlanning = location.pathname.startsWith("/planner") || location.pathname.startsWith("/course")
  const isSchedules = location.pathname.startsWith("/schedules")
  // 변경: 라우터의 실제 화면 경로는 단수형 /inquiry이므로 메뉴 활성화 기준도 맞춥니다.
  const isInquiries = location.pathname.startsWith("/inquiry")
  const isProfile = location.pathname.startsWith("/profile")

  async function handleLogout() {
    await logout()
    navigate("/auth/login", { replace: true })
  }

  function handleSaveScheduleClick() {
    // 변경: /api는 JSON 응답 주소이므로, 저장 일정 목록을 렌더링하는 프론트 라우트로 이동합니다.
    navigate("/schedules")
  }

  function handleStartNewTrip() {
    // 변경: 헤더에서 새 여행 계획을 시작하면 이전 초안의 tripPlanId까지 비웁니다.
    // 남아 있던 ID로 PUT 요청을 보내 과거 저장 일정의 원본 계획 날짜가 바뀌는 것을 막습니다.
    resetPlan()
    navigate("/planner/condition")
  }

  function handleProfileClick() {
    navigate("/profile")
  }

  function handleInquiryClick() {
    // 변경: 문의 JSON API가 아닌 라우터에 등록된 사용자의 문의 목록 화면으로 이동합니다.
    navigate("/inquiry")
  }
  
  return (
    <header className={styles.header}>
      <Link className={styles.logo} to="/">ROUTA</Link>

      <nav className={styles.primaryNav} aria-label="여행 메뉴">
        <button
          className={isPlanning ? styles.activeMenu : styles.menuButton}
          type="button"
          onClick={handleStartNewTrip}
        >
          여행 계획
        </button>
        <button className={isSchedules ? styles.activeMenu : styles.menuButton} type="button" onClick={handleSaveScheduleClick}>
          저장한 일정
        </button>
      </nav>

      <nav className={styles.userNav} aria-label="사용자 메뉴">
        <button className={isInquiries ? styles.currentUserMenu : ""} type="button" onClick={handleInquiryClick}>내 문의</button>
        {user?.isAdmin && <Link to="/admin">관리자</Link>}
        <button
          className={`${styles.profileButton} ${isProfile ? styles.profileButtonActive : ""}`}
          type="button"
          aria-label="프로필"
          onClick={handleProfileClick}
        >
          <span aria-hidden="true">●</span>
        </button>
        <button className={styles.logoutButton} type="button" onClick={handleLogout}>
          로그아웃
        </button>
      </nav>
    </header>
  )
}
