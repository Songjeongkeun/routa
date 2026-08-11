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
    `SELECT inquiry_id, itinerary_id, title, content, status, created_at, updated_at,
            answered_at, answer_content, answered_by
     FROM public."INQUIRY"
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    params,
  )
  return result.rows
}

/**
 * 변경: 목록 필터와 무관한 전체 문의 통계를 별도로 조회합니다.
 * 검색 결과 개수로 상단 통계를 표시하면 사용자가 "전체" 건수로 오해하기 때문입니다.
 */
export async function getInquirySummaryByUser(userId) {
  const result = await query(
    `SELECT
       COUNT(*)::INT AS "totalCount",
       COUNT(*) FILTER (WHERE status = 'WAITING')::INT AS "waitingCount",
       COUNT(*) FILTER (WHERE status = 'ANSWERED')::INT AS "answeredCount"
     FROM public."INQUIRY"
     WHERE user_id = $1`,
    [userId],
  )
  return result.rows[0]
}

export async function findInquiryByIdWithRequester(inquiryId) {
  const result = await query(
    `SELECT i.*, u.nickname AS requester_name, u.email AS requester_email,
            u.profile_image_url AS requester_profile_image_url,
            answerer.nickname AS answerer_name
     FROM public."INQUIRY" i
     JOIN public."USER" u ON u.user_id = i.user_id
     LEFT JOIN public."USER" answerer ON answerer.user_id = i.answered_by
     WHERE i.inquiry_id = $1`,
    [inquiryId],
  )
  return result.rows[0] ?? null
}

export async function createInquiry({ userId, itineraryId, title, content }) {
  const result = await query(
    // 변경: itinerary_id는 선택값입니다. 일정과 무관한 일반 문의에는 NULL을 저장합니다.
    `INSERT INTO public."INQUIRY" (user_id, itinerary_id, title, content, status, updated_at)
     VALUES ($1, $2, $3, $4, 'WAITING', NOW())
     RETURNING inquiry_id`,
    [userId, itineraryId, title, content],
  )
  return result.rows[0].inquiry_id
}

/** 저장 일정 소유 여부를 확인해 다른 사용자의 course_id를 문의에 연결하지 못하게 합니다. */
export async function findOwnedSavedItinerary({ userId, itineraryId }) {
  const result = await query(
    `SELECT course.course_id
     FROM public."COURSE" AS course
     JOIN public."TRIP_PLAN" AS plan ON plan.plan_id = course.plan_id
     WHERE course.course_id = $1
       AND plan.user_id = $2
       AND course.status = 'SAVED'`,
    [itineraryId, userId],
  )
  return result.rows[0] ?? null
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
    `SELECT i.inquiry_id, i.user_id, i.itinerary_id, i.title, i.status, i.content,
            i.created_at, i.updated_at, i.answered_at, i.answered_by, i.answer_content,
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

export async function saveAnswer({ inquiryId, answerContent, adminId }) {
  await query(
    // 변경: 답변을 누가 언제 수정했는지 추적하기 위해 answered_by와 updated_at도 함께 저장합니다.
    `UPDATE public."INQUIRY"
     SET answer_content = $1,
         answered_at = NOW(),
         answered_by = $3,
         updated_at = NOW(),
         status = 'ANSWERED'
     WHERE inquiry_id = $2`,
    [answerContent, inquiryId, adminId],
  )
}
