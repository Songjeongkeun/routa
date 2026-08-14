import * as recommendationRepository from "./recommendation.repository.mjs"
import { calculateDistanceKm, getCourseScore } from "./recommendation.scorer.mjs"
import {
  assertPlaceFeasible,
  createConstraintError,
  createHttpError,
  normalizeTripPlanId,
} from "./recommendation.errors.mjs"
import {
  createInitialLeg,
  createMealConstraint,
  evaluateMealArrival,
  formatTime,
  getMealLabel,
  getMealStayMinutes,
  getTravelBufferMinutes,
  hasCoordinates,
  parseStoredJson,
} from "./recommendation.schedule.mjs"
import {
  createRoutePairKey,
  enrichSelectedRouteGeometry,
  getRouteLeg,
} from "./recommendation.route-cache.mjs"
import { findNearbyMealCandidates } from "./recommendation.meal-candidates.mjs"
import { addMinutes } from "../../utils/mealSchedule.mjs"
import { evaluatePlaceVisit } from "../../utils/placeSchedule.mjs"

const COURSE_TYPES = ["SHORTEST_WALK", "FASTEST_TRANSIT", "BALANCED"]
// 완전 탐색의 입력 크기를 제한합니다.
const MAX_VISIT_STOPS = 5
// 긴 공백이 생기는 일정을 피하기 위한 기본 대기 한도입니다.
const MAX_UNPLANNED_WAIT_MINUTES = 60
// 기본 한도에서 실패할 때만 한 번 완화해 가능한 일정을 다시 탐색합니다.
const RECOMMENDATION_WAIT_LIMIT_STAGES = [MAX_UNPLANNED_WAIT_MINUTES, 120]

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
    // 지도 좌표는 최적 경로가 확정된 구간에만 요청합니다.
    routeLegs: [],
    summary: {
      totalMinutes: 0,
      walkingDistanceMeters: 0,
      transferCount: 0,
      estimatedFare: 0,
    },
    warnings: [],
    usedWalkingFallback: false,
    // 이동시간과 별도로 불필요한 대기 시간을 점수에 반영합니다.
    idleMinutes: 0,
    // 지정 음식점은 자동 추천 식당 후보에서 제외합니다.
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
 * 한 탐색 가지에서 다음 장소 하나를 방문했을 때의 시간·제약·이동 수치를 계산합니다.
 * 불가능한 장소는 예외를 전파하지 않고 null을 반환해 해당 Branch를 즉시 종료합니다.
 */
