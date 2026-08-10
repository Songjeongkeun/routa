import * as itineraryRepository from "./itinerary.repository.mjs"
import {
  createLegMetrics,
  selectRouteAlternative,
} from "../recommendations/recommendation.scorer.mjs"
import * as recommendationRepository from "../recommendations/recommendation.repository.mjs"
import { rebuildCourseForEdit } from "../recommendations/recommendation.service.mjs"
import { MEAL_TIME_WINDOWS, createKoreanDateTime } from "../../utils/mealSchedule.mjs"
import { randomUUID } from "node:crypto"

const COURSE_META = {
  // 변경: ODsay 대중교통 후보 중 도보 거리가 가장 적은 경로이므로 표현을 실제 계산 기준에 맞춥니다.
  SHORTEST_WALK: { title: "최소 도보", description: "대중교통 경로 중 도보 거리를 줄인 코스" },
  FASTEST_TRANSIT: { title: "최소 시간", description: "이동 시간을 줄인 코스" },
  BALANCED: { title: "추천 코스", description: "장소와 이동을 균형 있게 고려한 코스" },
}
const COURSE_TYPES = new Set(Object.keys(COURSE_META))

function createHttpError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function normalizeId(value, fieldName) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw createHttpError(`${fieldName} 값이 올바르지 않습니다.`)
  return id
}

function parseStoredJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function getStoredRouteAlternative(pathDetails, courseKind) {
  const storedPath = parseStoredJson(pathDetails, null)
  return selectRouteAlternative(storedPath?.alternatives, courseKind)
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value))
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

/**
 * 변경: COURSE_NODE에는 식사 시간 창·사용자가 고른 시각이 없으므로 TRIP_PLAN의
 * meal_preference를 합쳐 결과 화면이 계산 결과를 설명할 수 있는 정보로 복원합니다.
 */
function getMealTimingDetails({ node, meal, courseStartTime }) {
  if (node.kind !== "MEAL" || !meal) return {}

  const window = MEAL_TIME_WINDOWS[meal.mealSlot]
  if (!window) return { mealSlot: meal.mealSlot ?? null }

  const actualStart = new Date(node.arrivalTime)
  const windowStart = createKoreanDateTime(courseStartTime, window.start)
  const windowEnd = createKoreanDateTime(courseStartTime, window.end)
  const startsWithinWindow = actualStart >= windowStart && actualStart <= windowEnd
  const scheduledTime = meal.scheduledTime ?? null
  const startsAtReservationTime = meal.isFixedReservation
    && formatTime(actualStart) === scheduledTime

  return {
    mealSlot: meal.mealSlot,
    mealWindow: `${window.start}~${window.end}`,
    mealScheduledTime: scheduledTime,
    mealIsFixedReservation: meal.isFixedReservation === true,
    // 변경: 일반 식사는 시간 창 준수 여부, 예약 식사는 지정 시각 준수 여부를 분리해 화면에 표시합니다.
    mealTimingStatus: meal.isFixedReservation
      ? (startsAtReservationTime ? "예약 시간 준수" : "예약 시간 조정 필요")
      : (startsWithinWindow ? "권장 시간 준수" : "권장 시간 초과"),
  }
}

function formatCourse(course) {
  const meta = COURSE_META[course.courseKind] ?? COURSE_META.BALANCED
  const isSaved = course.status === "SAVED"
  return {
    itineraryId: course.itineraryId,
    tripPlanId: course.tripPlanId,
    courseKind: course.courseKind,
    // 변경: DRAFT는 코스 종류 제목을 쓰고, SAVED는 사용자가 입력한 일정 제목을 우선 표시합니다.
    title: isSaved && course.savedTitle ? course.savedTitle : meta.title,
    description: meta.description,
    travelDate: formatDate(course.startTime),
    startTime: formatTime(course.startTime),
    endTime: formatTime(course.endTime),
    summary: {
      totalMinutes: course.totalMinutes,
      walkingDistanceMeters: course.walkingDistanceMeters,
      transferCount: course.transferCount,
      estimatedFare: course.estimatedFare,
    },
    warnings: parseStoredJson(course.warningsJson, []),
    status: course.status ?? "DRAFT",
    savedAt: course.savedAt ? new Date(course.savedAt).toISOString() : null,
  }
}

