import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../../app/providers/authContext.js"
import styles from "./Header.module.css"

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate("/auth/login", { replace: true })
  }

  async function handleSaveScheduleClick() {
    await navigate("api/itineraries?status=SAVED")
  }

  async function handleProfileClick() {
    await navigate("/api/users/me")
  }

  async function handleInquiryClick() {
    await navigate("/api/inquiries")
  }
  
  return (
    <header className={styles.header}>
      <Link className={styles.logo} to="/">ROUTA</Link>

      <nav className={styles.primaryNav} aria-label="여행 메뉴">
        <button
          className={styles.activeMenu}
          type="button"
          onClick={() => navigate("/planner/condition")}
        >
          여행 계획
        </button>
        <button type="button" onClick={handleSaveScheduleClick}>
          저장한 일정
        </button>
      </nav>

      <nav className={styles.userNav} aria-label="사용자 메뉴">
        <button type="button" onClick={handleInquiryClick}>내 문의</button>
        {user?.role === "ADMIN" && <Link to="/admin">관리자</Link>}
        <button
          className={styles.profileButton}
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
