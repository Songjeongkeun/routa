import * as placeService from "./place.service.mjs"

export async function searchLocation(req, res) {
  const location = await placeService.searchLocation(req.query.keyword)
  return res.status(200).json({ location })
}

export async function getPlaces(req, res) {
  const result = await placeService.searchPlaces({
    keyword: req.query.keyword,
    // 변경: 음식점 화면처럼 장소의 대분류를 정확히 제한할 수 있도록 쿼리 값을 서비스에 전달합니다.
    // keyword만 사용하면 장소명·주소·카테고리를 함께 검색하므로 "음식점만"이라는 조건을 보장할 수 없습니다.
    placeCategory: req.query.placeCategory,
    page: req.query.page,
    pageSize: req.query.pageSize,
    tripType: req.query.tripType,
    travelDate: req.query.travelDate,
    startLocation: req.query.startLocation,
    startLatitude: req.query.startLatitude,
    startLongitude: req.query.startLongitude,
    startTime: req.query.startTime,
    endTime: req.query.endTime,
  })

  return res.status(200).json(result)
}
