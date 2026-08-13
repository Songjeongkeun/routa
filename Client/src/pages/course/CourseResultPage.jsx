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

// 변경: 서버가 반환하는 이동 출처를 사용자에게 이해하기 쉬운 이름과 색상용 class로 변환합니다.
// 실제 API 경로와 최후의 추정 경로를 구분해, 사용자가 경로 정보의 정확도를 판단할 수 있게 합니다.
const ROUTE_SOURCE_META = {
  ODSAY: { label: "대중교통", className: "transit" },
  KAKAO_WALK: { label: "실제 도보 경로", className: "walk" },
  WALK_FALLBACK: { label: "도보 추정 경로", className: "estimate" },
  ESTIMATE: { label: "예상 경로", className: "estimate" },
}

// 변경: 구간 안의 각 단계를 도보·버스·지하철로 빠르게 구별할 수 있도록 공통 표시 정보를 둡니다.
const ROUTE_STEP_META = {
  WALK: { icon: "🚶", label: "도보" },
  BUS: { icon: "🚌", label: "버스" },
  SUBWAY: { icon: "🚇", label: "지하철" },
  TRANSIT: { icon: "🚌", label: "대중교통" },
}

const getPlaceEmoji = (item) =>
  PLACE_EMOJI[item.placeName] || (item.kind === "MEAL" ? "🍽️" : "📍")

function formatDistance(distanceMeters = 0) {
  const normalizedDistance = Math.max(0, Number(distanceMeters) || 0)
  if (normalizedDistance < 1000) return `${Math.round(normalizedDistance).toLocaleString()}m`
  return `${(normalizedDistance / 1000).toFixed(1)}km`
}

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
  // 변경: 삭제·추가·일반 재계산 중 어떤 작업인지 로딩 화면에서 정확히 안내하기 위한 상태입니다.
  const [recalculationContext, setRecalculationContext] = useState(null)
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
  async function saveEditedNodes(
    nodes,
    context = {
      type: "RECALCULATE",
      message: "경로를 다시 계산하고 있어요.",
    },
  ) {
    if (!activeCourse || isRecalculating) return false

    try {
      setIsRecalculating(true)
      // 변경: 공통 재계산 API를 그대로 사용하면서 화면 문구만 현재 편집 작업에 맞게 바꿉니다.
      setRecalculationContext(context)
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
      setRecalculationContext(null)
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
    const target = deleteTarget
    // 변경: 같은 장소가 여러 방문 항목으로 존재할 수 있으므로 placeId가 아닌 COURSE_NODE itemId로 삭제합니다.
    const nodes = toEditableNodes(activeCourse.items.filter((item) => item.itemId !== target.itemId))

    // 변경: 삭제 모달과 로딩 레이어가 겹치지 않도록 모달을 먼저 닫고 재계산을 시작합니다.
    // 서버 계산이 실패하면 activeCourse를 교체하지 않으므로 삭제 전 일정은 그대로 유지됩니다.
    setDeleteTarget(null)
    await saveEditedNodes(nodes, {
      type: "DELETE",
      message: `${target.placeName}을 일정에서 삭제하고 있어요.`,
    })
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
        // 변경: 일정 편집 Drawer에서는 식당·편의점 등이 아니라 관광명소·문화시설·카페만 조회합니다.
        // 프론트에서 결과를 자르지 않고 서버 필터를 사용해 페이지 개수와 실제 목록이 일치하게 합니다.
        visitOnly: true,
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
    const didSave = await saveEditedNodes(nodes, {
      type: "ADD",
      message: `${place.placeName}을 추가하고 경로를 다시 계산하고 있어요.`,
    })
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
        <div className="loading-layer" role="status" aria-live="assertive">
          <div className="loading-box">
            <strong>{recalculationContext?.message ?? "경로를 다시 계산하고 있어요."}</strong>
            {/* 변경: 서버가 실제 진행률을 반환하지 않으므로 잘못된 백분율 대신 무한 진행바를 표시합니다. */}
            <div className="route-loading-bar" aria-hidden="true"><span /></div>
            <p>운영시간, 식사 시간, 이동시간, 종료시간을 확인하는 중입니다.</p>
          </div>
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
            <div><p className="breadcrumb">일정 편집</p><h2>관광지·카페 추가</h2></div>
            <button className="drawer-close" onClick={() => setIsDrawerOpen(false)}>닫기</button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); loadDrawerPlaces(drawerKeyword.trim()) }}>
            <input
              className="place-search-input"
              value={drawerKeyword}
              onChange={(event) => setDrawerKeyword(event.target.value)}
              placeholder="관광지·카페 이름 또는 지역으로 검색"
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
            {!isSearchingDrawer && !drawerError && drawerPlaces.length === 0 && <p className="course-subtitle">추가할 관광지나 카페가 없습니다.</p>}
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
        {inboundLeg && (
          <button
            className="transit-toggle"
            type="button"
            aria-expanded={isExpanded}
            onClick={onToggle}
          >
            {isExpanded ? "이동 상세 닫기 ▲" : "이동 상세 보기 ▼"}
          </button>
        )}
      </div>
      {/* 변경: 한 줄 설명 대신 이동 시간·도보·환승·요금과 단계별 경로를 구조화해서 보여 줍니다. */}
      {isExpanded && inboundLeg && <TransitDetail leg={inboundLeg} />}
      {index > 0 && <div className="timeline-divider" />}
    </article>
  )
}

