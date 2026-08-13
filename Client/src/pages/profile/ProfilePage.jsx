import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../app/providers/authContext.js"
import { usePlan } from "../../app/providers/planContext.js"
import { API_URL } from "../../shared/api/httpClient.js"
import { getSavedItineraries } from "../../features/schedule/schedule.api.js"
import { changePassword, withdrawUser } from "../../features/profile/profile.api.js"
import styles from "./ProfilePage.module.css"

import defaultAvatar from "../../shared/assets/icons/default-avatar.png"
import savedScheduleIcon from "../../shared/assets/icons/Saved-schedule.png"
import securityIcon from "../../shared/assets/icons/Security icon.png"
import passwordRowIcon from "../../shared/assets/icons/Account row icon 0.png"

/**
 * 변경: 실제 API가 없는 방문 장소·거리·취향을 임의 수치로 보여 주지 않습니다.
 * 프로필에서는 사용자 정보와 실제 저장 일정 수, 실제로 동작하는 계정 관리만 제공합니다.
 */
export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { resetPlan } = usePlan()
  const navigate = useNavigate()
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false)
  const [savedScheduleCount, setSavedScheduleCount] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function loadSavedScheduleCount() {
      try {
        // 변경: 프로필 통계는 실제 SAVED 일정 목록 API의 totalCount만 사용합니다.
        const result = await getSavedItineraries({ page: 1, pageSize: 1 })
        if (isMounted) setSavedScheduleCount(result.totalCount ?? 0)
      } catch {
        // 오류 시 임의 숫자를 보여 주지 않고 값이 아직 확인되지 않았음을 유지합니다.
        if (isMounted) setSavedScheduleCount(null)
      }
    }

    loadSavedScheduleCount()
    return () => { isMounted = false }
  }, [])

  async function handlePasswordSubmit(event) {
    event.preventDefault()
    const currentPassword = event.target.currentPassword.value
    const newPassword = event.target.newPassword.value
    const newPasswordConfirm = event.target.newPasswordConfirm.value

    if (newPassword !== newPasswordConfirm) {
      setPasswordError("새 비밀번호가 서로 일치하지 않아요.")
      return
    }

    try {
      setPasswordError("")
      setIsPasswordSubmitting(true)
      await changePassword({ currentPassword, newPassword })
      setIsPasswordModalOpen(false)
    } catch (error) {
      setPasswordError(error.message || "비밀번호를 변경하지 못했습니다.")
    } finally {
      setIsPasswordSubmitting(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate("/auth/login", { replace: true })
  }

  async function handleWithdraw() {
    if (!window.confirm("정말 탈퇴하시겠어요? 이 작업은 되돌릴 수 없어요.")) return

    try {
      await withdrawUser()
      await logout()
      navigate("/auth/login", { replace: true })
    } catch (error) {
      setPasswordError(error.message || "회원 탈퇴를 처리하지 못했습니다.")
    }
  }

  function handleStartNewTrip() {
    // 변경: 프로필의 새 여행 진입점도 이전 tripPlanId를 제거해 저장된 일정의 원본 계획을 덮어쓰지 않습니다.
    resetPlan()
    navigate("/planner/condition")
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
        <p>계정 정보와 저장한 여행 일정을 관리해요.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={styles.profileCard}>
            <img className={styles.avatar} src={avatarSrc} alt="프로필" />
            <div className={styles.profileInfo}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{user?.nickname}</span>
                <button type="button" className={styles.editButton} onClick={() => navigate("/profile/edit")}>프로필 수정</button>
              </div>
              <p className={styles.role}>{user?.introduction || "ROUTA 여행자"}</p>
              <p className={styles.email}>{user?.email}</p>
            </div>
          </section>

          <section className={styles.scheduleSummaryCard}>
            <img className={styles.statIcon} src={savedScheduleIcon} alt="" />
            <div>
              <p>저장한 일정</p>
              <strong>{savedScheduleCount == null ? "불러오는 중" : `${savedScheduleCount}개`}</strong>
              <span>마음에 든 경로는 저장 일정에서 다시 확인할 수 있어요.</span>
            </div>
            <button type="button" onClick={() => navigate("/schedules")}>저장 일정 보기</button>
          </section>

          <section className={styles.nextPlanCard}>
            <h2>다음 여행을 준비해 볼까요?</h2>
            <p>관심 테마와 식사 방식은 여행 계획을 만들 때 선택하고 추천 경로에 바로 반영할 수 있어요.</p>
            <button type="button" onClick={handleStartNewTrip}>여행 일정 만들기</button>
          </section>
        </div>

        <div className={styles.sideColumn}>
          <section className={styles.securityCard}>
            <h2><img className={styles.titleIcon} src={securityIcon} alt="" /> 계정 및 보안</h2>
            <ul className={styles.securityList}>
              {user?.authProvider === "LOCAL" && (
                <li>
                  <button type="button" onClick={() => { setPasswordError(""); setIsPasswordModalOpen(true) }}>
                    <span className={styles.rowLeft}><img src={passwordRowIcon} alt="" />비밀번호 변경</span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              )}
            </ul>
            {passwordError && <p className={styles.errorText} role="alert">{passwordError}</p>}
            <div className={styles.accountActions}>
              <button type="button" className={styles.logoutButton} onClick={handleLogout}>로그아웃</button>
              <button type="button" className={styles.withdrawButton} onClick={handleWithdraw}>회원 탈퇴</button>
            </div>
          </section>
        </div>
      </div>

      {isPasswordModalOpen && (
        <div className={styles.modalOverlay}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="password-change-title">
            <header className={styles.modalHeader}>
              <h2 id="password-change-title">비밀번호 변경</h2>
              <button type="button" aria-label="닫기" onClick={() => setIsPasswordModalOpen(false)}>×</button>
            </header>
            <form onSubmit={handlePasswordSubmit} className={styles.modalForm}>
              <label><span>현재 비밀번호</span><input type="password" name="currentPassword" required /></label>
              <label><span>새 비밀번호</span><input type="password" name="newPassword" minLength={8} required /></label>
              <label><span>새 비밀번호 확인</span><input type="password" name="newPasswordConfirm" minLength={8} required /></label>
              {passwordError && <p className={styles.errorText} role="alert">{passwordError}</p>}
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setIsPasswordModalOpen(false)}>취소</button>
                <button type="submit" disabled={isPasswordSubmitting}>{isPasswordSubmitting ? "변경 중…" : "변경하기"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
