import { query } from "../../db/database.mjs"

export async function findProfileImageUrl(userId) {
    const result = await query(
        `SELECT profile_image_url FROM public."USER" WHERE user_id =$1`,
        [userId],
    )
    return result.rows[0]?.profile_image_url
}

/** 이미지 변경 */
export async function updateProfileImageUrl(userId, imageUrl) {
    const result = await query(
        `UPDATE public."USER" SET profile_image_url = $1 WHERE user_id = $2
        RETURNING user_id, profile_image_url`,
        [imageUrl, userId],
    )
    return result.rows[0]
}

/** 닉네임 변경 */
export async function updateNickname(userId, nickname) {
    const result = await query(
        `UPDATE public."USER" SET nickname = $1 WHERE user_id = $2
        RETURNING user_id, nickname`,
        [nickname, userId],
    )
    return result.rows[0]
}

/** 자기소개 변경 */
export async function updateIntroduction(userId, introduction) {
    const result = await query(
        `UPDATE public."USER" SET introduction = $1 WHERE user_id = $2
        RETURNING user_id, introduction`,
        [introduction, userId],
    )
    return result.rows[0]
}

/** 전체 유저 수 (탈퇴 제외) */
export async function countUsers() {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM public."USER" WHERE account_status != 'WITHDRAWN'`,
  )
  return result.rows[0].count
}

/** 신규 가입(오늘) */
export async function countNewUsersToday() {
    const result = await query(
        `SELECT COUNT(*)::int AS count FROM public."USER"
        WHERE created_at >= date_trunc('day', CURRENT_TIMESTAMP)`,
    )
    return result.rows[0].count
}

/** 활성 유저 = 최근 30일 내 로그인한 유저 */
export async function countActiveUsers() {
    const result = await query(
        `SELECT COUNT(*)::int AS count FROM public."USER"
        WHERE last_login_at >= CURRENT_TIMESTAMP - interval '30 days'`,
    )
    return result.rows[0].count
}

/** 최근 N개월, 월말 기준 누적 가입자 수 (그래프용) */
export async function findMonthlyUserTrend(months = 6) {
  const result = await query(
    `SELECT to_char(month, 'MM') || '월' AS month,
            (SELECT COUNT(*) FROM public."USER" u
             WHERE u.created_at < month + interval '1 month')::int AS value
     FROM generate_series(
       date_trunc('month', CURRENT_DATE) - interval '${months - 1} months',
       date_trunc('month', CURRENT_DATE),
       interval '1 month'
     ) AS month
     ORDER BY month`,
  )
  return result.rows
}

/** 최근 가입한 순서로 유저 정렬 (디폴트는 0번째부터 50명까지) */
export async function findUsers({ limit = 50, offset = 0 } = {}) {
    const result = await query(
        `SELECT user_id, nickname, email, created_at, account_status
        FROM public."USER"
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
        [limit, offset],
    )
    return result.rows
}

/** 특정 유저 1명의 account_status 조회 */
export async function findAccountStatusById(userId) {
    const result = await query(
        `SELECT account_status FROM public."USER" WHERE user_id = $1`,
        [userId],
    )
    return result.rows[0]?.account_status
}

/** 특정 유저의 account_status 값을 새 값으로 실제로 바꾸는 함수 */
export async function updateAccountStatus(userId, status) {
    const result = await query(
        `UPDATE public."USER" SET account_status = $1 WHERE user_id = $2
        RETURNING user_id, account_status`,
        [status, userId],
    )
    return result.rows[0]
}

/** 회원 탈퇴 — 실제로 삭제하지 않고 상태만 변경 */
export async function withdrawUser(userId) {
  const result = await query(
    `UPDATE public."USER" SET account_status = 'WITHDRAWN' WHERE user_id = $1
     RETURNING user_id, account_status`,
    [userId],
  )
  return result.rows[0]
}

/** 현재 비밀번호 해시 조회 (OAuth 계정은 null) */
export async function findPasswordHash(userId) {
  const result = await query(
    `SELECT password FROM public."USER" WHERE user_id = $1`,
    [userId],
  )
  return result.rows[0]?.password
}

/** 비밀번호 변경 */
export async function updatePassword(userId, passwordHash) {
  await query(
    `UPDATE public."USER" SET password = $1 WHERE user_id = $2`,
    [passwordHash, userId],
  )
}