/**
 * 변경: 하나의 장소 사이 이동 구간을 요약 수치와 세부 단계로 나눠 표시합니다.
 * saved_snapshot_json에 문자열 step만 남아 있는 과거 저장 일정도 함께 열 수 있도록
 * TransitStep에서 문자열과 최신 객체 형식을 모두 지원합니다.
 */
function TransitDetail({ leg }) {
  const sourceMeta = ROUTE_SOURCE_META[leg.source] ?? ROUTE_SOURCE_META.ESTIMATE
  const steps = Array.isArray(leg.steps) ? leg.steps : []
  const hasScheduleTimes = leg.departureTime && leg.nextScheduleTime

  return (
    <section className="transit-detail" aria-label="이동 경로 상세">
      <div className="transit-detail__header">
        <div className="transit-detail__heading">
          <span className={`route-source route-source--${sourceMeta.className}`}>{sourceMeta.label}</span>
          <strong>
            {hasScheduleTimes
              ? `${leg.departureTime} 출발 · ${leg.nextScheduleTime} 다음 일정 시작`
              : "이동 구간 상세"}
          </strong>
        </div>
        <strong className="transit-detail__duration">약 {Number(leg.durationMinutes) || 0}분</strong>
      </div>

      <div className="transit-detail__metrics">
        <RouteMetric label="도보" value={formatDistance(leg.walkingDistanceMeters)} />
        <RouteMetric label="환승" value={`${Number(leg.transferCount) || 0}회`} />
        <RouteMetric label="예상 요금" value={`${(Number(leg.estimatedFare) || 0).toLocaleString()}원`} />
      </div>

      {/* 변경: 직선거리 기반 최후 대체 경로는 실제 보행로와 혼동하지 않도록 정확도 안내를 표시합니다. */}
      {leg.source === "WALK_FALLBACK" && (
        <p className="route-warning">실제 도보 경로를 불러오지 못해 직선거리를 기준으로 추정한 정보입니다.</p>
      )}

      {steps.length > 0 ? (
        <ol className="transit-step-list">
          {steps.map((step, index) => (
            <TransitStep
              // 변경: 설명 문구 대신 구간 ID와 순서를 사용해 같은 도보 문장이 반복될 때의 React key 경고를 막습니다.
              key={typeof step === "object" && step?.stepId
                ? step.stepId
                : `${leg.fromItemId}-${leg.toItemId}-${index}`}
              step={step}
            />
          ))}
        </ol>
      ) : (
        <p className="transit-detail__empty">단계별 이동 정보가 없는 이전 경로입니다.</p>
      )}
    </section>
  )
}

function RouteMetric({ label, value }) {
  return (
    <div className="route-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function TransitStep({ step }) {
  // 변경: 상세 필드가 저장되기 전에 생성된 일정은 문자열 설명만 있으므로 그대로 안전하게 표시합니다.
  if (typeof step === "string") {
    return (
      <li className="transit-step transit-step--legacy">
        <span className="transit-step__icon" aria-hidden="true">•</span>
        <p className="transit-step__legacy-description">{step}</p>
      </li>
    )
  }

  const stepType = String(step?.type ?? "TRANSIT").toUpperCase()
  const stepMeta = ROUTE_STEP_META[stepType] ?? ROUTE_STEP_META.TRANSIT
  const durationMinutes = Math.max(0, Number(step?.durationMinutes) || 0)
  const distanceMeters = Math.max(0, Number(step?.distanceMeters) || 0)
  const routeNames = Array.isArray(step?.routeNames)
    ? step.routeNames.map((name) => String(name).trim()).filter(Boolean)
    : []

  return (
    <li className={`transit-step transit-step--${stepType.toLowerCase()}`}>
      <span className="transit-step__icon" aria-hidden="true">{stepMeta.icon}</span>
      <div className="transit-step__content">
        <strong>{stepMeta.label}</strong>
        {/* 변경: ODsay 버스 번호·지하철 노선명을 설명 속 문장에 묻지 않고 별도 배지로 강조합니다. */}
        {routeNames.length > 0 && (
          <div className="transit-step__routes" aria-label={`${stepMeta.label} 노선`}>
            {routeNames.map((routeName, index) => (
              <span
                className={`route-name-badge route-name-badge--${stepType.toLowerCase()}`}
                key={`${routeName}-${index}`}
              >
                {routeName}
              </span>
            ))}
          </div>
        )}
        <p>{step?.description || "이동 정보 없음"}</p>
        {(durationMinutes > 0 || distanceMeters > 0) && (
          <div className="transit-step__meta">
            {durationMinutes > 0 && <span>{durationMinutes}분</span>}
            {distanceMeters > 0 && <span>{formatDistance(distanceMeters)}</span>}
          </div>
        )}
      </div>
    </li>
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
