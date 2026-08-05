import { Navigate, createBrowserRouter } from "react-router-dom"
import AdminRoute from "./AdminRoute.jsx"
import ProtectedRoute from "./ProtectedRoute.jsx"
import AuthLayout from "../../shared/layouts/AuthLayout.jsx"
import AppLayout from "../../shared/layouts/AppLayout.jsx"
import LoginPage from "../../pages/auth/LoginPage.jsx"
import SignupPage from "../../pages/auth/SignupPage.jsx"
import SignupSuccessPage from "../../pages/auth/SignupSuccessPage.jsx"
import HomePage from "../../pages/home/HomePage.jsx"
import UserManagementPage from "../../pages/admin/UserManagementPage.jsx"
import NotFoundPage from "../../pages/NotFoundPage.jsx"
import ProfilePage from "../../pages/profile/ProfilePage.jsx"
import ProfileEditPage from "../../pages/profile/ProfileEditPage.jsx"
import MyInquiriesPage
  from "../../pages/inquiry/MyInquiriesPage.jsx"
import NewInquiryPage
  from "../../pages/inquiry/NewInquiryPage.jsx"

export const router = createBrowserRouter([
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { index: true, element: <Navigate to="login" replace /> },
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "signup/success", element: <SignupSuccessPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/",
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "profile/edit", element: <ProfileEditPage /> },
          {
          path: "inquiry",
            element: <MyInquiriesPage />,
          },
          {
            path: "inquiry/new",
            element: <NewInquiryPage />,
          },
          {
            path: "admin",
            element: <AdminRoute />,
            children: [{ index: true, element: <UserManagementPage /> }],
          },
        ],
      },
    ],
  },
  { path: "/login", element: <Navigate to="/auth/login" replace /> },
  { path: "/signup", element: <Navigate to="/auth/signup" replace /> },
  { path: "*", element: <NotFoundPage /> },
])
