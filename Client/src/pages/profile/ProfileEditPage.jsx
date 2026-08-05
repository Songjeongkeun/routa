import { useNavigate } from "react-router-dom"
import { useAuth } from "../../app/providers/authContext.js"
import { updateProfileImage } from "../../features/profile/profile.api.js"
import { API_URL } from "../../shared/api/httpClient.js"
import accountIcon from "../../shared/assets/icons/account.png"
import styles from "./ProfileEditPage.module.css"
import { useState } from "react"

export default function ProfileEditPage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  const [imageError, setImageError] = useState("")

  async function handleImageChange(event) {
    const file = event.target.files[0]
    if (!file) return

    const previewUrl = URL.createObjectURL(file)
    const prevImageUrl = user?.profileImageUrl
    setImageError("")
    updateUser({ profileImageUrl: previewUrl })

    try {
      const { profileImageUrl } = await updateProfileImage(file)
      updateUser({ profileImageUrl })
    } catch (error) {
      updateUser({ profileImageUrl: prevImageUrl })
      setImageError(error.message)
    } finally {
      URL.revokeObjectURL(previewUrl)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    // 프로필 수정 API 호출
    navigate(-1)
  }

  const avartarSrc = user?.profileImageUrl 
    ? user.profileImageUrl.startsWith("blob:")
      ? user.profileImageUrl
      : `${API_URL}${user.profileImageUrl}`
    : accountIcon

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
                src={avartarSrc}
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
            <span>이메일</span>
            <input
              type="email"
              name="email"
              defaultValue={user?.email}
              placeholder="이메일을 입력하세요"
            />
            <small>이메일 변경 시 인증이 필요해요.</small>
          </label>

          <label className={styles.field}>
            <span>한 줄 소개</span>
            <input
              type="text"
              name="introduction"
              placeholder="자기소개를 입력하세요"
            />
          </label>

          <div className={styles.actions}>
            <button
              className={styles.cancelButton}
              type="button"
              onClick={() => navigate(-1)}
            >
              취소
            </button>

            <button className={styles.submitButton} type="submit">
              변경사항 저장
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}