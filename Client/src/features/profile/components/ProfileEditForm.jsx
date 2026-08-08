import { useAuth } from "../../../app/providers/authContext.js"
import { updateProfileImage } from "../profile.api.js"

export default function ProfileEditForm() {
    const { user, updateUser } = useAuth()

    async function handleImageChange(e) {
        const file = e.target.files[0]
        if (!file) return

        const previewUrl = URL.createObjectURL(file)
        const prevImageUrl = user?.profileImageUrl
        updateUser({ profileImageUrl: previewUrl })

        try {
            const { profileImageUrl } = await updateProfileImage(file)
            updateUser({ profileImageUrl })
        } catch (error) {
            updateUser({ profileImageUrl: prevImageUrl })
        } finally {
            URL.revokeObjectURL(previewUrl)
        }
    }

    const avatarSrc = user?.profileImageUrl
        ? user.profileImageUrl.startsWith("blob:")
            ? user.profileImageUrl
            : `${import.meta.env.VITE_API_URL}${user.profileImageUrl}`
        : "/default-avartar.png"

    return (
        <div>
            <img src={avatarSrc} alt="프사" width={120} height={120}/>
            <input type="file" accept="image/*" onChange={handleImageChange}/>
        </div>
    )
}