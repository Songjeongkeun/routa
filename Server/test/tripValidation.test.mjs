import assert from "node:assert/strict"
import test from "node:test"
import { getTransportCriterionByDate, isValidCalendarDate } from "../src/utils/tripValidation.mjs"

test("실제 달력에 없는 날짜를 거부하고 윤년 날짜를 허용한다", () => {
  assert.equal(isValidCalendarDate("2026-02-30"), false)
  assert.equal(isValidCalendarDate("2026-02-29"), false)
  assert.equal(isValidCalendarDate("2028-02-29"), true)
  assert.equal(isValidCalendarDate("2028-13-01"), false)
})

test("날짜에서 평일과 주말 교통 기준을 일관되게 계산한다", () => {
  assert.equal(getTransportCriterionByDate("2026-08-14"), "평일")
  assert.equal(getTransportCriterionByDate("2026-08-15"), "주말")
  assert.equal(getTransportCriterionByDate("2026-02-30"), null)
})
