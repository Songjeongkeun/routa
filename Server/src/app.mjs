import cors from "cors"
import express from "express"
import { config } from "./config.mjs"
import { errorHandler } from "./middleware/errorHandler.mjs"
import { notFound } from "./middleware/notFound.mjs"
import authRouter from "./modules/auth/auth.router.mjs"

const app = express()

app.use(cors({
  origin: config.frontendUrl,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true,
}))
app.use(express.json())

app.get("/", (req, res) => res.json({ message: "ROUTA API가 정상 실행 중입니다." }))
app.use("/auth", authRouter)
app.use(notFound)
app.use(errorHandler)

export default app
