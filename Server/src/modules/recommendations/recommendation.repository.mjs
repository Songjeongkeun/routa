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
 * 변경: 주변 음식점 추천은 계획된 경로의 현재·다음 장소 반경에서만 후보를 읽습니다.
 * 영업·휴무·라스트오더의 정확한 판정은 도착 시각이 계산된 뒤 서비스 계층에서 다시 수행합니다.
 */
export async function findNearbyRestaurants({
  latitude,
  longitude,
  radiusKm,
  withPet,
  // 변경: 점심에 이미 확정했거나 다른 슬롯에 지정한 음식점은 SQL 단계에서 제외합니다.
  // LIMIT 전에 제외해야 상위 20개가 모두 중복 음식점인 경우에도 다음 후보를 정상적으로 찾을 수 있습니다.
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
       -- 변경: 빈 BIGINT 배열에 대한 "<> ALL" 조건은 항상 참이므로,
       -- 제외할 음식점이 없을 때도 별도 동적 SQL 없이 같은 쿼리를 사용할 수 있습니다.
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
 * 변경: ROUTE_SECTION은 장소 쌍마다 하나의 행을 유지하는 실제 대중교통 경로 캐시입니다.
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
      // 변경: 실제 보행 네트워크(KAKAO_WALK)와 최후의 직선거리 추정(WALK_FALLBACK)을
      // 결과 조회·지도 표시에서 구분할 수 있도록 이동수단 값을 나누어 저장합니다.
      route.source === "KAKAO_WALK"
        ? "WALK_REAL"
        : (route.source === "WALK_FALLBACK" ? "WALK_FALLBACK" : "PUBLIC_TRANSIT"),
      route.estimatedFare,
      // 변경: 대표 경로 수치와 함께 후보 전체를 저장해야 코스별로 다른 기준을 적용할 수 있습니다.
      JSON.stringify({
        // 변경: 실제 도보 경로가 저장된 경우에는 어느 외부 Provider가 계산했는지도 보존합니다.
        provider: route.source === "KAKAO_WALK" ? "KAKAO" : "ODSAY",
        alternatives: route.alternatives,
      }),
    ],
  )
  return result.rows[0]
}

export function replaceCourses({ tripPlanId, courses }) {
  return withTransaction(async (execute) => {
    // 변경: 같은 계획을 다시 계산하면 이전 DRAFT 추천 코스만 지웁니다.
    // 사용자가 SAVED로 확정한 일정은 재추천 때문에 삭제되면 안 되므로 그대로 보존합니다.
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
 * 변경: 결과 화면에서 한 코스만 편집할 때는 다른 두 추천 코스를 보존합니다.
 * 모든 노드·요약 수치를 한 트랜잭션에서 교체하므로 검증 실패 시 이전 일정이 그대로 남습니다.
 */
export function replaceCourseContents({ itineraryId, course }) {
  return withTransaction(async (execute) => {
    await execute(`DELETE FROM public."COURSE_NODE" WHERE course_id = $1`, [itineraryId])
    await execute(
      `UPDATE public."COURSE"
       SET total_moving_time = $2, total_walking_dist = $3, total_transfer_count = $4,
           total_estimated_fare = $5, warnings_json = $6,
           -- 변경: 저장 일정 편집은 새 시간표·지도 좌표를 만들므로, 이전 스냅샷을 먼저 비웁니다.
           -- service가 재계산 상세를 읽은 직후 최신 스냅샷을 다시 저장합니다.
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
