import { useState } from "react";
import "../admin-inquiry.css";

//이 컴포넌트는 부모(InquiryManagementPage)에서 key={inquiry.inquiry_id}를 붙여서 사용된다
//React는 key가 바뀌면 그 컴포넌트를 "재사용"하지 않고 통째로 새로 만든다
//그 덕분에 관리자가 왼쪽 목록에서 다른 문의를 클릭할 때마다
//answerText가 항상 그 문의에 맞는 값(기존 답변 or 빈칸)으로 자동으로 새로 시작한다
export default function InquiryReplyForm({ inquiry, onSubmit, submitError, isSubmitting }) {
  //이미 등록된 답변이 있으면(수정하는 경우) 그 내용을 기본값으로 넣어준다
  const [answerText, setAnswerText] = useState(inquiry.answer_content ?? "");

  function handleSubmit(event) {
    event.preventDefault();
    //실제 서버 요청은 부모가 하고, 이 컴포넌트는 입력된 텍스트만 부모에게 넘긴다
    onSubmit(answerText);
  }

  return (
    <form className="admin-answer-form" onSubmit={handleSubmit}>
      <label htmlFor="answer" className="admin-inquiry-detail__label">
        답변 작성하기
      </label>
      <textarea
        id="answer"
        rows={8}
        value={answerText}
        onChange={(e) => setAnswerText(e.target.value)}
        placeholder="문의하신 내용에 대한 답변을 작성해 주세요."
      />

      {/* 답변 등록 실패 상태 (재시도는 버튼을 다시 누르면 됨) */}
      {submitError && <p className="admin-answer-form__error">{submitError}</p>}

      <div className="admin-answer-form__actions">
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "등록 중..." : "답변 등록 완료"}
        </button>
      </div>
    </form>
  );
}