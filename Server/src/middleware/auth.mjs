import * as authRepository from "../modules/auth/auth.repository.mjs"
import { getCookie } from "../utils/cookie.mjs"
import { verifyAccessToken } from "../utils/jwt.mjs"

const AUTH_ERROR = { message: "로그인이 필요합니다." }

export async function isAuth(req, res, next) {
  const authHeader = req.get("Authorization")
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined
  const token = bearerToken || getCookie(req, "access_token")

  if (!token) return res.status(401).json(AUTH_ERROR)

  try {
    const decoded = verifyAccessToken(token)
    const user = await authRepository.findById(decoded.userId)
    if (!user || user.account_status !== "ACTIVE") {
      return res.status(401).json(AUTH_ERROR)
    }
    req.userId = user.user_id
    req.user = user
    return next()
  } catch {
    return res.status(401).json(AUTH_ERROR)
  }
}
