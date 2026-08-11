import { useEffect, useState, useCallback, useRef } from "react";
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
  // 변경: 통계는 검색·상태 필터와 독립된 전체 문의 기준으로 API에서 받습니다.
  // 그래서 "답변 대기"만 필터링해도 상단의 전체 문의 건수가 줄어들지 않습니다.
  const [summary, setSummary] = useState({ totalCount: 0, answeredCount: 0, waitingCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestSequence = useRef(0);

  const loadInquiries = useCallback(async () => {
    // 변경: 이전 검색 요청이 늦게 도착해 최신 검색 결과를 덮어쓰지 않게 요청 순서를 관리합니다.
    const currentRequest = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (keyword) query.set("keyword", keyword);
      if (status) query.set("status", status);
      const queryString = query.toString();
      const result = await apiRequest(`/inquiries${queryString ? `?${queryString}` : ""}`);
      if (currentRequest !== requestSequence.current) return;
      setInquiries(result.data);
    } catch (err) {
      if (currentRequest === requestSequence.current) setError(err);
    } finally {
      if (currentRequest === requestSequence.current) setIsLoading(false);
    }
  }, [keyword, status]);

  useEffect(() => {
    // 변경: 검색어를 입력할 때마다 요청하지 않고 300ms 동안 입력이 멈췄을 때만 목록을 조회합니다.
    const timer = window.setTimeout(loadInquiries, 300);
    return () => window.clearTimeout(timer);
  }, [loadInquiries]);

  const loadSummary = useCallback(async () => {
    try {
      const result = await apiRequest("/inquiries/summary");
      setSummary(result.data);
    } catch {
      // 목록은 계속 사용할 수 있으므로 통계 조회 실패만으로 전체 화면을 오류 처리하지 않습니다.
      setSummary({ totalCount: 0, answeredCount: 0, waitingCount: 0 });
    }
  }, []);

  useEffect(() => {
    // 변경: effect 본문에서 동기적으로 상태를 바꾸지 않고, 다음 이벤트 루프에서 전체 통계를 조회합니다.
    const timer = window.setTimeout(() => {
      void loadSummary();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSummary]);

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
                    <strong>{summary.totalCount}건</strong>
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
                    <strong>{summary.answeredCount}건</strong>
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
                    <strong>{summary.waitingCount}건</strong>
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
