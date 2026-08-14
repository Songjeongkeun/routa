import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import { requireAdmin } from "../../middleware/requireAdmin.mjs"
import * as adminController from "./admin.controller.mjs"
import * as inquiryController from "../inquiries/inquiry.controller.mjs"

const router = express.Router()

router.get("/users/stats", isAuth, requireAdmin, adminController.getUserStats)
router.get("/users", isAuth, requireAdmin, adminController.getUsers)
router.patch("/users/:userId/status", isAuth, requireAdmin, adminController.updateUserStatus)
// 장소 수집은 시간이 오래 걸릴 수 있어 202를 먼저 반환하고 서버에서 비동기로 처리합니다.
router.post("/places/collect", isAuth, requireAdmin, adminController.collectPlaces)

router.get("/inquiries", isAuth, requireAdmin, inquiryController.getAllInquiries)
router.get("/inquiries/:inquiryId", isAuth, requireAdmin, inquiryController.getInquiryDetailForAdmin)
router.post("/inquiries/:inquiryId/reply", isAuth, requireAdmin, inquiryController.replyToInquiry)

export default router
