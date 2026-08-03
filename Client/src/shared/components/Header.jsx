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

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.logo} to="/">ROUTA</Link>
        <nav className={styles.navigation} aria-label="주요 메뉴">
          <Link to="/">홈</Link>
          {user?.role === "ADMIN" && <Link to="/admin">관리자</Link>}
          <button type="button" onClick={handleLogout}>로그아웃</button>
        </nav>
      </div>
    </header>
  )
}
