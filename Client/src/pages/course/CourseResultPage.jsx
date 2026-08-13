import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  getItineraries,
  getItinerary,
  saveItinerary,
  updateItineraryNodes,
} from "../../features/course/course.api.js"
import { searchPlaces } from "../../features/place/place.api.js"
import { usePlan } from "../../app/providers/planContext.js"
import KakaoCourseMap from "../../features/course/KakaoCourseMap"
import RouteCalculationLoader from "../../features/course/components/RouteCalculationLoader.jsx"
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

/**
 * 변경: 자동 최적화는 관광지 순서를 바꿀 수 있으므로, 최신 상세가 요청한 장소 집합과 실제 시간을 모두 포함하는지 확인합니다.
 * 이전 캐시·불완전 응답을 화면에 적용하면 새 장소가 계속 "재계산 후"로 남을 수 있으므로 이를 먼저 차단합니다.
 */
function hasRecalculatedSchedule(itinerary, requestedNodes) {
  const calculatedItems = Array.isArray(itinerary?.items)
    ? itinerary.items.filter((item) => item.kind === "VISIT" || item.kind === "MEAL")
    : []
  const createNodeKey = ({ placeId, nodeType, kind, stayMinutes }) => (
    `${kind ?? nodeType}:${Number(placeId)}:${Math.round(Number(stayMinutes) || 0)}`
  )
  const requestedNodeKeys = requestedNodes.map(createNodeKey).sort()
  const calculatedNodeKeys = calculatedItems.map(createNodeKey).sort()

  return calculatedItems.length === requestedNodes.length
    && calculatedItems.every((item) => (
      /^\d{2}:\d{2}$/.test(String(item.arrivalTime ?? ""))
      && /^\d{2}:\d{2}$/.test(String(item.departureTime ?? ""))
    ))
    && calculatedNodeKeys.every((nodeKey, index) => nodeKey === requestedNodeKeys[index])
}

function getConstraintMessage(error) {
  const details = Array.isArray(error.conflicts) ? error.conflicts : []
  if (details.length === 0) return error.message || "일정을 다시 계산하지 못했습니다."
  return details.map((conflict) => `• ${conflict.message}`).join("\n")
}

/**
 * 변경: 결과 화면의 장소 편집은 우선 브라우저의 임시 편집 목록에만 반영합니다.
 * 삭제할 때마다 길찾기 API를 호출하면 장소가 서버 제약에서 탈락할 경우 삭제 자체가 되돌아가므로,
 * 사용자가 "이 경로 다시 계산"을 눌렀을 때만 PUT 요청으로 시간표·지도 경로를 확정합니다.
 */
