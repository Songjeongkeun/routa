/**
 * 관리자 문의 관리 페이지 - 문의 조회 및 답변하는 페이지
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../shared/api/httpClient.js"; // 실제 경로에 맞게 수정하세요
import { API_URL } from "../../shared/api/httpClient.js";
import defaultAvatar from "../../shared/assets/icons/default-avatar.png";
import "../inquiry/MyInquiriesPage.css"; // .inquiry-badge 등 공통 스타일 재사용
import "./InquiryManagementPage.css";

const STATUS_LABEL = {
  WAITING: "답변 대기",
  ANSWERED: "답변 완료",
};

export default function InquiryManagementPage() {
  const navigate = useNavigate();
  //목록 관련 상태 
  const [inquiries, setInquiries] = useState([]);
  const [statusFilter, setStatusFilter] = useState(""); // "" | "WAITING" | "ANSWERED"
  const [isListLoading, setIsListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  //선택된 문의(상세) 관련 상태 
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // 답변 입력 관련 상태 
  const [answerContent, setAnswerContent] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [replyError, setReplyError] = useState(null);

 
  // 1.관리자용 전체 문의 목록 불러오기
  const loadInquiries = useCallback(async () => {
    setIsListLoading(true);
    setListError(null);
    try {
      // 변경: 상태 필터를 실제 관리자 API 쿼리로 전달합니다.
      // 선택값이 없을 때는 ?status=를 보내지 않아 전체 목록을 받습니다.
      const result = await apiRequest(`/admin/inquiries${statusFilter ? `?status=${statusFilter}` : ""}`);
      setInquiries(result.data);
    } catch (err) {
      setListError(err);
    } finally {
      setIsListLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    // 변경: effect 본문에서 즉시 상태를 바꾸지 않고 다음 이벤트 루프에서 목록을 조회합니다.
    // React의 effect 규칙을 지키면서 statusFilter 변경 시에도 같은 로딩 함수를 재사용합니다.
    const timer = window.setTimeout(() => {
      void loadInquiries();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInquiries]);


  // 2.문의 하나를 클릭했을 때: 상세 불러오기=
  const loadDetail = useCallback(async (inquiryId) => {
    setSelectedId(inquiryId);
    setIsDetailLoading(true);
    setDetailError(null);
    setAnswerContent("");
    setReplyError(null);
    try {
      const result = await apiRequest(`/admin/inquiries/${inquiryId}`);
      setDetail(result.data);
    } catch (err) {
      setDetailError(err);
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  
  // 3.답변 등록
  async function handleReplySubmit(event) {
    event.preventDefault();
    if (!answerContent.trim()) {
      setReplyError("답변 내용을 입력해 주세요.");
      return;
    }
    setIsReplying(true);
    setReplyError(null);
    try {
      await apiRequest(`/admin/inquiries/${selectedId}/reply`, {
        method: "POST",
        body: JSON.stringify({ answerContent: answerContent.trim() }),
      });
      await loadDetail(selectedId);
      await loadInquiries();
    } catch {
      setReplyError("답변 등록에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsReplying(false);
    }
  }

  const total = inquiries.length;
  const waitingCount = inquiries.filter((item) => item.status === "WAITING").length;

  function handleStatusFilterChange(event) {
    // 변경: 다른 상태 목록으로 전환하면 이전 목록의 상세 패널을 비워,
    // 필터에 없는 문의를 계속 답변하는 혼란을 막습니다.
    setStatusFilter(event.target.value);
    setSelectedId(null);
    setDetail(null);
  }


  return (
    <div className="admin-inquiry-page">
      <div className="admin-inquiry-topbar">
        <div>
          <h1>문의 답변 관리</h1>
          <p>사용자의 소중한 피드백과 문의에 신속하게 답변해 주세요.</p>
        </div>
        <button className="admin-inquiry-back-btn" onClick={() => navigate("/admin")}>
          ← 유저 관리로 돌아가기
        </button>
      </div>

      <div className="admin-inquiry-body">
        {/* 왼쪽: 목록 */}
        <div className="admin-inquiry-list-panel">
          <div className="admin-inquiry-list-header">
            <h2>전체 문의 목록</h2>
            <span className="admin-inquiry-list-summary">
              미답변 {waitingCount}건 / 표시 {total}건
            </span>
          </div>
          {/* 변경: 선언만 되어 있던 statusFilter를 목록 API와 연결해 관리자가 답변 상태별로 볼 수 있게 합니다. */}
          <label className="admin-inquiry-status-filter">
            <span className="sr-only">문의 상태 필터</span>
            <select value={statusFilter} onChange={handleStatusFilterChange}>
              <option value="">전체 상태</option>
              <option value="WAITING">답변 대기</option>
              <option value="ANSWERED">답변 완료</option>
            </select>
          </label>

        {isListLoading && <div className="inquiry-state">불러오는 중...</div>}

          {!isListLoading && listError && (
            <div className="inquiry-state inquiry-state--error">
              <p>목록을 불러오지 못했습니다.</p>
              <button onClick={loadInquiries}>다시 시도</button>
            </div>
          )}

          {!isListLoading && !listError && inquiries.length === 0 && (
            <div className="inquiry-state">등록된 문의가 없습니다.</div>
          )}

          {!isListLoading && !listError && inquiries.length > 0 && (
            <ul className="admin-inquiry-list">
              {inquiries.map((item) => (
                <li
                  key={item.inquiry_id}
                  className={
                    "admin-inquiry-list-item" +
                    (item.inquiry_id === selectedId ? " admin-inquiry-list-item--active" : "")
                  }
                  onClick={() => loadDetail(item.inquiry_id)}
                >
                  <div className="admin-inquiry-list-item__header">
                    <span className="admin-inquiry-list-item__requester">
                      {item.requester_name}
                      <span className="admin-inquiry-list-item__date">
                        {new Date(item.created_at).toLocaleDateString("ko-KR")}
                      </span>
                    </span>
                    <span className={`inquiry-badge inquiry-badge--${item.status.toLowerCase()}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <div className="admin-inquiry-list-item__title">{item.title}</div>
                  <p className="admin-inquiry-list-item__preview">{item.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 오른쪽: 상세 + 답변 */}
        <div className="admin-inquiry-detail-panel">
          {!selectedId && <div className="inquiry-state">왼쪽 목록에서 문의를 선택해 주세요.</div>}

          {selectedId && isDetailLoading && <div className="inquiry-state">불러오는 중...</div>}

          {selectedId && !isDetailLoading && detailError && (
            <div className="inquiry-state inquiry-state--error">
              <p>상세 정보를 불러오지 못했습니다.</p>
              <button onClick={() => loadDetail(selectedId)}>다시 시도</button>
            </div>
          )}
          {selectedId && !isDetailLoading && !detailError && detail && (
            <>
              <div className="admin-inquiry-requester-row">
                <img
                  className="admin-inquiry-avatar"
                  src={detail.requester_profile_image_url ? `${API_URL}${detail.requester_profile_image_url}` : defaultAvatar}
                  alt=""
                />
                <div>
                  <div className="admin-inquiry-requester-name">{detail.requester_name}</div>
                  <div className="admin-inquiry-requester-meta">
                    {detail.requester_email} · 접수 일시: {new Date(detail.created_at).toLocaleString("ko-KR")}
                  </div>
                </div>
              </div>

              <span className="admin-inquiry-section-label">문의 제목</span>
              <h2 className="admin-inquiry-title">{detail.title}</h2>

              <span className="admin-inquiry-section-label">문의 상세 내용</span>
              <p className="admin-inquiry-detail__content">{detail.content}</p>

              <hr className="admin-inquiry-divider" />

              {detail.status === "ANSWERED" ? (
                <>
                  <span className="admin-inquiry-section-label">등록된 답변</span>
                  <div className="admin-inquiry-answer-box">{detail.answer_content}</div>
                </>
              ) : (
                <form className="admin-inquiry-reply-form" onSubmit={handleReplySubmit}>
                  <span className="admin-inquiry-section-label">답변 작성하기</span>
                  <textarea
                    rows={7}
                    value={answerContent}
                    onChange={(e) => setAnswerContent(e.target.value)}
                    placeholder="답변 내용을 입력하세요"
                  />
                  {replyError && <p className="inquiry-form__error">{replyError}</p>}
                  <div className="admin-inquiry-reply-form__actions">
                    <button type="submit" disabled={isReplying}>
                      {isReplying ? "등록 중..." : "답변 등록 완료"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
