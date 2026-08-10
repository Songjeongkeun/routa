import { query } from "../../db/database.mjs"

export async function findPlaces({
  keyword,
  placeCategory,
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
    ],
  )

  const totalItems = result.rows[0]?.totalItems ?? 0
  const places = result.rows.map(({ totalItems: _totalItems, ...place }) => place)

  return { places, totalItems }
}
