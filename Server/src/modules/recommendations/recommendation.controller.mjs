import * as recommendationService from "./recommendation.service.mjs"
import { runSingleFlight } from "../../utils/inFlightJob.mjs"
import { logger } from "../../utils/logger.mjs"

function getRecommendationRunKey({ userId, tripPlanId }) {
  // 서비스가 이후 실제 ID 검증을 수행합니다. 여기서는 1과 "1"이 같은 실행을 공유하도록 숫자로 통일합니다.
  return `recommendation:${userId}:${Number(tripPlanId)}`
}

/**
 * 같은 사용자가 같은 여행 계획으로 보낸 동시 추천 요청은 한 번만 계산합니다.
 * 클라이언트의 요청 취소는 서버 계산을 중단시키지 않으므로, 이 보호 장치가 중복 ODsay 호출과
 * DRAFT 코스 교체 경합을 막습니다. 완료된 뒤의 새 요청은 정상적으로 다시 계산합니다.
 */
export async function createRecommendation(req, res) {
  const tripPlanId = req.body?.tripPlanId
  const startedAt = Date.now()
  const { result: recommendation, wasShared } = await runSingleFlight({
    key: getRecommendationRunKey({ userId: req.userId, tripPlanId }),
    job: () => recommendationService.createRecommendation({
      userId: req.userId,
      tripPlanId,
    }),
  })

  logger(
    "recommendation",
    `requestId=${req.requestId ?? "-"} tripPlanId=${tripPlanId} shared=${wasShared} durationMs=${Date.now() - startedAt}`,
  )
  return res.status(201).json({ recommendation, wasShared })
}
