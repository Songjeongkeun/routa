import { API_URL } from "../../shared/api/httpClient.js"

export async function updateProfileImage(file) {
    const formData = new FormData()
    formData.append("profileImage", file)

    const response = await fetch(`${API_URL}/users/me/image`, {
        method: "PUT",
        credentials: "include",
        body: formData,
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data?.message ?? "업로드에 실패했습니다.")
    return data
}