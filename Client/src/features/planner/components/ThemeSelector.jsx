/**
 * 변경: 현재 테마 선택 UI는 PlanConditionPage에서 직접 렌더링합니다.
 * 비어 있는 컴포넌트가 사용하지 않는 props·CSS import 때문에 lint를 실패시키지 않도록
 * 호환용 빈 컴포넌트로만 유지합니다.
 */
export default function ThemeSelector() {
  return null
}
