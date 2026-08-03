import app from "./app.mjs"
import { config } from "./config.mjs"
import { checkDBConnection } from "./db/database.mjs"
import { logger } from "./utils/logger.mjs"

async function startServer() {
  await checkDBConnection()
  app.listen(config.host.port, () => {
    logger("server", `http://localhost:${config.host.port}에서 실행 중`)
  })
}

startServer().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
