import { Link } from "react-router-dom"
import styles from "../shared/styles/PlaceholderPage.module.css"

export default function NotFoundPage() {
  return (
    <main className={styles.page}>
      <h1>페이지를 찾을 수 없습니다.</h1>
      <Link to="/">홈으로 돌아가기</Link>
    </main>
  )
}
