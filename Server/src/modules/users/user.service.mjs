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