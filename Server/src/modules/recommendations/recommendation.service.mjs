import * as recommendationRepository from "./recommendation.repository.mjs"
import { selectRouteAlternative, sortByDistanceFrom } from "./recommendation.scorer.mjs"
import {
  loadPublicTransitRouteGeometry,
  searchPublicTransitRoutes,
} from "../../providers/odsay.mjs"
import {
  MEAL_TIME_WINDOWS,
  addMinutes,
  createKoreanDateTime,
  maxDate,
} from "../../utils/mealSchedule.mjs"
import { evaluatePlaceVisit } from "../../utils/placeSchedule.mjs"

const COURSE_TYPES = ["SHORTEST_WALK", "FASTEST_TRANSIT", "BALANCED"]
// 변경: Branch-and-Bound 완전 탐색의 입력 크기를 안전하게 제한하기 위해 방문 장소를 최대 5곳으로 유지합니다.
const MAX_VISIT_STOPS = 5

function createHttpError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

/**
 * 변경: 제약 실패를 경고로만 저장하지 않고 HTTP 422와 구조화된 이유 목록으로 반환합니다.
 * 수정 API는 이 오류를 받은 경우 DB를 변경하지 않으므로 기존 일정이 안전하게 유지됩니다.
 */
function createConstraintError(conflicts) {
  const error = createHttpError("선택한 일정은 운영 조건 또는 종료 시간 안에 배치할 수 없습니다.", 422)
  error.conflicts = conflicts
  return error
}

function assertPlaceFeasible(timing) {
  if (!timing.isFeasible) throw createConstraintError(timing.conflicts)
  return timing
}

function normalizeTripPlanId(value) {
  const tripPlanId = Number(value)
  if (!Number.isSafeInteger(tripPlanId) || tripPlanId <= 0) {
    throw createHttpError("추천할 여행 계획을 선택해 주세요.")
  }
  return tripPlanId
}

function parseStoredJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    // 변경: JSON 전환 전의 과거 문자열 데이터도 추천 요청에서 서버 오류가 나지 않도록 처리합니다.
    return fallback
  }
}

function minDate(...values) {
  const dates = values.filter(Boolean).map((value) => new Date(value))
  return dates.length > 0 ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null
}

// 변경: 위치를 선택하지 않은 경우에는 START·END 경계 노드를 만들지 않습니다.
// 좌표가 문자열로 조회되는 환경도 있어 Number 변환 후 유효성을 확인합니다.
function hasCoordinates(place) {
  if (place?.latitude == null || place?.longitude == null) return false
  return Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude))
}

