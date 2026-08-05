import { useState } from "react"
import { useAuth } from "../../../app/providers/authContext.js"
import accountIcon from "../../../shared/assets/icons/account.png"
import lockIcon from "../../../shared/assets/icons/lock.png"
import FormField from "./FormField.jsx"
import styles from "./AuthForm.module.css"

export default function LoginForm({ successMessage, onSuccess }) {
  const { login } = useAuth()
  const [form, setForm] = useState({ email: "", password: "", rememberMe: false })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleChange(event) {
    const { name, value, checked, type } = event.target
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)
    try {
      const user = await login(form)
      onSuccess(user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <FormField label="이메일" icon={accountIcon} name="email" type="email" value={form.email}
        onChange={handleChange} placeholder="이메일을 입력해 주세요" autoComplete="email" required />
      <FormField
        label="비밀번호" icon={lockIcon} name="password"
        type={showPassword ? "text" : "password"} value={form.password}
        onChange={handleChange} placeholder="비밀번호를 입력해 주세요"
        autoComplete="current-password" required
        action={
          <button className={styles.passwordAction} type="button"
            onClick={() => setShowPassword((current) => !current)}>
            {showPassword ? "숨기기" : "보기"}
          </button>
        }
      />
      <div className={styles.options}>
        <label className={styles.checkboxLabel}>
          <input name="rememberMe" type="checkbox" checked={form.rememberMe}
            onChange={handleChange} />
          로그인 유지
        </label>
        <a className={styles.textLink} href="/forgot-password">비밀번호 찾기</a>
      </div>
      {successMessage && (
        <p className={`${styles.message} ${styles.successMessage}`} role="status">
          {successMessage}
        </p>
      )}
      {error && <p className={styles.message} role="alert">{error}</p>}
      <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
        {isSubmitting ? "로그인 중..." : "로그인"}
      </button>
    </form>
  )
}
