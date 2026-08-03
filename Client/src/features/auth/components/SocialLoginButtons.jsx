import { startOAuth } from "../auth.api.js"
import styles from "./AuthForm.module.css"

export default function SocialLoginButtons() {
  return (
    <>
      <div className={styles.divider}>또는</div>
      <div className={styles.socialButtons}>
        <button className={`${styles.socialButton} ${styles.kakaoButton}`} type="button"
          onClick={() => startOAuth("kakao")}>
          <span className={styles.kakaoIcon} aria-hidden="true" />
          카카오
        </button>
        <button className={styles.socialButton} type="button" onClick={() => startOAuth("google")}>
          <span className={styles.googleIcon} aria-hidden="true">G</span>
          Google
        </button>
      </div>
    </>
  )
}
