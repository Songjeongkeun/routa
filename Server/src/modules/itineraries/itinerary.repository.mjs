// 변경: 저장 일정 확정은 여러 DB 작업을 하나의 단위로 처리하므로 트랜잭션 함수도 함께 가져옵니다.
// withTransaction import가 없으면 저장 버튼을 눌렀을 때 ReferenceError가 발생합니다.
import { query, withTransaction } from "../../db/database.mjs"

const COURSE_COLUMNS = `
  course.course_id AS "itineraryId",
  course.plan_id AS "tripPlanId",
  course.course_type AS "courseKind",
  course.total_moving_time AS "totalMinutes",
  course.total_walking_dist AS "walkingDistanceMeters",
  course.total_transfer_count AS "transferCount",
  course.total_estimated_fare AS "estimatedFare",
  course.warnings_json AS "warningsJson",
  -- 변경: 추천 결과(DRAFT)와 사용자가 확정한 저장 일정(SAVED)을 같은 COURSE에서 구분합니다.
  course.status,
  course.title AS "savedTitle",
  course.saved_at AS "savedAt",
  course.saved_snapshot_json AS "savedSnapshotJson",
  -- 변경: SAVED 일정은 원본 TRIP_PLAN이 나중에 수정돼도, 확정 당시의 여행 시각을 사용합니다.
  course.saved_travel_start_time AS "savedTravelStartTime",
  course.saved_travel_end_time AS "savedTravelEndTime",
  plan.start_time AS "startTime",
  plan.end_time AS "endTime",
  plan.start_latitude AS "startLatitude",
  plan.start_longitude AS "startLongitude",
  plan.end_latitude AS "endLatitude",
  plan.end_longitude AS "endLongitude",
  plan.with_pet AS "withPet",
  plan.meal_preference AS "mealPreference"`

// 변경: 목록 쿼리와 전체 건수 쿼리가 완전히 같은 조건을 사용하도록 공통 WHERE 절을 둡니다.
// COUNT(*) OVER()는 현재 페이지가 비었을 때 행 자체가 없어 총 건수를 0으로 잘못 읽는 문제가 있었습니다.
const SAVED_COURSE_FILTERS = `
  WHERE plan.user_id = $1
    AND course.status = 'SAVED'
    AND (
      $2 = ''
      OR COALESCE(course.title, '') ILIKE '%' || $2 || '%'
      OR EXISTS (
        SELECT 1
        FROM public."COURSE_NODE" AS node
        JOIN public."PLACE" AS place ON place.place_id = node.place_id
        WHERE node.course_id = course.course_id
          AND place.place_name ILIKE '%' || $2 || '%'
      )
    )
    AND ($3::VARCHAR IS NULL OR course.course_type = $3)
    AND ($4::DATE IS NULL OR (COALESCE(course.saved_travel_start_time, plan.start_time) AT TIME ZONE 'Asia/Seoul')::DATE = $4::DATE)
    AND (
      $5::VARCHAR IS NULL
      OR ($5 = 'UPCOMING' AND COALESCE(course.saved_travel_end_time, plan.end_time) >= NOW())
      OR ($5 = 'PAST' AND COALESCE(course.saved_travel_end_time, plan.end_time) < NOW())
    )`

export async function findOwnedCourses({ userId, tripPlanId }) {
  const result = await query(
    `SELECT ${COURSE_COLUMNS}
     FROM public."COURSE" AS course
     JOIN public."TRIP_PLAN" AS plan ON plan.plan_id = course.plan_id
     -- 변경: 추천 결과 화면에는 이번 계산에서 생성한 DRAFT 코스만 보입니다.
     -- SAVED 일정은 /itineraries?status=SAVED 목록에서 별도로 관리합니다.
     WHERE course.plan_id = $1 AND plan.user_id = $2 AND course.status = 'DRAFT'
     ORDER BY course.course_id ASC`,
    [tripPlanId, userId],
  )
  return result.rows
}

export async function findOwnedCourseById({ userId, itineraryId }) {
  const result = await query(
    `SELECT ${COURSE_COLUMNS}
     FROM public."COURSE" AS course
     JOIN public."TRIP_PLAN" AS plan ON plan.plan_id = course.plan_id
     WHERE course.course_id = $1 AND plan.user_id = $2`,
    [itineraryId, userId],
  )
  return result.rows[0] ?? null
}

