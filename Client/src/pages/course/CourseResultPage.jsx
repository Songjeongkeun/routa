import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  getItineraries,
  getItinerary,
  saveItinerary,
  updateItineraryNodes,
} from "../../features/course/course.api.js"
import { searchPlaces } from "../../features/place/place.api.js"
import { usePlan } from "../../app/providers/planContext.js"
import KakaoCourseMap from "../../features/course/KakaoCourseMap"
import "./CourseResultPage.css"

const COURSE_EMOJI = {
  SHORTEST_WALK: "🚶",
  FASTEST_TRANSIT: "🕒",
  BALANCED: "🌿",
}

const PLACE_EMOJI = {
  서울역: "🚆",
  경복궁: "🏛️",
  "북촌 한옥마을": "🏘️",
  북촌담: "🍽️",
  "성수 카페거리": "☕",
  한강공원: "🌳",
}

const getPlaceEmoji = (item) =>
  PLACE_EMOJI[item.placeName] || (item.kind === "MEAL" ? "🍽️" : "📍")

function toEditableNodes(items) {
  // 변경: START·END는 사용자가 입력한 좌표를 대신하는 경계 노드라 편집 요청에서 제외합니다.
  return items
    .filter((item) => item.kind === "VISIT" || item.kind === "MEAL")
    .map((item) => ({
      placeId: item.placeId,
      nodeType: item.kind,
      stayMinutes: item.stayMinutes,
    }))
}

function getConstraintMessage(error) {
  const details = Array.isArray(error.conflicts) ? error.conflicts : []
  if (details.length === 0) return error.message || "일정을 다시 계산하지 못했습니다."
  return details.map((conflict) => `• ${conflict.message}`).join("\n")
}

/**
 * 변경: 결과 화면은 Mock 항목을 수정하지 않습니다. 모든 편집은 PUT /itineraries/:id/nodes로 보내고,
 * 서버가 ODsay 이동 시간·운영시간·식사 시간·종료 시간을 통과시킨 최신 itinerary만 화면에 반영합니다.
 */
