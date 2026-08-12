import { startOAuth } from "../auth.api.js"
import googleLogo from "../../../shared/assets/icons/google-logo.svg"
import kakaoLogo from "../../../shared/assets/icons/kakao-logo.svg"
import styles from "./AuthForm.module.css"

export default function SocialLoginButtons() {
  return (
    <>
      <div className={styles.divider}>또는</div>
      <div className={styles.socialButtons}>
        <button className={`${styles.socialButton} ${styles.kakaoButton}`} type="button"
          onClick={() => startOAuth("kakao")}>
          {/* 변경: CSS 도형 대신 비율이 일정한 SVG 로고를 사용해 작은 화면에서도 형태가 깨지지 않습니다. */}
          <img className={`${styles.socialLogo} ${styles.kakaoLogo}`} src={kakaoLogo} alt="" aria-hidden="true" />
          카카오
        </button>
        <button className={styles.socialButton} type="button" onClick={() => startOAuth("google")}>
          {/* 변경: 파란색 문자 G를 Google의 다색 SVG 마크로 교체합니다. */}
          <img className={`${styles.socialLogo} ${styles.googleLogo}`} src={googleLogo} alt="" aria-hidden="true" />
          Google
        </button>
      </div>
    </>
  )
}
