import { lazy, Suspense } from "react"

// 변경: Kakao 지도 SDK와 경로 상세 UI는 초기 홈 화면에서 필요하지 않습니다.
// 결과·저장 일정 화면에 실제로 진입할 때만 내려받아 첫 화면 JavaScript 용량을 줄입니다.
const CourseLoadingPage = lazy(() => import("../../pages/course/CourseLoadingPage.jsx"))
const CourseResultPage = lazy(() => import("../../pages/course/CourseResultPage.jsx"))
const SavedSchedulesPage = lazy(() => import("../../pages/schedule/SavedSchedulesPage.jsx"))

/**
 * 변경: React.lazy 컴포넌트는 라우터 설정 파일이 아닌 전용 컴포넌트 파일에서 감쌉니다.
 * router.jsx가 객체만 export하도록 유지해 Vite Fast Refresh 규칙과 지연 로딩을 함께 만족합니다.
 */
function LazyRouteFallback() {
  return <main className="route-page-loading" aria-live="polite">화면을 불러오는 중입니다.</main>
}

export function CourseLoadingRoute() {
  return (
    <Suspense fallback={<LazyRouteFallback />}>
      <CourseLoadingPage />
    </Suspense>
  )
}

export function CourseResultRoute() {
  return (
    <Suspense fallback={<LazyRouteFallback />}>
      <CourseResultPage />
    </Suspense>
  )
}

export function SavedSchedulesRoute() {
  return (
    <Suspense fallback={<LazyRouteFallback />}>
      <SavedSchedulesPage />
    </Suspense>
  )
}
