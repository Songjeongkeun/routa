import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import { requireAdmin } from "../../middleware/requireAdmin.mjs"
import * as adminController from "./admin.controller.mjs"

const router = express.Router()

router.get("/users/stats", isAuth, requireAdmin, adminController.getUserStats)
router.get("/users", isAuth, requireAdmin, adminController.getUsers)
router.patch("/users/:userId/status", isAuth, requireAdmin, adminController.updateUserStatus)

// 장소 수집 기능용 라우터
router.post("/collect-places", isAuth, requireAdmin, adminController.collectPlaces)

export default router