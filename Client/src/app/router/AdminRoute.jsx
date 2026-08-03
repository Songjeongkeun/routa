import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../providers/authContext.js"

export default function AdminRoute() {
  const { user } = useAuth()
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />
  return <Outlet />
}
