import multer from "multer"
import { logError } from "../utils/logger.mjs"

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  // 변경: 프론트의 X-Request-Id와 서버 로그를 연결하되, 예외 객체 전체는 출력하지 않습니다.
  // 사용자가 오류를 제보하면 이 식별자로 해당 요청의 원인을 빠르게 찾을 수 있습니다.
  logError("error", error, { requestId: req.requestId })

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "파일 용량이 너무 큽니다. 2MB 이하로 올려주세요." })
  }

  return res.status(error.status ?? 500).json({
    message: error.status ? error.message : "서버 오류가 발생했습니다.",
    // 변경: 사용자 화면에는 안전한 메시지만 보이게 하면서, 문의·로그 대조에 쓸 요청 ID도 전달합니다.
    requestId: req.requestId,
    // 변경: 422 일정 제약 오류는 장소별 원인을 포함해 프론트에서 즉시 안내할 수 있게 합니다.
    ...(Array.isArray(error.conflicts) ? { conflicts: error.conflicts } : {}),
  })
}
