import cors from "cors"
import express from "express"
import { config } from "./config.mjs"
import { errorHandler } from "./middleware/errorHandler.mjs"
import { notFound } from "./middleware/notFound.mjs"
import authRouter from "./modules/auth/auth.router.mjs"
import path from "path"
import userRouter from "./modules/users/user.router.mjs"
import adminRouter from "./modules/admin/admin.router.mjs"
import placeRouter from "./modules/places/place.router.mjs"
import tripRouter from "./modules/trips/trip.router.mjs"
import recommendationRouter from "./modules/recommendations/recommendation.router.mjs"
import itineraryRouter from "./modules/itineraries/itinerary.router.mjs"
import inquiryRouter from "./modules/inquiries/inquiry.router.mjs"

const app = express()

app.use(express.static(path.resolve("public")))

app.use(cors({
  origin: config.frontendUrl,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true,
}))
app.use(express.json())

app.get("/", (req, res) => res.json({ message: "ROUTA API가 정상 실행 중입니다." }))
app.use("/auth", authRouter)
app.use("/users", userRouter)
app.use("/admin", adminRouter)
app.use("/places", placeRouter)
// 변경: 계획 저장 → 추천 생성 → 일정 조회가 실제 HTTP 경로로 연결되도록 각 도메인 router를 등록합니다.
app.use("/trip-plans", tripRouter)
app.use("/recommendations", recommendationRouter)
app.use("/itineraries", itineraryRouter)
app.use("/inquiries", inquiryRouter)
app.use(notFound)
app.use(errorHandler)


export default app
