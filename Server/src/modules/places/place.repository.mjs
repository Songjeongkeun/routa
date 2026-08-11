import { query } from "../../db/database.mjs"

export async function findPlaces({
  keyword,
  placeCategory,
  visitOnly,
  petOnly,
  closedWeekday,
  startTime,
  endTime,
  limit,
  offset,
}) {
  const result = await query(
    `SELECT
       place_id AS "placeId",
       place_name AS "placeName",
       place_category AS "placeCategory",
       address,
       latitude,
       longitude,
       thumbnail_url AS "thumbnailUrl",
       start_time AS "startTime",
       end_time AS "endTime",
       closed_days AS "closedDays",
       last_order AS "lastOrder",
       average_rating::DOUBLE PRECISION AS "averageRating",
       default_stay_mins AS "defaultStayMins",
       pet_is_allowed AS "petIsAllowed",
       google_place_id AS "googlePlaceId",
       COUNT(*) OVER()::INT AS "totalItems"
     FROM public."PLACE"
     WHERE (
       $1::TEXT IS NULL
       OR place_name ILIKE '%' || $1 || '%'
       OR place_category ILIKE '%' || $1 || '%'
       OR address ILIKE '%' || $1 || '%'
       OR (
         $1 = '공원 산책'
         AND (place_category ILIKE '%공원%' OR place_category ILIKE '%산책%')
       )
     )
     -- 변경: 검색어와 별개로 장소 대분류를 정확히 제한합니다.
     -- placeCategory가 '음식점'이면 PLACE의 음식점 행만 반환합니다.
     AND ($6::TEXT IS NULL OR place_category = $6)
     -- 변경: 방문 장소 선택은 DB에서 실제로 관광지 역할을 하는 카페·관광명소·문화시설만 노출합니다.
     -- 음식점뿐 아니라 편의점·공공기관 등 경유지가 될 수 없는 일반 장소도 함께 제외합니다.
     AND (NOT $9::BOOLEAN OR place_category IN ('카페', '관광명소', '문화시설'))
     AND (NOT $2::BOOLEAN OR pet_is_allowed = TRUE)
     AND (
       $3::TEXT IS NULL
       OR closed_days IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM unnest(string_to_array(closed_days, ',')) AS closed_day
         WHERE BTRIM(closed_day) = $3
       )
     )
     AND (
       $4::TIME IS NULL
       OR $5::TIME IS NULL
       OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < $5 AND end_time > $4)
     )
     ORDER BY RANDOM()
     LIMIT $7
     OFFSET $8`,
    [
      keyword,
      petOnly,
      closedWeekday,
      startTime,
      endTime,
      placeCategory,
      limit,
      offset,
      visitOnly,
    ],
  )

  const totalItems = result.rows[0]?.totalItems ?? 0
  const places = result.rows.map(({ totalItems: _totalItems, ...place }) => place)

  return { places, totalItems }
}

/**
 * 변경: 방문 장소 추천은 일반 검색과 다르게 선택한 장소와 방문 대상이 아닌 장소를 제외하고,
 * 테마 일치·출발/도착지 거리·평점 순으로 정렬합니다. RANDOM 정렬을 쓰지 않아
 * 같은 여행 조건에서는 팀원이 재현 가능한 추천 결과를 확인할 수 있습니다.
 */
export async function findRecommendedVisitPlaces({
  excludePlaceIds,
  petOnly,
  closedWeekday,
  startTime,
  endTime,
  startLatitude,
  startLongitude,
  endLatitude,
  endLongitude,
  themes,
  limit,
}) {
  const result = await query(
    `SELECT
       place_id AS "placeId",
       place_name AS "placeName",
       place_category AS "placeCategory",
       address,
       latitude,
       longitude,
       thumbnail_url AS "thumbnailUrl",
       start_time AS "startTime",
       end_time AS "endTime",
       closed_days AS "closedDays",
       average_rating::DOUBLE PRECISION AS "averageRating",
       default_stay_mins AS "defaultStayMins",
       pet_is_allowed AS "petIsAllowed",
       CASE
         WHEN cardinality($10::TEXT[]) = 0 THEN 0
         WHEN EXISTS (
           SELECT 1
           FROM unnest($10::TEXT[]) AS theme
           WHERE place_category ILIKE '%' || theme || '%'
              OR place_name ILIKE '%' || theme || '%'
              OR address ILIKE '%' || theme || '%'
         ) THEN 1
         ELSE 0
       END AS "themeMatchScore",
       -- 변경: 출발·종료 위치는 각각 선택 사항입니다.
       -- 한쪽만 입력된 경우에도 해당 위치까지의 거리를 추천 점수에 반영하고,
       -- 둘 다 없을 때만 거리 점수를 NULL로 두어 테마·평점 순으로 추천합니다.
       CASE
         WHEN ($6::DOUBLE PRECISION IS NULL OR $7::DOUBLE PRECISION IS NULL)
          AND ($8::DOUBLE PRECISION IS NULL OR $9::DOUBLE PRECISION IS NULL) THEN NULL
         ELSE
           CASE
             WHEN $6::DOUBLE PRECISION IS NULL OR $7::DOUBLE PRECISION IS NULL THEN 0
             ELSE 6371 * 2 * ASIN(SQRT(
               POWER(SIN(RADIANS(latitude - $6) / 2), 2)
               + COS(RADIANS($6)) * COS(RADIANS(latitude))
               * POWER(SIN(RADIANS(longitude - $7) / 2), 2)
             ))
           END
           + CASE
             WHEN $8::DOUBLE PRECISION IS NULL OR $9::DOUBLE PRECISION IS NULL THEN 0
             ELSE 6371 * 2 * ASIN(SQRT(
               POWER(SIN(RADIANS(latitude - $8) / 2), 2)
               + COS(RADIANS($8)) * COS(RADIANS(latitude))
               * POWER(SIN(RADIANS(longitude - $9) / 2), 2)
             ))
           END
       END AS "routeDistanceScore"
     FROM public."PLACE"
     -- 변경: 자동 추천도 화면과 같은 기준으로 카페·관광명소·문화시설만 후보로 사용합니다.
     -- 따라서 식당·숙박·편의점·공공기관이 관광 일정에 자동 추가되지 않습니다.
     WHERE place_category IN ('카페', '관광명소', '문화시설')
       AND place_id <> ALL($1::BIGINT[])
       AND (NOT $2::BOOLEAN OR pet_is_allowed = TRUE)
       AND (
         $3::TEXT IS NULL
         OR closed_days IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM unnest(string_to_array(closed_days, ',')) AS closed_day
           WHERE BTRIM(closed_day) = $3
         )
       )
       AND (
         $4::TIME IS NULL
         OR $5::TIME IS NULL
         OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < $5 AND end_time > $4)
       )
     ORDER BY
       "themeMatchScore" DESC,
       "routeDistanceScore" ASC NULLS LAST,
       average_rating DESC NULLS LAST,
       place_id ASC
     LIMIT $11`,
    [
      excludePlaceIds,
      petOnly,
      closedWeekday,
      startTime,
      endTime,
      startLatitude,
      startLongitude,
      endLatitude,
      endLongitude,
      themes,
      limit,
    ],
  )

  return result.rows
}
