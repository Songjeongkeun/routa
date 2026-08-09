import * as placeService from "./place.service.mjs"

export async function searchLocation(req, res) {
  const location = await placeService.searchLocation(req.query.keyword)
  return res.status(200).json({ location })
}

export async function getPlaces(req, res) {
  const result = await placeService.searchPlaces({
    keyword: req.query.keyword,
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
