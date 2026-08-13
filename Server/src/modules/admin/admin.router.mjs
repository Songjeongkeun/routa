import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import { requireAdmin } from "../../middleware/requireAdmin.mjs"
import * as adminController from "./admin.controller.mjs"
import * as inquiryController from "../inquiries/inquiry.controller.mjs"

const router = express.Router()

router.get("/users/stats", isAuth, requireAdmin, adminController.getUserStats)
router.get("/users", isAuth, requireAdmin, adminController.getUsers)
router.patch("/users/:userId/status", isAuth, requireAdmin, adminController.updateUserStatus)

router.get("/inquiries", isAuth, requireAdmin, inquiryController.getAllInquiries)
router.get("/inquiries/:inquiryId", isAuth, requireAdmin, inquiryController.getInquiryDetailForAdmin)
router.post("/inquiries/:inquiryId/reply", isAuth, requireAdmin, inquiryController.replyToInquiry)

export default router