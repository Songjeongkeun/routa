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
import PlanPlacesPage from "../../pages/planner/PlanPlacesPage.jsx"
import PlanMealsPage from "../../pages/planner/PlanMealsPage.jsx"
import CourseLoadingPage from "../../pages/course/CourseLoadingPage.jsx"
import CourseResultPage from "../../pages/course/CourseResultPage.jsx"
import UserManagementPage from "../../pages/admin/UserManagementPage.jsx"
import NotFoundPage from "../../pages/NotFoundPage.jsx"
import ProfilePage from "../../pages/profile/ProfilePage.jsx"
import ProfileEditPage from "../../pages/profile/ProfileEditPage.jsx"
import InquiryManagementPage from "../../pages/admin/InquiryManagementPage.jsx"

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
          { path: "planner/condition", element: <PlanConditionPage /> },
          { path: "planner/places", element: <PlanPlacesPage /> },
          // 변경: 장소 선택 후 음식점 선택 단계로 이동할 수 있도록 경로를 등록합니다.
          { path: "planner/meals", element: <PlanMealsPage /> },
          // 변경: 저장된 여행 계획의 추천 계산이 끝날 때까지 진행 상태를 보여 주는 화면입니다.
          { path: "course/loading", element: <CourseLoadingPage /> },
          // 변경: 음식점 선택 완료 후 확인할 경로 결과 화면을 라우터에 연결합니다.
          { path: "course/result", element: <CourseResultPage /> },
          { path: "admin",
            element: <AdminRoute />,
            children: [
              { index: true, element: <UserManagementPage /> },
              { path: "inquiries", element: <InquiryManagementPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "/login", element: <Navigate to="/auth/login" replace /> },
  { path: "/signup", element: <Navigate to="/auth/signup" replace /> },
  { path: "*", element: <NotFoundPage /> },
])
