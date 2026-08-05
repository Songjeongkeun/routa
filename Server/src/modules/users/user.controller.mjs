import * as userService from "./user.service.mjs"

export async function updateProfileImage(req, res) {
    try {
        if(!req.file) return res.status(400).json({message:"이미지 파일이 필요합니다."})
        const imageUrl = `/uploads/profiles/${req.file.filename}`
        const user = await userService.updateProfileImage(req.userId, imageUrl)
        return res.status(200).json({ profileImageUrl: user.profile_image_url })
    } catch (error) {
        console.error("프로필 이미지 변경 오류: ", error)
        return res.status(500).json({ message: "프로필 이미지 변경에 실패했습니다."})
    }
}