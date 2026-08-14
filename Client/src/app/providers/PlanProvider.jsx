import { useEffect, useMemo, useState } from "react"
import { PlanContext } from "./planContext.js"

// 변경: 여행 계획 상태를 한 곳에서만 저장하기 위한 sessionStorage key입니다.
const PLAN_STORAGE_KEY = "routa:plan"

function createInitialPlan() {
    return {
        tripPlanId: null,

        tripType: "",
        date: "",
        transport: "",

        startLocation: "",
        startAddress: "",
        startLatitude: null,
        startLongitude: null,
        startTime: "09:00",

        endLocation: "",
        endAddress: "",
        endLatitude: null,
        endLongitude: null,
        endTime: "21:00",

        themes: [],
        selectedPlaces: [],
        // 변경: 자동 추천으로 한 번 제시한 장소를 기록합니다.
        // 추천 장소를 삭제하거나 "추천 새로고침"을 눌러도 같은 장소가 다시 제시되지 않게 합니다.
        // 직접 선택한 장소 목록과 분리해야, 추천 이력 때문에 최대 5곳 계산이 잘못되지 않습니다.
        recommendedPlaceHistoryIds: [],

        meals: {
            lunch: null,
            dinner: null,
        },

        // 변경: 각 식사는 지정 음식점(DESIGNATED), 주변 추천(NEARBY), 식사 제외(SKIP) 중 하나를 가집니다.
        // 일반 여행에서는 음식점을 고르지 않아도 장소 중심 일정을 만들 수 있도록 기본값은 식사 제외입니다.
        mealModes: {
            // 변경: 새 일반 여행은 음식점 선택을 강제하지 않도록 점심도 기본적으로 제외합니다.
            // 이전 기본값(DESIGNATED)은 음식점 없이 다음 단계로 간 경우 서버 저장을 막았으므로,
            // 사용자가 식사 제외·주변 추천·지정 음식점 중 자신의 계획에 맞는 방식을 직접 선택하게 합니다.
            lunch: "SKIP",
            // 변경: 저녁도 같은 이유로 기본 제외 상태를 유지합니다.
            // 사용자는 식사 화면에서 주변 추천 또는 지정 음식점으로 언제든 변경할 수 있습니다.
            dinner: "SKIP",
        },

        mealTimes: {
            lunch: "12:00",
            dinner: "19:00",
        },
    }
}

// 변경: 새로고침 후에도 같은 브라우저 탭에서는 입력한 여행 조건을 복원합니다.
function readStoredPlan() {
    const initialPlan = createInitialPlan()

    try {
        const storedPlan = sessionStorage.getItem(PLAN_STORAGE_KEY)
        if (!storedPlan) return initialPlan

        const parsedPlan = JSON.parse(storedPlan)
        // 변경: 저장값이 객체가 아니면 잘못된 이전 데이터로 화면이 깨지지 않도록 초기값을 사용합니다.
        if (!parsedPlan || typeof parsedPlan !== "object") return initialPlan

        const restoredMeals = { ...initialPlan.meals, ...parsedPlan.meals }
        const restoredMealModes = { ...initialPlan.mealModes, ...parsedPlan.mealModes }

        Object.keys(restoredMealModes).forEach((slot) => {
            // 변경: 이전 버전은 점심 기본값이 DESIGNATED여서 음식점을 선택하지 않은 저장값도
            // 경로 확인 시 "음식점을 선택해 주세요"로 막혔습니다. 실제 선택 매장이 없는
            // 과거 기본값만 SKIP으로 보정하고, 매장이 있는 사용자의 지정 선택은 그대로 유지합니다.
            if (restoredMealModes[slot] === "DESIGNATED" && !restoredMeals[slot]) {
                restoredMealModes[slot] = "SKIP"
            }
        })

        return {
            ...initialPlan,
            ...parsedPlan,
            themes: Array.isArray(parsedPlan.themes) ? parsedPlan.themes : initialPlan.themes,
            selectedPlaces: Array.isArray(parsedPlan.selectedPlaces)
                ? parsedPlan.selectedPlaces
                : initialPlan.selectedPlaces,
            // 변경: 이전 버전의 sessionStorage에는 추천 이력이 없을 수 있으므로,
            // 숫자 장소 ID만 복원해 오래되었거나 잘못된 저장값으로 API 요청이 깨지지 않게 합니다.
            recommendedPlaceHistoryIds: Array.isArray(parsedPlan.recommendedPlaceHistoryIds)
                ? [...new Set(parsedPlan.recommendedPlaceHistoryIds.map(Number))]
                    .filter((placeId) => Number.isSafeInteger(placeId) && placeId > 0)
                : initialPlan.recommendedPlaceHistoryIds,
            meals: restoredMeals,
            // 변경: 배포 전 저장된 계획에는 이 키가 없을 수 있어 초기 모드와 병합해 안전하게 복원합니다.
            mealModes: restoredMealModes,
            mealTimes: { ...initialPlan.mealTimes, ...parsedPlan.mealTimes },
        }
    } catch {
        return initialPlan
    }
}

export function PlanProvider({ children }) {
    // 변경: 페이지별 state가 아닌 여행 계획 전체를 Context 상태로 관리합니다.
    const [plan, setPlan] = useState(readStoredPlan)

    // 변경: 객체 또는 함수형 patch 모두 받아 중첩 상태도 안전하게 갱신합니다.
    function updatePlan(patch) {
        setPlan((current) => {
            const nextPatch = typeof patch === "function" ? patch(current) : patch

            return {
                ...current,
                ...nextPatch,
            }
        })
    }

    // 변경: 새 여행을 시작할 때 모든 입력값을 한 번에 초기화합니다.
    function resetPlan() {
        setPlan(createInitialPlan())
    }

    // 변경: 기존 페이지들이 개별적으로 저장하던 값을 Provider에서 일관되게 저장합니다.
    useEffect(() => {
        sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan))
    }, [plan])

    const value = useMemo(
        () => ({
            plan,
            updatePlan,
            resetPlan,
        }),
        [plan],
    )

    return (
        <PlanContext.Provider value={value}>
            {children}
        </PlanContext.Provider>
    )
}
