import express from "express"
import { isAuth } from "../../middleware/auth.mjs"
import * as placeController from "./place.controller.mjs"

const router = express.Router()

router.get("/location-search", isAuth, placeController.searchLocation)
router.get("/", isAuth, placeController.getPlaces)

export default router
