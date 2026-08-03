import { query } from "../../db/database.mjs"

export async function createUser({ loginId, email, passwordHash, nickname }) {
  const result = await query(
    `INSERT INTO users (login_id, email, password_hash, nickname)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id, login_id, email, nickname, role, account_status, created_at`,
    [loginId, email.toLowerCase(), passwordHash, nickname],
  )
  return result.rows[0]
}

export async function findByLoginId(loginId) {
  const result = await query(
    `SELECT user_id, login_id, email, password_hash, nickname, role, account_status
     FROM users
     WHERE LOWER(login_id) = LOWER($1)`,
    [loginId.trim()],
  )
  return result.rows[0]
}

export async function findByEmail(email) {
  const result = await query(
    `SELECT user_id, login_id, email, password_hash, nickname, role, account_status, created_at
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email.trim()],
  )
  return result.rows[0]
}

export async function findById(userId) {
  const result = await query(
    `SELECT user_id, login_id, email, nickname, role, account_status, created_at
     FROM users
     WHERE user_id = $1`,
    [userId],
  )
  return result.rows[0]
}

export async function updateLastLoginAt(userId) {
  await query(
    `UPDATE users
     SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1`,
    [userId],
  )
}

export async function findByOAuthAccount(provider, providerUserId) {
  const result = await query(
    `SELECT u.user_id, u.login_id, u.email, u.nickname, u.role, u.account_status, u.created_at
     FROM oauth_accounts oa
     JOIN users u ON u.user_id = oa.user_id
     WHERE oa.provider = $1 AND oa.provider_user_id = $2`,
    [provider, String(providerUserId)],
  )
  return result.rows[0]
}

export async function createOAuthUser({ email, nickname, provider, providerUserId }) {
  const result = await query(
    `WITH new_user AS (
       INSERT INTO users (email, nickname, signup_type)
       VALUES ($1, $2, 'OAUTH')
       RETURNING user_id, login_id, email, nickname, role, account_status, created_at
     ), new_oauth_account AS (
       INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_email)
       SELECT user_id, $3, $4, $1 FROM new_user
     )
     SELECT * FROM new_user`,
    [email.toLowerCase(), nickname, provider, String(providerUserId)],
  )
  return result.rows[0]
}

export async function createRefreshToken({ userId, tokenHash, expiresAt }) {
  const result = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING refresh_token_id, user_id, expires_at, created_at`,
    [userId, tokenHash, expiresAt],
  )
  return result.rows[0]
}

export async function consumeRefreshToken(tokenHash) {
  const result = await query(
    `UPDATE refresh_tokens rt
     SET revoked_at = CURRENT_TIMESTAMP
     FROM users u
     WHERE rt.token_hash = $1
       AND rt.revoked_at IS NULL
       AND rt.expires_at > CURRENT_TIMESTAMP
       AND u.user_id = rt.user_id
     RETURNING rt.user_id, u.account_status`,
    [tokenHash],
  )
  return result.rows[0]
}

export async function revokeRefreshToken(tokenHash) {
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING refresh_token_id`,
    [tokenHash],
  )
  return result.rowCount > 0
}
