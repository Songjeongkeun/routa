import * as recommendationService from "./recommendation.service.mjs"

/** 변경: 추천 계산이 끝난 코스 식별자를 반환해 로딩 화면이 실제 결과 URL로 이동할 수 있게 합니다. */
export async function createRecommendation(req, res) {
  const recommendation = await recommendationService.createRecommendation({
    userId: req.userId,
    tripPlanId: req.body.tripPlanId,
  })

  return res.status(201).json({ recommendation })
}
