import multer from "multer"

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  console.error(error)

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "파일 용량이 너무 큽니다. 2MB 이하로 올려주세요." })
  }

  return res.status(error.status ?? 500).json({
    message: error.status ? error.message : "서버 오류가 발생했습니다.",
    // 변경: 422 일정 제약 오류는 장소별 원인을 포함해 프론트에서 즉시 안내할 수 있게 합니다.
    ...(Array.isArray(error.conflicts) ? { conflicts: error.conflicts } : {}),
  })
}
