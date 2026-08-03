import dotenv from "dotenv"

// ROUTA 루트의 .env 하나를 Client/Server가 공유한다.
dotenv.config({ path: new URL("../../.env", import.meta.url) })

function required(key, defaultValue) {
    const value = process.env[key] || defaultValue
    if (value == null) throw new Error(`환경 변수 ${key}가 설정되지 않았습니다.`)
    return value
}

export const config = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    frontendUrl: required("FRONTEND_URL", "http://localhost:5173"),
    host: {
        port: Number(required("HOST_PORT", "18765")),
    },
    jwt: {
        secretKey: required("JWT_SECRET"),
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
    cookie: {
        secure: process.env.NODE_ENV === "production",
    },
    db: {
        user: required("PG_USER"),
        host: required("PG_HOST"),
        database: required("PG_DATABASE"),
        password: required("PG_PASSWORD"),
        port: Number(required("PG_PORT", "5432")),
    },
}
