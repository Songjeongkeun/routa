import { useContext } from "react"

// useContext 사용해서 코딩 작성하는 방법

// 사용자 입력값 받아둘 배열 생성
const PlanProvider = [
    {
        tripType: TRIP_TYPES[0].value,
        travelDate: "",
        startLocation : "",
        endLocation: "",
        tripHour: [],
        theme: [],
        places: [],
        meals: []
    }
]