import fs from "fs/promises"
import path from "path"
import * as userRepository from "./user.repository.mjs"
import bcrypt from "bcrypt"
import { config } from "../../config.mjs"

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

export async function withdraw(userId) {
  return userRepository.withdrawUser(userId)
}

/** 비밀번호 변경 */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const currentHash = await userRepository.findPasswordHash(userId)

  if (!currentHash) {
    const error = new Error("소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.")
    error.status = 400
    throw error
  }

  const matches = await bcrypt.compare(currentPassword ?? "", currentHash)
  if (!matches) {
    const error = new Error("현재 비밀번호가 올바르지 않습니다.")
    error.status = 401
    throw error
  }

  if (!newPassword || newPassword.length < 8 || newPassword.length > 72) {
    const error = new Error("새 비밀번호는 8자 이상 72자 이하로 입력해주세요.")
    error.status = 400
    throw error
  }

  const newHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds)
  await userRepository.updatePassword(userId, newHash)
}