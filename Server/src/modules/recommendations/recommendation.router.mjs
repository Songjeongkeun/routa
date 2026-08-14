import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import * as recommendationController from "./recommendation.controller.mjs"

const router = express.Router()

// 저장된 여행 계획을 기준으로 세 가지 추천 코스를 생성합니다.
router.post("/", isAuth, recommendationController.createRecommendation)

export default router
