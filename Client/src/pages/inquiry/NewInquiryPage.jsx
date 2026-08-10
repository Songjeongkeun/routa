import { Link } from "react-router-dom"
import "./MyInquiriesPage.css"

// 변경: 아직 저장 API가 없는 문의 작성 경로도 빈 폼을 제공하지 않고 동일한 준비 상태를 보여 줍니다.
export default function NewInquiryPage() {
  return (
    <main className="inquiry-page">
      <section className="inquiry-empty-state" aria-labelledby="new-inquiry-preparing-title">
        <span aria-hidden="true">✍️</span>
        <h1 id="new-inquiry-preparing-title">문의 작성 기능 준비 중</h1>
        <p>작성한 내용이 사라지는 임시 폼은 제공하지 않습니다.</p>
        <Link to="/inquiries">내 문의로 돌아가기</Link>
      </section>
    </main>
  )
}
