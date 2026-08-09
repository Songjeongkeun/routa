import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { API_URL } from "../../shared/api/httpClient.js"
import { useAuth } from "../../app/providers/authContext.js"
import { updateProfileImage, updateNickname, updateIntroduction } from "../../features/profile/profile.api.js"
import styles from "./ProfileEditPage.module.css"
import defaultAvatar from "../../shared/assets/icons/default-avatar.png"


export default function ProfileEditPage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  const [imageError, setImageError] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleImageChange(event) {
    const file = event.target.files[0]
    if (!file) return
    setImageError("")
    try {
      const { profileImageUrl } = await updateProfileImage(file)
      updateUser({ profileImageUrl })
    } catch (error) {
      setImageError(error.message)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nickname = event.target.nickname.value.trim()
    const introduction = event.target.introduction.value.trim()
    if (!nickname) {
      setSubmitError("닉네임을 입력해주세요.")
      return
    }
    setIsSubmitting(true)
    setSubmitError("")
    try {
      const [nicknameResult, introductionResult] = await Promise.all([
        updateNickname(nickname),
        updateIntroduction(introduction),
      ])
      updateUser({ nickname: nicknameResult.nickname, introduction: introductionResult.introduction })
      navigate(-1)
    } catch (error) {
      setSubmitError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-edit-title"
      >
        <button
          className={styles.closeButton}
          type="button"
          aria-label="닫기"
          onClick={() => navigate(-1)}
        >
          ×
        </button>

        <header className={styles.header}>
          <h1 id="profile-edit-title">프로필 수정</h1>
          <p>프로필 사진과 기본 정보를 변경할 수 있어요.</p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.imageSection}>
            <div className={styles.avatarWrapper}>
              <img
                className={styles.avatar}
                src={user?.profileImageUrl ? `${API_URL}${user.profileImageUrl}` : defaultAvatar}
                alt="프로필"
              />

              <span className={styles.statusCircle} />
            </div>

            <label className={styles.imageButton}>
              사진 변경
              <input
                className={styles.fileInput}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
            </label>
            {imageError && <p className={styles.errorText}>{imageError}</p>}
          </div>

          <label className={styles.field}>
            <span>닉네임</span>
            <input
              type="text"
              name="nickname"
              defaultValue={user?.nickname}
              placeholder="닉네임을 입력하세요"
            />
          </label>

          <label className={styles.field}>
            <span>한 줄 소개</span>
            <input
              type="text"
              name="introduction"
              defaultValue={user?.introduction}
              placeholder="자기소개를 입력하세요"
            />
          </label>

          {submitError && <p className={styles.errorText}>{submitError}</p>}

          <div className={styles.actions}>
            <button className={styles.cancelButton} type="button" onClick={() => navigate(-1)}>
              취소
            </button>
            <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
              {isSubmitting ? "저장 중..." : "변경사항 저장"}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}