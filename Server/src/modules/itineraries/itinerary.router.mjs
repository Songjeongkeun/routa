import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import * as itineraryController from "./itinerary.controller.mjs"

const router = express.Router()

// 변경: 결과 화면은 계획에 속한 코스 목록을 받고, 카드 선택 시 단일 코스 상세를 다시 조회합니다.
router.get("/", isAuth, itineraryController.getItineraries)
router.get("/:itineraryId", isAuth, itineraryController.getItineraryById)
// 변경: 편집 결과를 서버가 재계산해 성공한 경우에만 저장합니다.
router.put("/:itineraryId/nodes", isAuth, itineraryController.updateItineraryNodes)

export default router
