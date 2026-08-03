import { useAuth } from "../../app/providers/authContext.js"
import styles from "../../shared/styles/PlaceholderPage.module.css"

export default function HomePage() {
  const { user } = useAuth()

  return (
    <main className={styles.page}>
      <h1>ROUTA</h1>
      <p>{user?.nickname ?? user?.loginId}님, 로그인이 완료되었습니다.</p>
    </main>
  )
}
