export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  console.error(error)
  return res.status(error.status ?? 500).json({
    message: error.status ? error.message : "서버 오류가 발생했습니다.",
  })
}
