import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../app/providers/authContext.js"
import { API_URL } from "../../shared/api/httpClient.js"
import defaultAvatar from "../../shared/assets/icons/default-avatar.png"
import savedScheduleIcon from "../../shared/assets/icons/Saved-schedule.png"
import visitedPlaceIcon from "../../shared/assets/icons/Visited-place.png"
import totalDistanceIcon from "../../shared/assets/icons/Total-distance-traveled.png"
import securityIcon from "../../shared/assets/icons/Security icon.png"
import passwordRowIcon from "../../shared/assets/icons/Account row icon 0.png"
import alertRowIcon from "../../shared/assets/icons/Account row icon 1.png"
import privacyRowIcon from "../../shared/assets/icons/Account row icon 2.png"
import travelRecordIcon from "../../shared/assets/icons/Travel record icon.png"
import hartIcon from "../../shared/assets/icons/Preferences icon.png"
import styles from "./ProfilePage.module.css"

const INTEREST_THEMES = ["역사·전통", "카페·감성", "전시·문화", "쇼핑", "자연·산책", "힐링·여유"]
const MOVE_MODES = ["도보 위주", "대중교통 위주", "균형 있게"]
const MEAL_MODES = ["경로 주변 추천", "직접 선택"]

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [selectedThemes, setSelectedThemes] = useState(["카페·감성"])
  const [moveMode, setMoveMode] = useState("도보 위주")
  const [mealMode, setMealMode] = useState("경로 주변 추천")

  function toggleTheme(theme) {
    setSelectedThemes((prev) =>
      prev.includes(theme) ? prev.filter((item) => item !== theme) : [...prev, theme]
    )
  }

  async function handleLogout() {
    await logout()
    navigate("/auth/login", { replace: true })
  }

  function handleWithdraw() {
    const ok = window.confirm("정말 탈퇴하시겠어요? 이 작업은 되돌릴 수 없어요.")
    if (!ok) return
    window.alert("회원 탈퇴 기능은 아직 구현되지 않았습니다.")
  }

  const avatarSrc = user?.profileImageUrl
    ? user.profileImageUrl.startsWith("blob:")
      ? user.profileImageUrl
      : `${API_URL}${user.profileImageUrl}`
    : defaultAvatar

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>내 정보</h1>
        <p>나의 여행 취향과 활동을 한눈에 확인하고 관리해요.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={styles.profileCard}>
            <img className={styles.avatar} src={avatarSrc} alt="프로필" />
            <div className={styles.profileInfo}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{user?.nickname}</span>
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => navigate("/profile/edit")}
                >
                  프로필 수정
                </button>
              </div>
              <p className={styles.role}>{user?.introduction || "ROUTA 여행자"}</p>
              <p className={styles.email}>{user?.email}</p>
            </div>
          </section>

          <section className={styles.statsRow}>
            <div className={styles.statCard}>
              <img className={styles.statIcon} src={savedScheduleIcon} alt="" />
              <div className={styles.statText}>
                <span className={styles.statLabel}>저장한 일정</span>
                <strong className={styles.statValue}>4</strong>
              </div>
            </div>
            <div className={styles.statCard}>
              <img className={styles.statIcon} src={visitedPlaceIcon} alt="" />
              <div className={styles.statText}>
                <span className={styles.statLabel}>방문한 장소</span>
                <strong className={styles.statValue}>16</strong>
              </div>
            </div>
            <div className={styles.statCard}>
              <img className={styles.statIcon} src={totalDistanceIcon} alt="" />
              <div className={styles.statText}>
                <span className={styles.statLabel}>총 이동 거리</span>
                <strong className={styles.statValue}>42.8km</strong>
              </div>
            </div>
          </section>

          <section className={styles.recordCard}>
            <h2><img className={styles.titleIcon} src={travelRecordIcon} alt="" /> 나의 서울 여행 기록</h2>
            <p className={styles.recordText}>
              서울 ?개 구 중 ?개 구를 여행했어요
            </p>
            <div className={styles.progressTrack}></div>

          </section>
        </div>

        <div className={styles.sideColumn}>
          <section className={styles.preferenceCard}>
            <h2><img className={styles.titleIcon} src={hartIcon} alt="" /> 나의 여행 취향</h2>
            <p className={styles.cardSubtitle}>추천 경로에 반영되는 정보를 관리해요.</p>

            <div className={styles.preferenceGroup}>
              <span className={styles.groupLabel}>관심 테마</span>
              <div className={styles.tagRow}>
                {INTEREST_THEMES.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={`${styles.tag} ${selectedThemes.includes(theme) ? styles.tagActive : ""}`}
                    onClick={() => toggleTheme(theme)}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.preferenceGroup}>
              <span className={styles.groupLabel}>선호 이동 방식</span>
              <div className={styles.tagRow}>
                {MOVE_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`${styles.tag} ${moveMode === mode ? styles.tagActive : ""}`}
                    onClick={() => setMoveMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.preferenceGroup}>
              <span className={styles.groupLabel}>식사 추천</span>
              <div className={styles.tagRow}>
                {MEAL_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`${styles.tag} ${mealMode === mode ? styles.tagActive : ""}`}
                    onClick={() => setMealMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className={styles.saveButton}>취향 저장하기</button>
          </section>

          <section className={styles.securityCard}>
            <h2><img className={styles.titleIcon} src={securityIcon} alt="" /> 계정 및 보안</h2>
            <ul className={styles.securityList}>
              <li>
                <button type="button">
                  <span className={styles.rowLeft}>
                    <img src={passwordRowIcon} alt="" />
                    비밀번호 변경
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
              <li>
                <button type="button">
                  <span className={styles.rowLeft}>
                    <img src={alertRowIcon} alt="" />
                    알림 설정
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
              <li>
                <button type="button">
                  <span className={styles.rowLeft}>
                    <img src={privacyRowIcon} alt="" />
                    개인정보 관리
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            </ul>

            <div className={styles.accountActions}>
              <button type="button" className={styles.logoutButton} onClick={handleLogout}>
                로그아웃
              </button>
              <button type="button" className={styles.withdrawButton} onClick={handleWithdraw}>
                회원 탈퇴
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}