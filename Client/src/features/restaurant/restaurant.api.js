import { searchPlaces } from "../place/place.api.js"

/**
 * 변경: 음식점도 PLACE 테이블의 한 종류이므로 별도 restaurants 테이블을 조회하지 않습니다.
 * 이 함수가 항상 placeCategory="음식점"을 붙여, 음식점 화면에서 카페·관광지 등이 섞이지 않게 합니다.
 */
export function searchRestaurants({
  keyword = "",
  page = 1,
  pageSize = 6,
  tripType = "",
  travelDate = "",
  startLocation = "",
  startLatitude = null,
  startLongitude = null,
  startTime = "",
  endTime = "",
} = {}) {
  return searchPlaces({
    keyword,
    placeCategory: "음식점",
    page,
    pageSize,
    // 변경: 식당 목록에도 반려동물 동반·여행 날짜·출발지 필터를 전달합니다.
    // 최종 추천 때에는 서버가 실제 도착 시각으로 다시 검증합니다.
    tripType,
    travelDate,
    startLocation,
    startLatitude,
    startLongitude,
    startTime,
    endTime,
  })
}
