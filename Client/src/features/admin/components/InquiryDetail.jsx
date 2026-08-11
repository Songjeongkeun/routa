import "../admin-inquiry.css";

//ISO 날짜 문자열을 "2026.10.12 · 14:32" 형태로 바꿔주는 함수.
//이 컴포넌트 파일 안에서만 쓰기 때문에 컴포넌트 밖, 파일 위쪽에 뒀음
function formatDateTime(isoString) {
  const date = new Date(isoString);
  const datePart = date.toLocaleDateString("ko-KR").replaceAll(". ", ".").replace(/\.$/, "");
  const timePart = date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${datePart} · ${timePart}`;
}

//inquiry 객체 하나를 받아서 화면에 그리기만 하는 표시 전용 컴포넌트
//답변 작성 부분은 별도의 InquiryReplyForm 컴포넌트가 담당한다(역할 분리)
export default function InquiryDetail({ inquiry }) {
  return (
    <>
      <div className="admin-inquiry-detail__profile">
        <div className="admin-inquiry-detail__avatar">
          {/* 이름의 첫 글자만 꺼내서 아바타 안에 표시.
              ?. 와 ??를 같이 써서 이름이 없어도 에러 없이 "?"가 나오도록 방어한다. */}
          {inquiry.requester_name?.charAt(0) ?? "?"}
        </div>
        <div>
          <div className="admin-inquiry-detail__name">{inquiry.requester_name}</div>
          <div className="admin-inquiry-detail__meta">
            {inquiry.requester_email} · 접수 일시: {formatDateTime(inquiry.created_at)}
          </div>
        </div>
      </div>

      <div className="admin-inquiry-detail__field">
        <span className="admin-inquiry-detail__label">문의 제목</span>
        <p className="admin-inquiry-detail__title">{inquiry.title}</p>
      </div>

      <div className="admin-inquiry-detail__field">
        <span className="admin-inquiry-detail__label">문의 상세 내용</span>
        <p className="admin-inquiry-detail__content">{inquiry.content}</p>
      </div>
    </>
  );
}