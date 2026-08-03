import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "../providers/authContext.js"

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <p className="route-status">로그인 정보를 확인하고 있습니다.</p>
  if (!user) return <Navigate to="/auth/login" replace state={{ from: location }} />
  return <Outlet />
}
