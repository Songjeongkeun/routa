export function notFound(req, res) {
  return res.status(404).json({ message: "요청한 API를 찾을 수 없습니다." })
}
