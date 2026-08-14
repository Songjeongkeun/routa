import cors from "cors"
import express from "express"
import { config } from "./config.mjs"
import { isDatabaseHealthy } from "./db/database.mjs"
import { errorHandler } from "./middleware/errorHandler.mjs"
import { notFound } from "./middleware/notFound.mjs"
import { requestLogger } from "./middleware/requestLogger.mjs"
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

// 변경: 모든 API 응답에 요청 ID와 처리 시간을 남겨 추천·저장 오류를 로그에서 추적할 수 있게 합니다.
app.use(requestLogger)

app.use(cors({
  // 변경: 쿠키 인증에서는 모든 origin을 허용할 수 없습니다.
  // FRONTEND_URL과 CORS_ALLOWED_ORIGINS에 명시된 localhost·LAN·ngrok 주소만 허용합니다.
  origin(origin, callback) {
    // curl, 서버 간 상태 점검처럼 Origin 헤더가 없는 요청은 CORS 검증 대상이 아니므로 허용합니다.
    if (!origin || config.cors.allowedOrigins.includes(origin)) return callback(null, true)

    const error = new Error("허용되지 않은 프론트엔드 주소입니다.")
    error.status = 403
    return callback(error)
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true,
}))
app.use(express.json())

app.get("/", (req, res) => res.json({ message: "ROUTA API가 정상 실행 중입니다." }))
// 변경: 프론트·배포 환경에서 서버 프로세스와 DB 연결을 함께 확인할 수 있는 가벼운 상태 점검 API입니다.
// 외부 API 키·DB 주소 같은 민감 정보는 응답에 포함하지 않습니다.
app.get("/health", async (req, res) => {
  const databaseHealthy = await isDatabaseHealthy()
  return res.status(databaseHealthy ? 200 : 503).json({
    status: databaseHealthy ? "ok" : "degraded",
    database: databaseHealthy ? "connected" : "unavailable",
    timestamp: new Date().toISOString(),
  })
})
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
