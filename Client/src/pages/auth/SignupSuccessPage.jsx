import { Link } from "react-router-dom"
import styles from "../../features/auth/components/AuthForm.module.css"

export default function SignupSuccessPage() {
  return (
    <section>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>가입 완료</p>
        <h1 className={styles.title}>ROUTA 회원이 되신 것을 환영합니다!</h1>
        <p className={styles.description}>로그인하고 나에게 맞는 서울 여행 코스를 만들어보세요.</p>
      </header>
      <Link className={styles.submitButton} to="/auth/login"
        style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
        로그인하러 가기
      </Link>
    </section>
  )
}
