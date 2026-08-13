import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import * as placeController from "./place.controller.mjs"

const router = express.Router()

router.get("/location-search", isAuth, placeController.searchLocation)
// 변경: 일반 목록 검색과 분리해, 선택한 장소를 제외한 방문 장소만 점수 기반으로 추천합니다.
router.post("/recommendations", isAuth, placeController.recommendVisitPlaces)
router.get("/", isAuth, placeController.getPlaces)

export default router
