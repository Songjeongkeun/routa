import "../admin-inquiry.css";

const STATUS_LABEL = {
  WAITING: "답변 대기",
  ANSWERED: "답변 완료",
};

// selectedId: 지금 오른쪽에 상세가 열려있는 문의의 id (강조 표시용)
// onSelect: 항목을 클릭했을 때 부모에게 "이 id를 선택했어요"라고 알려주는 함수
export default function InquiryAdminList({ inquiries, isLoading, error, onRetry, selectedId, onSelect }) {
  // ---- 로딩 중 ----
  if (isLoading) {
    return <div className="admin-inquiry-state">불러오는 중</div>;
  }

  // ---- 조회 실패 + 재시도 ----
  if (error) {
    return (
      <div className="admin-inquiry-state admin-inquiry-state--error">
        <p>문의 목록을 불러오지 못했습니다.</p>
        <button type="button" onClick={onRetry}>다시 시도</button>
      </div>
    );
  }

  // ---- 빈 목록 ----
  if (inquiries.length === 0) {
    return <div className="admin-inquiry-state">등록된 문의가 없습니다.</div>;
  }

  // ---- 정상 목록 ----
  return (
    <ul className="admin-inquiry-list">
      {inquiries.map((item) => (
        <li
          key={item.inquiry_id}
          //지금 선택된 항목이면 클래스를 하나 더 붙여서 CSS로 강조 표시한다
          className={`admin-inquiry-list__item${
            item.inquiry_id === selectedId ? " admin-inquiry-list__item--active" : ""
          }`}
          onClick={() => onSelect(item.inquiry_id)}
        >
          <div className="admin-inquiry-list__item-top">
            <span className="admin-inquiry-list__name">{item.requester_name}</span>
            <span className="admin-inquiry-list__date">
              {new Date(item.created_at).toLocaleDateString("ko-KR")}
            </span>
            <span className={`admin-inquiry-badge admin-inquiry-badge--${item.status.toLowerCase()}`}>
              {STATUS_LABEL[item.status]}
            </span>
          </div>
          <h3 className="admin-inquiry-list__title">{item.title}</h3>
          <p className="admin-inquiry-list__preview">{item.content}</p>
        </li>
      ))}
    </ul>
  );
}
