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
// 변경: 영업 시작·식사 시간까지 아무 활동 없이 기다리는 구간은 최대 60분까지만 허용합니다.
// 더 긴 공백은 다른 관광지를 사이에 배치하는 Branch를 탐색하게 해 2시간 이상 비는 일정을 방지합니다.
const MAX_UNPLANNED_WAIT_MINUTES = 60
// 변경: 일반 여행 추천은 먼저 60분 대기 제한으로 자연스러운 코스를 찾습니다.
// 해가 없을 때만 120분까지 한 번 더 탐색해, 실제로 가능한 일정까지 모두 실패로 처리하지 않습니다.
const RECOMMENDATION_WAIT_LIMIT_STAGES = [MAX_UNPLANNED_WAIT_MINUTES, 120]
// 변경: 자동 식당은 한 곳만 고르면 실제 이동 뒤 영업시간에 걸렸을 때 대안이 없습니다.
// 반경별 DB 후보는 넉넉히 읽고, 그중 상위 3곳을 Branch-and-Bound의 실제 이동시간으로 비교합니다.
const MAX_NEARBY_RESTAURANT_CANDIDATES = 20
const MAX_NEARBY_MEAL_BRANCHES = 3

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

/**
 * 변경: 탐색 요청 안에서 같은 방향의 장소 쌍을 하나의 키로 관리합니다.
 * 대중교통은 A→B와 B→A의 시간·노선이 다를 수 있으므로 두 방향을 별도 캐시합니다.
 */
function createRoutePairKey(from, to) {
  return `${from.placeId}:${to.placeId}`
}

/**
 * 변경: DB ROUTE_SECTION의 TEXT JSON을 탐색에 사용할 후보 배열로 복원합니다.
 * 이전 형식처럼 alternatives가 없는 행도 대표 수치로 변환해, 캐시 형식 변경 때문에
 * 추천 자체가 실패하지 않도록 호환성을 유지합니다.
 */
function getStoredRouteAlternatives(routeSection) {
  const storedPath = parseStoredJson(routeSection?.pathDetails, null)
  const alternatives = Array.isArray(storedPath?.alternatives)
    ? storedPath.alternatives
    : []

  if (alternatives.length > 0) return alternatives

  // 변경: 후보 전체를 저장하기 전의 이전 ROUTE_SECTION 행도 재사용할 수 있도록,
  // 대표 수치만으로 최소 한 개의 호환 가능한 후보를 복원합니다.
  if (!routeSection) return []
  const source = routeSection.transportMode === "WALK_REAL"
    ? "KAKAO_WALK"
    : (routeSection.transportMode === "WALK_FALLBACK" ? "WALK_FALLBACK" : "ODSAY")

  return [{
    durationMinutes: Number(routeSection.durationMinutes) || 0,
    walkingDistanceMeters: Number(routeSection.walkingDistanceMeters) || 0,
    transferCount: Number(routeSection.transferCount) || 0,
    estimatedFare: Number(routeSection.estimatedFare) || 0,
    source,
    steps: [],
    geometrySegments: [],
    mapObject: null,
  }]
}

/**
 * 변경: 탐색 중 새로 외부 API에서 찾은 후보와, 최종 경로에 추가된 지도 좌표를
 * 같은 ROUTE_SECTION 행에 저장합니다. 다음 추천은 이 데이터를 먼저 읽습니다.
 */
async function persistRouteAlternatives({ from, to, alternatives }) {
  const representativeRoute = selectRouteAlternative(alternatives, "BALANCED")
  if (!representativeRoute) return

  await recommendationRepository.upsertRouteSection({
    originPlaceId: from.placeId,
    destinationPlaceId: to.placeId,
    route: { ...representativeRoute, alternatives },
  })
}

/**
 * 변경: 지도 좌표(loadLane)는 B&B가 최종 순서를 고른 뒤에만 조회합니다.
 * 탐색 단계에서 탈락할 수백 개의 가지까지 노선 그래픽을 받지 않아 추천 응답 시간을 줄입니다.
 */
