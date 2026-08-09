import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import * as recommendationController from "./recommendation.controller.mjs"

const router = express.Router()

// 변경: 로딩 화면은 저장이 끝난 tripPlanId만 보내고, 서버는 그 계획의 코스 3개를 생성합니다.
router.post("/", isAuth, recommendationController.createRecommendation)

export default router
