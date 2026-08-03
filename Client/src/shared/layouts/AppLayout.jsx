import { Outlet } from "react-router-dom"
import Header from "../components/Header.jsx"

export default function AppLayout() {
  return (
    <div>
      <Header />
      <Outlet />
    </div>
  )
}