function getSavedSnapshot(course) {
  if (course.status !== "SAVED") return null
  const snapshot = parseStoredJson(course.savedSnapshotJson, null)
  if (!snapshot || typeof snapshot !== "object") return null

  // 변경: 저장 시점 DTO를 그대로 쓰되, 제목·저장 시각처럼 이후에 바뀔 수 있는 COURSE 값은 덮어씁니다.
  return {
    ...snapshot,
    itineraryId: course.itineraryId,
    tripPlanId: course.tripPlanId,
    courseKind: course.courseKind,
    title: course.savedTitle || snapshot.title,
    status: "SAVED",
    savedAt: course.savedAt ? new Date(course.savedAt).toISOString() : null,
  }
}

function normalizeTitle(value, fallback) {
  const title = String(value ?? "").trim() || fallback
  if (!title) throw createHttpError("일정 제목을 입력해 주세요.")
  if (title.length > 50) throw createHttpError("일정 제목은 50자 이내로 입력해 주세요.")
  return title
}

function normalizePage(value, fallback = 1, maximum = 100) {
  const number = Number(value ?? fallback)
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw createHttpError("페이지 값이 올바르지 않습니다.")
  }
  return number
}

function normalizeCourseType(value) {
  if (!value) return null
  if (!COURSE_TYPES.has(value)) throw createHttpError("코스 종류 필터가 올바르지 않습니다.")
  return value
}

function normalizeTravelDate(value) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createHttpError("여행 날짜 필터는 YYYY-MM-DD 형식이어야 합니다.")
  }
  return value
}

export async function getItineraries({ userId, tripPlanId }) {
  const courses = await itineraryRepository.findOwnedCourses({
    userId,
    tripPlanId: normalizeId(tripPlanId, "여행 계획"),
  })
  return courses.map(formatCourse)
}

/** 변경: 저장 일정 목록은 DRAFT 추천 코스를 제외하고 현재 사용자 소유의 SAVED 코스만 반환합니다. */
export async function getSavedItineraries({ userId, keyword, courseType, travelDate, page, pageSize }) {
  const normalizedPage = normalizePage(page)
  const normalizedPageSize = normalizePage(pageSize, 12, 50)
  const result = await itineraryRepository.findSavedOwnedCourses({
    userId,
    keyword: String(keyword ?? ""),
    courseType: normalizeCourseType(courseType),
    travelDate: normalizeTravelDate(travelDate),
    page: normalizedPage,
    pageSize: normalizedPageSize,
  })

  return {
    itineraries: result.rows.map(formatCourse),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalCount: result.totalCount,
  }
}

