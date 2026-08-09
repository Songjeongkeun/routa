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

        meals: {
            lunch: null,
            dinner: null,
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

        return {
            ...initialPlan,
            ...parsedPlan,
            themes: Array.isArray(parsedPlan.themes) ? parsedPlan.themes : initialPlan.themes,
            selectedPlaces: Array.isArray(parsedPlan.selectedPlaces)
                ? parsedPlan.selectedPlaces
                : initialPlan.selectedPlaces,
            meals: { ...initialPlan.meals, ...parsedPlan.meals },
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
