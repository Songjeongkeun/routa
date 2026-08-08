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