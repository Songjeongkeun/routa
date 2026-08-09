import { searchPlaces } from "../place/place.api.js"

/**
 * 변경: 음식점도 PLACE 테이블의 한 종류이므로 별도 restaurants 테이블을 조회하지 않습니다.
 * 이 함수가 항상 placeCategory="음식점"을 붙여, 음식점 화면에서 카페·관광지 등이 섞이지 않게 합니다.
 */
export function searchRestaurants({ keyword = "", page = 1, pageSize = 6 } = {}) {
  return searchPlaces({
    keyword,
    placeCategory: "음식점",
    page,
    pageSize,
  })
}
