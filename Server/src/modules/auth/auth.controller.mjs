import { config } from "../../config.mjs"
import * as googleProvider from "../../providers/google.mjs"
import * as kakaoProvider from "../../providers/kakao.mjs"
import {
  clearAuthCookies,
  createOAuthStateCookie,
  getCookie,
  setAuthCookies,
  validateOAuthStateCookie,
} from "../../utils/cookie.mjs"
import * as authService from "./auth.service.mjs"

function respondWithError(res, error, fallbackMessage) {
  if (!error.status || error.status >= 500) console.error(error)
  return res.status(error.status ?? 500).json({ message: error.status ? error.message : fallbackMessage })
}

export async function signup(req, res) {
  try {
    const user = await authService.signup(req.body)
    return res.status(201).json({ message: "회원가입이 완료되었습니다.", user })
  } catch (error) {
    return respondWithError(res, error, "회원가입 처리 중 오류가 발생했습니다.")
  }
}

export async function login(req, res) {
  try {
    const session = await authService.login(req.body)
    setAuthCookies(res, session)
    return res.status(200).json({ user: session.user })
  } catch (error) {
    return respondWithError(res, error, "로그인 처리 중 오류가 발생했습니다.")
  }
}

export function me(req, res) {
  return res.status(200).json({ user: authService.toPublicUser(req.user) })
}

export async function refresh(req, res) {
  try {
    const session = await authService.refreshSession(getCookie(req, "refresh_token"))
    setAuthCookies(res, session)
    return res.sendStatus(204)
  } catch (error) {
    clearAuthCookies(res)
    return respondWithError(res, error, "로그인 갱신 중 오류가 발생했습니다.")
  }
}

export async function logout(req, res) {
  try {
    await authService.logout(getCookie(req, "refresh_token"))
  } catch (error) {
    console.error(error)
  } finally {
    clearAuthCookies(res)
  }
  return res.sendStatus(204)
}

export function startGoogleLogin(req, res) {
  res.set("Cache-Control", "no-store")
  const state = createOAuthStateCookie(res)
  return res.redirect(googleProvider.createGoogleAuthorizeUrl(state))
}

export async function googleCallback(req, res) {
  try {
    res.set("Cache-Control", "no-store")
    if (req.query.error) return res.status(400).json({ message: "Google 로그인이 취소되었습니다." })
    if (!req.query.code || !validateOAuthStateCookie(req, res)) {
      return res.status(400).json({ message: "유효하지 않은 OAuth 요청입니다." })
    }
    const profile = await googleProvider.getGoogleProfile(req.query.code)
    const session = await authService.loginWithOAuth({ provider: "GOOGLE", ...profile })
    setAuthCookies(res, session)
    return res.redirect(config.frontendUrl)
  } catch (error) {
    return respondWithError(res, error, "Google 로그인 처리 중 오류가 발생했습니다.")
  }
}

export function startKakaoLogin(req, res) {
  res.set("Cache-Control", "no-store")
  const state = createOAuthStateCookie(res)
  return res.redirect(kakaoProvider.createKakaoAuthorizeUrl(state))
}

export async function kakaoCallback(req, res) {
  try {
    res.set("Cache-Control", "no-store")
    if (req.query.error) return res.status(400).json({ message: "Kakao 로그인이 취소되었습니다." })
    if (!req.query.code || !validateOAuthStateCookie(req, res)) {
      return res.status(400).json({ message: "유효하지 않은 OAuth 요청입니다." })
    }
    const profile = await kakaoProvider.getKakaoProfile(req.query.code)
    const session = await authService.loginWithOAuth({ provider: "KAKAO", ...profile })
    setAuthCookies(res, session)
    return res.redirect(config.frontendUrl)
  } catch (error) {
    return respondWithError(res, error, "Kakao 로그인 처리 중 오류가 발생했습니다.")
  }
}
