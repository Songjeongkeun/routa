import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import * as authController from "./auth.controller.mjs"
import { loginLimiter, signupLimiter } from "../../middleware/rateLimit.mjs"

const router = express.Router()

router.post("/signup", signupLimiter, authController.signup)
router.post("/login", loginLimiter, authController.login)
router.get("/google", authController.startGoogleLogin)
router.get("/google/callback", authController.googleCallback)
router.get("/kakao", authController.startKakaoLogin)
router.get("/kakao/callback", authController.kakaoCallback)
router.get("/me", isAuth, authController.me)
router.post("/refresh", authController.refresh)
router.post("/logout", authController.logout)

export default router