async function createSearchTransition({
  state,
  stop,
  courseType,
  plan,
  routeAlternativesByPlacePair,
  selectedRouteByPair = null,
  // 같은 식사 조건은 캐시된 시간 제약을 재사용합니다.
  getMealConstraint = (meal) => createMealConstraint({ plan, meal }),
  planEndTime = new Date(plan.endTime),
  // 편집 재계산은 기본 대기 한도를 사용합니다.
  maxUnplannedWaitMinutes = MAX_UNPLANNED_WAIT_MINUTES,
  // 잘린 가지의 제약 사유를 상위 탐색기에 전달합니다.
  onConstraint = null,
}) {
  let travelArrivalTime = new Date(state.currentTime)
  let leg = createInitialLeg()

  if (state.currentPlace) {
    leg = await getRouteLeg({
      from: state.currentPlace,
      to: stop,
      courseType,
      routeAlternativesByPlacePair,
      selectedRouteByPair,
    })
    const bufferMinutes = getTravelBufferMinutes({ route: leg, withPet: plan.withPet })
    travelArrivalTime = addMinutes(state.currentTime, leg.durationMinutes + bufferMinutes)
  }

  let visitStart = travelArrivalTime
  let departureTime = travelArrivalTime
  let idleMinutes = 0
  let warnings = state.warnings

  if (stop.nodeType === "MEAL") {
    const mealConstraint = getMealConstraint(stop)
    const mealTiming = evaluateMealArrival({
      travelArrivalTime,
      constraint: mealConstraint,
      meal: stop,
    })
    if (!mealTiming.isFeasible) {
      onConstraint?.({
        code: "MEAL_TIME_WINDOW",
        placeId: stop.placeId,
        placeName: stop.placeName,
        message: `${getMealLabel(stop.mealSlot)} 식사 시간 또는 예약 시각에 ${stop.placeName}을(를) 배치할 수 없습니다.`,
      })
      return null
    }

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
    if (!placeTiming.isFeasible) {
      placeTiming.conflicts.forEach((conflict) => onConstraint?.(conflict))
      return null
    }
    // 고정 예약이 아닌 일정에서 설정된 최대 대기시간을 넘게 기다려야 하는 Branch는 잘라내고,
    // 남아 있는 관광지·카페를 먼저 배치할 수 있는 다른 순서를 계속 탐색합니다.
    if (!stop.isFixedReservation && placeTiming.waitMinutes > maxUnplannedWaitMinutes) {
      onConstraint?.({
        code: "EXCESSIVE_WAIT",
        placeId: stop.placeId,
        placeName: stop.placeName,
        message: `${stop.placeName} 방문 전 ${placeTiming.waitMinutes}분을 기다려야 합니다.`,
      })
      return null
    }
    visitStart = placeTiming.visitStart
    departureTime = placeTiming.departureTime
    idleMinutes = placeTiming.waitMinutes

    if (stop.nodeType !== "MEAL" && placeTiming.waitMinutes > 0) {
      warnings = appendSearchWarning(
        warnings,
        `${stop.placeName} 운영 시작 전 ${placeTiming.waitMinutes}분의 대기 시간이 포함됩니다.`,
      )
    }
  }

  // 종료 시각을 넘긴 가지는 더 탐색하지 않습니다.
  if (departureTime > planEndTime) {
    onConstraint?.({
      code: "PLAN_END_TIME",
      placeId: stop.placeId,
      placeName: stop.placeName,
      message: `${stop.placeName}까지 포함하면 여행 종료 시간을 넘깁니다.`,
    })
    return null
  }

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
    // 최종 선택 뒤 추가한 지도 좌표를 같은 후보 객체와 DB 캐시에 반영합니다.
    routeLegs: state.currentPlace
      ? [...state.routeLegs, {
        pairKey: createRoutePairKey(state.currentPlace, stop),
        from: state.currentPlace,
        to: stop,
        route: leg,
      }]
      : state.routeLegs,
    summary: nextSummary,
    warnings,
    usedWalkingFallback: state.usedWalkingFallback || leg.source === "WALK_FALLBACK",
    idleMinutes: state.idleMinutes + idleMinutes,
  }
}

