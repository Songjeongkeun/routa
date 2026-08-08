import bcrypt from "bcrypt"
import crypto from "node:crypto"
import { config } from "../../config.mjs"
import { createAccessToken } from "../../utils/jwt.mjs"
import * as authRepository from "./auth.repository.mjs"

function serviceError(message, status, code) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

export function toPublicUser(user) {
  return {
    userId: user.user_id,
    email: user.email,
    nickname: user.nickname,
    authProvider:user.auth_provider,
    profileImageUrl: user.profile_image_url,
    isAdmin: user.is_admin,
    accountStatus: user.account_status,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at
  }
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

async function createSession(userId, { updateLastLogin = true } = {}) {
  const accessToken = createAccessToken(userId)
  const refreshToken = crypto.randomBytes(48).toString("base64url")
  const tokenHash = hashRefreshToken(refreshToken)
  const expiresAt = new Date(
    Date.now() + config.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000,
  )

  await authRepository.createRefreshToken({ userId, tokenHash, expiresAt })
  if (updateLastLogin) await authRepository.updateLastLoginAt(userId)
  return { accessToken, refreshToken }
}

export async function signup({ email: rawEmail, password, nickname: rawNickname }) {
  const email = rawEmail?.trim().toLowerCase()
  const nickname = rawNickname?.trim()
  if (password.length < 8) {
    throw serviceError("비밀번호는 8자 이상으로 입력해주세요.", 400)
  }
  if (password.length > 72) {
    throw serviceError("비밀번호는 72자 이하로 입력해주세요.", 400)
  }
  if (!email || !password || !nickname) {
    throw serviceError("이메일, 비밀번호, 닉네임은 필수입니다.", 400)
  }
  if (email.length > 50) {throw serviceError("이메일은 50자 이하로 입력해주세요.", 400,)
  }
  if (nickname.length > 30) {throw serviceError("닉네임은 30자 이하로 입력해주세요.", 400,)
  }
  if (password.length < 8) {
    throw serviceError("비밀번호는 8자 이상으로 입력해주세요.", 400)
  }
  if (await authRepository.findByEmail(email)) {
    throw serviceError("이미 가입된 이메일입니다.", 409)
  }

  try {
    const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds)
    const user = await authRepository.createUser({ email, passwordHash, nickname })
    return toPublicUser(user)
  } catch (error) {
    if (error.code === "23505") {
      throw serviceError("이미 사용 중인 회원 정보입니다.", 409)
    }
    throw error
  }
}

export async function login({ email: rawEmail, password }) {
  const email = rawEmail?.trim().toLowerCase()
  if (!email || !password) {
    throw serviceError("아이디와 비밀번호를 입력해주세요.", 400)
  }

  const user = await authRepository.findByEmail(email)
  const matches = user?.auth_provider === "LOCAL" && user?.password
    ? await bcrypt.compare(password, user.password)
    : false

  if (!user || !matches) {
    throw serviceError("이메일 또는 비밀번호가 올바르지 않습니다.", 401)
  }
  if (user.account_status !== "ACTIVE") {
    throw serviceError("사용할 수 없는 계정입니다.", 403, "INACTIVE_ACCOUNT")
  }

  return {
    user: toPublicUser(user),
    ...(await createSession(user.user_id)),
  }
}

export async function refreshSession(refreshToken) {
  if (!refreshToken) throw serviceError("로그인이 필요합니다.", 401)

  const storedToken = await authRepository.consumeRefreshToken(hashRefreshToken(refreshToken))
  if (!storedToken) {
    throw serviceError("로그인 정보가 만료되었습니다.", 401, "INVALID_REFRESH_TOKEN")
  }
  if (storedToken.account_status !== "ACTIVE") {
    throw serviceError("사용할 수 없는 계정입니다.", 403, "INACTIVE_ACCOUNT")
  }

  return createSession(storedToken.user_id, { updateLastLogin: false })
}

export async function logout(refreshToken) {
  if (!refreshToken) return false
  return authRepository.revokeRefreshToken(hashRefreshToken(refreshToken))
}

export async function loginWithOAuth({ provider, providerUserId, email, nickname }) {
  let user = await authRepository.findByOAuthAccount(provider, providerUserId)

  if (!user) {
    if (await authRepository.findByEmail(email)) {
      throw serviceError(
        "같은 이메일의 기존 계정이 있습니다. 기존 계정으로 로그인 후 소셜 계정을 연결해주세요.",
        409,
        "EXISTING_EMAIL",
      )
    }
    user = await authRepository.createOAuthUser({ email, nickname, provider, providerUserId })
  }

  if (user.account_status !== "ACTIVE") {
    throw serviceError("사용할 수 없는 계정입니다.", 403, "INACTIVE_ACCOUNT")
  }

  return { user: toPublicUser(user), ...(await createSession(user.user_id)) }
}
