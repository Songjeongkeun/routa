import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../providers/authContext.js"

export default function AdminRoute() {
  const { user } = useAuth()
  if (!user?.isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
