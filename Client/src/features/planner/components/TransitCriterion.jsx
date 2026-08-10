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
            <label className={styles.field}>
                {/* 변경: 출발 위치를 비워도 여행 계획을 계속 진행할 수 있음을 화면에서 명확히 알립니다. */}
                <span>출발 위치 (선택)</span>
                <span className={styles.locationControl}>
                    <input
                        className={`${styles.locationInput} ${locationErrors.start ? styles.invalidInput : ""}`}
                        value={startLocation}
                        onChange={(event) => handleLocationChange("start", event.target.value)}
                        onBlur={(event) => handleLocationBlur("start", event.target.value)}
                        onKeyDown={handleLocationKeyDown}
                        placeholder="출발지 입력 (선택)"
                        aria-invalid={Boolean(locationErrors.start)}
                    />
                    {searchingField === "start" && <small>검색 중...</small>}
                    {!searchingField && startAddress && !locationErrors.start && (
                        <small className={styles.confirmedAddress}>✓ {startAddress}</small>
                    )}
                    {locationErrors.start && <small className={styles.errorMessage}>{locationErrors.start}</small>}
                </span>
            </label>

            <label className={styles.field}>
                {/* 변경: 종료 위치가 없으면 마지막 실제 방문 장소에서 일정이 끝납니다. */}
                <span>종료 위치 (선택)</span>
                <span className={styles.locationControl}>
                    <input
                        className={`${styles.locationInput} ${locationErrors.end ? styles.invalidInput : ""}`}
                        value={endLocation}
                        onChange={(event) => handleLocationChange("end", event.target.value)}
                        onBlur={(event) => handleLocationBlur("end", event.target.value)}
                        onKeyDown={handleLocationKeyDown}
                        placeholder="출발지로 돌아오기 (선택)"
                        aria-invalid={Boolean(locationErrors.end)}
                    />
                    {searchingField === "end" && <small>검색 중...</small>}
                    {!searchingField && endAddress && !locationErrors.end && (
                        <small className={styles.confirmedAddress}>✓ {endAddress}</small>
                    )}
                    {locationErrors.end && <small className={styles.errorMessage}>{locationErrors.end}</small>}
                </span>
            </label>

            <div className={styles.timeFields}>
                <label className={styles.timeField}>
                    <span>오전 시간</span>
                    <input
                        className={styles.timeInput}
                        type="time"
                        min="00:00"
                        max="11:59"
                        step={1800}
                        value={startTime}
                        onChange={(e) => onChange("startTime", e.target.value)}
                    />
                </label>
                <span className={styles.timeDivider} aria-hidden="true">~</span>
                <label className={styles.timeField}>
                    <span>오후 시간</span>
                    <input
                        className={styles.timeInput}
                        type="time"
                        min="12:00"
                        max="23:59"
                        step={1800}
                        value={endTime}
                        onChange={(e) => onChange("endTime", e.target.value)}
                    />
                </label>
            </div>
        </div>
    )
}
