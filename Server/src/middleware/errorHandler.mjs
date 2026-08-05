import multer from "multer"

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  console.error(error)

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "파일 용량이 너무 큽니다. 2MB 이하로 올려주세요." })
  }

  return res.status(error.status ?? 500).json({
    message: error.status ? error.message : "서버 오류가 발생했습니다.",
  })
}