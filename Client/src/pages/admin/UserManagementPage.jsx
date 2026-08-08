import styles from "../../shared/styles/PlaceholderPage.module.css"
import { Link } from "react-router-dom"
export default function UserManagementPage() {
  return (
    <main className={styles.page}>
      <h1>관리자 페이지</h1>

      <p>
        관리자 전용 사용자 관리 기능이
        이곳에 추가됩니다.
      </p>

      <Link to="/inquiry">
        문의 페이지로 이동
      </Link>
    </main>
  )
}
