import { randomUUID } from "node:crypto"
import { logger } from "../utils/logger.mjs"

/**
 * 요청별 식별자와 처리 시간을 남겨 운영 중인 오류를 서버 로그에서 추적합니다.
 * OAuth code, 검색어 등 민감하거나 불필요한 query string은 기록하지 않고 HTTP 메서드·경로만 남깁니다.
 */
export function requestLogger(req, res, next) {
  const requestId = randomUUID()
  const startedAt = process.hrtime.bigint()
  req.requestId = requestId
  res.setHeader("X-Request-Id", requestId)

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    logger(
      "http",
      `requestId=${requestId} ${req.method} ${req.path} status=${res.statusCode} durationMs=${durationMs.toFixed(1)}`,
    )
  })

  next()
}
