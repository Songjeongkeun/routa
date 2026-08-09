import { query } from "../../db/database.mjs"

export async function findCoordinatesByLocation(location) {
  const result = await query(
    `SELECT latitude, longitude
     FROM public."PLACE"
     WHERE place_name ILIKE $1
        OR address ILIKE $1
        OR address ILIKE '%' || $1 || '%'
     ORDER BY
       CASE
         WHEN place_name ILIKE $1 THEN 0
         WHEN address ILIKE $1 THEN 1
         ELSE 2
       END,
       place_id ASC
     LIMIT 1`,
    [location],
  )

  return result.rows[0] ?? null
}

export async function findPlaces({
  keyword,
  petOnly,
  closedWeekday,
  startTime,
  endTime,
  originLatitude,
  originLongitude,
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
       CASE
         WHEN $6::DOUBLE PRECISION IS NULL OR $7::DOUBLE PRECISION IS NULL THEN NULL
         ELSE ROUND((6371 * 2 * ASIN(SQRT(
           POWER(SIN(RADIANS(latitude - $6) / 2), 2)
           + COS(RADIANS($6)) * COS(RADIANS(latitude))
           * POWER(SIN(RADIANS(longitude - $7) / 2), 2)
         )))::NUMERIC, 2)::DOUBLE PRECISION
       END AS "distanceKm",
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
     AND (
       $6::DOUBLE PRECISION IS NULL
       OR $7::DOUBLE PRECISION IS NULL
       OR 6371 * 2 * ASIN(SQRT(
         POWER(SIN(RADIANS(latitude - $6) / 2), 2)
         + COS(RADIANS($6)) * COS(RADIANS(latitude))
         * POWER(SIN(RADIANS(longitude - $7) / 2), 2)
       )) <= 5
     )
     ORDER BY
       CASE
         WHEN $6::DOUBLE PRECISION IS NULL OR $7::DOUBLE PRECISION IS NULL THEN NULL
         ELSE 6371 * 2 * ASIN(SQRT(
           POWER(SIN(RADIANS(latitude - $6) / 2), 2)
           + COS(RADIANS($6)) * COS(RADIANS(latitude))
           * POWER(SIN(RADIANS(longitude - $7) / 2), 2)
         ))
       END ASC NULLS LAST,
       average_rating DESC NULLS LAST,
       place_name ASC,
       place_id ASC
     LIMIT $8
     OFFSET $9`,
    [
      keyword,
      petOnly,
      closedWeekday,
      startTime,
      endTime,
      originLatitude,
      originLongitude,
      limit,
      offset,
    ],
  )

  const totalItems = result.rows[0]?.totalItems ?? 0
  const places = result.rows.map(({ totalItems: _totalItems, ...place }) => place)

  return { places, totalItems }
}
