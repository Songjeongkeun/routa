import { useAuth } from "../../app/providers/authContext.js"
import { Link } from "react-router-dom"
import { useNavigate } from "react-router-dom"

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate("/auth/login", { replace: true })
  }
  return (
    <main>
      <h1>내 프로필</h1>
      <button type="button" onClick={handleLogout}>로그아웃</button>
      <p>닉네임: {user?.nickname}</p>
      <p>이메일: {user?.email}</p>
      <Link to="/profile/edit">프로필 수정</Link>
    </main>
  )
}