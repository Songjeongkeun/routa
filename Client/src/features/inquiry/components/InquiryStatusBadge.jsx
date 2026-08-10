//status값을 사람이 읽을 한글 라벨을 라벨로 바꿔주는 매핑
const STATUS_LABEL = {
  WAITING: "답변 대기",
  ANSWERED: "답변 완료",
};


//status라는 prop 하나만 받아서 뱃지 하나를 그려주는 아주 작은 컴포넌트
// 목록(InquiryList) 등 여러 곳에서 뱃지 모양을 매번 새로 만들지 않고 이 컴포넌트 하나로 재사용 가능
export default function InquiryStatusBadge({ status }) {
  return (
    // status가 "WAITING"이면 클래스명이 "inquiry-badge inquiry-badge--waiting"이 된다
    // toLowerCase()로 소문자로 바꿔서 CSS 클래스 이름 규칙(소문자-케밥케이스)에 맞춘다
    <span className={`inquiry-badge inquiry-badge--${status.toLowerCase()}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}