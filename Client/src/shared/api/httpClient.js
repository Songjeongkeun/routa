export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:18765"

/** ROUTA API에 쿠키를 포함해 요청하고 공통 오류 형식으로 변환한다. */
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  })

  const contentType = response.headers.get("content-type") ?? ""
  const data = response.status === 204
    ? null
    : contentType.includes("application/json")
      ? await response.json()
      : await response.text()

  if (!response.ok) {
    const error = new Error(data?.message ?? "요청을 처리하지 못했습니다.")
    // 변경: 일정 재계산의 422 응답에는 장소별 제약 사유가 있으므로 호출 화면까지 함께 전달합니다.
    error.conflicts = Array.isArray(data?.conflicts) ? data.conflicts : []
    throw error
  }

  return data
}
