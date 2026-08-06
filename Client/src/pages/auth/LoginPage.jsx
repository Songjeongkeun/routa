import { Link, useLocation, useNavigate } from "react-router-dom"
import LoginForm from "../../features/auth/components/LoginForm.jsx"
import SocialLoginButtons from "../../features/auth/components/SocialLoginButtons.jsx"
import styles from "../../features/auth/components/AuthForm.module.css"

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  function handleLoginSuccess(user) {
    const requestedPath = location.state?.from?.pathname
    navigate(user.isAdmin ? "/admin" : requestedPath || "/", {replace:true})
  }

  return (
    <>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>다시 만나 반가워요!</p>
        <h1 className={styles.title}>여행을 이어볼까요?</h1>
      </header>
      <LoginForm successMessage={location.state?.message} onSuccess={handleLoginSuccess} />
      <SocialLoginButtons />
      <p className={styles.footer}>
        아직 루타 회원이 아닌가요? <Link className={styles.textLink} to="/auth/signup">회원가입</Link>
      </p>
    </>
  )
}
