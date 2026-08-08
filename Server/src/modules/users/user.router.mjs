import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import * as userController from "./user.controller.mjs"
import { uploadProfileImage } from "../../middleware/imgUpload.mjs"

const router = express.Router()

router.put("/me/image", isAuth, uploadProfileImage.single("profileImage"), userController.updateProfileImage)
router.put("/me/nickname", isAuth, userController.updateNickname)
router.put("/me/introduction", isAuth, userController.updateIntroduction)


export default router
