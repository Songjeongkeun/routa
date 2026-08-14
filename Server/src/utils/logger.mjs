import { currentTime } from "./date.mjs"

export function logger(source, message) {
  console.log(`[${currentTime()}] [${source}] ${message}`)
}

/**
 * 예외 객체 전체를 그대로 출력하면 요청 본문·외부 API 응답처럼 민감할 수 있는 값이 섞일 수 있습니다.
 * 운영에 필요한 최소 정보(요청 ID, 상태, 오류 종류, 메시지)만 같은 형식으로 남깁니다.
 */
export function logError(source, error, { requestId = "-" } = {}) {
  const status = Number.isInteger(error?.status) ? error.status : 500
  const name = error?.name ?? "Error"
  const message = error?.message ?? "알 수 없는 오류"
  console.error(`[${currentTime()}] [${source}] requestId=${requestId} status=${status} ${name}: ${message}`)
}
