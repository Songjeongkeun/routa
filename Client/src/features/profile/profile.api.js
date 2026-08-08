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

export async function updateNickname(nickname) {
    const response = await fetch(`${API_URL}/users/me/nickname`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.message ?? "닉네임 변경에 실패했습니다.")
    return data
}

export async function updateIntroduction(introduction) {
    const response = await fetch(`${API_URL}/users/me/introduction`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ introduction }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.message ?? "자기소개 변경에 실패했습니다.")
    return data
}