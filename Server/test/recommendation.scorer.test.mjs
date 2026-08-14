import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateDistanceKm,
  getCourseScore,
  selectRouteAlternative,
} from "../src/modules/recommendations/recommendation.scorer.mjs"

test("같은 좌표의 Haversine 거리는 0km이다", () => {
  const place = { latitude: 37.5665, longitude: 126.978 }
  assert.equal(calculateDistanceKm(place, place), 0)
})

test("코스 기준에 따라 이동 후보의 우선순위가 달라진다", () => {
  const alternatives = [
    { durationMinutes: 20, walkingDistanceMeters: 1_800, transferCount: 0, estimatedFare: 0 },
    { durationMinutes: 28, walkingDistanceMeters: 300, transferCount: 1, estimatedFare: 1_450 },
  ]

  assert.equal(selectRouteAlternative(alternatives, "SHORTEST_WALK"), alternatives[1])
  assert.equal(selectRouteAlternative(alternatives, "FASTEST_TRANSIT"), alternatives[0])
})

test("대기 시간이 늘어나면 동일 코스의 탐색 비용도 증가한다", () => {
  const state = {
    summary: {
      totalMinutes: 120,
      walkingDistanceMeters: 3_000,
      transferCount: 1,
      estimatedFare: 1_450,
    },
  }

  assert.ok(
    getCourseScore({ ...state, idleMinutes: 30 }, "BALANCED")
      > getCourseScore({ ...state, idleMinutes: 0 }, "BALANCED"),
  )
})
