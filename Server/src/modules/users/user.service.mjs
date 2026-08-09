import fs from "fs/promises"
import path from "path"
import * as userRepository from "./user.repository.mjs"

export async function updateProfileImage(userId, imageUrl) {
    const prevImageUrl = await userRepository.findProfileImageUrl(userId)

    if (prevImageUrl) {
        const oldPath = path.resolve("public", prevImageUrl.replace(/^\//, ""))
        await fs.unlink(oldPath).catch(() => {})
    }
    return userRepository.updateProfileImageUrl(userId, imageUrl)
}

export async function updateNickname(userId, nickname) {
    const trimmed = nickname?.trim()
    if (!trimmed) {
        const error = new Error("닉네임을 입력해주세요.")
        error.status = 400
        throw error
    }
    return userRepository.updateNickname(userId, trimmed)
}

export async function updateIntroduction(userId, introduction) {
    const trimmed = introduction?.trim() ?? ""
    if (trimmed.length > 150) {
        const error = new Error("자기소개는 150자 이하로 입력해주세요.")
        error.status = 400
        throw error
    }
    return userRepository.updateIntroduction(userId, trimmed)
}