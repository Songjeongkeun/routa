import { query, withTransaction } from "../../db/database.mjs"

export async function findOwnedPlan({ userId, tripPlanId }) {
  const result = await query(
    `SELECT
      plan_id AS "tripPlanId",
      start_time AS "startTime",
      end_time AS "endTime",
      start_location AS "startLocation",
      start_latitude AS "startLatitude",
      start_longitude AS "startLongitude",
      end_location AS "endLocation",
      end_latitude AS "endLatitude",
      end_longitude AS "endLongitude",
      with_pet AS "withPet",
      meal_preference AS "mealPreference",
      preferred_themes AS "preferredThemes"
    FROM public."TRIP_PLAN"
    WHERE plan_id = $1 AND user_id = $2`,
    [tripPlanId, userId],
  )
  return result.rows[0] ?? null
}

export async function findPlacesByIds(placeIds) {
  if (placeIds.length === 0) return []

  const result = await query(
    `SELECT
      place_id AS "placeId", place_name AS "placeName", place_category AS "placeCategory",
      latitude, longitude, default_stay_mins AS "defaultStayMins",
      start_time AS "startTime", end_time AS "endTime", closed_days AS "closedDays",
      last_order AS "lastOrder", pet_is_allowed AS "petIsAllowed",
      average_rating::DOUBLE PRECISION AS "averageRating"
    FROM public."PLACE"
    WHERE place_id = ANY($1::BIGINT[])`,
    [placeIds],
  )
  return result.rows
}

export async function findClosestPlace(latitude, longitude) {
  const result = await query(
    `SELECT
      place_id AS "placeId", place_name AS "placeName", place_category AS "placeCategory",
      latitude, longitude, default_stay_mins AS "defaultStayMins",
      start_time AS "startTime", end_time AS "endTime", closed_days AS "closedDays",
      last_order AS "lastOrder", pet_is_allowed AS "petIsAllowed",
      average_rating::DOUBLE PRECISION AS "averageRating"
    FROM public."PLACE"
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY
       6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(latitude - $1) / 2), 2)
         + COS(RADIANS($1)) * COS(RADIANS(latitude))
         * POWER(SIN(RADIANS(longitude - $2) / 2), 2)
      )) ASC
    LIMIT 1`,
    [latitude, longitude],
  )
  return result.rows[0] ?? null
}

/**
 * 주변 음식점 후보는 계획된 경로의 현재·다음 장소 반경에서만 읽습니다.
 * 영업·휴무·라스트오더의 정확한 판정은 도착 시각이 계산된 뒤 서비스 계층에서 다시 수행합니다.
 */
export async function findNearbyRestaurants({
  latitude,
  longitude,
  radiusKm,
  withPet,
  // LIMIT 전에 중복 식당을 제외해 유효 후보 수를 확보합니다.
  excludePlaceIds = [],
  limit = 20,
}) {
  const normalizedExcludedPlaceIds = [...new Set(excludePlaceIds.map(Number))]
    .filter((placeId) => Number.isSafeInteger(placeId) && placeId > 0)
  const result = await query(
    `SELECT
       place_id AS "placeId", place_name AS "placeName", place_category AS "placeCategory",
       latitude, longitude, default_stay_mins AS "defaultStayMins",
       start_time AS "startTime", end_time AS "endTime", closed_days AS "closedDays",
       last_order AS "lastOrder", pet_is_allowed AS "petIsAllowed",
       average_rating::DOUBLE PRECISION AS "averageRating",
       6371 * 2 * ASIN(SQRT(
         POWER(SIN(RADIANS(latitude - $1) / 2), 2)
         + COS(RADIANS($1)) * COS(RADIANS(latitude))
         * POWER(SIN(RADIANS(longitude - $2) / 2), 2)
       )) AS "distanceKm"
     FROM public."PLACE"
     WHERE place_category = '음식점'
       AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND (NOT $4::BOOLEAN OR pet_is_allowed = TRUE)
       -- 빈 배열에도 안전한 조건이므로 동적 SQL이 필요하지 않습니다.
       AND place_id <> ALL($5::BIGINT[])
       AND 6371 * 2 * ASIN(SQRT(
         POWER(SIN(RADIANS(latitude - $1) / 2), 2)
         + COS(RADIANS($1)) * COS(RADIANS(latitude))
         * POWER(SIN(RADIANS(longitude - $2) / 2), 2)
       )) <= $3
     ORDER BY "distanceKm" ASC, average_rating DESC NULLS LAST, place_id ASC
     LIMIT $6`,
    [latitude, longitude, radiusKm, withPet, normalizedExcludedPlaceIds, limit],
  )
  return result.rows
}

/**
 * 추천 탐색 전에 저장된 장소 쌍의 이동 후보를 읽어 옵니다.
 * ROUTE_SECTION은 서버 재시작 뒤에도 남는 공용 캐시이므로, 메모리 캐시가 비어 있어도
 * 같은 장소 쌍에 대해 ODsay·카카오 길찾기 API를 다시 호출하지 않게 합니다.
 */
