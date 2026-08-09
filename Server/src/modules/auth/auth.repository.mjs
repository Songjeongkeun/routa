import { query } from "../../db/database.mjs"

/** 데이터 변경 후 바로 데이터 반환 받을 데이터 묶음 */
const USER_COLUMNS = `user_id, email, password, nickname, auth_provider, provider_id, profile_image_url, introduction, is_admin, account_status, created_at, last_login_at`

/** 회원가입 시 새 로컬(Local) 계정을 생성한다. */
export async function createUser({ email, passwordHash, nickname }) {
  const result = await query(
    `INSERT INTO public."USER" (email, password, nickname, auth_provider)
     VALUES ($1, $2, $3, 'LOCAL')
     RETURNING ${USER_COLUMNS}`,
    [email.toLowerCase(), passwordHash, nickname],
  )
  return result.rows[0]
}

/**
 * 이메일로 유저를 조회한다.
 * 로그인 시 비밀번호 대조 대상 조회, 회원가입/OAuth 가입 시 이메일 중복 체크에 쓰임
 */
export async function findByEmail(email) {
  const result = await query(
    `SELECT ${USER_COLUMNS}
     FROM public."USER"
     WHERE LOWER(email) = LOWER($1)`,
    [email.trim()],
  )
  return result.rows[0]
}

/**
 * user_id로 유저를 조회한다.
 * isAuth 미들웨어가 액세스 토큰 검증 후 현재 요청의 유저 정보를 채울 때 사용
 */
export async function findById(userId) {
  const result = await query(
    `SELECT ${USER_COLUMNS}
     FROM public."USER"
     WHERE user_id = $1`,
    [userId],
  )
  return result.rows[0]
}

/**
 * 로그인 성공 시 마지막 로그인 시각을 갱신
 * createSession()에서 액세스/리프레시 토큰 발급과 함께 호출됨(단, refresh 갱신 시엔 생략)
 * 휴먼, 활성화 계정 구분 용도로 쓰일 예정
 */
export async function updateLastLoginAt(userId) {
  await query(
    `UPDATE public."USER"
     SET last_login_at = CURRENT_TIMESTAMP
     WHERE user_id = $1`,
    [userId],
  )
}

/**
 * Auth 제공자(구글, 카카오)와 제공자 측 유저 ID로 이미 연결된 계정이 있는지 조회한다.
 * loginWithOAuth()에서 신규 가입 여부를 판단하는데 쓰임
 */
export async function findByOAuthAccount(provider, providerUserId) {
  const result = await query(
    `SELECT ${USER_COLUMNS}
    FROM public."USER"
    WHERE auth_provider = $1 AND provider_id = $2`,
    [provider, String(providerUserId),],
  )
  return result.rows[0]
}

/**
 * 최초 OAuth 로그인 시 새 계정을 생성한다,(비밀번호 없음, provider/provider_id 저장)
 * loginWithOAuth()에서 findByOAuthAccount 결과가 없을 때 호출됨.
 */
export async function createOAuthUser({ email, nickname, provider, providerUserId }) {
  const result = await query(
    `INSERT INTO public."USER" (
    email, password, nickname, auth_provider, provider_id)
    VALUES ($1, NULL, $2, $3, $4)
    RETURNING ${USER_COLUMNS}`,
    [email.toLowerCase(), nickname, provider, String(providerUserId)],
  )
  return result.rows[0]
}

/**
 * 새로 발급한 리프레시 토큰의 해시값을 DB에 저장한다.
 * createSession()에서 로그인/ OAuth로그임/ 토큰 갱신 시마다 호출됨
 */
export async function createRefreshToken({ userId, tokenHash, expiresAt }) {
  const result = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING refresh_token_id, user_id, expires_at, created_at`,
    [userId, tokenHash, expiresAt],
  )
  return result.rows[0]
}

/**
 * 리프레시 토큰을 1회성으로 소비(삭제)하여 유효성을 확인한다.(회전 방식)
 * refreshSession()에서 새 토큰 발급 전, 만료되지 않은 토큰인지 검증하는 데 쓰임
 * 존재하지 않거나 만료됐으면 undefined를 반환해 401 처리로 이어짐
 */
export async function consumeRefreshToken( tokenHash ) {
  const result = await query(
    `DELETE FROM public.refresh_tokens rt
USING public."USER" u
    WHERE rt.token_hash = $1 
      AND rt.expires_at > CURRENT_TIMESTAMP
      AND u.user_id = rt.user_id
    RETURNING rt.user_id, u.account_status`,
    [tokenHash],
  )

  return result.rows[0]
}

/**
 * 로그아웃 시 해당 리프레시 토큰을 DB에서 삭제해 더 이상 갱신에 쓸 수 없게 만든다.
 * logout()에서 호출됨
 */
export async function revokeRefreshToken(tokenHash) {
  const result = await query(
    `DELETE FROM public.refresh_tokens
     WHERE token_hash = $1
     RETURNING refresh_token_id`,
    [tokenHash],
  )
  return result.rowCount > 0
}
