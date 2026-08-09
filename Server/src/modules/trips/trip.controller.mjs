import * as tripService from "./trip.service.mjs"

/** 변경: 현재 입력한 전체 여행 계획을 생성하고 생성된 DB 식별자를 프론트에 돌려줍니다. */
export async function createTripPlan(req, res) {
  const tripPlan = await tripService.createTripPlan(req.userId, req.body)
  return res.status(201).json({ tripPlan })
}

/** 변경: 같은 초안을 다시 계산할 때는 소유자가 가진 계획만 전체 내용으로 교체합니다. */
export async function updateTripPlan(req, res) {
  const tripPlan = await tripService.updateTripPlan(req.userId, req.params.tripPlanId, req.body)
  return res.status(200).json({ tripPlan })
}

/** 변경: 결과 화면이나 조건 수정 화면이 새로고침돼도 소유자의 저장 계획을 복원할 수 있습니다. */
export async function getTripPlanById(req, res) {
  const tripPlan = await tripService.getTripPlanById(req.userId, req.params.tripPlanId)
  return res.status(200).json({ tripPlan })
}
