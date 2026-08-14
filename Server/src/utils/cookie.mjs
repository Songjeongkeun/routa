import crypto from "node:crypto"
import { config } from "../config.mjs"

// 변경: 브라우저는 LAN 접속 시 /api/auth/* 주소를 사용하고 Express 내부 라우트는 /auth/*를 사용합니다.
// 프록시 앞·뒤 경로 모두에서 OAuth state와 refresh token을 보낼 수 있도록 인증 쿠키 경로를 /로 통일합니다.
// HttpOnly·SameSite=Lax는 그대로 유지해 JavaScript 접근과 일반적인 CSRF 위험을 제한합니다.
const AUTH_COOKIE_PATH = "/"

export function getCookie(req, name) {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return undefined

  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined
}

export function createOAuthStateCookie(res) {
  const state = crypto.randomBytes(32).toString("hex")
  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookie.secure,
    path: AUTH_COOKIE_PATH,
    maxAge: 10 * 60 * 1000,
  })

  return state
}

export function validateOAuthStateCookie(req, res) {
  const stateFromCookie = getCookie(req, "oauth_state")
  // 변경: 생성할 때 사용한 경로와 동일해야 브라우저에 OAuth 임시 쿠키가 남지 않습니다.
  res.clearCookie("oauth_state", { path: AUTH_COOKIE_PATH })
  return Boolean(stateFromCookie) && stateFromCookie === req.query.state
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookie.secure,
    path: "/",
    maxAge: config.jwt.expiresInSec * 1000,
  })
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookie.secure,
    path: AUTH_COOKIE_PATH,
    maxAge: config.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000,
  })
}

export function clearAuthCookies(res) {
  res.clearCookie("access_token", { path: "/" })
  // 변경: 로그인 때 설정한 공통 경로와 같은 값으로 삭제해 LAN 프록시 환경에서도 로그아웃을 보장합니다.
  res.clearCookie("refresh_token", { path: AUTH_COOKIE_PATH })
  res.clearCookie("oauth_state", { path: AUTH_COOKIE_PATH })
}
