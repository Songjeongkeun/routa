import { Navigate, createBrowserRouter } from "react-router-dom"
import AdminRoute from "./AdminRoute.jsx"
import ProtectedRoute from "./ProtectedRoute.jsx"
import AuthLayout from "../../shared/layouts/AuthLayout.jsx"
import AppLayout from "../../shared/layouts/AppLayout.jsx"
import LoginPage from "../../pages/auth/LoginPage.jsx"
import SignupPage from "../../pages/auth/SignupPage.jsx"
import SignupSuccessPage from "../../pages/auth/SignupSuccessPage.jsx"
import HomePage from "../../pages/home/HomePage.jsx"
import PlanConditionPage from "../../pages/planner/PlanConditionPage.jsx"
import PlanMealsPage from "../../pages/planner/PlanMealsPage.jsx"
// Mock 일정 편집 화면. 실제 API가 준비되어도 동일한 경로를 유지합니다.
import CourseResultPage from "../../pages/course/CourseResultPage.jsx"
import UserManagementPage from "../../pages/admin/UserManagementPage.jsx"
import NotFoundPage from "../../pages/NotFoundPage.jsx"

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
    // 나중에 API 직접 열결할 때 지워야 할 부분.
    ...(import.meta.env.DEV
    ? [
      {
        path: "/dev",
        element: <AppLayout />,
        children: [
          {
            path: "course-result",
            element: <CourseResultPage />,
          },
          {
            path: "plan-meals",
            element: <PlanMealsPage />,
          },
        ],
      },
    ]
    : []),
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/",
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "planner/condition", element: <PlanConditionPage /> },
          { path: "planner/meals", element: <PlanMealsPage /> },
          // AppLayout 안에서 공통 Header와 함께 렌더링되는 추천 결과 화면입니다.
          { path: "course/result", element: <CourseResultPage /> },
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
