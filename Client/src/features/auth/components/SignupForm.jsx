import { useState } from "react"
import accountIcon from "../../../shared/assets/icons/account.png"
import emailIcon from "../../../shared/assets/icons/email.png"
import lockIcon from "../../../shared/assets/icons/lock.png"
import { signup } from "../auth.api.js"
import FormField from "./FormField.jsx"
import styles from "./AuthForm.module.css"

const initialForm = { nickname: "", loginId: "", email: "", password: "", agreed: false }

export default function SignupForm({ onSuccess }) {
  const [form, setForm] = useState(initialForm)
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
    if (!form.agreed) {
      setError("서비스 이용약관과 개인정보 처리방침에 동의해 주세요.")
      return
    }

    setIsSubmitting(true)
    try {
      await signup(form)
      onSuccess()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <FormField label="닉네임" icon={accountIcon} name="nickname" value={form.nickname}
        onChange={handleChange} placeholder="어떻게 불러드릴까요?" autoComplete="nickname" required />
      <FormField label="아이디" icon={accountIcon} name="loginId" value={form.loginId}
        onChange={handleChange} placeholder="영문, 숫자 조합" minLength="4" maxLength="30"
        autoComplete="username" required />
      <FormField label="이메일" icon={emailIcon} name="email" type="email" value={form.email}
        onChange={handleChange} placeholder="example@email.com" autoComplete="email" required />
      <FormField
        label="비밀번호" icon={lockIcon} name="password"
        type={showPassword ? "text" : "password"} value={form.password}
        onChange={handleChange} placeholder="8자 이상 입력해 주세요" minLength="8"
        autoComplete="new-password" required
        action={
          <button className={styles.passwordAction} type="button"
            onClick={() => setShowPassword((current) => !current)}>
            {showPassword ? "숨기기" : "보기"}
          </button>
        }
      />
      <label className={styles.terms}>
        <input name="agreed" type="checkbox" checked={form.agreed} onChange={handleChange} />
        서비스 이용약관 및 개인정보 처리방침에 동의합니다.
      </label>
      {error && <p className={styles.message} role="alert">{error}</p>}
      <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
        {isSubmitting ? "가입 중..." : "회원가입"}
      </button>
    </form>
  )
}
