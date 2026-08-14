import pg from 'pg';
import { config } from "../config.mjs"
import { logger } from "../utils/logger.mjs"

const { Pool } = pg;
const pool = new Pool({
  connectionString: config.database.url,

  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,

  ssl: {
    rejectUnauthorized: false,
  },
});


export async function checkDBConnection() {
  try {
    const result = await pool.query("SELECT NOW()")
    logger("database", `PostgreSQL 연결 성공: ${result.rows[0].now}`)
  } catch (error) {
    logger("database", error.message)
    throw error
  }
}

/**
 * /health 요청은 시작 로그를 반복 출력하지 않고 DB 연결 가능 여부만 확인합니다.
 * 실제 쿼리를 한 번 수행하므로 프로세스가 살아 있는 것뿐 아니라 Postgres 연결도 함께 점검합니다.
 */
export async function isDatabaseHealthy() {
  try {
    await pool.query("SELECT 1")
    return true
  } catch {
    return false
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

/**
 * 변경: 여행 계획 본문과 필수 방문 장소·식사 설정은 함께 저장돼야 하므로 트랜잭션을 제공합니다.
 * 중간 쿼리 하나라도 실패하면 전체 변경을 되돌려, 반쪽짜리 여행 계획이 DB에 남지 않게 합니다.
 */
export async function withTransaction(work) {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    const result = await work((text, params) => client.query(text, params))
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    logger("database", error.message)
    throw error
  } finally {
    client.release()
  }
}

export async function closeDB() {
  await pool.end()
}
