/**
 * 사용자가 자신의 문의 목록을 보는 페이지
 */
import { Link } from "react-router-dom"
import"./MyInquiriesPage.css"

function MyInquiriesPage(){
    return(
        <div className="inquiry-page">
            <h1 className="page-title">내 문의 내역</h1>
            <p className="page-description">ROUTA에 접수한 문의를 관리하고 답변을 확인할 수 있습니다</p>
            <div className="stats-container">
                <InquiryStats title="전체 문의" count={6} color="#222"/>
                <InquiryStats title="답변 완료" count={4} color="#00b97a"/>
                <InquiryStats title="답변 대기" count={4} color="#d18c00"/>
            </div>
            <div className="top-action">
                <input

                className="search-input"

                type="text"

                placeholder="문의 제목 또는 키워드 검색"

                />
                <Link
                    className="new-button"
                    to="/inquiry/new"
                >
                    새 문의 작성
                </Link>
                
                <button className="new-button">
                    
                </button>
            </div>
        </div>
    );
}
export default MyInquiriesPage;