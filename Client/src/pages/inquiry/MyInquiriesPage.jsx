import { Link } from "react-router-dom"
import "./MyInquiriesPage.css"

/**
 * 변경: 문의 API가 아직 서버에 연결되지 않은 상태에서 가짜 건수·검색·작성 버튼을 보여 주지 않습니다.
 * 사용자가 실제로 저장되었다고 오해하지 않도록 준비 상태와 다음 행동만 명확히 안내합니다.
 */
export default function MyInquiriesPage() {
  return (
    <main className="inquiry-page">
      <header className="inquiry-page__header">
        <p>HELP CENTER</p>
        <h1>내 문의</h1>
        <span>문의 내역과 답변을 확인하는 기능을 준비하고 있어요.</span>
      </header>

      <section className="inquiry-empty-state" aria-labelledby="inquiry-preparing-title">
        <span aria-hidden="true">💬</span>
        <h2 id="inquiry-preparing-title">문의 기능 준비 중</h2>
        <p>현재는 저장되지 않는 문의 폼이나 임의의 통계를 표시하지 않습니다.</p>
        <Link to="/">홈으로 돌아가기</Link>
      </section>
    </main>
  )
}
