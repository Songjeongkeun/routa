import { useState } from "react"
import { searchLocation } from "../../place/place.api.js"
import styles from "./TransitionCriterion.module.css"

export default function TransitionCriterion({
    startLocation,
    startAddress,
    endLocation,
    endAddress,
    startTime,
    endTime,
    onChange,
}) {
    const [searchingField, setSearchingField] = useState("")
    const [locationErrors, setLocationErrors] = useState({ start: "", end: "" })

    // 위치를 입력할 때 실행되는 함수
    const handleLocationChange = (prefix, value) => {
        // 백틱 안의 ${}는 문자열에 변수를 넣는 문법
        onChange(`${prefix}Location`, value)
        onChange(`${prefix}Address`, "")
        onChange(`${prefix}Latitude`, null)
        onChange(`${prefix}Longitude`, null)
        setLocationErrors((current) => ({ ...current, [prefix]: "" }))
    }

    // 입력란에서 벗어났을 때 장소 검색
    const handleLocationBlur = async (prefix, value) => {
        const keyword = value.trim()
        if (!keyword) {
            setLocationErrors((current) => ({ ...current, [prefix]: "" }))
            return
        }

        try {
            // 검색 시작
            setSearchingField(prefix)
            const location = await searchLocation(keyword)
            onChange(`${prefix}Location`, location.placeName)
            onChange(`${prefix}Address`, location.address)
            onChange(`${prefix}Latitude`, location.latitude)
            onChange(`${prefix}Longitude`, location.longitude)
            setLocationErrors((current) => ({ ...current, [prefix]: "" }))
        } catch (error) {
            onChange(`${prefix}Address`, "")
            onChange(`${prefix}Latitude`, null)
            onChange(`${prefix}Longitude`, null)
            setLocationErrors((current) => ({
                ...current,
                [prefix]: error.message || "위치를 검색하지 못했습니다.",
            }))
        } finally {
            setSearchingField("")
        }
    }

    // Enter키 처리
    const handleLocationKeyDown = (event) => {
        if (event.key !== "Enter") return
        event.preventDefault()
        event.currentTarget.blur()
    }

    return (
        <div className={styles.fields}>
            {/* 이전 코드는 출발 위치·종료 위치·시간을 한 줄의 3열에 배치해 입력칸이 좁았습니다.
                변경: 위치 두 칸을 한 그룹으로 묶고 여행 시간은 아래의 독립 영역으로 분리합니다. */}
            <div className={styles.locationFields}>
                <label className={styles.field}>
                    <span className={styles.fieldHeader}>
                        <span>출발 위치</span>
                        <small className={styles.optionalBadge}>선택 사항</small>
                    </span>
                    <span className={styles.locationControl}>
                        {/* 이전 placeholder는 "출발지로 돌아오기"였지만 빈 값의 실제 동작과 달라 제거했습니다. */}
                        <input
                            className={`${styles.locationInput} ${locationErrors.start ? styles.invalidInput : ""}`}
                            value={startLocation}
                            onChange={(event) => handleLocationChange("start", event.target.value)}
                            onBlur={(event) => handleLocationBlur("start", event.target.value)}
                            onKeyDown={handleLocationKeyDown}
                            placeholder="예: 서울역, 숙소 이름"
                            aria-describedby="start-location-help"
                            aria-invalid={Boolean(locationErrors.start)}
                        />
                        {searchingField === "start" && <small>검색 중...</small>}
                        {!searchingField && startAddress && !locationErrors.start && (
                            <small className={styles.confirmedAddress}>✓ {startAddress}</small>
                        )}
                        {locationErrors.start && <small className={styles.errorMessage}>{locationErrors.start}</small>}
                    </span>
                    {/* 변경: 빈 입력이 오류가 아니라 어떤 일정 동작을 만드는지 바로 설명합니다. */}
                    <small className={styles.fieldHelp} id="start-location-help">
                        입력하지 않으면 첫 번째 방문 장소에서 일정이 시작됩니다.
                    </small>
                </label>

                <label className={styles.field}>
                    <span className={styles.fieldHeader}>
                        <span>종료 위치</span>
                        <small className={styles.optionalBadge}>선택 사항</small>
                    </span>
                    <span className={styles.locationControl}>
                        <input
                            className={`${styles.locationInput} ${locationErrors.end ? styles.invalidInput : ""}`}
                            value={endLocation}
                            onChange={(event) => handleLocationChange("end", event.target.value)}
                            onBlur={(event) => handleLocationBlur("end", event.target.value)}
                            onKeyDown={handleLocationKeyDown}
                            placeholder="예: 서울역, 강남역"
                            aria-describedby="end-location-help"
                            aria-invalid={Boolean(locationErrors.end)}
                        />
                        {searchingField === "end" && <small>검색 중...</small>}
                        {!searchingField && endAddress && !locationErrors.end && (
                            <small className={styles.confirmedAddress}>✓ {endAddress}</small>
                        )}
                        {locationErrors.end && <small className={styles.errorMessage}>{locationErrors.end}</small>}
                    </span>
                    <small className={styles.fieldHelp} id="end-location-help">
                        입력하지 않으면 마지막 방문 장소에서 일정이 종료됩니다.
                    </small>
                </label>
            </div>

            <div className={styles.timeSection}>
                <div className={styles.timeSectionHeader}>
                    <strong>여행 시간</strong>
                    <small>기본 09:00~21:00</small>
                </div>
                <div className={styles.timeFields}>
                    <label className={styles.timeField}>
                        {/* 이전 코드의 "오전 시간"은 시작 시각을 오전으로 제한했습니다.
                            변경: 역할이 분명한 "여행 시작"으로 표시하고 하루 전체 시간을 허용합니다. */}
                        <span>여행 시작</span>
                        <input
                            className={styles.timeInput}
                            type="time"
                            min="00:00"
                            max="23:59"
                            step={1800}
                            value={startTime}
                            onChange={(e) => onChange("startTime", e.target.value)}
                        />
                    </label>
                    <span className={styles.timeDivider} aria-hidden="true">~</span>
                    <label className={styles.timeField}>
                        {/* 이전 코드의 "오후 시간" 대신 실제 의미인 여행 종료 시각으로 안내합니다. */}
                        <span>여행 종료</span>
                        <input
                            className={styles.timeInput}
                            type="time"
                            min="00:00"
                            max="23:59"
                            step={1800}
                            value={endTime}
                            onChange={(e) => onChange("endTime", e.target.value)}
                        />
                    </label>
                </div>
            </div>
        </div>
    )
}
