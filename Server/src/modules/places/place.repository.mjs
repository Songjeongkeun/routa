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
     -- 장소 선택 화면의 전체 조회는 여행 장소 세 분류만 보여줍니다.
     -- 음식점 화면처럼 placeCategory가 명시되면 해당 분류만 조회합니다.
     AND (
       ($6::TEXT IS NULL AND place_category IN ('관광명소', '문화시설', '전망대'))
       OR place_category = $6
     )
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
