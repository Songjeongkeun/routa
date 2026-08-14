import dotenv from "dotenv"

// ROUTA 루트의 .env 하나를 Client/Server가 공유한다.
dotenv.config({ path: new URL("../../.env", import.meta.url) })

function required(key, defaultValue) {
    const value = process.env[key] || defaultValue
    if (value == null) throw new Error(`환경 변수 ${key}가 설정되지 않았습니다.`)
    return value
}

const jwtSecret = required("JWT_SECRET")
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET은 최소 32자 이상의 랜덤 문자열이어야 합니다.")
}

const nodeEnv = process.env.NODE_ENV ?? "development"
const frontendUrl = required("FRONTEND_URL", "http://localhost:5173")

/**
 * CORS 비교는 URL 전체가 아니라 브라우저가 보내는 origin(protocol + host + port) 단위로 해야 합니다.
 * FRONTEND_URL은 OAuth 완료 후 이동 주소로 원본 값을 보존하고, 여기서는 허용 여부 비교용 origin만 만듭니다.
 */
function normalizeHttpOrigin(value, key) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("unsupported protocol")
    return url.origin
  } catch {
    throw new Error(`${key}은(는) http 또는 https URL이어야 합니다.`)
  }
}

const localDevelopmentOrigins = nodeEnv === "development"
  // 변경: ngrok을 OAuth 기본 주소로 쓰는 동안에도 개발 PC의 Vite 프록시를 테스트할 수 있게 합니다.
  // production에는 포함하지 않으며, LAN 주소는 CORS_ALLOWED_ORIGINS에서 명시적으로 추가해야 합니다.
  ? ["http://localhost:5173", "http://127.0.0.1:5173"]
  : []

const corsAllowedOrigins = [...new Set([
  normalizeHttpOrigin(frontendUrl, "FRONTEND_URL"),
  ...localDevelopmentOrigins,
  // 변경: LAN·ngrok을 함께 테스트해야 할 때만 쉼표로 필요한 주소를 추가합니다.
  // '*'는 쿠키 인증과 함께 안전하지 않으므로 지원하지 않습니다.
  ...String(process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => normalizeHttpOrigin(origin, "CORS_ALLOWED_ORIGINS")),
])]

export const config = {
    nodeEnv,
    frontendUrl,
    cors: {
        // 변경: OAuth 리디렉션 대상은 하나로 유지하면서, 개발 시 필요한 origin만 명시적으로 허용합니다.
        allowedOrigins: corsAllowedOrigins,
    },
    host: {
        port: Number(required("HOST_PORT", "18765")),
    },
    jwt: {
        secretKey: jwtSecret,
        expiresInSec: Number(required("JWT_EXPIRES_SEC", "900")),
        refreshExpiresInDays: Number(required("REFRESH_TOKEN_EXPIRES_DAYS", "14")),
    },
    bcrypt: {
        saltRounds: Number(required("BCRYPT_SALT_ROUNDS", "10")),
    },
    oauth: {
        google: {
            clientId: required("GOOGLE_CLIENT_ID"),
            clientSecret: required("GOOGLE_CLIENT_SECRET"),
            callbackUrl: required("GOOGLE_CALLBACK_URL"),
        },
        kakao: {
            restApiKey: required("KAKAO_REST_API_KEY"),
            clientSecret: process.env.KAKAO_CLIENT_SECRET ?? "",
            callbackUrl: required("KAKAO_CALLBACK_URL"),
        },
    },
    odsay: {
        // 변경: ODsay 키는 브라우저가 아닌 Express 서버만 사용합니다.
        // 아직 키를 발급·등록하지 않은 개발 환경도 서버 자체는 실행할 수 있게 두고,
        // 실제 추천 요청 시 provider에서 설정 방법을 안내하는 503 오류를 반환합니다.
        serverApiKey: process.env.ODSAY_SERVER_API_KEY ?? "",
    },
    cookie: {
        // 변경: HTTPS 터널로 LAN OAuth를 시험할 때 NODE_ENV 전체를 production으로 바꾸지 않아도
        // COOKIE_SECURE=true만으로 Secure 쿠키를 사용할 수 있습니다. 미설정 시 기존 동작을 유지합니다.
        secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    },
    database: {
        url: required("DATABASE_URL")
    }
}
