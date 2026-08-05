import { query } from "../../db/database.mjs"

export async function findProfileImageUrl(userId) {
    const result = await query(
        `SELECT profile_image_url FROM public."USER" WHERE user_id =$1`,
        [userId],
    )
    return result.rows[0]?.profile_image_url
}

export async function updateProfileImageUrl(userId, imageUrl) {
    const result = await query(
        `UPDATE public."USER" SET profile_image_url = $1 WHERE user_id = $2
        RETURNING user_id, profile_image_url`,
        [imageUrl, userId],
    )
    return result.rows[0]
}