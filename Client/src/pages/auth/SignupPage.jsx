import { Link, useNavigate } from "react-router-dom"
import SignupForm from "../../features/auth/components/SignupForm.jsx"
import styles from "../../features/auth/components/AuthForm.module.css"

export default function SignupPage() {
  const navigate = useNavigate()

  return (
    <>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>첫 여행을 준비해 볼까요?</p>
        <h1 className={styles.title}>루타와 함께 시작해요</h1>
        <p className={styles.description}>가입하고 내 취향에 꼭 맞는 하루 코스를 받아보세요.</p>
      </header>
      <SignupForm onSuccess={() => navigate("/auth/signup/success", { replace: true })} />
      <p className={styles.footer}>
        이미 계정이 있나요? <Link className={styles.textLink} to="/auth/login">로그인</Link>
      </p>
    </>
  )
}
