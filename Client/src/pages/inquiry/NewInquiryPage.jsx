import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../shared/api/httpClient.js";
import "./MyInquiriesPage.css";

const TITLE_MAX_LENGTH = 50;

const CONTENT_PLACEHOLDER = `문의하실 내용을 상세히 적어주시면 더 신속하고 정확한 답변을 드릴 수 있습니다.

- 문의 주실 일정이나 장소 정보가 있다면 함께 적어주세요.
- 구체적인 오류 상황이나 요청 내용이 있다면 작성 부탁드립니다.`;

export default function NewInquiryPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  function validate() {
    const nextErrors = {};
    if (!title.trim()) {
      nextErrors.title = "제목을 입력해 주세요";
    } else if (title.length > TITLE_MAX_LENGTH) {
      nextErrors.title = `제목은 최대 ${TITLE_MAX_LENGTH}자까지 입력할 수 있습니다.`;
    }
    if (!content.trim()) {
      nextErrors.content = "내용을 입력해 주세요.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await apiRequest("/inquiries", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      navigate("/inquiry");
    } catch (err) {
      setSubmitError("문의 등록에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="inquiry-page">
      <div className="new-inquiry-header">
        <h1>새 문의 작성</h1>
        <p>궁금한 점이나 불편한 사항을 문의해 주세요. 최대한 빠르게 답변드리겠습니다.</p>
      </div>
      {submitError && <p className="inquiry-form__error">{submitError}</p>}
      <form onSubmit={handleSubmit}>
        <div className="inquiry-form__field">
          <label htmlFor="title">제목</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX_LENGTH}
            placeholder={`문의 제목을 입력해 주세요 (최대 ${TITLE_MAX_LENGTH}자)`}
          />
          {fieldErrors.title && <p className="inquiry-form__error">{fieldErrors.title}</p>}
        </div>

        <div className="inquiry-form__field">
          <label htmlFor="content">문의 내용</label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder={CONTENT_PLACEHOLDER}
          />
          {fieldErrors.content && <p className="inquiry-form__error">{fieldErrors.content}</p>}
        </div>

        <div className="inquiry-form__actions">
          <button type="button" onClick={() => navigate("/inquiry")} disabled={isSubmitting}>
            취소
          </button>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "등록 중..." : "문의 등록"}
          </button>
        </div>
      </form>

      <div className="inquiry-notice">
        <span className="inquiry-notice__icon">ⓘ</span>
        <span>
          접수해 주신 문의는 '마이페이지 &gt; 내 문의 내역'에서 상태를 확인하실 수 있으며,
          평균 24시간 이내에 답변을 완료해 드립니다.
        </span>
      </div>
    </div>
  );
}