export default function CourseResultPage() {
  const { plan } = usePlan()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)
  const [courseLoadError, setCourseLoadError] = useState("")
  const [expandedItemId, setExpandedItemId] = useState(null)
  // 변경: 우측 시간표와 지도 마커를 연결하는 현재 선택 일정 항목입니다.
  // 장소 추가·삭제는 임시 목록만 바꿔도 이 값으로 같은 위치를 즉시 찾아볼 수 있습니다.
  const [focusedItemId, setFocusedItemId] = useState(null)
  // 변경: 이미 선택된 같은 장소를 다시 눌러도 지도 중심 이동 Effect를 다시 실행하기 위한 요청 번호입니다.
  // itemId만 상태로 쓰면 React가 같은 값의 업데이트를 생략해 두 번째 클릭에서는 지도가 움직이지 않습니다.
  const [mapFocusRequestId, setMapFocusRequestId] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState("")
  const [saveError, setSaveError] = useState("")
  const [isSavingItinerary, setIsSavingItinerary] = useState(false)
  const [isSaveSuccess, setIsSaveSuccess] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)
  // 변경: 실제 서버 재계산 중 어떤 작업인지 로딩 화면에서 정확히 안내하기 위한 상태입니다.
  const [recalculationContext, setRecalculationContext] = useState(null)
  const [editError, setEditError] = useState("")
  // 변경: 코스별 임시 편집 목록입니다. 코스를 바꿨다가 돌아와도 재계산 전 변경사항을 잃지 않으며,
  // 이 값이 있는 동안에는 서버의 이전 이동시간·경로선이 최신이 아니므로 지도에는 표시하지 않습니다.
  const [draftItemsByCourse, setDraftItemsByCourse] = useState({})
  // 변경: 새 장소의 임시 itemId는 렌더링 값(Date.now 등)이 아니라 사용자 추가 이벤트마다 증가하는 번호로 만듭니다.
  const draftItemSequenceRef = useRef(0)
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
          setDraftItemsByCourse({})
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
        // 변경: 코스 선택은 URL 변경으로도 이 목록을 다시 읽습니다.
        // 그때마다 임시 삭제 내용이 사라지지 않도록, 현재 목록에 남아 있는 코스의 draft만 유지합니다.
        setDraftItemsByCourse((previous) => {
          const availableCourseIds = new Set(detailedCourses.map((course) => String(course.itineraryId)))
          return Object.fromEntries(
            Object.entries(previous).filter(([itineraryId]) => availableCourseIds.has(itineraryId)),
          )
        })
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
  const draftItems = activeCourse ? draftItemsByCourse[activeCourse.itineraryId] ?? null : null
  // 변경: 타임라인·마커는 삭제 직후에도 즉시 변경된 목록을 사용합니다.
  // 서버가 다시 계산하기 전에는 이 배열의 도착시각과 이동 구간이 최신 값이 아닐 수 있습니다.
  const displayedItems = draftItems ?? activeCourse?.items ?? []
  const hasPendingChanges = Array.isArray(draftItems)
  // 변경: 삭제된 관광지 앞뒤를 잇는 새 이동 경로는 서버 계산 전에는 알 수 없습니다.
  // 이전 legs를 그대로 그리면 실제와 다른 선이 남으므로, 임시 편집 상태에서는 지도·상세 이동 정보를 숨깁니다.
  const displayedLegs = hasPendingChanges ? [] : activeCourse?.legs ?? []
  // 변경: URL의 saved 값만 믿지 않고 실제 서버 응답도 SAVED인지 확인해
  // 저장 상세 전용 UI가 초안(DRAFT) 추천 결과에 잘못 적용되지 않게 합니다.
  const isSavedDetail = isSavedView && activeCourse?.status === "SAVED"
  const travelDate = activeCourse?.travelDate || plan.date
  const startTime = activeCourse?.startTime || plan.startTime
  const endTime = activeCourse?.endTime || plan.endTime
  const selectedPlaceCount = displayedItems.filter((item) => item.kind === "VISIT").length

  // 변경: 지도 핀 클릭과 시간표의 장소명 클릭이 하나의 선택 상태를 공유합니다.
  // 같은 장소를 다시 클릭해도 요청 번호를 증가시켜 중심 이동을 반드시 다시 실행합니다.
  // 콜백을 고정해 지도 마커·경로선을 불필요하게 다시 만들지 않도록 합니다.
  const handleMapItemSelect = useCallback((itemId) => {
    setFocusedItemId(itemId)
    setMapFocusRequestId((previous) => previous + 1)
  }, [])

  /**
   * 변경: 삭제·추가·체류시간·순서 변경의 공통 저장소입니다.
   * 이 함수는 네트워크 요청을 하지 않으므로 관광지 삭제가 영업시간·식사시간 검증 실패 때문에
   * 화면에서 복구되는 문제가 없어집니다. 실제 경로 계산은 아래 saveEditedNodes에서만 수행합니다.
   */
  function stageEditedItems(nextItems) {
    if (!activeCourse || isRecalculating) return

    setDraftItemsByCourse((previous) => ({
      ...previous,
      [activeCourse.itineraryId]: nextItems,
    }))
    setExpandedItemId(null)
    setEditError("")
  }

  /** 변경: 임시 편집을 버리고 마지막으로 서버가 계산한 일정으로 되돌립니다. */
  function discardPendingChanges() {
    if (!activeCourse || isRecalculating) return
    setDraftItemsByCourse((previous) => {
      const next = { ...previous }
      delete next[activeCourse.itineraryId]
      return next
    })
    setExpandedItemId(null)
    setEditError("")
  }

  /**
   * 변경: 하단 "이 경로 다시 계산" 버튼을 눌렀을 때만 임시 목록을 서버에 전달합니다.
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
      const { itinerary: recalculatedItinerary } = await updateItineraryNodes(activeCourse.itineraryId, nodes)
      // 변경: PUT 응답에는 재계산 직전 캐시가 섞일 가능성을 없애기 위해, 성공 직후 상세 API를 캐시 없이 다시 읽습니다.
      // 이 조회 결과에는 DB에 새로 INSERT된 COURSE_NODE의 실제 arrivalTime·departureTime·legs가 모두 포함돼야 합니다.
      const { itinerary } = await getItinerary(recalculatedItinerary.itineraryId, { fresh: true })
      if (!hasRecalculatedSchedule(itinerary, nodes)) {
        // 변경: 새 시간표가 아닌 응답으로 draft를 지우면 "재계산 후" 문구만 남습니다.
        // 이 경우 임시 편집을 유지하고 명확한 오류를 보여 주어 사용자가 잘못된 경로를 저장하지 않게 합니다.
        throw new Error("새 경로 시간표를 확인하지 못했습니다. 잠시 후 ‘변경사항으로 경로 다시 계산’을 다시 눌러 주세요.")
      }
      setCourses((previousCourses) => previousCourses.map((course) =>
        Number(course.itineraryId) === Number(itinerary.itineraryId) ? itinerary : course,
      ))
      // 변경: 재계산에 성공한 서버 itinerary가 새로운 기준입니다. 해당 코스의 임시 편집은 제거해
      // 최신 도착 시각·지도 이동선·요약 수치를 즉시 다시 표시합니다.
      setDraftItemsByCourse((previous) => {
        const next = { ...previous }
        delete next[activeCourse.itineraryId]
        return next
      })
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
    // 변경: 임시 삭제·추가 상태에서 저장하면 화면과 DB 일정이 달라질 수 있습니다.
    // 저장 전에는 반드시 사용자가 재계산으로 변경사항을 서버에 확정하도록 안내합니다.
    if (hasPendingChanges) {
      setEditError("변경한 장소가 아직 경로에 반영되지 않았습니다. ‘이 경로 다시 계산’을 눌러 확인한 뒤 저장해 주세요.")
      return
    }
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
    navigate(isSavedDetail ? "/schedules" : "/planner/meals")
  }

  function changeStayMinutes(itemId, difference) {
    // 변경: 같은 PLACE를 두 번 넣은 일정에서도 클릭한 itemId 하나만 임시 체류시간이 바뀝니다.
    // 이전에는 이때마다 서버 재계산을 호출했지만, 이제 사용자가 재계산 버튼을 누를 때 한 번만 요청합니다.
    const nextItems = displayedItems.map((item) =>
      item.itemId === itemId
        ? { ...item, stayMinutes: Math.max(30, item.stayMinutes + difference) }
        : item,
    )
    stageEditedItems(nextItems)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    // 변경: 같은 장소가 여러 번 포함돼도 placeId가 아닌 COURSE_NODE itemId 하나만 지웁니다.
    // 삭제는 즉시 타임라인과 지도 마커에서 사라지고, 서버·길찾기 요청은 재계산 버튼을 누를 때만 실행됩니다.
    stageEditedItems(displayedItems.filter((item) => item.itemId !== target.itemId))
    setDeleteTarget(null)
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

  function addPlace(place) {
    // 변경: 결과 화면에서 새 음식점을 추가해도 식사 시간 창을 임의로 만들지 않습니다.
    // 추가 장소는 일반 방문(VISIT)으로 처리하고, 식사는 식사 계획 화면에서만 설정합니다.
    draftItemSequenceRef.current += 1
    const newPlaceItem = {
      // 변경: 서버 재계산 전에는 새 COURSE_NODE ID가 없으므로 브라우저 전용 임시 ID를 사용합니다.
      // 재계산 성공 후 서버가 부여한 실제 itemId로 전체 itinerary가 교체됩니다.
      itemId: `draft-${place.placeId}-${draftItemSequenceRef.current}`,
      placeId: place.placeId,
      kind: "VISIT",
      placeName: place.placeName,
      latitude: place.latitude,
      longitude: place.longitude,
      // 변경: 아직 새 시간표를 계산하지 않았으므로 타임라인은 "재계산 후"로 표시합니다.
      arrivalTime: "",
      stayMinutes: Math.max(30, Number(place.defaultStayMins) || 90),
    }
    // 변경: 종료 지점은 항상 마지막에 있어야 하므로 새 관광지는 END 바로 앞에 넣습니다.
    const endIndex = displayedItems.findIndex((item) => item.kind === "END")
    const nextItems = endIndex < 0
      ? [...displayedItems, newPlaceItem]
      : [...displayedItems.slice(0, endIndex), newPlaceItem, ...displayedItems.slice(endIndex)]
    stageEditedItems(nextItems)
    setIsDrawerOpen(false)
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
            {/* 변경: 저장 상세는 추천 생성 단계가 아니므로 저장 일정에 맞는 탐색 경로와 실제 제목을 표시합니다. */}
            <p className="breadcrumb">{isSavedDetail ? "🗂️ 저장한 일정 › 일정 상세" : "🧭 여행 조건 입력 › 추천 경로"}</p>
            <h1>{isSavedDetail ? activeCourse.title : "서울에서 보내는 하루, 이렇게 이동해 보세요"}</h1>
            <p className="course-subtitle">{travelDate} · {startTime}–{endTime} · 방문 장소 {selectedPlaceCount}곳</p>
          </div>
          <div className="course-title-actions">
            <button className="button button--secondary" onClick={handleConditionAction}>{isSavedDetail ? "저장 목록" : "조건 수정"}</button>
            {/* 변경: 저장 상세의 두 버튼이 모두 같은 목록으로 이동하던 중복을 제거합니다. */}
            {!isSavedDetail && (
              <button className="button button--primary" onClick={openSaveModal}>일정 저장</button>
            )}
          </div>
        </div>

        {/* 변경: 일부 추천 기준이 제약에 걸려도 성공한 코스를 먼저 보여 주는 부분 성공 구조입니다.
            이 안내는 계산 직후에만 표시되며, 새로고침 후에는 서버에 저장된 성공 코스만 그대로 조회합니다. */}
        {location.state?.recommendationNotice && (
          <p className="course-partial-notice" role="status">{location.state.recommendationNotice}</p>
        )}

        {hasPendingChanges && (
          <section className="course-draft-notice" role="status" aria-live="polite">
            <div>
              <strong>장소 변경사항이 임시로 적용됐어요.</strong>
              <p>삭제·추가·체류시간을 정한 뒤 “최적 경로 다시 계산”을 누르면 관광지 순서와 실제 이동 경로·시간표를 함께 최적화합니다.</p>
            </div>
            <button type="button" onClick={discardPendingChanges} disabled={isRecalculating}>변경 취소</button>
          </section>
        )}

        {/* 변경: 저장 상세는 선택할 코스가 한 건뿐이므로 제목을 반복하던 단일 코스 선택 카드를 숨깁니다. */}
        {!isSavedDetail && (
          <section className="course-options">
            {courses.map((course) => (
              <button
                key={course.itineraryId}
                className={`course-option ${selectedCourseId === course.itineraryId ? "course-option--selected" : ""}`}
                onClick={() => {
                  setSelectedCourseId(course.itineraryId)
                  setSearchParams({ tripPlanId: String(tripPlanId), itineraryId: String(course.itineraryId) })
                  setExpandedItemId(null)
                  // 변경: 다른 추천 코스로 바꾸면 이전 코스의 마커 강조 상태는 해제합니다.
                  setFocusedItemId(null)
                  setMapFocusRequestId((previous) => previous + 1)
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
        )}

        <section className="course-main-grid">
          {/* 변경: 삭제 직후 지도 마커도 임시 목록과 맞추고, 오래된 이동선은 재계산 전까지 표시하지 않습니다. */}
          <KakaoCourseMap
            items={displayedItems}
            legs={displayedLegs}
            activeItemId={focusedItemId}
            focusRequestId={mapFocusRequestId}
            onItemSelect={handleMapItemSelect}
          />
          <section className="timeline-panel">
            <div className="timeline-panel__header">
              {/* 변경: 저장 제목은 상단에서 이미 보여 주므로 타임라인에는 영역의 역할만 표시합니다. */}
              <p className="timeline-panel__eyebrow">{isSavedDetail ? "시간별 상세 일정" : activeCourse.title}</p>
            </div>
            <div className="timeline-list">
              {displayedItems.map((item, index) => {
                const inboundLeg = index === 0 ? null : displayedLegs.find((leg) => leg.toItemId === item.itemId)
                const orderInfo = getTimelineOrderInfo(item, index, displayedItems)
                return (
                  <TimelineItem
                    key={item.itemId}
                    item={item}
                    index={index}
                    orderInfo={orderInfo}
                    inboundLeg={inboundLeg}
                    isExpanded={expandedItemId === item.itemId}
                    isMapFocused={String(focusedItemId) === String(item.itemId)}
                    onFocus={() => handleMapItemSelect(item.itemId)}
                    onToggle={() => setExpandedItemId((previous) => previous === item.itemId ? null : item.itemId)}
                    onDelete={() => setDeleteTarget(item)}
                    onDecreaseStay={() => changeStayMinutes(item.itemId, -30)}
                    onIncreaseStay={() => changeStayMinutes(item.itemId, 30)}
                    isRecalculating={isRecalculating}
                  />
                )
              })}
            </div>
            <button className="timeline-add-button" onClick={openDrawer} disabled={isRecalculating}>＋ 장소 추가</button>
          </section>
        </section>

        <SummaryStats
          summary={activeCourse.summary}
          hasPendingChanges={hasPendingChanges}
          isRecalculating={isRecalculating}
          // 변경: 버튼을 누른 시점의 장소 집합을 한 번만 서버에 보내므로, 장소를 여러 번 삭제해도 API를 반복 호출하지 않습니다.
          // 서버는 이 입력 순서를 고정하지 않고 Branch-and-Bound로 관광지 방문 순서를 다시 최적화합니다.
          onRecalculate={() => saveEditedNodes(toEditableNodes(displayedItems), {
            type: "RECALCULATE",
            message: "수정한 장소로 최적 이동 경로와 시간표를 계산하고 있어요.",
          })}
        />
        {activeCourse.warnings?.length > 0 && <p className="mock-guide">{activeCourse.warnings.join(" ")}</p>}
        {editError && <p className="course-edit-error" role="alert">{editError}</p>}
      </section>

      {isRecalculating && (
        <RouteCalculationLoader
          variant="overlay"
          title={recalculationContext?.message ?? "경로를 다시 계산하고 있어요."}
          description="운영시간, 식사 시간, 이동 시간, 종료 시간을 확인하고 있어요."
          detail="계산이 완료되면 지도와 시간표를 새 경로로 업데이트합니다."
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="이 장소를 삭제할까요?"
          description={`“${deleteTarget.placeName}”을 일정 목록에서 제거합니다. 이동 경로와 시간은 “이 경로 다시 계산”을 누른 뒤 갱신됩니다.`}
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

/** 지도 마커와 동일하게 START·END를 제외한 실제 방문 순번을 시간표에 표시합니다. */
function getTimelineOrderInfo(item, itemIndex, items) {
  if (item.kind === "START") return { label: "S", type: "start" }
  if (item.kind === "END") return { label: "E", type: "end" }

  const order = items
    .slice(0, itemIndex + 1)
    .filter((scheduledItem) => scheduledItem.kind !== "START" && scheduledItem.kind !== "END")
    .length
  return { label: String(order), type: item.kind === "MEAL" ? "meal" : "visit" }
}

function TimelineItem({
  item,
  index,
  orderInfo,
  inboundLeg,
  isExpanded,
  isMapFocused,
  onFocus,
  onToggle,
  onDelete,
  onDecreaseStay,
  onIncreaseStay,
  isRecalculating,
}) {
  const canEdit = item.kind !== "START" && item.kind !== "END"

  return (
    <article className="timeline-item">
      {/* 변경: 이동 완료 후 다음 일정까지 비는 시간을 타임라인 안에 표시해 긴 공백을 놓치지 않게 합니다. */}
      {Number(inboundLeg?.waitMinutes) > 0 && <WaitTimeNotice leg={inboundLeg} />}
      <div className="timeline-item__top">
        {/* 변경: 새로 추가한 관광지는 아직 서버 시간표가 없으므로 빈 시간 대신 재계산 시점을 안내합니다. */}
        <time>{item.arrivalTime || "재계산 후"}</time>
        <div className="timeline-item__body">
          {/* 변경: 장소명 영역을 누르면 지도에서 같은 순번 마커를 강조하고 해당 위치로 이동합니다. */}
          <button
            className={`timeline-item__map-focus ${isMapFocused ? "timeline-item__map-focus--active" : ""}`}
            type="button"
            aria-pressed={isMapFocused}
            onClick={onFocus}
          >
            <span className={`timeline-order-badge timeline-order-badge--${orderInfo.type}`} aria-hidden="true">{orderInfo.label}</span>
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
          </button>
          {canEdit && (
            <div className="timeline-item__actions">
              <span>체류 {item.stayMinutes}분</span>
              <span className="stay-controls">
                <button className="stay-button" disabled={isRecalculating} onClick={onDecreaseStay} aria-label="체류시간 30분 줄이기">−</button>
                <button className="stay-button" disabled={isRecalculating} onClick={onIncreaseStay} aria-label="체류시간 30분 늘리기">+</button>
              </span>
              {/* 변경: 방문 순서는 자동 최적화하므로 사용자가 드래그·화살표로 직접 바꾸는 기능을 제거했습니다. */}
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

function WaitTimeNotice({ leg }) {
  const waitMinutes = Math.max(0, Number(leg.waitMinutes) || 0)
  const isLongWait = waitMinutes > 60

  return (
    <aside className={`timeline-wait-notice ${isLongWait ? "timeline-wait-notice--long" : ""}`}>
      <span className="timeline-wait-notice__icon" aria-hidden="true">⏳</span>
      <div>
        <strong>
          {leg.routeArrivalTime && leg.nextScheduleTime
            ? `${leg.routeArrivalTime}~${leg.nextScheduleTime} · 대기 ${waitMinutes}분`
            : `대기 ${waitMinutes}분`}
        </strong>
        <p>
          {isLongWait
            ? "긴 공백입니다. 장소를 추가하거나 식사시간·방문 순서를 조정해 주세요."
            : "다음 장소의 영업시간 또는 식사시간에 맞추기 위한 대기입니다."}
        </p>
      </div>
    </aside>
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
        <strong className="transit-detail__duration">이동 약 {Number(leg.durationMinutes) || 0}분</strong>
      </div>

      {/* 변경: 장소 시각의 차이가 이동시간보다 길 때 환승 여유와 실제 대기를 분리해 설명합니다. */}
      <div className="transit-time-breakdown" aria-label="구간 시간 구성">
        <span>이동 <strong>{Number(leg.durationMinutes) || 0}분</strong></span>
        {Number(leg.bufferMinutes) > 0 && <span>이동 여유 <strong>{Number(leg.bufferMinutes)}분</strong></span>}
        {Number(leg.waitMinutes) > 0 && <span>대기 <strong>{Number(leg.waitMinutes)}분</strong></span>}
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

function SummaryStats({ summary, onRecalculate, hasPendingChanges, isRecalculating }) {
  const hour = Math.floor(summary.totalMinutes / 60)
  const minute = summary.totalMinutes % 60
  return (
    <section className="summary-stats">
      <Stat icon="⏱️" label="총 이동" value={`${hour}시간 ${minute}분`} />
      <Stat icon="🔀" label="환승" value={`${summary.transferCount}회`} />
      <Stat icon="🚌" label="예상 교통비" value={`${summary.estimatedFare.toLocaleString()}원`} />
      <Stat icon="🚶" label="총 도보" value={`${(summary.walkingDistanceMeters / 1000).toFixed(1)}km`} />
      {/* 변경: 실제 서버 호출은 이 버튼 하나에만 연결해, 편집 중 API 호출과 로딩을 줄입니다. */}
      <button className="summary-recalculate" onClick={onRecalculate} disabled={isRecalculating}>
        {hasPendingChanges ? "✨ 변경사항으로 최적 경로 계산" : "✨ 최적 경로 다시 계산"}
      </button>
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
