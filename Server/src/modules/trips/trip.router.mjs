import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import * as tripController from "./trip.controller.mjs"

const router = express.Router()

// 변경: app.mjs가 /trip-plans에 이 router를 연결하므로 여기서는 접두어를 중복하지 않습니다.
// 한 요청으로 조건·장소·식사를 저장해 추천 계산 직전의 DB 상태가 일관되도록 합니다.
router.post("/", isAuth, tripController.createTripPlan)
router.put("/:tripPlanId", isAuth, tripController.updateTripPlan)
router.get("/:tripPlanId", isAuth, tripController.getTripPlanById)

export default router