// 변경: 출발 위치 없이 첫 실제 장소에서 일정을 시작할 때는 이동 시간·거리·요금이 없습니다.
function createInitialLeg() {
  return {
    durationMinutes: 0,
    walkingDistanceMeters: 0,
    transferCount: 0,
    estimatedFare: 0,
    source: "NO_START_LOCATION",
  }
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

function getMealLabel(mealSlot) {
  return mealSlot === "DINNER" ? "저녁" : "점심"
}

// 변경: 과거 계획에 식사 체류 시간이 없을 때도 중앙 설정의 60분을 적용합니다.
// 이미 DB에 명시적으로 저장된 기존 일정의 체류 시간은 사용자의 이전 선택 기록이므로 그대로 존중합니다.
function getMealStayMinutes(meal) {
  const storedStayMinutes = Number(meal?.stayMinutes)
  if (Number.isFinite(storedStayMinutes) && storedStayMinutes > 0) return storedStayMinutes
  return MEAL_TIME_WINDOWS[meal?.mealSlot]?.defaultStayMinutes ?? 60
}

function getTravelBufferMinutes({ route, withPet }) {
  // 변경: 기획서의 대중교통 여유 시간(일반 10분, 반려동물 동반 15분)을 실제 대중교통 구간에만 적용합니다.
  if (route.source !== "ODSAY") return 0
  return withPet ? 15 : 10
}

function getPlaceBusinessTime(planStartTime, time, openingTime = null) {
  if (!time) return null
  const businessTime = createKoreanDateTime(planStartTime, time)
  // 변경: 자정을 넘겨 닫는 음식점은 종료 시간을 다음 날로 해석합니다.
  if (openingTime && businessTime <= openingTime) return addMinutes(businessTime, 24 * 60)
  return businessTime
}

function createMealConstraint({ plan, meal }) {
  const mealWindow = MEAL_TIME_WINDOWS[meal.mealSlot]
  if (!mealWindow) {
    throw createHttpError("식사 구분 정보가 올바르지 않습니다.")
  }

  const windowStart = createKoreanDateTime(plan.startTime, mealWindow.start)
  const windowEnd = createKoreanDateTime(plan.startTime, mealWindow.end)
  const preferredStart = createKoreanDateTime(plan.startTime, meal.scheduledTime)
  const openingTime = getPlaceBusinessTime(plan.startTime, meal.startTime)
  const closingTime = getPlaceBusinessTime(plan.startTime, meal.endTime, openingTime)
  const lastOrderTime = getPlaceBusinessTime(plan.startTime, meal.lastOrder, openingTime)
  const latestByClosing = closingTime ? addMinutes(closingTime, -meal.stayMinutes) : null

  return {
    mealWindow,
    preferredStart,
    earliestStart: maxDate(windowStart, openingTime),
    latestStart: minDate(windowEnd, lastOrderTime, latestByClosing),
    reservationArrivalDeadline: meal.isFixedReservation
      ? addMinutes(preferredStart, -20)
      : null,
  }
}

function evaluateMealArrival({ travelArrivalTime, constraint, meal }) {
  const visitStart = meal.isFixedReservation
    ? maxDate(travelArrivalTime, constraint.preferredStart, constraint.earliestStart)
    : maxDate(travelArrivalTime, constraint.earliestStart)
  const reservationOnTime = !constraint.reservationArrivalDeadline
    || travelArrivalTime <= constraint.reservationArrivalDeadline
  const reservationStartsOnTime = !meal.isFixedReservation
    || visitStart.getTime() === constraint.preferredStart.getTime()
  const withinLatestStart = !constraint.latestStart || visitStart <= constraint.latestStart

  return {
    visitStart,
    isFeasible: reservationOnTime && reservationStartsOnTime && withinLatestStart,
    waitMinutes: Math.max(0, Math.round((visitStart.getTime() - travelArrivalTime.getTime()) / 60_000)),
  }
}

async function getRouteLeg({ from, to, courseType, routeAlternativesByPlacePair }) {
  const pairKey = `${from.placeId}:${to.placeId}`
  let alternatives = routeAlternativesByPlacePair.get(pairKey)
  let shouldSaveRoute = false

  if (!alternatives) {
    alternatives = await searchPublicTransitRoutes({ from, to })
    routeAlternativesByPlacePair.set(pairKey, alternatives)
    shouldSaveRoute = true
  }

  const route = selectRouteAlternative(alternatives, courseType)
  if (!route) throw createHttpError("대중교통 경로 후보를 선택하지 못했습니다.", 422)

  // 변경: 선택된 ODsay 후보의 노선 그래픽을 캐시해 결과 지도에서 실제 버스·지하철 경로를 그립니다.
  if (route.source === "ODSAY" && route.mapObject && !Object.hasOwn(route, "geometrySegments")) {
    route.geometrySegments = await loadPublicTransitRouteGeometry(route.mapObject)
    shouldSaveRoute = true
  }

  if (shouldSaveRoute) {
    const representativeRoute = selectRouteAlternative(alternatives, "BALANCED")
    await recommendationRepository.upsertRouteSection({
      originPlaceId: from.placeId,
      destinationPlaceId: to.placeId,
      route: { ...representativeRoute, alternatives },
    })
  }

  return route
}

function distanceKm(first, second) {
  const toRadians = (value) => Number(value) * Math.PI / 180
  const latitudeDifference = toRadians(second.latitude - first.latitude)
  const longitudeDifference = toRadians(second.longitude - first.longitude)
  const formula = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(toRadians(first.latitude)) * Math.cos(toRadians(second.latitude))
    * Math.sin(longitudeDifference / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(formula))
}

/**
 * 변경: 주변 추천 식사는 현재 장소와 다음 방문 후보 양쪽에서 500m를 먼저 찾고,
 * 없을 때만 1km로 넓힙니다. 두 위치 중 가까운 쪽과 평점을 함께 사용해 우회 가능성을 줄입니다.
 */
async function selectNearbyMeal({
  meal,
  currentPlace,
  currentTime,
  remainingVisits,
  plan,
  usedMealPlaceIds,
}) {
  // 변경: 출발 위치가 없을 때는 첫 방문 후보를 주변 음식점 추천의 기준점으로 사용합니다.
  // 방문 장소도 없으면 "주변"을 판단할 기준이 없으므로 아래에서 지정 음식점을 안내합니다.
  const nextPlace = currentPlace
    ? sortByDistanceFrom(currentPlace, remainingVisits)[0] ?? null
    : remainingVisits[0] ?? null
  const anchors = [currentPlace, nextPlace].filter(Boolean)

  if (anchors.length === 0) {
    throw createConstraintError([{
      code: "NEARBY_MEAL_ANCHOR_MISSING",
      message: "출발 위치와 방문 장소가 없어 주변 음식점을 추천할 기준이 없습니다. 지정 음식점을 선택하거나 방문 장소를 추가해 주세요.",
    }])
  }

  for (const radiusKm of [0.5, 1]) {
    const candidatesById = new Map()
    for (const anchor of anchors) {
      const candidates = await recommendationRepository.findNearbyRestaurants({
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        radiusKm,
        withPet: plan.withPet,
        // 변경: 점심·저녁이 같은 자동 추천 음식점을 사용하지 않도록,
        // 현재 코스에서 이미 식사로 사용한 모든 placeId를 DB 조회 전에 제외합니다.
        excludePlaceIds: [...usedMealPlaceIds],
      })
      candidates.forEach((candidate) => candidatesById.set(Number(candidate.placeId), candidate))
    }

    const candidates = [...candidatesById.values()]
      .filter((candidate) => evaluatePlaceVisit({
        plan,
        place: candidate,
        travelArrivalTime: currentTime,
        stayMinutes: meal.stayMinutes,
        enforceLastOrder: true,
      }).isFeasible)
      .sort((first, second) => {
        const firstDistance = Math.min(...anchors.map((anchor) => distanceKm(anchor, first)))
        const secondDistance = Math.min(...anchors.map((anchor) => distanceKm(anchor, second)))
        return firstDistance - secondDistance || (second.averageRating ?? 0) - (first.averageRating ?? 0)
      })

    if (candidates[0]) {
      return {
        ...candidates[0],
        ...meal,
        nodeType: "MEAL",
        mode: "NEARBY",
      }
    }
  }

  throw createConstraintError([{
    code: "NEARBY_MEAL_NOT_FOUND",
    message: `${getMealLabel(meal.mealSlot)} 시간에 이용 가능한 주변 음식점을 1km 안에서 찾지 못했습니다. 지정 음식점을 선택하거나 식사를 제외해 주세요.`,
  }])
}

// 변경: 세 코스의 이동 기준에 불필요한 대기 시간을 보정해 Branch-and-Bound의 현재 비용을 계산합니다.
// 이후에 추가될 이동·대기 비용은 모두 0 이상이므로, 이 값이 이미 최적 점수보다 크면 안전하게 가지를 버릴 수 있습니다.
function getCourseScore({ summary, idleMinutes = 0 }, courseType) {
  if (courseType === "SHORTEST_WALK") {
    return summary.walkingDistanceMeters * 1_000 + summary.totalMinutes + idleMinutes * 10
  }
  if (courseType === "FASTEST_TRANSIT") {
    return summary.totalMinutes * 1_000
      + summary.transferCount * 10
      + summary.walkingDistanceMeters / 1_000
      // 변경: 식사 시간까지 몇 시간 대기하는 경로가 이동시간만 짧다는 이유로 선택되지 않게 합니다.
      + idleMinutes * 100
  }
  return summary.totalMinutes * 0.7
    + (summary.walkingDistanceMeters / 1_000) * 0.3
    + summary.transferCount * 8
    + summary.estimatedFare / 500
    + idleMinutes * 0.5
}

function createInitialSearchState({ startPlace, plan, meals }) {
  const hasStartPlace = Boolean(startPlace)
  const startNode = hasStartPlace ? { ...startPlace, nodeType: "START", stayMinutes: 0 } : null

  return {
    currentPlace: startNode,
    currentTime: new Date(plan.startTime),
    nodes: startNode
      ? [{
        placeId: startNode.placeId,
        visitOrder: 1,
        nodeType: "START",
        arrivalTime: new Date(plan.startTime).toISOString(),
        departureTime: new Date(plan.startTime).toISOString(),
        stayMinutes: 0,
      }]
      : [],
    summary: {
      totalMinutes: 0,
      walkingDistanceMeters: 0,
      transferCount: 0,
      estimatedFare: 0,
    },
    warnings: [],
    usedWalkingFallback: false,
    // 변경: UI의 이동시간 합계와 분리해, 식사·영업 시작 전 불필요한 대기 시간을 최적화 점수에 반영합니다.
    idleMinutes: 0,
    // 변경: 지정 음식점은 처음부터 사용 중으로 기록해 주변 추천 식당과 중복되지 않게 합니다.
    usedMealPlaceIds: new Set(
      meals
        .filter((meal) => meal.mode === "DESIGNATED" && Number.isSafeInteger(Number(meal.placeId)))
        .map((meal) => Number(meal.placeId)),
    ),
  }
}

function appendSearchWarning(warnings, message) {
  return warnings.includes(message) ? warnings : [...warnings, message]
}

/**
 * 변경: 한 탐색 가지에서 다음 장소 하나를 방문했을 때의 시간·제약·이동 수치를 계산합니다.
 * 불가능한 장소는 예외를 전파하지 않고 null을 반환해 해당 Branch를 즉시 종료합니다.
 */
async function createSearchTransition({
  state,
  stop,
  courseType,
  plan,
  routeAlternativesByPlacePair,
}) {
  let travelArrivalTime = new Date(state.currentTime)
  let leg = createInitialLeg()

  if (state.currentPlace) {
    leg = await getRouteLeg({
      from: state.currentPlace,
      to: stop,
      courseType,
      routeAlternativesByPlacePair,
    })
    const bufferMinutes = getTravelBufferMinutes({ route: leg, withPet: plan.withPet })
    travelArrivalTime = addMinutes(state.currentTime, leg.durationMinutes + bufferMinutes)
  }

  let visitStart = travelArrivalTime
  let departureTime = travelArrivalTime
  let idleMinutes = 0
  let warnings = state.warnings

  if (stop.nodeType === "MEAL") {
    const mealConstraint = createMealConstraint({ plan, meal: stop })
    const mealTiming = evaluateMealArrival({
      travelArrivalTime,
      constraint: mealConstraint,
      meal: stop,
    })
    if (!mealTiming.isFeasible) return null

    visitStart = mealTiming.visitStart
    if (mealTiming.waitMinutes > 0) {
      warnings = appendSearchWarning(
        warnings,
        `${getMealLabel(stop.mealSlot)} 식사 전 ${mealTiming.waitMinutes}분의 대기 시간이 포함됩니다.`,
      )
    }
  }

  if (stop.nodeType !== "END") {
    const placeTiming = evaluatePlaceVisit({
      plan,
      place: stop,
      travelArrivalTime,
      stayMinutes: stop.stayMinutes,
      requestedStart: stop.nodeType === "MEAL" ? visitStart : null,
      enforceLastOrder: stop.nodeType === "MEAL",
    })
    if (!placeTiming.isFeasible) return null
    visitStart = placeTiming.visitStart
    departureTime = placeTiming.departureTime
    idleMinutes = placeTiming.waitMinutes
  }

  // 변경: 현재 시간이 이미 여행 종료 시각을 넘은 가지는 이후에 더 좋아질 수 없으므로 즉시 잘라냅니다.
  if (departureTime > new Date(plan.endTime)) return null

  const nextSummary = {
    totalMinutes: state.summary.totalMinutes + leg.durationMinutes,
    walkingDistanceMeters: state.summary.walkingDistanceMeters + leg.walkingDistanceMeters,
    transferCount: state.summary.transferCount + leg.transferCount,
    estimatedFare: state.summary.estimatedFare + leg.estimatedFare,
  }

  return {
    ...state,
    currentPlace: stop,
    currentTime: departureTime,
    nodes: [...state.nodes, {
      placeId: stop.placeId,
      visitOrder: state.nodes.length + 1,
      nodeType: stop.nodeType,
      arrivalTime: visitStart.toISOString(),
      departureTime: departureTime.toISOString(),
      stayMinutes: stop.stayMinutes,
    }],
    summary: nextSummary,
    warnings,
    usedWalkingFallback: state.usedWalkingFallback || leg.source === "WALK_FALLBACK",
    idleMinutes: state.idleMinutes + idleMinutes,
  }
}

/**
 * 변경: 최대 방문 5곳·식사 2곳(총 7곳) 범위에서 모든 유효한 순서를 Branch-and-Bound로 탐색합니다.
 * 방문지는 어느 순서로도 분기하고, 식사는 점심→저녁 시간 순서를 유지합니다.
 */
async function buildCourseByBranchAndBound({
  courseType,
  startPlace,
  endPlace,
  visits,
  meals,
  plan,
  routeAlternativesByPlacePair,
}) {
  const orderedMeals = [...meals]
    .filter((meal) => meal.mode !== "SKIP")
    .sort((firstMeal, secondMeal) => firstMeal.scheduledTime.localeCompare(secondMeal.scheduledTime))
  const initialState = createInitialSearchState({ startPlace, plan, meals: orderedMeals })
  const nearbyMealByContext = new Map()
  const searchStats = { explored: 0, prunedByBound: 0, prunedByConstraint: 0 }
  let bestState = null
  let bestScore = Number.POSITIVE_INFINITY

  async function resolveNearbyMeal(state, meal, remainingVisits) {
    const key = [
      meal.mealSlot,
      state.currentPlace?.placeId ?? "NO_START",
      state.currentTime.getTime(),
      remainingVisits.map((visit) => visit.placeId).sort((first, second) => Number(first) - Number(second)).join(","),
      [...state.usedMealPlaceIds].sort((first, second) => first - second).join(","),
    ].join(":")
    if (nearbyMealByContext.has(key)) return nearbyMealByContext.get(key)

    try {
      const resolvedMeal = await selectNearbyMeal({
        meal,
        currentPlace: state.currentPlace,
        currentTime: state.currentTime,
        remainingVisits,
        plan,
        usedMealPlaceIds: state.usedMealPlaceIds,
      })
      nearbyMealByContext.set(key, resolvedMeal)
      return resolvedMeal
    } catch (error) {
      // 변경: 주변 음식점 후보가 없거나 영업 조건을 만족하지 않은 422만 현재 가지를 끝냅니다.
      // DB·ODsay 같은 시스템 오류는 숨기지 않고 기존 오류 처리기로 전달합니다.
      if (error.status !== 422) throw error
      nearbyMealByContext.set(key, null)
      return null
    }
  }

  async function explore(state, remainingVisits, remainingMeals) {
    const currentScore = getCourseScore(state, courseType)
    // 변경: 모든 이동 수치는 음수가 아니므로 현재 점수만으로도 안전한 하한(bound)이 됩니다.
    if (currentScore >= bestScore) {
      searchStats.prunedByBound += 1
      return
    }

    if (remainingVisits.length === 0 && remainingMeals.length === 0) {
      const completedState = endPlace
        ? await createSearchTransition({
          state,
          stop: { ...endPlace, nodeType: "END", stayMinutes: 0 },
          courseType,
          plan,
          routeAlternativesByPlacePair,
        })
        : state
      if (!completedState) {
        searchStats.prunedByConstraint += 1
        return
      }

      const completedScore = getCourseScore(completedState, courseType)
      if (completedScore < bestScore) {
        bestState = completedState
        bestScore = completedScore
      }
      return
    }

    const candidates = remainingVisits.map((visit) => ({
      stop: visit,
      remainingVisits: remainingVisits.filter((candidate) => candidate.placeId !== visit.placeId),
      remainingMeals,
      isNearbyMeal: false,
    }))

    // 변경: 식사는 정해진 시간 창을 지키기 위해 아직 배치하지 않은 가장 이른 식사만 다음 후보로 둡니다.
    if (remainingMeals[0]) {
      candidates.push({
        stop: remainingMeals[0],
        remainingVisits,
        remainingMeals: remainingMeals.slice(1),
        isNearbyMeal: remainingMeals[0].mode === "NEARBY",
      })
    }

    for (const candidate of candidates) {
      searchStats.explored += 1
      const stop = candidate.isNearbyMeal
        ? await resolveNearbyMeal(state, candidate.stop, candidate.remainingVisits)
        : candidate.stop
      if (!stop) {
        searchStats.prunedByConstraint += 1
        continue
      }

      const nextState = await createSearchTransition({
        state,
        stop,
        courseType,
        plan,
        routeAlternativesByPlacePair,
      })
      if (!nextState) {
        searchStats.prunedByConstraint += 1
        continue
      }

      if (candidate.isNearbyMeal) {
        // 변경: 이번 가지에서 확정한 주변 추천 음식점은 다음 식사 후보에서 제외합니다.
        nextState.usedMealPlaceIds = new Set([...state.usedMealPlaceIds, Number(stop.placeId)])
      }

      await explore(nextState, candidate.remainingVisits, candidate.remainingMeals)
    }
  }

  await explore(initialState, visits, orderedMeals)

  if (!bestState) {
    throw createConstraintError([{
      code: "NO_FEASIBLE_ROUTE",
      message: "방문 장소·식사 시간·영업시간·종료 시간 조건을 모두 만족하는 경로를 찾지 못했습니다.",
    }])
  }

  const warnings = [...bestState.warnings]
  if (bestState.usedWalkingFallback) {
    warnings.push("일부 구간은 대중교통 경로가 없어 장소 좌표 기준 도보 추정으로 계산했습니다.")
  }
  // 변경: 결과에 탐색 수를 남겨 Branch-and-Bound가 실제로 적용됐는지 팀에서 확인할 수 있게 합니다.
  warnings.push(`최적 경로 탐색: ${searchStats.explored}개 가지 검토, ${searchStats.prunedByBound + searchStats.prunedByConstraint}개 가지 제외`)

  return {
    courseType,
    summary: bestState.summary,
    warnings,
    nodes: bestState.nodes,
  }
}

async function buildCourse({
  courseType,
  startPlace,
  endPlace,
  visits,
  meals,
  plan,
  routeAlternativesByPlacePair,
  orderedStops = null,
}) {
  // 변경: 새 추천 생성은 그리디 순서 선택 대신 Branch-and-Bound 전체 탐색을 사용합니다.
  // 결과 화면에서 사용자가 직접 편집한 순서는 기존처럼 orderedStops를 그대로 재검증합니다.
  if (!orderedStops) {
    return buildCourseByBranchAndBound({
      courseType,
      startPlace,
      endPlace,
      visits,
      meals,
      plan,
      routeAlternativesByPlacePair,
    })
  }

  let currentTime = new Date(plan.startTime)
  // 변경: 출발 위치가 선택된 경우에만 START 노드를 만들고,
  // 선택하지 않으면 첫 실제 방문 장소 또는 식사에서 일정이 시작됩니다.
  let currentPlace = startPlace ? { ...startPlace, nodeType: "START", stayMinutes: 0 } : null
  let totalMinutes = 0
  let walkingDistanceMeters = 0
  let transferCount = 0
  let estimatedFare = 0
  let usedWalkingFallback = false
  const nodes = []
  const warnings = []

  function addWarning(message) {
    if (!warnings.includes(message)) warnings.push(message)
  }

  async function appendStop(stop, { precomputedLeg = null, mealConstraint = null } = {}) {
    let travelArrivalTime = new Date(currentTime)

    // 변경: START 노드가 없을 때 첫 실제 일정에는 이동 구간이 없습니다.
    // 이후에는 현재 장소가 생기므로 기존과 동일하게 모든 구간의 이동 경로를 계산합니다.
    if (currentPlace) {
      const leg = precomputedLeg ?? await getRouteLeg({
        from: currentPlace,
        to: stop,
        courseType,
        routeAlternativesByPlacePair,
      })
      const bufferMinutes = getTravelBufferMinutes({ route: leg, withPet: plan.withPet })
      travelArrivalTime = addMinutes(currentTime, leg.durationMinutes + bufferMinutes)
      totalMinutes += leg.durationMinutes
      walkingDistanceMeters += leg.walkingDistanceMeters
      transferCount += leg.transferCount
      estimatedFare += leg.estimatedFare
      usedWalkingFallback ||= leg.source === "WALK_FALLBACK"
    }

    // 출발·종료 경계 노드는 PLACE FK를 위한 좌표 대체 노드라 영업·반려동물 검증 대상이 아닙니다.
    let visitStart = travelArrivalTime
    let departureTime = travelArrivalTime
    if (stop.nodeType !== "START" && stop.nodeType !== "END") {
      let requestedStart = null
      if (stop.nodeType === "MEAL" && mealConstraint) {
        const mealTiming = evaluateMealArrival({
          travelArrivalTime,
          constraint: mealConstraint,
          meal: stop,
        })
        if (!mealTiming.isFeasible) {
          throw createConstraintError([{
            code: stop.isFixedReservation ? "RESERVATION_TIME" : "MEAL_TIME_WINDOW",
            placeId: stop.placeId,
            placeName: stop.placeName,
            message: stop.isFixedReservation
              ? `${getMealLabel(stop.mealSlot)} 예약 식당에 ${formatTime(mealConstraint.preferredStart)}까지 20분 여유를 두고 도착할 수 없습니다.`
              : `${getMealLabel(stop.mealSlot)} 식사를 ${mealConstraint.mealWindow.start}~${mealConstraint.mealWindow.end} 안에 시작할 수 없습니다.`,
          }])
        }
        requestedStart = mealTiming.visitStart
        if (mealTiming.waitMinutes > 0) {
          addWarning(`${getMealLabel(stop.mealSlot)} 식사 전 ${mealTiming.waitMinutes}분의 대기 시간이 포함됩니다.`)
        }
      }

      // 변경: 모든 실제 방문 노드는 도착 시각으로 운영시간·휴무일·반려동물 조건을 통과해야 저장됩니다.
      const placeTiming = assertPlaceFeasible(evaluatePlaceVisit({
        plan,
        place: stop,
        travelArrivalTime,
        stayMinutes: stop.stayMinutes,
        requestedStart,
        enforceLastOrder: stop.nodeType === "MEAL",
      }))
      visitStart = placeTiming.visitStart
      departureTime = placeTiming.departureTime
    }

    nodes.push({
      placeId: stop.placeId,
      visitOrder: nodes.length + 1,
      nodeType: stop.nodeType,
      arrivalTime: visitStart.toISOString(),
      departureTime: departureTime.toISOString(),
      stayMinutes: stop.stayMinutes,
    })
    currentPlace = stop
    currentTime = departureTime
  }

  // 변경: 출발 위치를 입력한 계획에서만 일정 첫 항목으로 START 경계 노드를 저장합니다.
  if (currentPlace) await appendStop(currentPlace)

  // 변경: 결과 화면에서 사용자가 직접 편집한 순서는 Branch-and-Bound로 다시 섞지 않고 그대로 재검증합니다.
  for (const stop of orderedStops) {
    const mealConstraint = stop.nodeType === "MEAL" ? createMealConstraint({ plan, meal: stop }) : null
    await appendStop(stop, { mealConstraint })
  }

  // 변경: 종료 위치가 선택된 경우에만 마지막 실제 일정 뒤에 END 경계 노드와 이동 구간을 추가합니다.
  if (endPlace) await appendStop({ ...endPlace, nodeType: "END", stayMinutes: 0 })

  if (currentTime > new Date(plan.endTime)) {
    throw createConstraintError([{
      code: "END_TIME",
      message: `종료 시간 ${formatTime(plan.endTime)}까지 일정을 마칠 수 없습니다. 장소를 줄이거나 체류 시간을 조정해 주세요.`,
    }])
  }
  if (usedWalkingFallback) {
    addWarning("일부 구간은 대중교통 경로가 없어 장소 좌표 기준 도보 추정으로 계산했습니다.")
  }

  return {
    courseType,
    summary: { totalMinutes, walkingDistanceMeters, transferCount, estimatedFare },
    warnings,
    nodes,
  }
}

async function resolveCourseBoundaries(plan) {
  // 변경: 현재 스키마의 COURSE_NODE가 PLACE FK를 요구하므로, 입력된 출발·도착 좌표에만
  // 가장 가까운 PLACE를 경계 노드로 사용합니다. 위치를 선택하지 않은 쪽은 null로 유지합니다.
  const hasStartLocation = hasCoordinates({ latitude: plan.startLatitude, longitude: plan.startLongitude })
  const hasEndLocation = hasCoordinates({ latitude: plan.endLatitude, longitude: plan.endLongitude })
  const [startPlace, endPlace] = await Promise.all([
    hasStartLocation
      ? recommendationRepository.findClosestPlace(plan.startLatitude, plan.startLongitude)
      : Promise.resolve(null),
    hasEndLocation
      ? recommendationRepository.findClosestPlace(plan.endLatitude, plan.endLongitude)
      : Promise.resolve(null),
  ])
  if ((hasStartLocation && !startPlace) || (hasEndLocation && !endPlace)) {
    throw createHttpError("입력한 출발지 또는 도착지 주변 장소를 찾을 수 없습니다.", 422)
  }
  return { startPlace, endPlace }
}

async function createPlanStops({ plan }) {
  const themePreference = parseStoredJson(plan.preferredThemes, { selectedPlaces: [] })
  const mealPreference = parseStoredJson(plan.mealPreference, { meals: [] })
  const selectedPlaces = Array.isArray(themePreference.selectedPlaces) ? themePreference.selectedPlaces : []
  if (selectedPlaces.length > MAX_VISIT_STOPS) {
    throw createHttpError(`필수 방문 장소는 최대 ${MAX_VISIT_STOPS}곳까지 선택할 수 있습니다.`)
  }
  const selectedMeals = Array.isArray(mealPreference.meals) ? mealPreference.meals : []
  const selectedPlaceIds = [...selectedPlaces, ...selectedMeals]
    .map((selection) => Number(selection.placeId))
    .filter(Number.isSafeInteger)
  const places = await recommendationRepository.findPlacesByIds(selectedPlaceIds)
  const placesById = new Map(places.map((place) => [Number(place.placeId), place]))

  const visits = selectedPlaces
    .map((selection) => {
      const place = placesById.get(Number(selection.placeId))
      return place && {
        ...place,
        nodeType: "VISIT",
        stayMinutes: Number(selection.stayMinutes) || place.defaultStayMins || 90,
      }
    })
    .filter(Boolean)

  const meals = selectedMeals
    .filter((selection) => selection.mode !== "SKIP")
    .map((selection) => {
      const mode = selection.mode ?? "DESIGNATED"
      if (mode === "NEARBY") {
        return {
          nodeType: "MEAL",
          mealSlot: selection.mealSlot,
          scheduledTime: selection.scheduledTime,
          mode,
          isFixedReservation: false,
          // 변경: 새 기본 식사 시간(60분)은 저장값이 없는 이전 계획에도 일관되게 적용합니다.
          stayMinutes: getMealStayMinutes(selection),
        }
      }
      const place = placesById.get(Number(selection.placeId))
      return place && {
        ...place,
        nodeType: "MEAL",
        mealSlot: selection.mealSlot,
        scheduledTime: selection.scheduledTime,
        isFixedReservation: selection.isFixedReservation === true,
        mode,
        // 변경: 지정 음식점도 주변 추천과 같은 60분 기본 체류 시간을 사용합니다.
        stayMinutes: getMealStayMinutes(selection),
      }
    })
    .filter(Boolean)

  return { visits, meals }
}

/**
 * 변경: 일정 편집 요청의 장소 순서를 검증 가능한 내부 모델로 변환합니다.
 * 이미 정한 식사 노드는 PLAN의 지정·주변 식사 설정을 다시 결합해 시간 창을 잃지 않습니다.
 */
export async function rebuildCourseForEdit({ plan, courseType, editableNodes }) {
  if (!Array.isArray(editableNodes)) throw createHttpError("수정할 일정 목록을 보내 주세요.")

  const normalizedNodes = editableNodes.map((node) => {
    const placeId = Number(node?.placeId)
    const nodeType = node?.nodeType
    const stayMinutes = Number(node?.stayMinutes)
    if (!Number.isSafeInteger(placeId) || placeId <= 0 || !["VISIT", "MEAL"].includes(nodeType)) {
      throw createHttpError("일정 항목 형식이 올바르지 않습니다.")
    }
    if (!Number.isFinite(stayMinutes) || stayMinutes < 30) {
      throw createHttpError("체류 시간은 30분 이상으로 설정해 주세요.")
    }
    return { placeId, nodeType, stayMinutes: Math.round(stayMinutes) }
  })

  // 변경: 결과 화면 API를 직접 호출해 VISIT 노드를 추가하는 경우에도 관광지·카페 최대 5곳 규칙을 지킵니다.
  const visitNodeCount = normalizedNodes.filter((node) => node.nodeType === "VISIT").length
  if (visitNodeCount > MAX_VISIT_STOPS) {
    throw createHttpError(`방문 장소는 최대 ${MAX_VISIT_STOPS}곳까지 수정할 수 있습니다.`)
  }

  const places = await recommendationRepository.findPlacesByIds(normalizedNodes.map((node) => node.placeId))
  const placesById = new Map(places.map((place) => [Number(place.placeId), place]))
  if (placesById.size !== new Set(normalizedNodes.map((node) => node.placeId)).size) {
    throw createHttpError("일정에 포함된 장소 정보를 찾을 수 없습니다.", 404)
  }

  const mealPreference = parseStoredJson(plan.mealPreference, { meals: [] })
  const storedMeals = Array.isArray(mealPreference.meals) ? mealPreference.meals : []
  const designatedByPlaceId = new Map(
    storedMeals
      .filter((meal) => (meal.mode ?? "DESIGNATED") === "DESIGNATED")
      .map((meal) => [Number(meal.placeId), meal]),
  )
  const nearbyMeals = storedMeals.filter((meal) => meal.mode === "NEARBY")
  let nearbyIndex = 0

  const orderedStops = normalizedNodes.map((node) => {
    const place = placesById.get(node.placeId)
    if (node.nodeType === "VISIT") return { ...place, ...node }

    if (place.placeCategory !== "음식점") {
      throw createHttpError("식사 항목은 음식점만 선택할 수 있습니다.")
    }
    const meal = designatedByPlaceId.get(node.placeId) ?? nearbyMeals[nearbyIndex++]
    if (!meal) {
      throw createHttpError("식사 항목의 시간 설정을 찾을 수 없습니다. 식사 선택 화면에서 다시 설정해 주세요.", 422)
    }
    return {
      ...place,
      ...node,
      mealSlot: meal.mealSlot,
      scheduledTime: meal.scheduledTime,
      mode: meal.mode ?? "DESIGNATED",
      isFixedReservation: meal.isFixedReservation === true,
    }
  })

  const { startPlace, endPlace } = await resolveCourseBoundaries(plan)
  return buildCourse({
    courseType,
    startPlace,
    endPlace,
    visits: [],
    meals: [],
    plan,
    orderedStops,
    routeAlternativesByPlacePair: new Map(),
  })
}

export async function createRecommendation({ userId, tripPlanId }) {
  const normalizedTripPlanId = normalizeTripPlanId(tripPlanId)
  const plan = await recommendationRepository.findOwnedPlan({ userId, tripPlanId: normalizedTripPlanId })
  if (!plan) throw createHttpError("여행 계획을 찾을 수 없거나 추천 권한이 없습니다.", 404)

  const { visits, meals } = await createPlanStops({ plan })
  if (visits.length === 0 && meals.filter((meal) => meal.mode !== "SKIP").length === 0) {
    throw createHttpError("추천 경로에 포함할 장소 또는 식사 방식을 한 가지 이상 선택해 주세요.")
  }

  const { startPlace, endPlace } = await resolveCourseBoundaries(plan)
  const routeAlternativesByPlacePair = new Map()
  const courses = []
  for (const courseType of COURSE_TYPES) {
    courses.push(await buildCourse({
      courseType,
      startPlace,
      endPlace,
      visits,
      meals,
      plan,
      routeAlternativesByPlacePair,
    }))
  }
  const savedCourses = await recommendationRepository.replaceCourses({
    tripPlanId: normalizedTripPlanId,
    courses,
  })

  return {
    tripPlanId: normalizedTripPlanId,
    itineraryIds: savedCourses.map((course) => course.itineraryId),
    status: "SUCCEEDED",
  }
}
