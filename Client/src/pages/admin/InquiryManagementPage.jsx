/**
 * 관리자 문의 관리 페이지 - 문의 조회 및 답변하는 페이지
 */

import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "../../shared/api/httpClient.js"; // 실제 경로에 맞게 수정하세요
import "../inquiry/MyInquiriesPage.css"; // .inquiry-badge 등 공통 스타일 재사용
import "./InquiryManagementPage.css";

const STATUS_LABEL = {
  WAITING: "답변 대기",
  ANSWERED: "답변 완료",
};

export default function InquiryManagementPage() {
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
      const query = statusFilter ? `?status=${statusFilter}` : "";
      const result = await apiRequest(`/admin/inquiries${query}`);
      setInquiries(result.data);
    } catch (err) {
      setListError(err);
    } finally {
      setIsListLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadInquiries();
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
    } catch (err) {
      setReplyError("답변 등록에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsReplying(false);
    }
  }

  const hasFilter = Boolean(statusFilter);

  return (
    <div className="admin-inquiry-page">
      {/*  왼쪽: 문의 목록 */}
      <div className="admin-inquiry-list-panel">
        <h1>문의 답변 관리</h1>

        <div className="admin-inquiry-filter">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">전체</option>
            <option value="WAITING">답변 대기</option>
            <option value="ANSWERED">답변 완료</option>
          </select>
        </div>

        {isListLoading && <div className="inquiry-state">불러오는 중...</div>}

        {!isListLoading && listError && (
          <div className="inquiry-state inquiry-state--error">
            <p>목록을 불러오지 못했습니다.</p>
            <button onClick={loadInquiries}>다시 시도</button>
          </div>
        )}

        {!isListLoading && !listError && inquiries.length === 0 && (
          <div className="inquiry-state">
            {hasFilter ? "검색 결과가 없습니다." : "등록된 문의가 없습니다."}
          </div>
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
                  <span className={`inquiry-badge inquiry-badge--${item.status.toLowerCase()}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                  <span className="admin-inquiry-list-item__date">
                    {new Date(item.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>
                <div>{item.title}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*  오른쪽: 상세 + 답변  */}
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
            <span className={`inquiry-badge inquiry-badge--${detail.status.toLowerCase()}`}>
              {STATUS_LABEL[detail.status]}
            </span>
            <h2>{detail.title}</h2>
            <p className="admin-inquiry-detail__content">{detail.content}</p>

            {/* 이미 답변이 있다면: 답변 내용을 보여주고, 폼은 안 보여줌 (MVP 규칙: 재답변 불가) */}
            {detail.status === "ANSWERED" ? (
              <>
                <strong>등록된 답변</strong>
                <div className="admin-inquiry-answer-box">{detail.answer_content}</div>
              </>
            ) : (
              <form className="admin-inquiry-reply-form" onSubmit={handleReplySubmit}>
                <strong>답변 작성</strong>
                <textarea
                  rows={6}
                  value={answerContent}
                  onChange={(e) => setAnswerContent(e.target.value)}
                  placeholder="답변 내용을 입력하세요"
                />
                {replyError && <p className="inquiry-form__error">{replyError}</p>}
                <div className="inquiry-form__actions">
                  <button type="submit" disabled={isReplying}>
                    {isReplying ? "등록 중..." : "답변 등록"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}