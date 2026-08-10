import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  deleteSavedItinerary,
  getSavedItineraries,
  updateSavedItineraryTitle,
} from "../../features/schedule/schedule.api.js"
import "./SavedSchedulesPage.css"

const COURSE_TYPE_LABELS = {
  "": "전체 코스",
  SHORTEST_WALK: "최소 도보",
  FASTEST_TRANSIT: "최소 시간",
  BALANCED: "추천 코스",
}

/**
 * 변경: 저장 일정은 추천 결과(DRAFT)와 분리된 SAVED 목록 API로 조회합니다.
 * 검색·필터·삭제 성공 후의 목록과 상단 건수는 이 화면의 단일 상태로 함께 갱신합니다.
 */
export default function SavedSchedulesPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState("")
  const [courseType, setCourseType] = useState("")
  const [travelDate, setTravelDate] = useState("")
  const [page, setPage] = useState(1)
  const [schedules, setSchedules] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  // 변경: 서버에 이미 있는 제목 수정 API를 목록 화면에서도 사용할 수 있게 상태를 연결합니다.
  const [editTarget, setEditTarget] = useState(null)
  const [editTitle, setEditTitle] = useState("")
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false)
  const pageSize = 12

  useEffect(() => {
    let isCancelled = false
    // 변경: 검색어 입력 한 글자마다 서버를 호출하지 않도록 300ms 후 목록을 갱신합니다.
    const loadTimer = window.setTimeout(async () => {
      try {
        setIsLoading(true)
        setError("")
        const result = await getSavedItineraries({ keyword, courseType, travelDate, page, pageSize })
        if (isCancelled) return
        setSchedules(result.itineraries ?? [])
        setTotalCount(result.totalCount ?? 0)
      } catch (requestError) {
        if (!isCancelled) {
          setSchedules([])
          setTotalCount(0)
          setError(requestError.message || "저장 일정을 불러오지 못했습니다.")
        }
      } finally {
        if (!isCancelled) setIsLoading(false)
      }
    }, 300)

    return () => {
      isCancelled = true
      window.clearTimeout(loadTimer)
    }
  }, [courseType, keyword, page, pageSize, travelDate])

  function resetFilters() {
    setKeyword("")
    setCourseType("")
    setTravelDate("")
    setPage(1)
  }

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return

    try {
      setIsDeleting(true)
      await deleteSavedItinerary(deleteTarget.itineraryId)
      // 변경: 서버 삭제 성공 이후에만 카드·건수 상태를 같이 줄입니다.
      setSchedules((previous) => previous.filter((schedule) => schedule.itineraryId !== deleteTarget.itineraryId))
      setTotalCount((previous) => Math.max(0, previous - 1))
      setDeleteTarget(null)
      // 현재 페이지의 마지막 카드만 삭제했다면 이전 페이지를 다시 읽습니다.
      if (schedules.length === 1 && page > 1) setPage((previous) => previous - 1)
    } catch (deleteError) {
      setError(deleteError.message || "일정을 삭제하지 못했습니다.")
      setDeleteTarget(null)
    } finally {
      setIsDeleting(false)
    }
  }

  function openTitleEditor(schedule) {
    setEditTarget(schedule)
    setEditTitle(schedule.title)
    setError("")
  }

  async function confirmTitleUpdate(event) {
    event.preventDefault()
    if (!editTarget || isUpdatingTitle) return

    const title = editTitle.trim()
    if (!title) {
      setError("일정 제목을 입력해 주세요.")
      return
    }

    try {
      setIsUpdatingTitle(true)
      const { itinerary } = await updateSavedItineraryTitle(editTarget.itineraryId, title)
      // 변경: 서버 저장 성공 뒤에만 카드 제목을 바꿔 목록과 상세 제목이 어긋나지 않게 합니다.
      setSchedules((previous) => previous.map((schedule) =>
        schedule.itineraryId === editTarget.itineraryId
          ? { ...schedule, title: itinerary?.title ?? title }
          : schedule,
      ))
      setEditTarget(null)
    } catch (updateError) {
      setError(updateError.message || "일정 제목을 수정하지 못했습니다.")
    } finally {
      setIsUpdatingTitle(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <main className="saved-schedules-page">
      <section className="saved-schedules-content">
        <header className="saved-schedules-header">
          <div>
            <p className="saved-schedules-eyebrow">MY TRAVEL</p>
            <h1>저장한 일정</h1>
            <p>마음에 든 여행 경로를 다시 확인하고 수정하거나 삭제할 수 있어요.</p>
          </div>
          <strong aria-live="polite">총 {totalCount}개</strong>
        </header>

        <section className="saved-schedules-filter" aria-label="저장 일정 검색과 필터">
          <label>
            <span>검색</span>
            <input
              value={keyword}
              onChange={(event) => { setKeyword(event.target.value); setPage(1) }}
              placeholder="일정 제목 또는 장소명"
            />
          </label>
          <label>
            <span>코스</span>
            <select value={courseType} onChange={(event) => { setCourseType(event.target.value); setPage(1) }}>
              {Object.entries(COURSE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>여행 날짜</span>
            <input type="date" value={travelDate} onChange={(event) => { setTravelDate(event.target.value); setPage(1) }} />
          </label>
          <button type="button" className="saved-schedules-reset" onClick={resetFilters}>초기화</button>
        </section>

        {error && <p className="saved-schedules-error" role="alert">{error}</p>}
        {isLoading ? (
          <section className="saved-schedules-state" aria-live="polite">저장 일정을 불러오는 중입니다.</section>
        ) : schedules.length === 0 ? (
          <section className="saved-schedules-state">
            <h2>{keyword || courseType || travelDate ? "검색 조건에 맞는 일정이 없어요" : "아직 저장한 일정이 없어요"}</h2>
            <p>{keyword || courseType || travelDate ? "검색어나 필터를 바꿔 다시 찾아보세요." : "추천 결과에서 마음에 드는 코스를 저장해 보세요."}</p>
            {!(keyword || courseType || travelDate) && <button type="button" onClick={() => navigate("/planner/condition")}>여행 일정 만들기</button>}
          </section>
        ) : (
          <section className="saved-schedule-grid" aria-label="저장 일정 목록">
            {schedules.map((schedule) => (
              <article className="saved-schedule-card" key={schedule.itineraryId}>
                <span className="saved-schedule-card__badge">{COURSE_TYPE_LABELS[schedule.courseKind]}</span>
                <div className="saved-schedule-card__title-row">
                  <h2>{schedule.title}</h2>
                  <button type="button" className="saved-schedule-card__edit" onClick={() => openTitleEditor(schedule)}>제목 수정</button>
                </div>
                <p>{schedule.travelDate} · {schedule.startTime}–{schedule.endTime}</p>
                <dl>
                  <div><dt>이동</dt><dd>{Math.floor(schedule.summary.totalMinutes / 60)}시간 {schedule.summary.totalMinutes % 60}분</dd></div>
                  <div><dt>도보</dt><dd>{(schedule.summary.walkingDistanceMeters / 1000).toFixed(1)}km</dd></div>
                  <div><dt>환승</dt><dd>{schedule.summary.transferCount}회</dd></div>
                </dl>
                <div className="saved-schedule-card__actions">
                  <button type="button" onClick={() => navigate(`/course/result?tripPlanId=${schedule.tripPlanId}&itineraryId=${schedule.itineraryId}&saved=1`)}>상세 보기</button>
                  <button type="button" className="saved-schedule-card__delete" onClick={() => setDeleteTarget(schedule)}>삭제</button>
                </div>
              </article>
            ))}
          </section>
        )}

        {totalCount > pageSize && (
          <nav className="saved-schedules-pagination" aria-label="저장 일정 페이지">
            <button type="button" disabled={page <= 1} onClick={() => setPage((previous) => previous - 1)}>이전</button>
            <span>{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((previous) => previous + 1)}>다음</button>
          </nav>
        )}
      </section>

      {editTarget && (
        <div className="saved-schedule-modal-backdrop">
          <section className="saved-schedule-title-modal" role="dialog" aria-modal="true" aria-labelledby="edit-schedule-title">
            <h2 id="edit-schedule-title">일정 제목 수정</h2>
            <form onSubmit={confirmTitleUpdate}>
              <label htmlFor="saved-schedule-title-input">일정 제목</label>
              <input
                id="saved-schedule-title-input"
                value={editTitle}
                maxLength={50}
                onChange={(event) => setEditTitle(event.target.value)}
                disabled={isUpdatingTitle}
                autoFocus
              />
              <div>
                <button type="button" disabled={isUpdatingTitle} onClick={() => setEditTarget(null)}>취소</button>
                <button type="submit" disabled={isUpdatingTitle}>{isUpdatingTitle ? "수정 중…" : "수정하기"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="saved-schedule-modal-backdrop">
          <section className="saved-schedule-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-schedule-title">
            <h2 id="delete-schedule-title">저장 일정을 삭제할까요?</h2>
            <p>“{deleteTarget.title}”은(는) 삭제 후 복구할 수 없습니다.</p>
            <div>
              <button type="button" disabled={isDeleting} onClick={() => setDeleteTarget(null)}>취소</button>
              <button type="button" disabled={isDeleting} onClick={confirmDelete}>{isDeleting ? "삭제 중…" : "삭제하기"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
