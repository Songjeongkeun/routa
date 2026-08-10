import { query } from "../../db/database.mjs"

export async function findInquiriesByUser({ userId, keyword, status }) {
  const conditions = ["user_id = $1"]
  const params = [userId]

  if (keyword) {
    params.push(`%${keyword}%`)
    conditions.push(`title ILIKE $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`status = $${params.length}`)
  }

  const result = await query(
    `SELECT inquiry_id, title, content, status, created_at, answered_at, answer_content
     FROM public."INQUIRY"
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    params,
  )
  return result.rows
}

export async function findInquiryByIdWithRequester(inquiryId) {
  const result = await query(
    `SELECT i.*, u.nickname AS requester_name, u.email AS requester_email,
            u.profile_image_url AS requester_profile_image_url
     FROM public."INQUIRY" i
     JOIN public."USER" u ON u.user_id = i.user_id
     WHERE i.inquiry_id = $1`,
    [inquiryId],
  )
  return result.rows[0] ?? null
}

export async function createInquiry({ userId, title, content }) {
  const result = await query(
    `INSERT INTO public."INQUIRY" (user_id, title, content, status)
     VALUES ($1, $2, $3, 'WAITING')
     RETURNING inquiry_id`,
    [userId, title, content],
  )
  return result.rows[0].inquiry_id
}

export async function findAllInquiries({ status }) {
  const conditions = []
  const params = []

  if (status) {
    params.push(status)
    conditions.push(`i.status = $${params.length}`)
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""

  const result = await query(
    `SELECT i.inquiry_id, i.user_id, i.title, i.status, i.content, i.created_at, i.answered_at,
            u.nickname AS requester_name, u.email AS requester_email,
            u.profile_image_url AS requester_profile_image_url
     FROM public."INQUIRY" i
     JOIN public."USER" u ON u.user_id = i.user_id
     ${whereClause}
     ORDER BY i.created_at DESC`,
    params,
  )
  return result.rows
}

export async function findInquiryById(inquiryId) {
  const result = await query(`SELECT * FROM public."INQUIRY" WHERE inquiry_id = $1`, [inquiryId])
  return result.rows[0] ?? null
}

export async function findInquiryByIdAndUser(inquiryId, userId) {
  const result = await query(
    `SELECT * FROM public."INQUIRY" WHERE inquiry_id = $1 AND user_id = $2`,
    [inquiryId, userId],
  )
  return result.rows[0] ?? null
}

export async function saveAnswer({ inquiryId, answerContent }) {
  await query(
    `UPDATE public."INQUIRY"
     SET answer_content = $1, answered_at = NOW(), status = 'ANSWERED'
     WHERE inquiry_id = $2`,
    [answerContent, inquiryId],
  )
}