import { useState } from "react"
import {useNavigate} from "react-router-dom"
import { usePlan } from "../../app/providers/planContext.js"
import TripTypeSelector from "../../features/planner/components/TripTypeSelector.jsx"
import DateSelector from "../../features/planner/components/DateSelector.jsx"
import TransitCriterion from "../../features/planner/components/TransitCriterion.jsx"
import { searchLocation } from "../../features/place/place.api.js"
import styles from "./PlanConditionPage.module.css"

function formatTimeWithPeriod(time) {
    // "14:05" > [14, 5]
    const [hour, minute] = time.split(":").map(Number)
    // 12시 이전이면 오전, 12시 이후면 오후
    const period = hour < 12 ? "오전" : "오후"
    // 24시간을 12시간제로 변환
    const displayHour = hour % 12 || 12
    // 시와 분 두자리로
    /*
        padString(옵션): 필요한 경우 자리수를 채우기 위해 사용될 문자열
        padStart(2, "0") : 두자리수 & 빈 공간에 0으로 채우기
    */
    return `${period} ${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function formatLocation(address, placeName) {
    if (address && placeName) return `${address} (${placeName})`
    // 변경: 출발·종료 위치는 선택 사항이므로 비어 있을 때 검증 오류처럼 보이지 않게 표시합니다.
    return address || placeName || "선택 안 함"
}

function createTransitCondition(plan) {
    return {
        startLocation: plan.startLocation,
        startAddress: plan.startAddress,
        startLatitude: plan.startLatitude,
        startLongitude: plan.startLongitude,
        endLocation: plan.endLocation,
        endAddress: plan.endAddress,
        endLatitude: plan.endLatitude,
        endLongitude: plan.endLongitude,
        startTime: plan.startTime,
        endTime: plan.endTime,
    }
}

export default function PlanConditionPage() {
    const { plan, updatePlan } = usePlan()
    // 변경: 이전 단계로 돌아왔을 때 입력값을 유지하기 위해 전역 여행 계획값으로 초기화합니다.
    const [selectOption, setSelectOption] = useState(plan.tripType)
    const [selectDate, setSelectDate] = useState(plan.date)
    const [selectTransport, setSelectTransport] = useState(plan.transport)
    const [isResolvingLocations, setIsResolvingLocations] = useState(false)
    // 변경: 브라우저 alert 대신 버튼 가까이에 입력 문제를 표시해 사용자가 바로 고칠 수 있게 합니다.
    const [formError, setFormError] = useState("")

    const navigate = useNavigate()

    // 취소 버튼 이동 경로
    const handleCancelClick = () => {
        navigate("/")
    }

    // 이동 조건 값 저장할 배열 생성
    // 변경: 출발·도착지와 여행 시간도 PlanProvider에서 이어서 관리합니다.
    const [transitCondition, setTransitCondition] = useState(() => createTransitCondition(plan))

    // 다음 버튼 이동 경로 & 입력 받은 값 저장
    const resolveLocation = async (condition, prefix) => {
        const placeName = condition[`${prefix}Location`]?.trim()
        if (!placeName || condition[`${prefix}Latitude`] != null) return condition

        const location = await searchLocation(placeName)
        return {
            ...condition,
            [`${prefix}Location`]: location.placeName,
            [`${prefix}Address`]: location.address,
            [`${prefix}Latitude`]: location.latitude,
            [`${prefix}Longitude`]: location.longitude,
        }
    }

    const handleNextClick = async () => {
        if (isResolvingLocations) return

        // 변경: 서버 요청 전 필수 여행 조건과 시간 순서를 검사해 다음 단계에서 갑작스러운 오류가 나지 않게 합니다.
        if (!selectOption) {
            setFormError("여행 성격을 선택해 주세요.")
            return
        }
        if (!selectDate) {
            setFormError("여행 날짜를 선택해 주세요.")
            return
        }
        if (!selectTransport) {
            setFormError("교통 기준을 선택해 주세요.")
            return
        }
        if (!transitCondition.startTime || !transitCondition.endTime || transitCondition.startTime >= transitCondition.endTime) {
            setFormError("여행 종료 시간은 출발 시간보다 늦어야 합니다.")
            return
        }

        try {
            setIsResolvingLocations(true)
            setFormError("")
            const [startResolved, endResolved] = await Promise.all([
                resolveLocation(transitCondition, "start"),
                resolveLocation(transitCondition, "end"),
            ])
            const resolvedTransitCondition = {
                ...transitCondition,
                startLocation: startResolved.startLocation,
                startAddress: startResolved.startAddress,
                startLatitude: startResolved.startLatitude,
                startLongitude: startResolved.startLongitude,
                endLocation: endResolved.endLocation,
                endAddress: endResolved.endAddress,
                endLatitude: endResolved.endLatitude,
                endLongitude: endResolved.endLongitude,
            }

            setTransitCondition(resolvedTransitCondition)

            const condition = {
                tripType: selectOption,
                date: selectDate,
                transport: selectTransport,
                startLocation: resolvedTransitCondition.startLocation,
                startAddress: resolvedTransitCondition.startAddress,
                startLatitude: resolvedTransitCondition.startLatitude,
                startLongitude: resolvedTransitCondition.startLongitude,
                endLocation: resolvedTransitCondition.endLocation,
                endAddress: resolvedTransitCondition.endAddress,
                endLatitude: resolvedTransitCondition.endLatitude,
                endLongitude: resolvedTransitCondition.endLongitude,
                startTime: resolvedTransitCondition.startTime,
                endTime: resolvedTransitCondition.endTime
            }

            // 변경: 페이지별 sessionStorage 대신 PlanProvider의 단일 여행 계획 상태에 저장합니다.
            updatePlan(condition)

            navigate("/planner/places")
        } catch (error) {
            // 변경: 위치는 선택 사항이지만 입력했다면 찾을 수 있어야 하므로 오류를 화면 안에서 안내합니다.
            setFormError(error.message || "입력한 위치를 찾지 못했습니다. 위치를 고치거나 비워 주세요.")
        } finally {
            setIsResolvingLocations(false)
        }
    }

    return (
        <main className={styles.page}>
            <header className={styles.intro}>
                <h1>어떤 하루를 계획하고 있나요?</h1>
                <p>여행 성격과 이동 조건을 알려 주시면 더 정확한 경로를 만들어요.</p>
            </header>

            <ol className={styles.stepper} aria-label="여행 계획 단계">
                <li className={styles.currentStep}><span>1</span>여행 설정</li>
                <li><span>2</span>장소 · 테마</li>
                <li><span>3</span>취향 · 식사</li>
            </ol>

            <div className={styles.layout}>
                <div className={styles.formColumn}>
                    <section className={styles.card}>
                        <TripTypeSelector
                            value={selectOption}
                            onChange={setSelectOption}
                        />
                    </section>

                    <section className={styles.card}>
                        <h2><span aria-hidden="true">▦</span> 날짜와 교통</h2>
                        <DateSelector
                            dateValue={selectDate}
                            transportValue={selectTransport}
                            onDateChange={setSelectDate}
                            onTransportChange={setSelectTransport}
                        />
                    </section>

                    <section className={styles.card}>
                        <h2><span aria-hidden="true">⌘</span> 이동 조건</h2>
                        <TransitCriterion
                            startLocation={transitCondition.startLocation}
                            startAddress={transitCondition.startAddress}
                            endLocation={transitCondition.endLocation}
                            endAddress={transitCondition.endAddress}
                            startTime={transitCondition.startTime}
                            endTime={transitCondition.endTime}
                            onChange={(field, value) => setTransitCondition((current) => ({
                                ...current,
                                [field]: value,
                            }))}
                        />
                    </section>

                    <div className={styles.actions}>
                        {formError && <p className={styles.formError} role="alert">{formError}</p>}
                        <button className={styles.cancelButton} type="button" onClick={handleCancelClick}>취소</button>
                        <button className={styles.nextButton} type="button" onClick={handleNextClick} disabled={isResolvingLocations}>
                            {isResolvingLocations ? "위치 검색 중..." : "다음"}
                        </button>
                    </div>
                </div>

                <aside className={styles.summary} aria-label="입력한 여행 조건">
                    <h2>입력한 여행 조건</h2>
                    <dl>
                        <div><dt>▥ 여행 성격</dt><dd>{selectOption === "GENERAL" ? "일반 여행" : "반려동물 여행"}</dd></div>
                        <div><dt>▦ 날짜</dt><dd>{selectDate || "날짜를 선택해 주세요"}</dd></div>
                        <div><dt>▣ 교통 기준</dt><dd>{selectTransport || "교통 기준을 선택해주세요"}</dd></div>
                        <div><dt>⌖ 출발 위치</dt><dd>{formatLocation(transitCondition.startAddress, transitCondition.startLocation)}</dd></div>
                        <div><dt>⌖ 종료 위치</dt><dd>{formatLocation(transitCondition.endAddress, transitCondition.endLocation)}</dd></div>
                        <div>
                            <dt>◷ 여행 시간</dt>
                            <dd>
                                {formatTimeWithPeriod(transitCondition.startTime)}
                                {" ~ "}
                                {formatTimeWithPeriod(transitCondition.endTime)}
                            </dd>
                        </div>
                        <div><dt>⌖ 필수 방문 장소</dt><dd>다음 단계에서 선택</dd></div>
                        <div><dt>♜ 식사 선택</dt><dd>다음 단계에서 선택</dd></div>
                    </dl>
                </aside>
            </div>
        </main>
    )
}
