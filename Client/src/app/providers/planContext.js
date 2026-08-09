import { createContext, useContext } from "react"

export const PlanContext = createContext(null)

export function usePlan() {
    const context = useContext(PlanContext)

    if (!context) {
        throw new Error("usePlan은 PlanProvider 안에서 사용해야 합니다.")
    }

    return context
}