/**
 * 변경: 저장 일정 목록은 제목뿐 아니라 포함된 장소명으로도 검색합니다.
 * 모든 조건을 TRIP_PLAN.user_id와 함께 적용해 다른 사용자의 저장 일정은 조회되지 않습니다.
 */
export async function findSavedOwnedCourses({
  userId,
  keyword = "",
  courseType = null,
  travelDate = null,
  schedulePeriod = null,
  page,
  pageSize,
}) {
  const normalizedKeyword = keyword.trim()
  const offset = (page - 1) * pageSize
  const filterParams = [userId, normalizedKeyword, courseType, travelDate, schedulePeriod]
  // 변경: 빈 마지막 페이지에서도 totalCount를 보존하기 위해 목록과 건수를 별도로 읽습니다.
  // 두 쿼리는 같은 필터 상수를 사용하므로 검색·기간 탭·코스 필터의 결과가 어긋나지 않습니다.
  const [countResult, result] = await Promise.all([
    query(
      `SELECT COUNT(*)::INT AS "totalCount"
       FROM public."COURSE" AS course
       JOIN public."TRIP_PLAN" AS plan ON plan.plan_id = course.plan_id
       ${SAVED_COURSE_FILTERS}`,
      filterParams,
    ),
    query(
    `SELECT
       ${COURSE_COLUMNS}
     FROM public."COURSE" AS course
     JOIN public."TRIP_PLAN" AS plan ON plan.plan_id = course.plan_id
     ${SAVED_COURSE_FILTERS}
     ORDER BY
       -- 변경: 다가오는 여행은 가까운 출발일 순, 지난 여행은 최근 종료일 순으로 보여 줍니다.
       CASE WHEN $5 = 'UPCOMING' THEN COALESCE(course.saved_travel_start_time, plan.start_time) END ASC NULLS LAST,
       CASE WHEN $5 = 'PAST' THEN COALESCE(course.saved_travel_end_time, plan.end_time) END DESC NULLS LAST,
       course.saved_at DESC NULLS LAST,
       course.course_id DESC
     LIMIT $6 OFFSET $7`,
      [...filterParams, pageSize, offset],
    ),
  ])

  return {
    rows: result.rows,
    totalCount: Number(countResult.rows[0]?.totalCount ?? 0),
  }
}

export async function findCourseNodes(itineraryId) {
  const result = await query(
    `SELECT
       node.node_id AS "itemId",
       node.place_id AS "placeId",
       node.visit_order AS "visitOrder",
       node.node_type AS kind,
       node.arrival_time AS "arrivalTime",
       node.departure_time AS "departureTime",
       node.stay_duration_mins AS "stayMinutes",
       place.place_name AS "placeName",
       place.place_category AS "placeCategory",
       place.latitude,
       place.longitude
     FROM public."COURSE_NODE" AS node
     JOIN public."PLACE" AS place ON place.place_id = node.place_id
     WHERE node.course_id = $1
     ORDER BY node.visit_order ASC`,
    [itineraryId],
  )
  return result.rows
}

/**
 * 변경: 추천을 생성할 때 ROUTE_SECTION에 저장한 실제 ODsay 경로를 결과 화면에서 다시 읽습니다.
 * COURSE_NODE는 장소 순서만 저장하므로, 인접한 두 장소 ID로 해당 구간을 찾습니다.
 */
export async function findRouteSection({ originPlaceId, destinationPlaceId }) {
  const result = await query(
    `SELECT
       route_id AS "routeId",
       transit_time_mins AS "durationMinutes",
       walking_distance_m AS "walkingDistanceMeters",
       transfer_count AS "transferCount",
       transport_mode AS "transportMode",
       estimated_fare AS "estimatedFare",
       path_details AS "pathDetails"
     FROM public."ROUTE_SECTION"
     WHERE origin_place_id = $1 AND dest_place_id = $2`,
    [originPlaceId, destinationPlaceId],
  )
  return result.rows[0] ?? null
}

/**
 * 변경: 저장 버튼을 여러 번 눌러도 COURSE 한 건을 새로 복제하지 않습니다.
 * DRAFT에서 SAVED로 전환된 첫 요청만 스냅샷을 저장하고, 뒤따른 요청은 이미 저장된 같은 코스를 반환합니다.
 */
