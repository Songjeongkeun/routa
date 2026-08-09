import { useState } from "react"
import {useNavigate} from "react-router-dom"
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
    return address || placeName || "입력해 주세요"
}

export default function PlanConditionPage() {
    const [selectOption, setSelectOption] = useState("")
    const [selectDate, setSelectDate] = useState("")
    const [selectTransport, setSelectTransport] = useState("")
    const [isResolvingLocations, setIsResolvingLocations] = useState(false)

    const navigate = useNavigate()

    // 취소 버튼 이동 경로
    const handleCancelClick = () => {
        navigate("/")
    }

    // 이동 조건 값 저장할 배열 생성
    const [transitCondition, setTransitCondition] = useState({
        startLocation: "",
        startAddress: "",
        startLatitude: null,
        startLongitude: null,
        endLocation: "",
        endAddress: "",
        endLatitude: null,
        endLongitude: null,
        startTime: "09:00",
        endTime: "21:00",
    })

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

        try {
            setIsResolvingLocations(true)
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

            /*
                sessionStorage
                    - sessionStorage의 데이터는 페이지 세션이 끝날 때 제거됨
                    - 브라우저가 열러있는 한 새로고침과 페이지 복구를 거쳐도 남아있음
            */
            sessionStorage.setItem(
                "plannerData",
                JSON.stringify(condition)
            )

            navigate("/planner/places")
        } catch (error) {
            window.alert(error.message || "위치를 검색하지 못했습니다.")
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
