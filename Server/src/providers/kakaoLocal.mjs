import { config } from "../config.mjs"

const KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

// 검색 함수
export async function searchKeyword(keyword) {
  const url = new URL(KAKAO_KEYWORD_SEARCH_URL)
  // url 쿼리스트링
  url.searchParams.set("query", keyword)
  url.searchParams.set("size", "1")

  const response = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${config.oauth.kakao.restApiKey}`,
    },
  })

  if (!response.ok) {
    const isAuthorizationError = response.status === 401 || response.status === 403
    const error = new Error(isAuthorizationError
      ? "카카오 REST API 키와 Local API 권한을 확인해 주세요."
      : "카카오 장소 검색 요청에 실패했습니다.")
    error.status = isAuthorizationError ? 500 : 502
    throw error
  }

  const data = await response.json()
  // 첫번째 장소 선택
  const place = data.documents?.[0]

  if (!place) return null

  return {
    placeId: place.id,
    placeName: place.place_name,
    address: place.road_address_name || place.address_name,
    roadAddress: place.road_address_name || null,
    lotAddress: place.address_name || null,
    latitude: Number(place.y),
    longitude: Number(place.x),
  }
}
