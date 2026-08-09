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

function getCandidateScore({ toVisit, toMeal }, courseType) {
  const totalDuration = toVisit.durationMinutes + toMeal.durationMinutes
  const totalWalking = toVisit.walkingDistanceMeters + toMeal.walkingDistanceMeters
  const totalTransfer = toVisit.transferCount + toMeal.transferCount
  const totalFare = toVisit.estimatedFare + toMeal.estimatedFare

  if (courseType === "SHORTEST_WALK") return totalWalking * 1_000 + totalDuration
  if (courseType === "FASTEST_TRANSIT") return totalDuration * 1_000 + totalTransfer * 10 + totalWalking / 1_000

  // 변경: 추천 코스는 기획서의 시간 0.7·거리 0.3 비율을 기본으로 환승과 요금을 작은 보정값으로 사용합니다.
  return totalDuration * 0.7 + (totalWalking / 1_000) * 0.3 + totalTransfer * 8 + totalFare / 500
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

async function chooseVisitBeforeMeal({
  currentPlace,
  currentTime,
  remainingVisits,
  meal,
  mealConstraint,
  courseType,
  plan,
  routeAlternativesByPlacePair,
}) {
  const candidates = []

  for (const visit of remainingVisits) {
    const toVisit = await getRouteLeg({
      from: currentPlace,
      to: visit,
      courseType,
      routeAlternativesByPlacePair,
    })
    const visitArrivalTime = addMinutes(
      currentTime,
      toVisit.durationMinutes + getTravelBufferMinutes({ route: toVisit, withPet: plan.withPet }),
    )
    // 변경: 식사 전 관광지 후보도 실제 도착 시각으로 운영 조건을 확인합니다.
    const visitTiming = evaluatePlaceVisit({
      plan,
      place: visit,
      travelArrivalTime: visitArrivalTime,
      stayMinutes: visit.stayMinutes,
    })
    if (!visitTiming.isFeasible) continue

    const toMeal = await getRouteLeg({
      from: visit,
      to: meal,
      courseType,
      routeAlternativesByPlacePair,
    })
    const mealTravelArrivalTime = addMinutes(
      visitTiming.departureTime,
      toMeal.durationMinutes + getTravelBufferMinutes({ route: toMeal, withPet: plan.withPet }),
    )
    const mealTiming = evaluateMealArrival({
      travelArrivalTime: mealTravelArrivalTime,
      constraint: mealConstraint,
      meal,
    })

    if (mealTiming.isFeasible) candidates.push({ visit, toVisit, toMeal })
  }

  return candidates.sort((first, second) =>
    getCandidateScore(first, courseType) - getCandidateScore(second, courseType),
  )[0] ?? null
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
async function selectNearbyMeal({ meal, currentPlace, currentTime, remainingVisits, plan }) {
  const nextPlace = sortByDistanceFrom(currentPlace, remainingVisits)[0] ?? null
  const anchors = [currentPlace, nextPlace].filter(Boolean)

  for (const radiusKm of [0.5, 1]) {
    const candidatesById = new Map()
    for (const anchor of anchors) {
      const candidates = await recommendationRepository.findNearbyRestaurants({
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        radiusKm,
        withPet: plan.withPet,
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
  let currentTime = new Date(plan.startTime)
  let currentPlace = { ...startPlace, nodeType: "START", stayMinutes: 0 }
  let totalMinutes = 0
  let walkingDistanceMeters = 0
  let transferCount = 0
  let estimatedFare = 0
  let usedWalkingFallback = false
  const nodes = []
  const warnings = []
  const remainingVisits = [...visits]

  function addWarning(message) {
    if (!warnings.includes(message)) warnings.push(message)
  }

  async function appendStop(stop, { precomputedLeg = null, mealConstraint = null } = {}) {
    let travelArrivalTime = new Date(currentTime)

    if (nodes.length > 0) {
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

  await appendStop(currentPlace)

  if (orderedStops) {
    // 변경: 결과 화면에서 사용자가 만든 순서는 서버가 다시 섞지 않고 그대로 검증·재계산합니다.
    for (const stop of orderedStops) {
      const mealConstraint = stop.nodeType === "MEAL" ? createMealConstraint({ plan, meal: stop }) : null
      await appendStop(stop, { mealConstraint })
    }
  } else {
    const orderedMeals = [...meals]
      .filter((meal) => meal.mode !== "SKIP")
      .sort((firstMeal, secondMeal) => firstMeal.scheduledTime.localeCompare(secondMeal.scheduledTime))

    for (let meal of orderedMeals) {
      if (meal.mode === "NEARBY") {
        meal = await selectNearbyMeal({
          meal,
          currentPlace,
          currentTime,
          remainingVisits,
          plan,
        })
      }
      const mealConstraint = createMealConstraint({ plan, meal })

      while (remainingVisits.length > 0) {
        const candidate = await chooseVisitBeforeMeal({
          currentPlace,
          currentTime,
          remainingVisits,
          meal,
          mealConstraint,
          courseType,
          plan,
          routeAlternativesByPlacePair,
        })
        if (!candidate) break

        await appendStop(candidate.visit, { precomputedLeg: candidate.toVisit })
        remainingVisits.splice(remainingVisits.findIndex((visit) => visit.placeId === candidate.visit.placeId), 1)
      }
      await appendStop(meal, { mealConstraint })
    }

    const finalVisits = courseType === "FASTEST_TRANSIT"
      ? [...remainingVisits].reverse()
      : sortByDistanceFrom(currentPlace, remainingVisits)
    for (const visit of finalVisits) await appendStop(visit)
  }

  await appendStop({ ...endPlace, nodeType: "END", stayMinutes: 0 })

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
  // 변경: 현재 스키마의 COURSE_NODE가 PLACE FK를 요구하므로 출발·도착 좌표에 가장 가까운 PLACE를 경계 노드로 사용합니다.
  const [startPlace, endPlace] = await Promise.all([
    recommendationRepository.findClosestPlace(plan.startLatitude, plan.startLongitude),
    recommendationRepository.findClosestPlace(plan.endLatitude, plan.endLongitude),
  ])
  if (!startPlace || !endPlace) {
    throw createHttpError("출발지 또는 도착지 주변 장소를 찾을 수 없습니다.", 422)
  }
  return { startPlace, endPlace }
}

async function createPlanStops({ plan }) {
  const themePreference = parseStoredJson(plan.preferredThemes, { selectedPlaces: [] })
  const mealPreference = parseStoredJson(plan.mealPreference, { meals: [] })
  const selectedPlaces = Array.isArray(themePreference.selectedPlaces) ? themePreference.selectedPlaces : []
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
          stayMinutes: Number(selection.stayMinutes) || 90,
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
        stayMinutes: Number(selection.stayMinutes) || 90,
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
