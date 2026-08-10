import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../shared/api/httpClient.js";

import generalInquiryIcon from "../../shared/assets/icons/General-Inquiry.png";
import answerCompletedIcon from "../../shared/assets/icons/Answer-completed.png";
import awaitingResponseIcon from "../../shared/assets/icons/Awaiting-response.png";

import "./MyInquiriesPage.css";

const STATUS_LABEL = {
  WAITING: "답변 대기",
  ANSWERED: "답변 완료",
};

export default function MyInquiriesPage() {
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadInquiries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (keyword) query.set("keyword", keyword);
      if (status) query.set("status", status);
      const result = await apiRequest(`/inquiries?${query.toString()}`);
      setInquiries(result.data);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [keyword, status]);

  useEffect(() => {
    loadInquiries();
  }, [loadInquiries]);

  const total = inquiries.length;
  const answeredCount = inquiries.filter((item) => item.status === "ANSWERED").length;
  const waitingCount = inquiries.filter((item) => item.status === "WAITING").length;
  const hasFilter = Boolean(keyword || status);

  return (
    <div className="inquiry-page">
      <h1>내 문의 내역</h1>
      <p>ROUTA에 접수해 주신 소중한 문의 내역을 관리하고 답변을 확인할 수 있습니다.</p>

      <div className="inquiry-stats">
        <div>
            <div className="inquiry-stat__row">
                <span className="inquiry-stat__icon inquiry-stat__icon--total">
                    <img src={generalInquiryIcon} alt="" />
                </span>
                <div>
                    <span className="inquiry-stat__label">전체 문의</span>
                    <strong>{total}건</strong>
                </div>
            </div>
        </div>
        <div>
            <div className="inquiry-stat__row">
                <span className="inquiry-stat__icon inquiry-stat__icon--answered">
                    <img src={answerCompletedIcon} alt="" />
                </span>
                <div>
                    <span className="inquiry-stat__label">답변 완료</span>
                    <strong>{answeredCount}건</strong>
                </div>
            </div>
        </div>
        <div>
            <div className="inquiry-stat__row">
                <span className="inquiry-stat__icon inquiry-stat__icon--waiting">
                    <img src={awaitingResponseIcon} alt="" />
                </span>
                <div>
                    <span className="inquiry-stat__label">답변 대기</span>
                    <strong>{waitingCount}건</strong>
                </div>
            </div>
        </div>
    </div>

      <div className="inquiry-toolbar">
        <input placeholder="문의 제목 또는 키워드 검색" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">전체</option>
          <option value="WAITING">답변 대기</option>
          <option value="ANSWERED">답변 완료</option>
        </select>
        <button onClick={() => navigate("/inquiry/new")}>새 문의 작성</button>
      </div>

      {isLoading && <div className="inquiry-state">불러오는 중</div>}

      {!isLoading && error && (
        <div className="inquiry-state inquiry-state--error">
          <p>문의를 불러오지 못했습니다.</p>
          <button onClick={loadInquiries}>다시 시도</button>
        </div>
      )}

      {!isLoading && !error && inquiries.length === 0 && (
        <div className="inquiry-state">
          {hasFilter ? "검색 결과가 없습니다." : "등록된 문의가 없습니다."}
        </div>
      )}

      {!isLoading && !error && inquiries.length > 0 && (
        <ul className="inquiry-list">
          {inquiries.map((item) => (
            <li key={item.inquiry_id} className="inquiry-item">
              <div className="inquiry-item__header">
                <span className={`inquiry-badge inquiry-badge--${item.status.toLowerCase()}`}>
                  {STATUS_LABEL[item.status]}
                </span>
                <span className="inquiry-item__date">
                  {new Date(item.created_at).toLocaleDateString("ko-KR")}
                </span>
              </div>
              <h3 className="inquiry-item__title">{item.title}</h3>
              <p className="inquiry-item__content">{item.content}</p>

              {item.status === "ANSWERED" && (
                <div className="inquiry-item__answer">
                  <strong>답변</strong>
                  <p>{item.answer_content}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}