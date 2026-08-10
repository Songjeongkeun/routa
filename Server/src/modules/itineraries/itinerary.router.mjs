import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import * as itineraryController from "./itinerary.controller.mjs"

const router = express.Router()

// 변경: 결과 화면은 계획에 속한 코스 목록을 받고, 카드 선택 시 단일 코스 상세를 다시 조회합니다.
router.get("/", isAuth, itineraryController.getItineraries)
// 변경: 저장은 추천 계산과 분리된 사용자 확정 동작이므로, 선택한 itineraryId에 명시적으로 요청합니다.
router.post("/:itineraryId/save", isAuth, itineraryController.saveItinerary)
router.get("/:itineraryId", isAuth, itineraryController.getItineraryById)
// 변경: 편집 결과를 서버가 재계산해 성공한 경우에만 저장합니다.
router.put("/:itineraryId/nodes", isAuth, itineraryController.updateItineraryNodes)
router.patch("/:itineraryId", isAuth, itineraryController.updateSavedItineraryTitle)
router.delete("/:itineraryId", isAuth, itineraryController.deleteSavedItinerary)

export default router
