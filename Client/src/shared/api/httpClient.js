// 변경: 기본 개발 환경은 현재 브라우저와 같은 origin의 /api를 사용합니다.
// Vite가 이를 로컬 Express(127.0.0.1:18765)로 프록시하므로 localhost와 LAN IP 접속이 모두 동작합니다.
// 별도 배포 API를 사용하는 환경만 VITE_API_URL에 전체 주소를 지정하면 됩니다.
export const API_URL = String(import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "")

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
    // 변경: 로딩·저장 화면이 422(조건 충돌), 429(쿼터), 502/504(외부 API)를 구분해 안내할 수 있게 합니다.
    error.status = response.status
    error.code = data?.code ?? null
    // 변경: 일정 재계산의 422 응답에는 장소별 제약 사유가 있으므로 호출 화면까지 함께 전달합니다.
    error.conflicts = Array.isArray(data?.conflicts) ? data.conflicts : []
    throw error
  }

  return data
}