/**
 * 최대 방문 5곳·식사 2곳 범위에서 유효한 순서를 Branch-and-Bound로 탐색합니다.
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
  maxUnplannedWaitMinutes = MAX_UNPLANNED_WAIT_MINUTES,
}) {
  const orderedMeals = [...meals]
    .filter((meal) => meal.mode !== "SKIP")
    .sort((firstMeal, secondMeal) => firstMeal.scheduledTime.localeCompare(secondMeal.scheduledTime))
  const initialState = createInitialSearchState({ startPlace, plan, meals: orderedMeals })
  const nearbyMealByContext = new Map()
  // 같은 반경의 자동 식당 목록은 한 번만 조회합니다.
  const nearbyRestaurantCandidatesByQuery = new Map()
  // 장소 쌍과 코스 기준별 최종 교통 후보를 메모이제이션합니다.
  const selectedRouteByPair = new Map()
  // 지정 식당의 시간창은 경로와 무관하므로 재사용합니다.
  const mealConstraintByKey = new Map()
  // 동일 상태에서는 누적 비용이 더 큰 가지를 제거합니다.
  const bestScoreByExactState = new Map()
  const planEndTime = new Date(plan.endTime)
  const searchStats = {
    explored: 0,
    prunedByBound: 0,
    prunedByConstraint: 0,
    prunedByRemainingStay: 0,
    prunedByMemo: 0,
  }
  // 모든 가지가 실패해도 사용자에게 보여 줄 제약 사유를 수집합니다.
  const constraintConflictsByKey = new Map()
  let bestState = null
  let bestScore = Number.POSITIVE_INFINITY

  function recordConstraint(conflict) {
    if (!conflict?.message) return
    const key = `${conflict.code ?? "CONSTRAINT"}:${conflict.placeId ?? ""}`
    if (!constraintConflictsByKey.has(key) && constraintConflictsByKey.size < 5) {
      constraintConflictsByKey.set(key, conflict)
    }
  }

  function getCachedMealConstraint(meal) {
    const key = [
      meal.placeId ?? "NEARBY",
      meal.mealSlot,
      meal.scheduledTime,
      meal.stayMinutes,
      meal.isFixedReservation === true,
      meal.startTime,
      meal.endTime,
      meal.lastOrder,
    ].join(":")
    if (!mealConstraintByKey.has(key)) {
      mealConstraintByKey.set(key, createMealConstraint({ plan, meal }))
    }
    return mealConstraintByKey.get(key)
  }

  function getExactStateKey(state, remainingVisits, remainingMeals) {
    const remainingVisitIds = remainingVisits
      .map((visit) => Number(visit.placeId))
      .sort((first, second) => first - second)
      .join(",")
    const remainingMealKeys = remainingMeals
      .map((meal) => `${meal.mealSlot}:${meal.placeId ?? "NEARBY"}`)
      .join(",")
    const usedMealIds = [...state.usedMealPlaceIds]
      .sort((first, second) => first - second)
      .join(",")
    return [
      state.currentPlace?.placeId ?? "NO_START",
      state.currentTime.getTime(),
      remainingVisitIds,
      remainingMealKeys,
      usedMealIds,
    ].join("|")
  }

  function exceedsEndTimeWithMinimumRemainingStay(state, remainingVisits, remainingMeals) {
    // 남은 체류시간만 더해도 종료 시각을 넘기면 가지를 제거합니다.
    const minimumRemainingStayMinutes = [...remainingVisits, ...remainingMeals]
      .reduce((total, stop) => total + Math.max(0, Number(stop.stayMinutes) || 0), 0)
    return addMinutes(state.currentTime, minimumRemainingStayMinutes) > planEndTime
  }

  async function resolveNearbyMealCandidates(state, meal, remainingVisits) {
    const key = [
      meal.mealSlot,
      state.currentPlace?.placeId ?? "NO_START",
      state.currentTime.getTime(),
      remainingVisits.map((visit) => visit.placeId).sort((first, second) => Number(first) - Number(second)).join(","),
      [...state.usedMealPlaceIds].sort((first, second) => first - second).join(","),
    ].join(":")
    if (nearbyMealByContext.has(key)) return nearbyMealByContext.get(key)

    try {
      const resolvedMeals = await findNearbyMealCandidates({
        meal,
        currentPlace: state.currentPlace,
        currentTime: state.currentTime,
        remainingVisits,
        plan,
        usedMealPlaceIds: state.usedMealPlaceIds,
        nearbyRestaurantCandidatesByQuery,
      })
      nearbyMealByContext.set(key, resolvedMeals)
      return resolvedMeals
    } catch (error) {
      // 사용자 조건 충돌만 현재 가지를 끝내고, 시스템 오류는 그대로 전파합니다.
      if (error.status !== 422) throw error
      ;(error.conflicts ?? []).forEach(recordConstraint)
      nearbyMealByContext.set(key, [])
      return []
    }
  }

  /**
   * 방문지는 각각 다음 후보로 분기하고, 식사는 시간 역전을 막기 위해
   * 점심·저녁 중 아직 남은 가장 이른 한 슬롯만 다음 후보로 만듭니다.
   */
  function createSearchCandidates(remainingVisits, remainingMeals) {
    const candidates = remainingVisits.map((visit) => ({
      stop: visit,
      remainingVisits: remainingVisits.filter((candidate) => candidate.placeId !== visit.placeId),
      remainingMeals,
      isNearbyMeal: false,
    }))

    // 식사는 시간창을 지키기 위해 가장 이른 슬롯만 다음 후보로 둡니다.
    if (remainingMeals[0]) {
      candidates.push({
        stop: remainingMeals[0],
        remainingVisits,
        remainingMeals: remainingMeals.slice(1),
        isNearbyMeal: remainingMeals[0].mode === "NEARBY",
      })
    }

    return candidates
  }

  /**
   * 탐색 순서만 정하는 가벼운 우선순위입니다.
   * 실제 최적성 판단은 createSearchTransition의 실제 이동 수치와 B&B 점수로 하므로,
   * 이 근사 거리 계산은 결과의 정확도를 바꾸지 않고 빠른 초기해 탐색만 돕습니다.
   */
  function getCandidatePriority(state, candidate) {
    // 자동 식사는 실제 식당이 정해지기 전이므로 방문지만 거리 우선으로 정렬합니다.
    if (candidate.stop.nodeType !== "MEAL") {
      return state.currentPlace ? calculateDistanceKm(state.currentPlace, candidate.stop) : 0
    }

    // 후보 정렬도 실제 전이와 같은 식사 제약 캐시를 사용합니다.
    const constraint = getCachedMealConstraint(candidate.stop)
    const minutesUntilLatestStart = constraint.latestStart
      ? Math.round((constraint.latestStart.getTime() - state.currentTime.getTime()) / 60_000)
      : Number.POSITIVE_INFINITY

    // 식사 마감이 임박하면 먼저 시도하고, 그렇지 않으면 가까운 방문지를 우선합니다.
    return minutesUntilLatestStart <= 60 ? -1_000_000 : 10_000
  }

  function sortSearchCandidates(state, candidates) {
    return [...candidates].sort((first, second) => {
      const priorityDifference = getCandidatePriority(state, first) - getCandidatePriority(state, second)
      if (priorityDifference !== 0) return priorityDifference
      return Number(first.stop.placeId) - Number(second.stop.placeId)
    })
  }

  /**
   * 일반 방문지와 자동 추천 식당의 다음 상태 생성 과정을 한 곳으로 모읍니다.
   * 그리디 초기해와 전체 B&B 탐색이 같은 시간 창·영업시간·중복 식당 검증을 사용하게 합니다.
   */
  async function createCandidateTransitions(state, candidate) {
    // 자동 식사는 최대 3개 후보로 분기해 영업시간 충돌에 대비합니다.
    const stops = candidate.isNearbyMeal
      ? await resolveNearbyMealCandidates(state, candidate.stop, candidate.remainingVisits)
      : [candidate.stop]
    const transitions = []

    for (const stop of stops) {
      const nextState = await createSearchTransition({
        state,
        stop,
        courseType,
        plan,
        routeAlternativesByPlacePair,
        selectedRouteByPair,
        getMealConstraint: getCachedMealConstraint,
        planEndTime,
        maxUnplannedWaitMinutes,
        onConstraint: recordConstraint,
      })
      if (!nextState) continue

      if (candidate.isNearbyMeal) {
        // 이번 가지에서 고른 자동 식당은 다음 식사 후보에서 제외합니다.
        nextState.usedMealPlaceIds = new Set([...state.usedMealPlaceIds, Number(stop.placeId)])
      }
      transitions.push({ ...candidate, nextState })
    }

    return transitions
  }

  /**
   * 완전 탐색 전 빠른 초기해를 만들어 가지치기 상한값으로 사용합니다.
   * 그리디 결과는 최적해가 아니며 이후 B&B가 모든 유효한 순서를 계속 검토합니다.
   */
  async function createGreedyInitialSolution() {
    let state = initialState
    let remainingVisits = visits
    let remainingMeals = orderedMeals

    while (remainingVisits.length > 0 || remainingMeals.length > 0) {
      const candidates = sortSearchCandidates(
        state,
        createSearchCandidates(remainingVisits, remainingMeals),
      )
      let selectedTransition = null

      for (const candidate of candidates) {
        const transitions = await createCandidateTransitions(state, candidate)
        if (transitions[0]) {
          selectedTransition = transitions[0]
          break
        }
      }

      if (!selectedTransition) return null
      state = selectedTransition.nextState
      remainingVisits = selectedTransition.remainingVisits
      remainingMeals = selectedTransition.remainingMeals
    }

    if (!endPlace) return state
    return createSearchTransition({
      state,
      stop: { ...endPlace, nodeType: "END", stayMinutes: 0 },
      courseType,
      plan,
      routeAlternativesByPlacePair,
      selectedRouteByPair,
      getMealConstraint: getCachedMealConstraint,
      planEndTime,
      maxUnplannedWaitMinutes,
      onConstraint: recordConstraint,
    })
  }

  async function explore(state, remainingVisits, remainingMeals) {
    if (exceedsEndTimeWithMinimumRemainingStay(state, remainingVisits, remainingMeals)) {
      searchStats.prunedByRemainingStay += 1
      return
    }

    const currentScore = getCourseScore(state, courseType)
    // 모든 이동 수치는 음수가 아니므로 현재 점수만으로도 안전한 하한(bound)이 됩니다.
    if (currentScore >= bestScore) {
      searchStats.prunedByBound += 1
      return
    }

    const exactStateKey = getExactStateKey(state, remainingVisits, remainingMeals)
    const previousBestScore = bestScoreByExactState.get(exactStateKey)
    if (previousBestScore != null && previousBestScore <= currentScore) {
      searchStats.prunedByMemo += 1
      return
    }
    bestScoreByExactState.set(exactStateKey, currentScore)

    if (remainingVisits.length === 0 && remainingMeals.length === 0) {
      const completedState = endPlace
        ? await createSearchTransition({
          state,
          stop: { ...endPlace, nodeType: "END", stayMinutes: 0 },
          courseType,
          plan,
          routeAlternativesByPlacePair,
          selectedRouteByPair,
          getMealConstraint: getCachedMealConstraint,
          planEndTime,
          maxUnplannedWaitMinutes,
          onConstraint: recordConstraint,
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

    const candidates = sortSearchCandidates(
      state,
      createSearchCandidates(remainingVisits, remainingMeals),
    )

    for (const candidate of candidates) {
      searchStats.explored += 1
      const transitions = await createCandidateTransitions(state, candidate)
      if (transitions.length === 0) {
        searchStats.prunedByConstraint += 1
        continue
      }

      for (const transition of transitions) {
        await explore(transition.nextState, transition.remainingVisits, transition.remainingMeals)
      }
    }
  }

  const greedyInitialSolution = await createGreedyInitialSolution()
  if (greedyInitialSolution) {
    bestState = greedyInitialSolution
    bestScore = getCourseScore(greedyInitialSolution, courseType)
  }

  await explore(initialState, visits, orderedMeals)

  if (!bestState) {
    throw createConstraintError([{
      code: "NO_FEASIBLE_ROUTE",
      message: `방문 장소·식사 시간·영업시간·최대 대기 ${maxUnplannedWaitMinutes}분·종료 시간 조건을 모두 만족하는 경로를 찾지 못했습니다.`,
    }, ...constraintConflictsByKey.values()])
  }

  // 최적 경로의 실제 이동 구간에만 지도 좌표를 보강합니다.
  await enrichSelectedRouteGeometry({
    routeLegs: bestState.routeLegs,
    routeAlternativesByPlacePair,
  })

  const warnings = [...bestState.warnings]
  if (maxUnplannedWaitMinutes > MAX_UNPLANNED_WAIT_MINUTES) {
    // 완화된 대기 한도를 사용했음을 사용자에게 알립니다.
    warnings.push(`일정을 만들기 위해 최대 대기 시간을 ${maxUnplannedWaitMinutes}분까지 허용했습니다.`)
  }
  if (bestState.usedWalkingFallback) {
    warnings.push("일부 구간은 대중교통 경로가 없어 장소 좌표 기준 도보 추정으로 계산했습니다.")
  }
  // 탐색·가지치기 수를 결과에 남겨 추천 과정을 확인할 수 있게 합니다.
  const prunedCount = searchStats.prunedByBound
    + searchStats.prunedByConstraint
    + searchStats.prunedByRemainingStay
    + searchStats.prunedByMemo
  warnings.push(`최적 경로 탐색: ${searchStats.explored}개 가지 검토, ${prunedCount}개 가지 제외`)

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
  // 기본 경로는 Branch-and-Bound 전체 탐색을 사용합니다.
  // orderedStops는 순서 고정이 필요한 별도 기능에서만 사용합니다.
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
  // 출발 위치가 없으면 첫 실제 방문 장소 또는 식사에서 일정을 시작합니다.
  let currentPlace = startPlace ? { ...startPlace, nodeType: "START", stayMinutes: 0 } : null
  let totalMinutes = 0
  let walkingDistanceMeters = 0
  let transferCount = 0
  let estimatedFare = 0
  let usedWalkingFallback = false
  const nodes = []
  // 순서가 확정된 구간만 지도 좌표를 추가로 요청합니다.
  const routeLegs = []
  const warnings = []

  function addWarning(message) {
    if (!warnings.includes(message)) warnings.push(message)
  }

  async function appendStop(stop, { precomputedLeg = null, mealConstraint = null } = {}) {
    let travelArrivalTime = new Date(currentTime)

    // START 노드가 없으면 첫 실제 일정에는 이동 구간이 없습니다.
    if (currentPlace && stop.nodeType !== "START") {
      const from = currentPlace
      const leg = precomputedLeg ?? await getRouteLeg({
        from,
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
      routeLegs.push({
        pairKey: createRoutePairKey(from, stop),
        from,
        to: stop,
        route: leg,
      })
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

      // 모든 실제 방문 노드는 도착 시각으로 운영시간·휴무일·반려동물 조건을 통과해야 저장됩니다.
      const placeTiming = assertPlaceFeasible(evaluatePlaceVisit({
        plan,
        place: stop,
        travelArrivalTime,
        stayMinutes: stop.stayMinutes,
        requestedStart,
        enforceLastOrder: stop.nodeType === "MEAL",
      }))
      // 사용자가 순서를 직접 편집한 경우에도 신규 추천과 같은 최대 대기시간을 적용합니다.
      // 실패하면 COURSE_NODE를 교체하지 않으므로 기존 저장 일정은 그대로 보존됩니다.
      if (!stop.isFixedReservation && placeTiming.waitMinutes > MAX_UNPLANNED_WAIT_MINUTES) {
        throw createConstraintError([{
          code: "EXCESSIVE_WAIT",
          placeId: stop.placeId,
          placeName: stop.placeName,
          message: `${stop.placeName}까지 ${placeTiming.waitMinutes}분을 기다려야 합니다. 방문 순서나 식사 시간을 조정해 대기시간을 ${MAX_UNPLANNED_WAIT_MINUTES}분 이하로 줄여 주세요.`,
        }])
      }
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

  // 출발 위치를 입력한 계획에서만 START 경계 노드를 저장합니다.
  if (currentPlace) await appendStop(currentPlace)

  // 순서를 고정해야 하는 호출에서만 입력 순서를 그대로 검증합니다.
  for (const stop of orderedStops) {
    const mealConstraint = stop.nodeType === "MEAL" ? createMealConstraint({ plan, meal: stop }) : null
    await appendStop(stop, { mealConstraint })
  }

  // 종료 위치가 있으면 마지막 일정 뒤에 END 경계 노드를 추가합니다.
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

  // 편집으로 확정한 이동 구간만 지도 그래픽을 보강합니다.
  await enrichSelectedRouteGeometry({ routeLegs, routeAlternativesByPlacePair })

  return {
    courseType,
    summary: { totalMinutes, walkingDistanceMeters, transferCount, estimatedFare },
    warnings,
    nodes,
  }
}

async function resolveCourseBoundaries(plan) {
  // COURSE_NODE의 PLACE FK를 만족하기 위해 좌표와 가장 가까운 PLACE를 경계 노드로 사용합니다.
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
        // USER 장소는 유지하고 RECOMMENDED 장소만 완화 단계에서 줄일 수 있습니다.
        selectionSource: selection.selectionSource === "RECOMMENDED" ? "RECOMMENDED" : "USER",
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
          // 저장값이 없는 이전 계획에도 기본 식사 시간 60분을 적용합니다.
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
        // 지정 음식점도 자동 추천과 같은 기본 체류 시간을 사용합니다.
        stayMinutes: getMealStayMinutes(selection),
      }
    })
    .filter(Boolean)

  return { visits, meals }
}

/**
 * 가능한 일정을 찾기 위한 단계형 탐색 래퍼입니다.
 * 1) 모든 장소를 60분 대기 제한으로 탐색하고, 2) 실제 가능한 일정까지 버리지 않도록 120분으로
 * 한 번 완화합니다. 그래도 실패한 경우에만 자동 추천 장소를 마지막 항목부터 하나씩 제외합니다.
 * 사용자가 직접 선택한 USER 장소와 지정·주변 식사 조건은 어떤 단계에서도 제외하지 않습니다.
 */
async function buildCourseWithRelaxations({
  courseType,
  startPlace,
  endPlace,
  visits,
  meals,
  plan,
  routeAlternativesByPlacePair,
}) {
  const userVisits = visits.filter((visit) => visit.selectionSource !== "RECOMMENDED")
  const recommendedVisits = visits.filter((visit) => visit.selectionSource === "RECOMMENDED")
  const visitVariants = [
    { visits, removedRecommendedCount: 0 },
    // 자동 추천 목록의 뒤쪽부터 하나씩 줄입니다. 장소 추천 API가 테마·거리·평점 순으로
    // 반환하므로 앞쪽의 높은 우선순위 추천은 최대한 보존하면서 시간 안에 들어가는 경로를 찾습니다.
    ...recommendedVisits.map((_, index) => ({
      visits: [...userVisits, ...recommendedVisits.slice(0, recommendedVisits.length - index - 1)],
      removedRecommendedCount: index + 1,
    })),
  ]
  const collectedConflicts = new Map()

  function collectConflicts(error) {
    ;(error?.conflicts ?? []).forEach((conflict) => {
      if (!conflict?.message) return
      const key = `${conflict.code ?? "CONSTRAINT"}:${conflict.placeId ?? ""}`
      if (!collectedConflicts.has(key) && collectedConflicts.size < 5) collectedConflicts.set(key, conflict)
    })
  }

  // 먼저 대기 한도만 60→120분으로 완화하고, 이후에만 자동 추천 장소를 줄입니다.
  const attempts = [
    ...RECOMMENDATION_WAIT_LIMIT_STAGES.map((maxUnplannedWaitMinutes) => ({
      visits,
      removedRecommendedCount: 0,
      maxUnplannedWaitMinutes,
    })),
    ...visitVariants
      .filter((variant) => variant.removedRecommendedCount > 0)
      .flatMap((variant) => RECOMMENDATION_WAIT_LIMIT_STAGES.map((maxUnplannedWaitMinutes) => ({
        ...variant,
        maxUnplannedWaitMinutes,
      }))),
  ]

  for (const attempt of attempts) {
    try {
      const course = await buildCourseByBranchAndBound({
        courseType,
        startPlace,
        endPlace,
        visits: attempt.visits,
        meals,
        plan,
        routeAlternativesByPlacePair,
        maxUnplannedWaitMinutes: attempt.maxUnplannedWaitMinutes,
      })
      const warnings = [...course.warnings]
      if (attempt.removedRecommendedCount > 0) {
        warnings.push(`시간 제약을 맞추기 위해 자동 추천 장소 ${attempt.removedRecommendedCount}곳을 제외했습니다.`)
      }
      return { ...course, warnings }
    } catch (error) {
      // 사용자 조건 충돌만 다음 완화 단계로 넘기고 시스템 오류는 그대로 전파합니다.
      if (error.status !== 422) throw error
      collectConflicts(error)
    }
  }

  throw createConstraintError([{
    code: "NO_FEASIBLE_ROUTE",
    message: "선택한 장소와 식사 조건을 만족하는 경로를 찾지 못했습니다.",
  }, ...collectedConflicts.values()])
}

/**
 * 일정 편집 요청을 Branch-and-Bound 탐색용 내부 모델로 변환합니다.
 * 관광지·카페의 순서는 자동 최적화하고, 이미 고른 식당과 식사 시간 창은 그대로 유지합니다.
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

  // 결과 화면에서 직접 요청해도 방문 장소 최대 5곳 규칙을 적용합니다.
  const visitNodeCount = normalizedNodes.filter((node) => node.nodeType === "VISIT").length
  if (visitNodeCount > MAX_VISIT_STOPS) {
    throw createHttpError(`방문 장소는 최대 ${MAX_VISIT_STOPS}곳까지 수정할 수 있습니다.`)
  }
  const mealNodeCount = normalizedNodes.filter((node) => node.nodeType === "MEAL").length
  if (mealNodeCount > 2) {
    throw createHttpError("식사 장소는 최대 2곳까지 수정할 수 있습니다.")
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

  // 편집 중 남긴 방문 장소는 USER로 취급해 자동 완화에서 제외하지 않습니다.
  const visits = normalizedNodes
    .filter((node) => node.nodeType === "VISIT")
    .map((node) => ({
      ...placesById.get(node.placeId),
      ...node,
      selectionSource: "USER",
    }))

  const meals = normalizedNodes
    .filter((node) => node.nodeType === "MEAL")
    .map((node) => {
      const place = placesById.get(node.placeId)
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
        // 편집 재계산에서는 현재 선택된 식당을 고정합니다.
        mode: "DESIGNATED",
        isFixedReservation: meal.isFixedReservation === true,
      }
    })

  const { startPlace, endPlace } = await resolveCourseBoundaries(plan)
  // 방문 순서는 다시 탐색하고, 식사는 점심·저녁 시간창을 유지합니다.
  return buildCourse({
    courseType,
    startPlace,
    endPlace,
    visits,
    meals,
    plan,
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
  const failedCourses = []
  for (const courseType of COURSE_TYPES) {
    try {
      // 한 추천 기준이 실패해도 성공한 다른 코스는 반환합니다.
      courses.push(await buildCourseWithRelaxations({
        courseType,
        startPlace,
        endPlace,
        visits,
        meals,
        plan,
        routeAlternativesByPlacePair,
      }))
    } catch (error) {
      // 사용자 조건 충돌만 부분 성공 응답에 포함하고 시스템 오류는 전파합니다.
      if (error.status !== 422) throw error
      failedCourses.push({
        courseType,
        message: error.message,
        conflicts: Array.isArray(error.conflicts) ? error.conflicts : [],
      })
    }
  }

  if (courses.length === 0) {
    // 모든 코스가 실패하면 수집한 제약 사유를 하나로 합칩니다.
    const conflictsByKey = new Map()
    failedCourses.flatMap((course) => course.conflicts).forEach((conflict) => {
      if (!conflict?.message) return
      const key = `${conflict.code ?? "CONSTRAINT"}:${conflict.placeId ?? ""}`
      if (!conflictsByKey.has(key) && conflictsByKey.size < 5) conflictsByKey.set(key, conflict)
    })
    throw createConstraintError([{
      code: "NO_FEASIBLE_ROUTE",
      message: "선택한 장소·식사 시간·영업시간 조건으로는 추천 경로를 만들지 못했습니다.",
    }, ...conflictsByKey.values()])
  }

  const savedCourses = await recommendationRepository.replaceCourses({
    tripPlanId: normalizedTripPlanId,
    courses,
  })

  return {
    tripPlanId: normalizedTripPlanId,
    itineraryIds: savedCourses.map((course) => course.itineraryId),
    // 모든 코스 성공과 부분 성공을 응답에서 구분합니다.
    status: failedCourses.length === 0 ? "SUCCEEDED" : "PARTIAL",
    courses: savedCourses,
    failedCourses,
  }
}
