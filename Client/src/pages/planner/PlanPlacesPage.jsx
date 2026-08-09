import { useNavigate } from "react-router-dom"
import { usePlan } from "../../app/providers/planContext.js"
import PlaceSelector from "../../features/planner/components/PlaceSelector.jsx"
import styles from "./PlanPlacesPage.module.css"

function formatTimeWithPeriod(time) {
    if (!time) return "시간을 선택해 주세요"

    const [hour, minute] = time.split(":").map(Number)
    const period = hour < 12 ? "오전" : "오후"
    const displayHour = hour % 12 || 12

    return `${period} ${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function formatLocation(address, placeName) {
    if (address && placeName) return `${address} (${placeName})`
    return address || placeName || "입력해 주세요"
}

export default function PlanPlacesPage() {
    const navigate = useNavigate()
    // 변경: 조건 단계의 값과 선택 장소를 한 상태로 공유하기 위해 PlanProvider를 사용합니다.
    const { plan: plannerData, updatePlan } = usePlan()
    const selectedPlaces = plannerData.selectedPlaces

    const handleSelectedPlacesChange = (places) => {
        // 변경: 선택 장소를 다음 식사·결과 단계에서도 사용할 수 있도록 전역 계획에 반영합니다.
        updatePlan({ selectedPlaces: places })
    }

    const handleCancelClick = () => {
        navigate("/planner/condition")
    }

    return (
        <main className={styles.page}>
            <header className={styles.intro}>
                <h1>어디를 방문하고 싶나요?</h1>
                <p>필수 방문지를 고르거나 추천 장소에서 추가해 주세요.</p>
            </header>

            <ol className={styles.stepper} aria-label="여행 계획 단계">
                <li className={styles.completedStep}><span>✓</span>여행 설정</li>
                <li className={styles.currentStep}><span>2</span>장소 · 테마</li>
                <li><span>3</span>취향 · 식사</li>
            </ol>

            <div className={styles.layout}>
                <section className={styles.content} aria-label="방문 장소 선택">
                    <PlaceSelector
                        plannerData={plannerData}
                        selectedPlaces={selectedPlaces}
                        onSelectedPlacesChange={handleSelectedPlacesChange}
                    />

                    <div className={styles.actions}>
                        <button className={styles.cancelButton} type="button" onClick={handleCancelClick}>취소</button>
                        <button
                            className={styles.nextButton}
                            type="button"
                            // 변경: 장소 선택 다음 단계인 음식점 선택 화면으로 이동하도록 연결합니다.
                            onClick={() => navigate("/planner/meals")}
                        >
                            다음
                        </button>
                    </div>
                </section>

                <aside className={styles.summary} aria-label="입력한 여행 조건">
                    <h2>입력한 여행 조건</h2>
                    <dl>
                        <div>
                            <dt>▥ 여행 성격</dt>
                            <dd>{plannerData.tripType === "PET" ? "반려동물 여행" : plannerData.tripType === "GENERAL" ? "일반 여행" : "선택해 주세요"}</dd>
                        </div>
                        <div><dt>▦ 날짜</dt><dd>{plannerData.date || "날짜를 선택해 주세요"}</dd></div>
                        <div><dt>▣ 교통 기준</dt><dd>{plannerData.transport || "교통 기준을 선택해주세요"}</dd></div>
                        <div><dt>⌖ 출발 위치</dt><dd>{formatLocation(plannerData.startAddress, plannerData.startLocation)}</dd></div>
                        <div><dt>⌖ 종료 위치</dt><dd>{formatLocation(plannerData.endAddress, plannerData.endLocation)}</dd></div>
                        <div>
                            <dt>◷ 여행 시간</dt>
                            <dd>
                                {formatTimeWithPeriod(plannerData.startTime)}
                                {" ~ "}
                                {formatTimeWithPeriod(plannerData.endTime)}
                            </dd>
                        </div>
                    </dl>

                    <section className={styles.summarySection} aria-label="선택한 필수 방문 장소 요약">
                        <div className={styles.summaryTitle}>
                            <span>⌖ 필수 방문 장소</span>
                            <strong>{selectedPlaces.length}개</strong>
                        </div>
                        {selectedPlaces.length > 0 ? (
                            <ul>
                                {selectedPlaces.map((place) => (
                                    <li key={place.placeId}>
                                        <span>{place.placeName}</span>
                                        <time>{place.stayMinutes}분</time>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className={styles.summaryEmpty}>장소를 선택해 주세요.</p>
                        )}
                    </section>

                    <div className={styles.summaryRow}><span>♥ &nbsp;관심 테마</span><strong>다음 단계에서 선택</strong></div>
                    <div className={styles.summaryRow}><span>♜ &nbsp;식사 선택</span><strong>다음 단계에서 선택</strong></div>
                </aside>
            </div>
        </main>
    )
}
