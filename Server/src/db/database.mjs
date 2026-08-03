import pg from "pg"
import { config } from "../config.mjs"
import { logger } from "../utils/logger.mjs"

const { Pool } = pg
const pool = new Pool(config.db)

export async function checkDBConnection() {
  try {
    const result = await pool.query("SELECT NOW()")
    logger("database", `PostgreSQL 연결 성공: ${result.rows[0].now}`)
  } catch (error) {
    logger("database", error.message)
    throw error
  }
}

export async function query(text, params) {
  try {
    return await pool.query(text, params)
  } catch (error) {
    logger("database", error.message)
    throw error
  }
}

export async function closeDB() {
  await pool.end()
}
