import { query } from "../../db/database.mjs"

const COURSE_COLUMNS = `
  course.course_id AS "itineraryId",
  course.plan_id AS "tripPlanId",
  course.course_type AS "courseKind",
  course.total_moving_time AS "totalMinutes",
  course.total_walking_dist AS "walkingDistanceMeters",
  course.total_transfer_count AS "transferCount",
  course.total_estimated_fare AS "estimatedFare",
  course.warnings_json AS "warningsJson",
  plan.start_time AS "startTime",
  plan.end_time AS "endTime",
  plan.start_latitude AS "startLatitude",
  plan.start_longitude AS "startLongitude",
  plan.end_latitude AS "endLatitude",
  plan.end_longitude AS "endLongitude",
  plan.with_pet AS "withPet",
  plan.meal_preference AS "mealPreference"`

export async function findOwnedCourses({ userId, tripPlanId }) {
  const result = await query(
    `SELECT ${COURSE_COLUMNS}
     FROM public."COURSE" AS course
     JOIN public."TRIP_PLAN" AS plan ON plan.plan_id = course.plan_id
     WHERE course.plan_id = $1 AND plan.user_id = $2
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
