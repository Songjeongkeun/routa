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
app.use(notFound)
app.use(errorHandler)


export default app