export default function CourseResultPage() {
  const { plan } = usePlan()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)
  const [courseLoadError, setCourseLoadError] = useState("")
  const [expandedItemId, setExpandedItemId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState("")
  const [saveError, setSaveError] = useState("")
  const [isSavingItinerary, setIsSavingItinerary] = useState(false)
  const [isSaveSuccess, setIsSaveSuccess] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [editError, setEditError] = useState("")
  const [draggingItemId, setDraggingItemId] = useState(null)
  const [drawerKeyword, setDrawerKeyword] = useState("")
  const [drawerPlaces, setDrawerPlaces] = useState([])
  const [isSearchingDrawer, setIsSearchingDrawer] = useState(false)
  const [drawerError, setDrawerError] = useState("")

  const tripPlanId = Number(searchParams.get("tripPlanId") ?? plan.tripPlanId)
  const requestedItineraryId = Number(searchParams.get("itineraryId"))
  const isSavedView = searchParams.get("saved") === "1"

  useEffect(() => {
    let isCancelled = false

    async function loadCourses() {
      try {
        // 변경: 저장 일정 목록에서 들어온 경우에는 해당 SAVED 코스 하나만 스냅샷으로 조회합니다.
        // 현재 PlanProvider 값이 다른 여행 계획이어도 저장 일정 상세를 정상 표시할 수 있습니다.
        if (isSavedView && Number.isSafeInteger(requestedItineraryId) && requestedItineraryId > 0) {
          const { itinerary } = await getItinerary(requestedItineraryId)
          if (isCancelled) return
          setCourses([itinerary])
          setSelectedCourseId(itinerary.itineraryId)
          setCourseLoadError("")
          return
        }

        if (!Number.isSafeInteger(tripPlanId) || tripPlanId <= 0) {
          throw new Error("추천 결과에 필요한 여행 계획 정보를 찾을 수 없습니다.")
        }
        const { itineraries } = await getItineraries(tripPlanId)
        if (itineraries.length === 0) throw new Error("생성된 추천 코스가 없습니다. 다시 추천을 요청해 주세요.")
        const detailedCourses = await Promise.all(
          itineraries.map(({ itineraryId }) => getItinerary(itineraryId).then(({ itinerary }) => itinerary)),
        )
        if (isCancelled) return

        const selectedId = detailedCourses.some((course) => course.itineraryId === requestedItineraryId)
          ? requestedItineraryId
          : detailedCourses[detailedCourses.length - 1].itineraryId
        setCourses(detailedCourses)
        setSelectedCourseId(selectedId)
        setCourseLoadError("")
      } catch (error) {
        if (!isCancelled) {
          setCourses([])
          setCourseLoadError(error.message || "추천 결과를 불러오지 못했습니다.")
        }
      } finally {
        if (!isCancelled) setIsLoadingCourses(false)
      }
    }

    const loadTimer = window.setTimeout(() => {
      setIsLoadingCourses(true)
      loadCourses()
    }, 0)
    return () => {
      isCancelled = true
      window.clearTimeout(loadTimer)
    }
  }, [isSavedView, requestedItineraryId, tripPlanId])

  const activeCourse = courses.find((course) => course.itineraryId === selectedCourseId)
  const travelDate = activeCourse?.travelDate || plan.date
  const startTime = activeCourse?.startTime || plan.startTime
  const endTime = activeCourse?.endTime || plan.endTime
  const selectedPlaceCount = activeCourse?.items.filter((item) => item.kind === "VISIT").length ?? 0

  /**
   * 변경: 화면에서 만든 다음 순서를 낙관적으로 그리지 않습니다.
   * 서버 계산이 성공할 때만 COURSE_NODE의 새 itemId·도착 시각·이동 경로가 포함된 응답으로 교체합니다.
   */
  async function saveEditedNodes(nodes) {
    if (!activeCourse || isRecalculating) return false

    try {
      setIsRecalculating(true)
      setEditError("")
      const { itinerary } = await updateItineraryNodes(activeCourse.itineraryId, nodes)
      setCourses((previousCourses) => previousCourses.map((course) =>
        course.itineraryId === itinerary.itineraryId ? itinerary : course,
      ))
      setExpandedItemId(null)
      return true
    } catch (error) {
      // 변경: 서버가 반환한 휴무·영업 종료·반려동물·종료 시간 사유를 그대로 표시합니다.
      setEditError(getConstraintMessage(error))
      return false
    } finally {
      setIsRecalculating(false)
    }
  }

  function openSaveModal() {
    if (!activeCourse) return
    setSaveTitle(activeCourse.status === "SAVED" ? activeCourse.title : `${travelDate} ${activeCourse.title}`)
    setSaveError("")
    setIsSaveSuccess(activeCourse.status === "SAVED")
    setIsSaveModalOpen(true)
  }

  async function confirmSaveItinerary() {
    if (!activeCourse || isSavingItinerary) return

    try {
      setIsSavingItinerary(true)
      setSaveError("")
      // 변경: 브라우저가 만든 UUID를 서버에도 보내, 더블 클릭·네트워크 재전송에도 같은 일정만 저장하게 합니다.
      const saveRequestId = window.crypto?.randomUUID?.()
      const { itinerary } = await saveItinerary(activeCourse.itineraryId, {
        title: saveTitle,
        saveRequestId,
      })
      setCourses((previousCourses) => previousCourses.map((course) =>
        course.itineraryId === itinerary.itineraryId ? itinerary : course,
      ))
      setSelectedCourseId(itinerary.itineraryId)
      setSearchParams({
        tripPlanId: String(itinerary.tripPlanId),
        itineraryId: String(itinerary.itineraryId),
        saved: "1",
      })
      setIsSaveSuccess(true)
    } catch (error) {
      setSaveError(error.message || "일정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setIsSavingItinerary(false)
    }
  }

  // 변경: 저장 일정 상세에서는 뒤로 가기 대신 목록으로 돌아가야 사용자가 길을 잃지 않습니다.
  function handleConditionAction() {
    navigate(isSavedView ? "/schedules" : "/planner/meals")
  }

  // 변경: HTML5 drag-and-drop이 어려운 모바일·키보드 사용자도 버튼으로 방문 순서를 바꿀 수 있게 합니다.
  function moveItemByOffset(itemId, offset) {
    if (!activeCourse || isRecalculating) return

    const editableItems = activeCourse.items.filter((item) => item.kind === "VISIT" || item.kind === "MEAL")
    const sourceIndex = editableItems.findIndex((item) => item.itemId === itemId)
    const targetIndex = sourceIndex + offset
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= editableItems.length) return

    const reordered = [...editableItems]
    ;[reordered[sourceIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[sourceIndex]]
    saveEditedNodes(toEditableNodes(reordered))
  }

  function changeStayMinutes(itemId, difference) {
    // 변경: 같은 PLACE를 두 번 넣은 일정에서도 클릭한 itemId 하나만 체류시간이 바뀌게 원본 항목에서 수정합니다.
    const nextItems = activeCourse.items.map((item) =>
      item.itemId === itemId
        ? { ...item, stayMinutes: Math.max(30, item.stayMinutes + difference) }
        : item,
    )
    saveEditedNodes(toEditableNodes(nextItems))
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    // 변경: 같은 장소가 여러 방문 항목으로 존재할 수 있으므로 placeId가 아닌 COURSE_NODE itemId로 삭제합니다.
    const nodes = toEditableNodes(activeCourse.items.filter((item) => item.itemId !== deleteTarget.itemId))
    const didSave = await saveEditedNodes(nodes)
    if (didSave) setDeleteTarget(null)
  }

  async function loadDrawerPlaces(keyword = "") {
    try {
      setIsSearchingDrawer(true)
      setDrawerError("")
      // 변경: 장소 추가 Drawer도 실제 PLACE 검색 API를 사용하므로 Mock 후보가 일정에 들어가지 않습니다.
      const { places } = await searchPlaces({
        keyword,
        page: 1,
        pageSize: 12,
        tripType: plan.tripType,
        travelDate: plan.date,
        startLatitude: plan.startLatitude,
        startLongitude: plan.startLongitude,
        startTime: plan.startTime,
        endTime: plan.endTime,
      })
      setDrawerPlaces(places)
    } catch (error) {
      setDrawerPlaces([])
      setDrawerError(error.message || "추가할 장소를 불러오지 못했습니다.")
    } finally {
      setIsSearchingDrawer(false)
    }
  }

  async function openDrawer() {
    setIsDrawerOpen(true)
    await loadDrawerPlaces(drawerKeyword)
  }

  async function addPlace(place) {
    // 변경: 결과 화면에서 새 음식점을 추가해도 식사 시간 창을 임의로 만들지 않습니다.
    // 추가 장소는 일반 방문(VISIT)으로 처리하고, 식사는 식사 계획 화면에서만 설정합니다.
    const nodes = [
      ...toEditableNodes(activeCourse.items),
      {
        placeId: place.placeId,
        nodeType: "VISIT",
        stayMinutes: Math.max(30, Number(place.defaultStayMins) || 90),
      },
    ]
    const didSave = await saveEditedNodes(nodes)
    if (didSave) setIsDrawerOpen(false)
  }

  function moveItem(targetItemId) {
    if (!draggingItemId || draggingItemId === targetItemId || isRecalculating) return

    const editableItems = activeCourse.items.filter((item) => item.kind === "VISIT" || item.kind === "MEAL")
    const sourceIndex = editableItems.findIndex((item) => item.itemId === draggingItemId)
    const targetIndex = editableItems.findIndex((item) => item.itemId === targetItemId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const reordered = [...editableItems]
    const [source] = reordered.splice(sourceIndex, 1)
    reordered.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, source)
    setDraggingItemId(null)
    saveEditedNodes(toEditableNodes(reordered))
  }

  if (isLoadingCourses) {
    return <main className="course-result-page"><section className="course-content course-result-status" aria-live="polite">추천 결과를 불러오는 중입니다.</section></main>
  }
  if (courseLoadError || !activeCourse) {
    return (
      <main className="course-result-page">
        <section className="course-content course-result-status" role="alert">
          <p>{courseLoadError || "선택한 추천 코스를 찾을 수 없습니다."}</p>
          <button className="button button--secondary" onClick={() => window.history.back()}>이전 화면으로 돌아가기</button>
        </section>
      </main>
    )
  }

  return (
    <main className="course-result-page">
      <section className="course-content">
        <div className="course-title-row">
          <div>
            <p className="breadcrumb">🧭 여행 조건 입력 › 추천 경로</p>
            <h1>서울에서 보내는 하루, 이렇게 이동해 보세요</h1>
            <p className="course-subtitle">{travelDate} · {startTime}–{endTime} · 방문 장소 {selectedPlaceCount}곳</p>
          </div>
          <div className="course-title-actions">
            <button className="button button--secondary" onClick={handleConditionAction}>{isSavedView ? "저장 목록" : "조건 수정"}</button>
            <button
              className="button button--primary"
              onClick={activeCourse.status === "SAVED" ? () => navigate("/schedules") : openSaveModal}
            >
              {activeCourse.status === "SAVED" ? "저장 일정 보기" : "일정 저장"}
            </button>
          </div>
        </div>

        <section className="course-options">
          {courses.map((course) => (
            <button
              key={course.itineraryId}
              className={`course-option ${selectedCourseId === course.itineraryId ? "course-option--selected" : ""}`}
              onClick={() => {
                setSelectedCourseId(course.itineraryId)
                setSearchParams({ tripPlanId: String(tripPlanId), itineraryId: String(course.itineraryId) })
                setExpandedItemId(null)
                setEditError("")
              }}
            >
              <span className="course-option__icon" aria-hidden="true">{COURSE_EMOJI[course.courseKind]}</span>
              <span className="course-option__content">
                <span className="course-option__title">{course.title}</span>
                <span className="course-option__description">{course.description}</span>
              </span>
              <span className="course-option__right" aria-hidden="true">
                {selectedCourseId === course.itineraryId && <span className="course-option__selected-label">✓</span>}
                <span className="course-option__arrow">›</span>
              </span>
            </button>
          ))}
        </section>

        <section className="course-main-grid">
          <KakaoCourseMap items={activeCourse.items} legs={activeCourse.legs} />
          <section className="timeline-panel">
            <div className="timeline-panel__header"><p className="timeline-panel__eyebrow">{activeCourse.title}</p></div>
            <div className="timeline-list">
              {activeCourse.items.map((item, index) => {
                const inboundLeg = index === 0 ? null : activeCourse.legs.find((leg) => leg.toItemId === item.itemId)
                const editableItems = activeCourse.items.filter((candidate) => candidate.kind === "VISIT" || candidate.kind === "MEAL")
                const editableIndex = editableItems.findIndex((candidate) => candidate.itemId === item.itemId)
                return (
                  <TimelineItem
                    key={item.itemId}
                    item={item}
                    index={index}
                    inboundLeg={inboundLeg}
                    isExpanded={expandedItemId === item.itemId}
                    onToggle={() => setExpandedItemId((previous) => previous === item.itemId ? null : item.itemId)}
                    onDelete={() => setDeleteTarget(item)}
                    onDecreaseStay={() => changeStayMinutes(item.itemId, -30)}
                    onIncreaseStay={() => changeStayMinutes(item.itemId, 30)}
                    canMoveUp={editableIndex > 0}
                    canMoveDown={editableIndex >= 0 && editableIndex < editableItems.length - 1}
                    onMoveUp={() => moveItemByOffset(item.itemId, -1)}
                    onMoveDown={() => moveItemByOffset(item.itemId, 1)}
                    isRecalculating={isRecalculating}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", String(item.itemId))
                      setDraggingItemId(item.itemId)
                    }}
                    onDrop={() => moveItem(item.itemId)}
                  />
                )
              })}
            </div>
            <button className="timeline-add-button" onClick={openDrawer} disabled={isRecalculating}>＋ 장소 추가</button>
          </section>
        </section>

        <SummaryStats summary={activeCourse.summary} onRecalculate={() => saveEditedNodes(toEditableNodes(activeCourse.items))} />
        {activeCourse.warnings?.length > 0 && <p className="mock-guide">{activeCourse.warnings.join(" ")}</p>}
        {editError && <p className="course-edit-error" role="alert">{editError}</p>}
      </section>

      {isRecalculating && (
        <div className="loading-layer">
          <div className="loading-box"><span className="loading-spinner" /><strong>경로를 다시 계산하고 있어요.</strong><p>운영시간, 식사 시간, 이동시간, 종료시간을 확인하는 중입니다.</p></div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="이 장소를 삭제할까요?"
          description={`“${deleteTarget.placeName}”을 삭제하면 이후 이동 경로와 시간이 서버에서 다시 계산됩니다.`}
          confirmLabel="삭제하기"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {isSaveModalOpen && (
        <div className="modal-backdrop">
          <section className="confirm-modal" aria-modal="true" role="dialog" aria-labelledby="save-itinerary-title">
            {isSaveSuccess ? (
              <>
                <h2 id="save-itinerary-title">일정을 저장했어요</h2>
                <p>저장 일정 목록에서 다시 확인하거나 수정·삭제할 수 있습니다.</p>
                <div className="confirm-modal__actions">
                  <button className="button button--secondary" onClick={() => setIsSaveModalOpen(false)}>계속 보기</button>
                  <button className="button button--primary" onClick={() => navigate("/schedules")}>저장 일정 보기</button>
                </div>
              </>
            ) : (
              <>
                <h2 id="save-itinerary-title">이 일정을 저장할까요?</h2>
                <p>추천을 다시 계산해도 저장한 일정의 시간표와 이동 경로는 보존됩니다.</p>
                <label className="save-itinerary-label" htmlFor="save-itinerary-title-input">일정 제목</label>
                <input
                  id="save-itinerary-title-input"
                  className="save-itinerary-input"
                  value={saveTitle}
                  onChange={(event) => setSaveTitle(event.target.value)}
                  maxLength={50}
                  disabled={isSavingItinerary}
                />
                {saveError && <p className="course-edit-error" role="alert">{saveError}</p>}
                <div className="confirm-modal__actions">
                  <button className="button button--secondary" onClick={() => setIsSaveModalOpen(false)} disabled={isSavingItinerary}>취소</button>
                  <button className="button button--primary" onClick={confirmSaveItinerary} disabled={isSavingItinerary}>
                    {isSavingItinerary ? "저장 중…" : "저장하기"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {isDrawerOpen && (
        <aside className="place-drawer">
          <div className="place-drawer__header">
            <div><p className="breadcrumb">일정 편집</p><h2>장소 추가</h2></div>
            <button className="drawer-close" onClick={() => setIsDrawerOpen(false)}>닫기</button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); loadDrawerPlaces(drawerKeyword.trim()) }}>
            <input
              className="place-search-input"
              value={drawerKeyword}
              onChange={(event) => setDrawerKeyword(event.target.value)}
              placeholder="장소명 또는 지역으로 검색"
            />
          </form>
          {isSearchingDrawer && <p className="course-subtitle">장소를 불러오는 중입니다.</p>}
          {drawerError && <p className="course-edit-error" role="alert">{drawerError}</p>}
          <div className="place-candidate-list">
            {drawerPlaces.map((place) => (
              <article className="place-candidate-card" key={place.placeId}>
                <div>
                  <span className="place-kind">{place.placeCategory}</span>
                  <h3>{place.placeName}</h3>
                  <p>{place.address || "주소 정보 없음"}</p>
                  <small>기본 체류시간 {place.defaultStayMins || 90}분</small>
                </div>
                <button className="button button--primary button--small" onClick={() => addPlace(place)} disabled={isRecalculating}>추가</button>
              </article>
            ))}
            {!isSearchingDrawer && !drawerError && drawerPlaces.length === 0 && <p className="course-subtitle">추가할 장소가 없습니다.</p>}
          </div>
        </aside>
      )}
    </main>
  )
}

function TimelineItem({
  item,
  index,
  inboundLeg,
  isExpanded,
  onToggle,
  onDelete,
  onDecreaseStay,
  onIncreaseStay,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isRecalculating,
  onDragStart,
  onDrop,
}) {
  const canEdit = item.kind !== "START" && item.kind !== "END"

  return (
    <article className="timeline-item" draggable={canEdit} onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <div className="timeline-item__top">
        <time>{item.arrivalTime}</time>
        <div className="timeline-item__body">
          <div className="timeline-item__place">
            <span className="timeline-icon" aria-hidden="true">{getPlaceEmoji(item)}</span>
            <div>
              <strong>{item.placeName}{inboundLeg && <span className="place-chevron">⌄</span>}</strong>
              {item.kind === "MEAL" && (
                <span className="meal-label">
                  🍴 {item.mealSlot === "DINNER" ? "저녁" : "점심"}
                  {item.mealWindow && ` · 권장 ${item.mealWindow}`}
                  {item.mealScheduledTime && ` · 선택 ${item.mealScheduledTime}`}
                  {item.mealTimingStatus && ` · ${item.mealTimingStatus}`}
                  {` · 시작 ${item.arrivalTime} · 체류 ${item.stayMinutes}분`}
                </span>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="timeline-item__actions">
              <span>체류 {item.stayMinutes}분</span>
              <span className="stay-controls">
                <button className="stay-button" disabled={isRecalculating} onClick={onDecreaseStay} aria-label="체류시간 30분 줄이기">−</button>
                <button className="stay-button" disabled={isRecalculating} onClick={onIncreaseStay} aria-label="체류시간 30분 늘리기">+</button>
              </span>
              <span className="order-controls" aria-label="방문 순서 변경">
                <button className="order-button" type="button" disabled={!canMoveUp || isRecalculating} onClick={onMoveUp} aria-label={`${item.placeName} 순서 앞으로`}>↑</button>
                <button className="order-button" type="button" disabled={!canMoveDown || isRecalculating} onClick={onMoveDown} aria-label={`${item.placeName} 순서 뒤로`}>↓</button>
              </span>
              <button className="delete-button" disabled={isRecalculating} onClick={onDelete} aria-label={`${item.placeName} 삭제`}>🗑️</button>
            </div>
          )}
        </div>
        {inboundLeg && <button className="transit-toggle" onClick={onToggle}>{isExpanded ? "이동 상세 닫기 ▲" : "이동 상세 보기 ▼"}</button>}
      </div>
      {isExpanded && inboundLeg && <div className="transit-detail"><strong>이동 약 {inboundLeg.durationMinutes}분</strong><ol>{inboundLeg.steps.map((step) => <li key={step}>{step}</li>)}</ol></div>}
      {index > 0 && <div className="timeline-divider" />}
    </article>
  )
}

function SummaryStats({ summary, onRecalculate }) {
  const hour = Math.floor(summary.totalMinutes / 60)
  const minute = summary.totalMinutes % 60
  return (
    <section className="summary-stats">
      <Stat icon="⏱️" label="총 이동" value={`${hour}시간 ${minute}분`} />
      <Stat icon="🔀" label="환승" value={`${summary.transferCount}회`} />
      <Stat icon="🚌" label="예상 교통비" value={`${summary.estimatedFare.toLocaleString()}원`} />
      <Stat icon="🚶" label="총 도보" value={`${(summary.walkingDistanceMeters / 1000).toFixed(1)}km`} />
      <button className="summary-recalculate" onClick={onRecalculate}>✨ 이 경로 다시 계산</button>
    </section>
  )
}

function Stat({ icon, label, value }) {
  return <div className="summary-stat"><span>{icon} {label}</span><strong>{value}</strong></div>
}

function ConfirmModal({ title, description, confirmLabel, danger = false, onClose, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-modal">
        <h2>{title}</h2><p>{description}</p>
        <div className="confirm-modal__actions">
          <button className="button button--secondary" onClick={onClose}>취소</button>
          <button className={`button ${danger ? "button--danger" : "button--primary"}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
