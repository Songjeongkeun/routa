import { Navigate, createBrowserRouter } from "react-router-dom"
import AdminRoute from "./AdminRoute.jsx"
import ProtectedRoute from "./ProtectedRoute.jsx"
import PlannerStepGuard from "./PlannerStepGuard.jsx"
import AuthLayout from "../../shared/layouts/AuthLayout.jsx"
import AppLayout from "../../shared/layouts/AppLayout.jsx"
import LoginPage from "../../pages/auth/LoginPage.jsx"
import SignupPage from "../../pages/auth/SignupPage.jsx"
import SignupSuccessPage from "../../pages/auth/SignupSuccessPage.jsx"
import HomePage from "../../pages/home/HomePage.jsx"
import PlanConditionPage from "../../pages/planner/PlanConditionPage.jsx"
import PlanPlacesPage from "../../pages/planner/PlanPlacesPage.jsx"
import PlanMealsPage from "../../pages/planner/PlanMealsPage.jsx"
import UserManagementPage from "../../pages/admin/UserManagementPage.jsx"
import NotFoundPage from "../../pages/NotFoundPage.jsx"
import ProfilePage from "../../pages/profile/ProfilePage.jsx"
import ProfileEditPage from "../../pages/profile/ProfileEditPage.jsx"
import InquiryManagementPage from "../../pages/admin/InquiryManagementPage.jsx"
import MyInquiriesPage from "../../pages/inquiry/MyInquiriesPage.jsx"
import NewInquiryPage from "../../pages/inquiry/NewInquiryPage.jsx"
// 변경: Header와 홈에서 이동하는 저장 일정 화면을 실제 라우터에 연결합니다.
import {
  CourseLoadingRoute,
  CourseResultRoute,
  SavedSchedulesRoute,
} from "./LazyRoutePages.jsx"

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
          {
            // 변경: 여행 조건을 완료한 사용자만 장소·식사 단계에 진입할 수 있게 공통 Guard로 묶습니다.
            // URL 직접 입력과 새로고침도 같은 검사를 거치므로 빈 조건으로 API를 호출하지 않습니다.
            element: <PlannerStepGuard />,
            children: [
              { path: "planner/places", element: <PlanPlacesPage /> },
              { path: "planner/meals", element: <PlanMealsPage /> },
            ],
          },
          // 변경: 저장된 여행 계획의 추천 계산이 끝날 때까지 진행 상태를 보여 주는 화면입니다.
          { path: "course/loading", element: <CourseLoadingRoute /> },
          // 변경: 음식점 선택 완료 후 확인할 경로 결과 화면을 라우터에 연결합니다.
          { path: "course/result", element: <CourseResultRoute /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "profile/edit", element: <ProfileEditPage /> },
          // 변경: /schedules는 API 주소가 아닌, 저장 일정 목록을 보여 주는 프론트 화면입니다.
          { path: "schedules", element: <SavedSchedulesRoute /> },
          { path: "inquiry", element: <MyInquiriesPage /> },
          { path: "inquiry/new", element: <NewInquiryPage /> },
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