export async function findRouteSection({ originPlaceId, destinationPlaceId }) {
  const result = await query(
    `SELECT
       route_id AS "routeId",
       origin_place_id AS "originPlaceId",
       dest_place_id AS "destinationPlaceId",
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
 * ROUTE_SECTION은 장소 쌍마다 하나의 행을 유지하는 이동 경로 캐시입니다.
 * 같은 장소 쌍을 여러 코스가 사용해도 ODsay를 반복 호출하지 않도록, 후보 경로 전체를
 * path_details(TEXT)에 JSON 문자열로 저장합니다.
 */
export async function upsertRouteSection({ originPlaceId, destinationPlaceId, route }) {
  const result = await query(
    `INSERT INTO public."ROUTE_SECTION" (
      origin_place_id, dest_place_id, transit_time_mins, walking_distance_m,
      transfer_count, transport_mode, estimated_fare, path_details
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (origin_place_id, dest_place_id)
    DO UPDATE SET
      transit_time_mins = EXCLUDED.transit_time_mins,
      walking_distance_m = EXCLUDED.walking_distance_m,
      transfer_count = EXCLUDED.transfer_count,
      transport_mode = EXCLUDED.transport_mode,
      estimated_fare = EXCLUDED.estimated_fare,
      path_details = EXCLUDED.path_details
    RETURNING
      route_id AS "routeId",
      origin_place_id AS "originPlaceId",
      dest_place_id AS "destinationPlaceId",
      transit_time_mins AS "durationMinutes",
      walking_distance_m AS "walkingDistanceMeters",
      transfer_count AS "transferCount",
      transport_mode AS "transportMode",
      estimated_fare AS "estimatedFare",
      path_details AS "pathDetails"`,
    [
      originPlaceId,
      destinationPlaceId,
      route.durationMinutes,
      route.walkingDistanceMeters,
      route.transferCount,
      // 실제 도보 경로와 직선거리 추정을 구분해 저장합니다.
      route.source === "KAKAO_WALK"
        ? "WALK_REAL"
        : (route.source === "WALK_FALLBACK" ? "WALK_FALLBACK" : "PUBLIC_TRANSIT"),
      route.estimatedFare,
      // 코스별 기준으로 다시 선택할 수 있도록 후보 전체를 보관합니다.
      JSON.stringify({
        // 지도 표시를 위해 실제 도보 경로의 제공자를 보존합니다.
        provider: route.source === "KAKAO_WALK" ? "KAKAO" : "ODSAY",
        alternatives: route.alternatives,
      }),
    ],
  )
  return result.rows[0]
}

export function replaceCourses({ tripPlanId, courses }) {
  return withTransaction(async (execute) => {
    // 재추천 시 DRAFT만 교체하고 사용자가 저장한 일정은 보존합니다.
    await execute(
      `DELETE FROM public."COURSE_NODE"
      WHERE course_id IN (
        SELECT course_id
        FROM public."COURSE"
        WHERE plan_id = $1 AND status = 'DRAFT'
      )`,
      [tripPlanId],
    )
    await execute(
      `DELETE FROM public."COURSE" WHERE plan_id = $1 AND status = 'DRAFT'`,
      [tripPlanId],
    )

    const insertedCourses = []
    for (const course of courses) {
      const courseResult = await execute(
        `INSERT INTO public."COURSE" (
          plan_id, course_type, total_moving_time, total_walking_dist,
          total_transfer_count, total_estimated_fare, warnings_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING course_id AS "itineraryId"`,
        [
          tripPlanId,
          course.courseType,
          course.summary.totalMinutes,
          course.summary.walkingDistanceMeters,
          course.summary.transferCount,
          course.summary.estimatedFare,
          JSON.stringify(course.warnings),
        ],
      )
      const itineraryId = courseResult.rows[0].itineraryId

      for (const node of course.nodes) {
        await execute(
          `INSERT INTO public."COURSE_NODE" (
            course_id, place_id, visit_order, node_type, arrival_time, departure_time, stay_duration_mins
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            itineraryId,
            node.placeId,
            node.visitOrder,
            node.nodeType,
            node.arrivalTime,
            node.departureTime,
            node.stayMinutes,
          ],
        )
      }
      insertedCourses.push({ itineraryId, courseType: course.courseType })
    }

    return insertedCourses
  })
}

/**
 * 결과 화면에서 한 코스만 편집해도 다른 두 추천 코스를 보존합니다.
 * 모든 노드·요약 수치를 한 트랜잭션에서 교체하므로 검증 실패 시 이전 일정이 그대로 남습니다.
 */
export function replaceCourseContents({ itineraryId, course }) {
  return withTransaction(async (execute) => {
    await execute(`DELETE FROM public."COURSE_NODE" WHERE course_id = $1`, [itineraryId])
    await execute(
      `UPDATE public."COURSE"
       SET total_moving_time = $2, total_walking_dist = $3, total_transfer_count = $4,
           total_estimated_fare = $5, warnings_json = $6,
           -- 편집으로 새 시간표·지도 좌표를 만들므로 기존 스냅샷을 비웁니다.
           saved_snapshot_json = NULL
       WHERE course_id = $1`,
      [
        itineraryId,
        course.summary.totalMinutes,
        course.summary.walkingDistanceMeters,
        course.summary.transferCount,
        course.summary.estimatedFare,
        JSON.stringify(course.warnings),
      ],
    )

    for (const node of course.nodes) {
      await execute(
        `INSERT INTO public."COURSE_NODE" (
          course_id, place_id, visit_order, node_type, arrival_time, departure_time, stay_duration_mins
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          itineraryId,
          node.placeId,
          node.visitOrder,
          node.nodeType,
          node.arrivalTime,
          node.departureTime,
          node.stayMinutes,
        ],
      )
    }
  })
}