export async function getItineraryById({ userId, itineraryId }) {
  const course = await itineraryRepository.findOwnedCourseById({
    userId,
    itineraryId: normalizeId(itineraryId, "추천 코스"),
  })
  if (!course) throw createHttpError("추천 코스를 찾을 수 없거나 접근 권한이 없습니다.", 404)

  // 변경: 저장 일정은 추천 재생성·ROUTE_SECTION 갱신과 무관하게 저장 당시의 지도·시간표를 보여 줍니다.
  const savedSnapshot = getSavedSnapshot(course)
  if (savedSnapshot) return savedSnapshot

  const itinerary = formatCourse(course)
  const mealPreference = parseStoredJson(course.mealPreference, { meals: [] })
  const mealByPlaceId = new Map(
    (mealPreference.meals ?? []).map((meal) => [Number(meal.placeId), meal]),
  )
  // 변경: 주변 추천 식사는 계획 저장 시점에 음식점 ID가 없고, 추천 시점에만 결정됩니다.
  // COURSE_NODE의 식사 순서대로 NEARBY 설정을 결합해 화면에도 시간 창을 복원합니다.
  const nearbyMeals = (mealPreference.meals ?? []).filter((meal) => meal.mode === "NEARBY")
  let nearbyMealIndex = 0
  const items = (await itineraryRepository.findCourseNodes(itinerary.itineraryId)).map((node) => {
    const meal = node.kind === "MEAL"
      ? mealByPlaceId.get(Number(node.placeId)) ?? nearbyMeals[nearbyMealIndex++]
      : null

    return {
      ...node,
      arrivalTime: formatTime(node.arrivalTime),
      departureTime: formatTime(node.departureTime),
      ...getMealTimingDetails({ node, meal, courseStartTime: course.startTime }),
    }
  })

  const legs = []
  for (const [index, item] of items.slice(1).entries()) {
    const fromItem = items[index]
    const savedRoute = await itineraryRepository.findRouteSection({
      originPlaceId: fromItem.placeId,
      destinationPlaceId: item.placeId,
    })
    const selectedRoute = getStoredRouteAlternative(savedRoute?.pathDetails, itinerary.courseKind)

    if (selectedRoute) {
      // 변경: 추천 생성 시 저장한 실제 ODsay 경로를 그대로 반환해 새로고침해도 같은 상세 이동 정보를 보여 줍니다.
      legs.push({
        fromItemId: fromItem.itemId,
        toItemId: item.itemId,
        durationMinutes: selectedRoute.durationMinutes,
        walkingDistanceMeters: selectedRoute.walkingDistanceMeters,
        transferCount: selectedRoute.transferCount,
        estimatedFare: selectedRoute.estimatedFare,
        steps: selectedRoute.steps.map((step) => step.description),
        // 변경: ODsay loadLane에서 저장한 실제 버스·지하철 좌표를 지도에 전달합니다.
        // 과거에 생성한 경로 또는 도보 대체 경로는 빈 배열이며 프론트가 점선으로 표시합니다.
        geometrySegments: Array.isArray(selectedRoute.geometrySegments)
          ? selectedRoute.geometrySegments
          : [],
        // 변경: 도보 대체 구간 여부를 프론트가 필요할 때 표시할 수 있도록 함께 반환합니다.
        source: selectedRoute.source ?? "ODSAY",
      })
      continue
    }

    // 변경: ODsay 연결 전 생성된 과거 COURSE도 결과 페이지가 깨지지 않도록 기존 추정값을 보조 처리합니다.
    const metric = createLegMetrics(fromItem, item, itinerary.courseKind)
    const transportLabel = itinerary.courseKind === "SHORTEST_WALK" ? "도보" : "대중교통"
    legs.push({
      fromItemId: fromItem.itemId,
      toItemId: item.itemId,
      durationMinutes: metric.durationMinutes,
      walkingDistanceMeters: metric.walkingDistanceMeters,
      transferCount: metric.transferCount,
      estimatedFare: metric.estimatedFare,
      steps: [`${fromItem.placeName}에서 ${item.placeName}까지 ${transportLabel} 이동`],
      // 변경: 실제 ODsay 캐시가 없는 과거 일정도 지도 렌더링이 깨지지 않게 빈 배열을 반환합니다.
      geometrySegments: [],
      source: "ESTIMATE",
    })
  }

  return { ...itinerary, items, legs }
}

/**
 * 변경: 체류시간 변경·삭제·추가·순서 변경은 모두 이 서버 재계산으로 처리합니다.
 * 계산이 실패하면 replaceCourseContents를 호출하지 않으므로 기존 COURSE_NODE는 그대로 보존됩니다.
 */