export function saveOwnedCourse({ userId, itineraryId, title, saveRequestId, snapshotJson }) {
  return withTransaction(async (execute) => {
    const savedResult = await execute(
      `UPDATE public."COURSE" AS course
       SET status = 'SAVED',
           title = $3,
           saved_at = NOW(),
           save_request_id = $4::UUID,
           saved_snapshot_json = $5,
           -- 변경: 이후 원본 TRIP_PLAN을 수정해도 저장 일정의 날짜·기간 분류가 바뀌지 않도록
           -- SAVED로 확정하는 바로 이 시점의 여행 시작·종료 시각을 COURSE에 복사합니다.
           saved_travel_start_time = plan.start_time,
           saved_travel_end_time = plan.end_time
       FROM public."TRIP_PLAN" AS plan
       WHERE course.course_id = $1
         AND course.plan_id = plan.plan_id
         AND plan.user_id = $2
         AND course.status = 'DRAFT'
       RETURNING course.course_id AS "itineraryId"`,
      [itineraryId, userId, title, saveRequestId, snapshotJson],
    )

    if (savedResult.rows[0]) {
      return { itineraryId: savedResult.rows[0].itineraryId, didSave: true }
    }

    const existingResult = await execute(
      `SELECT course.course_id AS "itineraryId", course.status
       FROM public."COURSE" AS course
       JOIN public."TRIP_PLAN" AS plan ON plan.plan_id = course.plan_id
       WHERE course.course_id = $1 AND plan.user_id = $2`,
      [itineraryId, userId],
    )
    const existingCourse = existingResult.rows[0]
    if (!existingCourse) return null

    return {
      itineraryId: existingCourse.itineraryId,
      didSave: false,
      status: existingCourse.status,
    }
  })
}

/** 변경: 저장 일정 편집 후 다시 계산된 items·legs 전체를 최신 스냅샷으로 교체합니다. */
export async function updateSavedSnapshot({ userId, itineraryId, snapshotJson }) {
  await query(
    `UPDATE public."COURSE" AS course
     SET saved_snapshot_json = $3
     FROM public."TRIP_PLAN" AS plan
     WHERE course.course_id = $1
       AND course.plan_id = plan.plan_id
       AND plan.user_id = $2
       AND course.status = 'SAVED'`,
    [itineraryId, userId, snapshotJson],
  )
}

/** 변경: 저장 목록 카드의 제목만 변경하며, DRAFT 추천 코스의 제목은 수정하지 않습니다. */
export async function updateOwnedSavedCourseTitle({ userId, itineraryId, title }) {
  const result = await query(
    `UPDATE public."COURSE" AS course
     SET title = $3
     FROM public."TRIP_PLAN" AS plan
     WHERE course.course_id = $1
       AND course.plan_id = plan.plan_id
       AND plan.user_id = $2
       AND course.status = 'SAVED'
     RETURNING course.course_id AS "itineraryId"`,
    [itineraryId, userId, title],
  )
  return result.rows[0] ?? null
}

/**
 * 변경: 삭제 대상이 현재 사용자 소유의 SAVED 일정인지 확인한 뒤, 노드와 코스를 같은 트랜잭션에서 제거합니다.
 * ROUTE_SECTION은 다른 일정도 공유하는 캐시이므로 여기서 삭제하지 않습니다.
 */
export function deleteOwnedSavedCourse({ userId, itineraryId }) {
  return withTransaction(async (execute) => {
    const ownedResult = await execute(
      `SELECT course.course_id AS "itineraryId"
       FROM public."COURSE" AS course
       JOIN public."TRIP_PLAN" AS plan ON plan.plan_id = course.plan_id
       WHERE course.course_id = $1
         AND plan.user_id = $2
         AND course.status = 'SAVED'
       FOR UPDATE`,
      [itineraryId, userId],
    )
    if (!ownedResult.rows[0]) return false

    await execute(`DELETE FROM public."COURSE_NODE" WHERE course_id = $1`, [itineraryId])
    await execute(`DELETE FROM public."COURSE" WHERE course_id = $1`, [itineraryId])
    return true
  })
}
