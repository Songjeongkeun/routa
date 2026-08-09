import { query, withTransaction } from "../../db/database.mjs"

function toTripPlan(row) {
  return {
    tripPlanId: row.tripPlanId,
    tripType: row.withPet ? "PET" : "GENERAL",
    startTime: row.startTime,
    endTime: row.endTime,
    startLocation: row.startLocation,
    startLatitude: row.startLatitude,
    startLongitude: row.startLongitude,
    endLocation: row.endLocation,
    endLatitude: row.endLatitude,
    endLongitude: row.endLongitude,
    mealPreference: row.mealPreference,
    preferredThemes: row.preferredThemes,
  }
}

const PLAN_COLUMNS = `
  plan_id AS "tripPlanId",
  with_pet AS "withPet",
  start_time AS "startTime",
  end_time AS "endTime",
  start_location AS "startLocation",
  start_latitude AS "startLatitude",
  start_longitude AS "startLongitude",
  end_location AS "endLocation",
  end_latitude AS "endLatitude",
  end_longitude AS "endLongitude",
  meal_preference AS "mealPreference",
  preferred_themes AS "preferredThemes"`

async function replaceMandatoryPlaces(execute, planId, selectedPlaces) {
  await execute(`DELETE FROM public."PLAN_MANDATORY_PLACE" WHERE plan_id = $1`, [planId])

  for (const place of selectedPlaces) {
    await execute(
      `INSERT INTO public."PLAN_MANDATORY_PLACE" (plan_id, place_id, fixed_visit_time)
      VALUES ($1, $2, NULL)`,
      [planId, place.placeId],
    )
  }
}

export async function assertPlacesExist(placeIds) {
  const uniquePlaceIds = [...new Set(placeIds)]
  if (uniquePlaceIds.length === 0) return

  const result = await query(
    `SELECT place_id AS "placeId" FROM public."PLACE" WHERE place_id = ANY($1::BIGINT[])`,
    [uniquePlaceIds],
  )
  if (result.rows.length !== uniquePlaceIds.length) {
    const error = new Error("선택한 장소 또는 음식점 정보를 찾을 수 없습니다.")
    error.status = 400
    throw error
  }
}

export function createTripPlan({ userId, plan }) {
  return withTransaction(async (execute) => {
    const result = await execute(
      `INSERT INTO public."TRIP_PLAN" (
        user_id, start_time, end_time, start_location, start_latitude, start_longitude,
        end_location, end_latitude, end_longitude, with_pet, meal_preference, preferred_themes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING ${PLAN_COLUMNS}`,
      [
        userId,
        plan.startTimestamp,
        plan.endTimestamp,
        plan.startLocation,
        plan.startLatitude,
        plan.startLongitude,
        plan.endLocation,
        plan.endLatitude,
        plan.endLongitude,
        plan.tripType === "PET",
        plan.mealPreference,
        plan.preferredThemes,
      ],
    )
    const savedPlan = toTripPlan(result.rows[0])
    await replaceMandatoryPlaces(execute, savedPlan.tripPlanId, plan.selectedPlaces)
    return savedPlan
  })
}

export function updateTripPlan({ userId, tripPlanId, plan }) {
  return withTransaction(async (execute) => {
    const result = await execute(
      `UPDATE public."TRIP_PLAN"
      SET start_time = $3, end_time = $4, start_location = $5, start_latitude = $6,
          start_longitude = $7, end_location = $8, end_latitude = $9, end_longitude = $10,
          with_pet = $11, meal_preference = $12, preferred_themes = $13
      WHERE plan_id = $1 AND user_id = $2
      RETURNING ${PLAN_COLUMNS}`,
      [
        tripPlanId,
        userId,
        plan.startTimestamp,
        plan.endTimestamp,
        plan.startLocation,
        plan.startLatitude,
        plan.startLongitude,
        plan.endLocation,
        plan.endLatitude,
        plan.endLongitude,
        plan.tripType === "PET",
        plan.mealPreference,
        plan.preferredThemes,
      ],
    )
    if (!result.rows[0]) {
      const error = new Error("여행 계획을 찾을 수 없거나 수정 권한이 없습니다.")
      error.status = 404
      throw error
    }
    const savedPlan = toTripPlan(result.rows[0])
    await replaceMandatoryPlaces(execute, savedPlan.tripPlanId, plan.selectedPlaces)
    return savedPlan
  })
}

export async function findTripPlanById({ userId, tripPlanId }) {
  const result = await query(
    `SELECT ${PLAN_COLUMNS}
    FROM public."TRIP_PLAN"
    WHERE plan_id = $1 AND user_id = $2`,
    [tripPlanId, userId],
  )
  return result.rows[0] ? toTripPlan(result.rows[0]) : null
}