export async function updateItineraryNodes({ userId, itineraryId, nodes }) {
  const normalizedItineraryId = normalizeId(itineraryId, "추천 코스")
  const course = await itineraryRepository.findOwnedCourseById({
    userId,
    itineraryId: normalizedItineraryId,
  })
  if (!course) throw createHttpError("추천 코스를 찾을 수 없거나 수정 권한이 없습니다.", 404)

  const recalculatedCourse = await rebuildCourseForEdit({
    plan: course,
    courseType: course.courseKind,
    editableNodes: nodes,
  })

  await recommendationRepository.replaceCourseContents({
    itineraryId: normalizedItineraryId,
    course: recalculatedCourse,
  })

  // 변경: replaceCourseContents는 이전 저장 스냅샷을 비워 두므로, 편집 직후에는 실제 재계산 결과를 읽습니다.
  const itinerary = await getItineraryById({ userId, itineraryId: normalizedItineraryId })
  if (course.status === "SAVED") {
    // 변경: 저장 일정도 편집은 가능하되, 성공적으로 재계산된 결과만 새 스냅샷으로 확정합니다.
    await itineraryRepository.updateSavedSnapshot({
      userId,
      itineraryId: normalizedItineraryId,
      snapshotJson: JSON.stringify(itinerary),
    })
  }

  return itinerary
}

/**
 * 변경: 선택한 추천 코스 한 개를 SAVED로 전환하고, 현재 items·legs·지도 좌표 전체를 스냅샷으로 보관합니다.
 * 같은 courseId는 다시 저장해도 복제되지 않아 더블 클릭·네트워크 재전송에 안전합니다.
 */
export async function saveItinerary({ userId, itineraryId, title, saveRequestId }) {
  const normalizedItineraryId = normalizeId(itineraryId, "추천 코스")
  const course = await itineraryRepository.findOwnedCourseById({ userId, itineraryId: normalizedItineraryId })
  if (!course) throw createHttpError("추천 코스를 찾을 수 없거나 저장 권한이 없습니다.", 404)

  if (course.status === "SAVED") {
    return getItineraryById({ userId, itineraryId: normalizedItineraryId })
  }

  const defaultTitle = `${formatDate(course.startTime)} ${COURSE_META[course.courseKind]?.title ?? "여행 일정"}`
  const normalizedTitle = normalizeTitle(title, defaultTitle)
  // 변경: 브라우저가 requestId를 보내지 못한 경우에도 서버가 UUID를 만들어 중복 저장 방지 키를 보장합니다.
  const normalizedSaveRequestId = saveRequestId || randomUUID()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedSaveRequestId)) {
    throw createHttpError("저장 요청 식별자가 올바르지 않습니다.")
  }
  const itinerary = await getItineraryById({ userId, itineraryId: normalizedItineraryId })
  const snapshot = {
    ...itinerary,
    title: normalizedTitle,
    status: "SAVED",
  }

  const savedCourse = await itineraryRepository.saveOwnedCourse({
    userId,
    itineraryId: normalizedItineraryId,
    title: normalizedTitle,
    saveRequestId: normalizedSaveRequestId,
    snapshotJson: JSON.stringify(snapshot),
  })
  if (!savedCourse) throw createHttpError("추천 코스를 찾을 수 없거나 저장 권한이 없습니다.", 404)

  return getItineraryById({ userId, itineraryId: normalizedItineraryId })
}

/** 변경: 저장 일정 목록에서 제목을 수정할 수 있도록 SAVED 코스의 제목만 변경합니다. */
export async function updateSavedItineraryTitle({ userId, itineraryId, title }) {
  const normalizedItineraryId = normalizeId(itineraryId, "저장 일정")
  const normalizedTitle = normalizeTitle(title, "")
  const updatedCourse = await itineraryRepository.updateOwnedSavedCourseTitle({
    userId,
    itineraryId: normalizedItineraryId,
    title: normalizedTitle,
  })
  if (!updatedCourse) throw createHttpError("저장 일정을 찾을 수 없거나 수정 권한이 없습니다.", 404)

  return getItineraryById({ userId, itineraryId: normalizedItineraryId })
}

/** 변경: 삭제 확인 이후에만 현재 사용자 소유의 SAVED 일정과 그 노드를 함께 삭제합니다. */
export async function deleteSavedItinerary({ userId, itineraryId }) {
  const normalizedItineraryId = normalizeId(itineraryId, "저장 일정")
  const didDelete = await itineraryRepository.deleteOwnedSavedCourse({
    userId,
    itineraryId: normalizedItineraryId,
  })
  if (!didDelete) throw createHttpError("저장 일정을 찾을 수 없거나 삭제 권한이 없습니다.", 404)
}
