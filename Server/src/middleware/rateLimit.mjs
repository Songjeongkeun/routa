// 로그인, 회원가입 횟수 제한을 위한 미들웨어

import rateLimit from "express-rate-limit"

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."},
})

export const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "회원가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."}
})