import { startOAuth } from "../auth.api.js"
import googleLogo from "../../../shared/assets/icons/google-logo.svg"
import kakaoLogo from "../../../shared/assets/icons/kakao-logo.svg"
import styles from "./AuthForm.module.css"

export default function SocialLoginButtons() {
  // 변경: Google은 일반 Web OAuth에서 HTTP 사설 IP redirect URI를 허용하지 않습니다.
  // LAN IP로 접속한 경우 실패하는 버튼 대신 HTTPS 터널이 필요하다는 안내를 표시합니다.
  // HTTPS 공개 주소에서는 자동 활성화되고, localhost 테스트는 환경변수로 명시한 경우에만 활성화됩니다.
  // LAN용 FRONTEND_URL을 사용하면서 localhost Google 로그인을 시작하면 콜백 뒤 쿠키 host가 달라질 수 있기 때문입니다.
  const isLocalHostname = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  const canUseGoogleOAuth = window.location.protocol === "https:"
    || (isLocalHostname && import.meta.env.VITE_GOOGLE_OAUTH_LOCAL_ENABLED === "true")

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
        <button
          className={styles.socialButton}
          type="button"
          onClick={() => startOAuth("google")}
          disabled={!canUseGoogleOAuth}
          title={canUseGoogleOAuth ? undefined : "Google 로그인은 HTTPS 공개 주소가 필요합니다."}
        >
          {/* 변경: 파란색 문자 G를 Google의 다색 SVG 마크로 교체합니다. */}
          <img className={`${styles.socialLogo} ${styles.googleLogo}`} src={googleLogo} alt="" aria-hidden="true" />
          Google
        </button>
      </div>
      {!canUseGoogleOAuth && (
        <p className={styles.oauthNotice}>Google 로그인은 HTTPS 터널 주소에서 이용할 수 있어요. 현재 LAN에서는 카카오 또는 이메일 로그인을 사용해 주세요.</p>
      )}
    </>
  )
}
