import { useAuth } from "../../../app/providers/authContext.js"
import { updateProfileImage } from "../profile.api.js"

export default function ProfileEditForm() {
    const { user, updateUser } = useAuth()

    async function handleImageChage(e) {
    const file = e.target.files[0]
    if (!file) return
    const { profileImageUrl } = await updateProfileImage(file)
    updateUser({ profileImageUrl })
    }

    return (
        <div>
            <img src={user?.profileImageUrl ? `${import.meta.env.VITE_API_URL}${user.profileImageUrl}` : "/default-avartar.png"}
            art="프사" width={120} height={120}/>
            <input type="file" accept="image/*" onChange={handleImageChage}/>
        </div>
    )
}
