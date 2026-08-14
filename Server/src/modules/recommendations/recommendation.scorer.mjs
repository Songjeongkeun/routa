const EARTH_RADIUS_KM = 6371

function degreesToRadians(value) {
  return (value * Math.PI) / 180
}

/** 두 장소 좌표의 직선거리를 Haversine 공식으로 계산합니다. */
export function calculateDistanceKm(from, to) {
  const latitudeDifference = degreesToRadians(to.latitude - from.latitude)
  const longitudeDifference = degreesToRadians(to.longitude - from.longitude)
  const latitudeFrom = degreesToRadians(from.latitude)
  const latitudeTo = degreesToRadians(to.latitude)

  const haversine =
    Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(latitudeFrom) * Math.cos(latitudeTo) * Math.sin(longitudeDifference / 2) ** 2

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function sortByDistanceFrom(origin, places) {
  return [...places].sort(
    (firstPlace, secondPlace) =>
      calculateDistanceKm(origin, firstPlace) - calculateDistanceKm(origin, secondPlace),
  )
}

export function createLegMetrics(from, to, courseType) {
  const distanceKm = calculateDistanceKm(from, to)
  const profile = {
    SHORTEST_WALK: { minutesPerKm: 12, walkingRatio: 1, fare: 0 },
    FASTEST_TRANSIT: { minutesPerKm: 4, walkingRatio: 0.28, fare: 1450 },
    BALANCED: { minutesPerKm: 6, walkingRatio: 0.5, fare: 1250 },
  }[courseType]

  return {
    durationMinutes: Math.max(5, Math.round(distanceKm * profile.minutesPerKm)),
    walkingDistanceMeters: Math.round(distanceKm * 1000 * profile.walkingRatio),
    transferCount: courseType === "SHORTEST_WALK" ? 0 : distanceKm > 3 ? 1 : 0,
    estimatedFare: profile.fare,
  }
}

/**
 * ODsay가 반환한 여러 대중교통 후보 중 코스 목적에 맞는 하나를 고릅니다.
 * 실제 이동 수치 자체는 ODsay 값이며, 이 함수는 그 값을 어떤 우선순위로 비교할지만 결정합니다.
 */
export function selectRouteAlternative(alternatives, courseType) {
  if (!Array.isArray(alternatives) || alternatives.length === 0) return null

  const sorted = [...alternatives].sort((first, second) => {
    if (courseType === "SHORTEST_WALK") {
      return first.walkingDistanceMeters - second.walkingDistanceMeters
        || first.durationMinutes - second.durationMinutes
        || first.transferCount - second.transferCount
    }

    if (courseType === "FASTEST_TRANSIT") {
      return first.durationMinutes - second.durationMinutes
        || first.transferCount - second.transferCount
        || first.walkingDistanceMeters - second.walkingDistanceMeters
    }

    // 균형형은 시간·도보·환승·요금을 함께 비교합니다.
    const getBalancedScore = (route) => (
      route.durationMinutes
      + (route.walkingDistanceMeters / 1000) * 8
      + route.transferCount * 8
      + route.estimatedFare / 500
    )
    return getBalancedScore(first) - getBalancedScore(second)
      || first.durationMinutes - second.durationMinutes
  })

  return sorted[0]
}

/**
 * Branch-and-Bound가 현재 탐색 가지를 계속 살릴지 판단하는 누적 비용입니다.
 * 이후 이동·대기 비용은 음수가 될 수 없으므로, 현재 점수가 최적 해보다 크면 안전하게 가지를 제거할 수 있습니다.
 */
export function getCourseScore({ summary, idleMinutes = 0 }, courseType) {
  if (courseType === "SHORTEST_WALK") {
    return summary.walkingDistanceMeters * 10 + summary.totalMinutes + idleMinutes * 20
  }
  if (courseType === "FASTEST_TRANSIT") {
    return (summary.totalMinutes + idleMinutes) * 1_000
      + summary.transferCount * 10
      + summary.walkingDistanceMeters / 1_000
  }
  return summary.totalMinutes * 0.7
    + (summary.walkingDistanceMeters / 1_000) * 0.3
    + summary.transferCount * 8
    + summary.estimatedFare / 500
    + idleMinutes * 2
}
