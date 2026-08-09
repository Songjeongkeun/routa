// 미들웨어 연결
import express from "express"
import { fileURLToPath } from "url"
import path from "path"
import { isAuth } from "../../middlewares/auth.mjs"
import * as tripController from "./trip.controller.mjs"

const router = express.Router()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 여행계획 생성
// http://127.0.0.1:18765/api/trips-plans(POST)
router.post("/api/trips-plans", isAuth, tripController.createTripPlan)

// 여행계획 가져오기
// http://127.0.0.1:18765/api/trips-plans/:tripPlanId(GET)
router.get("/api/trips-plans/:tripPlanId", isAuth, tripController.getTripPlanById)

// 여행계획 부분 수정
// http://127.0.0.1:18765/api/trips-plans/:tripPlanId/conditions(PATCH)
router.patch("/api/trips-plans/:tripPlanId/conditions", isAuth, tripController.patchTripPlanConditions)

// 여행 테마 수정
// http://127.0.0.1:18765/api/trips-plans/:tripPlanId/themes(PUT)
router.put("/api/trips-plans/:tripPlanId/themes", isAuth, tripController.putTripPlanThemes)

// 여행 장소 수정
// http://127.0.0.1:18765/api/trips-plans/:tripPlanId/places(PUT)
router.put("/api/trips-plans/:tripPlanId/places", isAuth, tripController.putTripPlanPlaces)

// 여행 식사 수정
// http://127.0.0.1:18765/api/trips-plans/:tripPlanId/meals(PUT)
router.put("/api/trips-plans/:tripPlanId/meals", isAuth, tripController.putTripPlanMeals)

// 여행 일정 삭제
// http://127.0.0.1:18765/api/trips-plans/:tripPlanId(DELETE)
router.delete("/api/trips-plans/:tripPlanId", isAuth, tripController.deleteTripPlan)

export default router