async function enrichSelectedRouteGeometry({ routeLegs, routeAlternativesByPlacePair }) {
  const uniqueLegs = new Map()
  for (const routeLeg of routeLegs) {
    if (routeLeg.route.source !== "ODSAY" || !routeLeg.route.mapObject) continue
    uniqueLegs.set(routeLeg.pairKey, routeLeg)
  }

  // 변경: ODsay 그래픽 API를 한 번에 과도하게 호출하지 않으면서도, 선택된 구간은 병렬로 보완합니다.
  const selectedLegs = [...uniqueLegs.values()]
  const workerCount = Math.min(3, selectedLegs.length)
  let nextIndex = 0

  async function enrichNextLeg() {
    while (nextIndex < selectedLegs.length) {
      const routeLeg = selectedLegs[nextIndex]
      nextIndex += 1

      if (!Object.hasOwn(routeLeg.route, "geometrySegments")) {
        routeLeg.route.geometrySegments = await loadPublicTransitRouteGeometry(routeLeg.route.mapObject)
      }

      const alternatives = routeAlternativesByPlacePair.get(routeLeg.pairKey)
      if (alternatives) {
        // routeLeg.route는 alternatives 안의 동일 객체이므로, 좌표를 추가한 최신 후보 전체를 다시 보관합니다.
        await persistRouteAlternatives({ from: routeLeg.from, to: routeLeg.to, alternatives })
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => enrichNextLeg()))
}

async function getRouteLeg({
  from,
  to,
  courseType,
  routeAlternativesByPlacePair,
  // 변경: 같은 장소 쌍은 B&B의 여러 분기에서 반복 방문됩니다.
  // ODsay 후보 목록은 이미 캐시하지만, 코스 기준별 최종 후보 선택도 한 번만 수행하도록 별도 캐시를 받습니다.
  selectedRouteByPair = null,
}) {
  const pairKey = createRoutePairKey(from, to)
  const selectedRouteKey = `${courseType}:${pairKey}`
  const selectedRoute = selectedRouteByPair?.get(selectedRouteKey)
  if (selectedRoute) return selectedRoute

  let alternatives = routeAlternativesByPlacePair.get(pairKey)

  if (!alternatives) {
    // 변경: 메모리 캐시가 비어도 DB의 ROUTE_SECTION 후보를 먼저 사용합니다.
    // 이로써 서버 재시작이나 다른 사용자의 동일 경로 추천 후에도 외부 길찾기 호출을 줄입니다.
    const storedRouteSection = await recommendationRepository.findRouteSection({
      originPlaceId: from.placeId,
      destinationPlaceId: to.placeId,
    })
    alternatives = getStoredRouteAlternatives(storedRouteSection)

    if (alternatives.length === 0) {
      alternatives = await searchPublicTransitRoutes({ from, to })
      // 변경: 실제 길찾기로 새로 찾은 후보만 DB 캐시에 기록합니다.
      // 지도 그래픽은 최종 경로 보강 단계에서 추가된 뒤 한 번 더 갱신됩니다.
      await persistRouteAlternatives({ from, to, alternatives })
    }
    routeAlternativesByPlacePair.set(pairKey, alternatives)
  }

  const route = selectRouteAlternative(alternatives, courseType)
  if (!route) throw createHttpError("대중교통 경로 후보를 선택하지 못했습니다.", 422)

  // 변경: alternatives 내부 객체를 그대로 보관합니다.
  // 이후 최종 경로에서 geometrySegments가 추가돼도 B&B가 사용한 동일한 경로 객체를 공유합니다.
  selectedRouteByPair?.set(selectedRouteKey, route)
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
 * 변경: 주변 추천 식사는 현재 장소와 다음 방문 후보 양쪽에서 500m부터 찾고,
 * 1km·2km까지 순서대로 반경을 넓힙니다. 단일 식당을 바로 확정하지 않고 상위 후보를 반환해,
 * 실제 이동 후 한 식당이 영업·식사 시간에 맞지 않아도 다음 식당 Branch를 탐색할 수 있게 합니다.
 */
async function findNearbyMealCandidates({
  meal,
  currentPlace,
  currentTime,
  remainingVisits,
  plan,
  usedMealPlaceIds,
  nearbyRestaurantCandidatesByQuery,
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

  for (const radiusKm of [0.5, 1, 2]) {
    const candidatesById = new Map()
    for (const anchor of anchors) {
      const cacheKey = `${anchor.placeId}:${radiusKm}:${plan.withPet ? "PET" : "ALL"}`
      let candidates = nearbyRestaurantCandidatesByQuery.get(cacheKey)

      if (!candidates) {
        // 변경: 식사 도착 시각은 가지마다 달라져도, '이 장소 반경의 식당 목록' 자체는 같습니다.
        // 따라서 DB에서는 상위 후보를 한 번만 읽고, 가지마다의 영업·라스트오더 판정은 아래에서 계속 수행합니다.
        candidates = await recommendationRepository.findNearbyRestaurants({
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          radiusKm,
          withPet: plan.withPet,
          excludePlaceIds: [],
          limit: MAX_NEARBY_RESTAURANT_CANDIDATES,
        })
        nearbyRestaurantCandidatesByQuery.set(cacheKey, candidates)
      }

      // 변경: 캐시 목록은 점심·저녁 탐색이 공유하므로, 이미 선택한 식당 제외 조건은 SQL이 아니라
      // 현재 가지에서만 적용합니다. 그래야 한 번 읽은 후보 목록을 다른 가지에서도 재사용할 수 있습니다.
      candidates = candidates.filter((candidate) => !usedMealPlaceIds.has(Number(candidate.placeId)))
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

    if (candidates.length > 0) {
      // 변경: 후보마다 실제 ODsay·카카오 이동시간을 계산한 뒤 최종 제약을 다시 확인합니다.
      // 여기서 가까운 한 곳만 고르면 그 식당이 늦은 도착으로 탈락할 때 전체 일정이 실패하므로,
      // 탐색 비용을 제한한 상위 3개만 Branch-and-Bound에 전달합니다.
      return candidates.slice(0, MAX_NEARBY_MEAL_BRANCHES).map((candidate) => ({
        ...candidate,
        ...meal,
        nodeType: "MEAL",
        mode: "NEARBY",
      }))
    }
  }

  throw createConstraintError([{
    code: "NEARBY_MEAL_NOT_FOUND",
    message: `${getMealLabel(meal.mealSlot)} 시간에 이용 가능한 주변 음식점을 2km 안에서 찾지 못했습니다. 지정 음식점을 선택하거나 식사를 제외해 주세요.`,
  }])
}

// 세 코스의 이동 기준에 불필요한 대기 시간을 보정해 Branch-and-Bound의 현재 비용을 계산합니다.
// 이후에 추가될 이동·대기 비용은 모두 0 이상이므로, 이 값이 이미 최적 점수보다 크면 안전하게 가지를 버릴 수 있습니다.
function getCourseScore({ summary, idleMinutes = 0 }, courseType) {
  if (courseType === "SHORTEST_WALK") {
    // 기존 1m당 1,000점은 몇 시간 대기하더라도 도보 몇 m를 줄인 경로가 이기는 과도한 가중치였습니다.
    // 도보를 가장 중요하게 유지하되 대기 1분도 도보 2m 수준의 비용으로 반영합니다.
    return summary.walkingDistanceMeters * 10 + summary.totalMinutes + idleMinutes * 20
  }
  if (courseType === "FASTEST_TRANSIT") {
    // 사용자가 느끼는 가장 빠른 경로는 순수 이동시간뿐 아니라 아무 활동 없는 대기시간도 포함합니다.
    return (summary.totalMinutes + idleMinutes) * 1_000
      + summary.transferCount * 10
      + summary.walkingDistanceMeters / 1_000
  }
  return summary.totalMinutes * 0.7
    + (summary.walkingDistanceMeters / 1_000) * 0.3
    + summary.transferCount * 8
    + summary.estimatedFare / 500
    // 균형 코스에서도 대기는 실제 이동보다 불편도가 높으므로 기존 0.5보다 강하게 반영합니다.
    + idleMinutes * 2
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
    // 변경: 탐색 중에는 이동 수치만 보관하고, 최종 경로가 확정된 뒤 이 목록의 구간에만 지도 좌표를 요청합니다.
    routeLegs: [],
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
  selectedRouteByPair = null,
  // 변경: 식사 제약은 장소·시간 설정이 같으면 항상 같은 결과입니다.
  // B&B 호출자가 resolver를 전달하면 반복적인 Date 생성·영업시간 계산을 피할 수 있습니다.
  getMealConstraint = (meal) => createMealConstraint({ plan, meal }),
  planEndTime = new Date(plan.endTime),
  // 변경: 일반 추천은 60분 제한으로 먼저 탐색하고 실패할 때만 120분으로 완화합니다.
  // 편집 재계산처럼 단일 규칙을 써야 하는 호출은 기본값 60분을 그대로 사용합니다.
  maxUnplannedWaitMinutes = MAX_UNPLANNED_WAIT_MINUTES,
  // 변경: 전체 경로가 만들어지지 않았을 때도 사용자가 원인을 알 수 있도록,
  // 이 Branch가 잘린 제약 사유를 상위 탐색기에 전달합니다.
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

  // 변경: 현재 시간이 이미 여행 종료 시각을 넘은 가지는 이후에 더 좋아질 수 없으므로 즉시 잘라냅니다.
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
    // 변경: route는 alternatives 배열 안의 같은 객체를 참조합니다.
    // 최종 선택 후 geometrySegments를 추가하면 DB 캐시에도 그대로 저장할 수 있습니다.
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
  maxUnplannedWaitMinutes = MAX_UNPLANNED_WAIT_MINUTES,
}) {
  const orderedMeals = [...meals]
    .filter((meal) => meal.mode !== "SKIP")
    .sort((firstMeal, secondMeal) => firstMeal.scheduledTime.localeCompare(secondMeal.scheduledTime))
  const initialState = createInitialSearchState({ startPlace, plan, meals: orderedMeals })
  const nearbyMealByContext = new Map()
  // 변경: 자동 식당은 시간 검증 전 후보 목록만 공통으로 캐시해, B&B의 같은 반경 DB 조회를 반복하지 않습니다.
  const nearbyRestaurantCandidatesByQuery = new Map()
  // 변경: 같은 장소 쌍·코스 기준의 최종 교통 후보는 탐색 요청 한 번 안에서 불변입니다.
  // 여러 순서가 같은 A→B 구간을 만날 때 후보 선택과 정렬을 반복하지 않도록 메모이제이션합니다.
  const selectedRouteByPair = new Map()
  // 변경: 지정 식당의 식사 시간 창은 탐색 경로와 무관하므로 한 번 계산해 재사용합니다.
  const mealConstraintByKey = new Map()
  // 변경: 완전히 같은 탐색 상태가 다시 나타났을 때 더 비싼 누적 비용만 제거합니다.
  // 현재 장소·시각·남은 장소·이미 선택한 자동 식당이 모두 같아 이후 가능한 경로도 같을 때만 적용합니다.
  const bestScoreByExactState = new Map()
  const planEndTime = new Date(plan.endTime)
  const searchStats = {
    explored: 0,
    prunedByBound: 0,
    prunedByConstraint: 0,
    prunedByRemainingStay: 0,
    prunedByMemo: 0,
  }
  // 변경: 모든 Branch가 사라진 경우에도 단순히 "경로 없음"만 반환하지 않도록,
  // 영업 종료·식사 시간·종료 시간 등 실제로 많이 발생한 제약을 중복 없이 수집합니다.
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
    // 변경: 남은 체류시간의 합은 어떤 유효 경로에도 반드시 필요한 시간입니다.
    // 이동·환승·영업 시작 대기는 모두 0 이상이므로, 이 하한만으로 종료 시간을 넘으면 안전하게 가지를 제외할 수 있습니다.
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
      // 변경: 주변 음식점 후보가 없거나 영업 조건을 만족하지 않은 422만 현재 가지를 끝냅니다.
      // DB·ODsay 같은 시스템 오류는 숨기지 않고 기존 오류 처리기로 전달합니다.
      if (error.status !== 422) throw error
      ;(error.conflicts ?? []).forEach(recordConstraint)
      nearbyMealByContext.set(key, [])
      return []
    }
  }

  /**
   * 변경: 방문지는 각각 다음 후보로 분기하고, 식사는 시간 역전을 막기 위해
   * 점심·저녁 중 아직 남은 가장 이른 한 슬롯만 다음 후보로 만듭니다.
   */
  function createSearchCandidates(remainingVisits, remainingMeals) {
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

    return candidates
  }

  /**
   * 변경: 탐색 순서만 정하는 가벼운 우선순위입니다.
   * 실제 최적성 판단은 createSearchTransition의 실제 이동 수치와 B&B 점수로 하므로,
   * 이 근사 거리 계산은 결과의 정확도를 바꾸지 않고 빠른 초기해 탐색만 돕습니다.
   */
  function getCandidatePriority(state, candidate) {
    // 변경: 주변 추천 식사 후보는 아직 실제 음식점 좌표가 없는 임시 객체입니다.
    // 그 객체로 거리를 계산하면 NaN이 되어 정렬 순서가 흔들리므로, 일반 방문지만 거리 우선으로 둡니다.
    if (candidate.stop.nodeType !== "MEAL") {
      return state.currentPlace ? distanceKm(state.currentPlace, candidate.stop) : 0
    }

    // 변경: 후보 정렬도 실제 전이 계산과 같은 식사 제약 캐시를 사용합니다.
    // 따라서 탐색 우선순위는 그대로 두고 Date·영업시간 객체 생성만 반복하지 않습니다.
    const constraint = getCachedMealConstraint(candidate.stop)
    const minutesUntilLatestStart = constraint.latestStart
      ? Math.round((constraint.latestStart.getTime() - state.currentTime.getTime()) / 60_000)
      : Number.POSITIVE_INFINITY

    // 변경: 식사 마감 시각이 한 시간 이내이면 방문지보다 먼저 시도해 시간 창 위반을 빠르게 제거합니다.
    // 그 외에는 가까운 방문지를 우선 탐색해 기다리는 시간이 긴 초반 경로를 초기해로 채택하지 않게 합니다.
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
   * 변경: 일반 방문지와 자동 추천 식당의 다음 상태 생성 과정을 한 곳으로 모읍니다.
   * 그리디 초기해와 전체 B&B 탐색이 같은 시간 창·영업시간·중복 식당 검증을 사용하게 합니다.
   */
  async function createCandidateTransitions(state, candidate) {
    // 변경: NEARBY 식사는 가까운 한 곳을 확정하지 않고 최대 3개 후보로 분기합니다.
    // 따라서 첫 식당이 실제 이동 후 식사 마감에 걸려도 다른 식당으로 같은 일정을 계속 탐색합니다.
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
        // 변경: 이번 가지에서 확정한 주변 추천 음식점은 다음 식사 후보에서 제외합니다.
        nextState.usedMealPlaceIds = new Set([...state.usedMealPlaceIds, Number(stop.placeId)])
      }
      transitions.push({ ...candidate, nextState })
    }

    return transitions
  }

  /**
   * 변경: 완전 탐색 전 가까운 후보를 따라 한 번 빠르게 완성해 초기 상한값을 만듭니다.
   * 기존에는 첫 완성 경로 전까지 bestScore가 Infinity라 bound 가지치기가 거의 동작하지 않았습니다.
   * 그리디 결과가 최적이라고 확정하지는 않고, 이후 B&B가 모든 유효한 순서를 계속 검토합니다.
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

  // 변경: 탐색에서 살아남은 최적 경로의 실제 이동 구간만 지도용 노선 좌표를 보강합니다.
  await enrichSelectedRouteGeometry({
    routeLegs: bestState.routeLegs,
    routeAlternativesByPlacePair,
  })

  const warnings = [...bestState.warnings]
  if (maxUnplannedWaitMinutes > MAX_UNPLANNED_WAIT_MINUTES) {
    // 변경: 완화 탐색 결과는 사용자가 긴 공백을 인지하고 필요하면 직접 조정할 수 있게 표시합니다.
    warnings.push(`일정을 만들기 위해 최대 대기 시간을 ${maxUnplannedWaitMinutes}분까지 허용했습니다.`)
  }
  if (bestState.usedWalkingFallback) {
    warnings.push("일부 구간은 대중교통 경로가 없어 장소 좌표 기준 도보 추정으로 계산했습니다.")
  }
  // 변경: 결과에 탐색 수를 남겨 Branch-and-Bound가 실제로 적용됐는지 팀에서 확인할 수 있게 합니다.
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
  // 변경: 새 추천과 편집 재계산 모두 그리디 순서 선택 대신 Branch-and-Bound 전체 탐색을 사용합니다.
  // orderedStops는 향후 예약 순서를 고정해야 하는 별도 기능을 위한 경로이며, 현재 결과 화면 편집에서는 사용하지 않습니다.
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
  // 변경: 순서 편집 후 재계산도 최종 확정된 경로이므로, 이 구간들에만 지도 좌표를 추가로 요청합니다.
  const routeLegs = []
  const warnings = []

  function addWarning(message) {
    if (!warnings.includes(message)) warnings.push(message)
  }

  async function appendStop(stop, { precomputedLeg = null, mealConstraint = null } = {}) {
    let travelArrivalTime = new Date(currentTime)

    // 변경: START 노드가 없을 때 첫 실제 일정에는 이동 구간이 없습니다.
    // 이후에는 현재 장소가 생기므로 기존과 동일하게 모든 구간의 이동 경로를 계산합니다.
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

  // 변경: 출발 위치를 입력한 계획에서만 일정 첫 항목으로 START 경계 노드를 저장합니다.
  if (currentPlace) await appendStop(currentPlace)

  // 변경: 예약처럼 순서를 고정해야 하는 별도 호출에서만 이 입력 순서를 그대로 재검증합니다.
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

  // 변경: 사용자가 편집해 확정한 순서의 이동 구간만 지도 그래픽을 보강합니다.
  await enrichSelectedRouteGeometry({ routeLegs, routeAlternativesByPlacePair })

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
        // 변경: 여행 계획 저장 시 보존한 장소 출처를 탐색 모델에도 복원합니다.
        // USER는 반드시 방문, RECOMMENDED는 모든 경로가 실패할 때만 단계적으로 줄이는 후보입니다.
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
 * 변경: 일반 여행의 추천 성공률을 높이기 위한 단계형 탐색 래퍼입니다.
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

  // 변경: 기획한 우선순위를 명확히 보장합니다. 모든 장소를 대기 60→120분으로 먼저 시도한 뒤,
  // 그 뒤에만 자동 추천 장소를 줄이므로 편의상 자동 추천 장소가 먼저 사라지지 않습니다.
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
      // 변경: 운영 제약(422)은 다음 완화 단계로 계속 시도하고, DB·길찾기 API 오류는 숨기지 않습니다.
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
 * 변경: 일정 편집 요청의 장소 집합을 Branch-and-Bound가 다시 탐색할 수 있는 내부 모델로 변환합니다.
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

  // 변경: 결과 화면 API를 직접 호출해 VISIT 노드를 추가하는 경우에도 관광지·카페 최대 5곳 규칙을 지킵니다.
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

  // 변경: 관광지·카페는 입력된 화면 순서를 사용하지 않고 B&B의 VISIT 후보로 전달합니다.
  // selectionSource를 USER로 두어 편집 중 사용자가 남긴 장소는 자동 완화 단계에서 제외되지 않게 합니다.
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
      // 변경: 자동 추천으로 골랐던 식당도 편집 재계산에서는 현재 선택된 식당을 고정합니다.
      // 관광지 순서를 최적화할 때 식당이 다른 곳으로 바뀌지 않도록 DESIGNATED로 처리합니다.
      mode: "DESIGNATED",
      isFixedReservation: meal.isFixedReservation === true,
    }
  })

  const { startPlace, endPlace } = await resolveCourseBoundaries(plan)
  // 변경: orderedStops를 넘기지 않아 Branch-and-Bound가 VISIT 순서를 새로 탐색합니다.
  // 식사는 시간 창을 지키기 위해 점심·저녁 순서를 유지하되, 관광지 사이 어느 위치에 둘지는 함께 비교합니다.
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
      // 변경: 세 추천 기준은 서로 독립된 결과입니다. 한 기준이 식사·영업시간 조건에서
      // 실패해도 성공한 다른 코스를 사용자에게 보여 주도록 코스별 실패를 분리합니다.
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
      // 변경: 422는 사용자 입력 조건의 충돌이므로 부분 성공 응답에 실패 코스 정보로 남깁니다.
      // ODsay·DB 같은 시스템 오류는 부분 성공으로 숨기면 원인을 알 수 없으므로 즉시 기존 오류 처리기로 전달합니다.
      if (error.status !== 422) throw error
      failedCourses.push({
        courseType,
        message: error.message,
        conflicts: Array.isArray(error.conflicts) ? error.conflicts : [],
      })
    }
  }

  if (courses.length === 0) {
    // 변경: 모든 코스가 실패할 때는 각 탐색에서 모은 장소별 제약 사유를 하나로 합쳐
    // 프론트가 단순 422 대신 사용자가 고칠 수 있는 원인을 보여 줄 수 있게 합니다.
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
    // 변경: 세 기준이 모두 성공했는지와 일부만 성공했는지를 응답에서 구분합니다.
    // 현재 UI는 성공한 카드만 표시하고, 이후 실패 코스 안내 UI를 추가할 때도 같은 값을 재사용합니다.
    status: failedCourses.length === 0 ? "SUCCEEDED" : "PARTIAL",
    courses: savedCourses,
    failedCourses,
  }
}
