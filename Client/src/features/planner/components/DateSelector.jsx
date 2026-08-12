import styles from "./DateSelector.module.css"

export default function DateSelector({
    dateValue,
    transportValue,
    weekday,
    onDateChange,
}) {
    return (
        <div className={styles.fields}>
            <label className={styles.field}>
                <span>여행 날짜</span>
                <span className={styles.dateInputWrapper}>
                    {!dateValue && (
                        <span className={styles.datePlaceholder} aria-hidden="true">
                            여행 날짜를 선택하세요
                        </span>
                    )}
                    <input
                        type="date"
                        className={`${styles.dateInput} ${!dateValue ? styles.emptyDateInput : ""}`}
                        value={dateValue}
                        onChange={(e) => onDateChange(e.target.value)}
                        aria-label="여행 날짜를 선택하세요"
                    />
                </span>
            </label>

            <div className={styles.field}>
                <span>교통 기준</span>
                {/* 이전 코드: 평일·주말을 사용자가 직접 선택하는 select였습니다.
                    <select className={styles.transportInput} value={transportValue} onChange={...}>
                        <option value="">선택해 주세요</option>
                        <option value="평일">평일</option>
                        <option value="주말">주말</option>
                    </select>
                    변경: 날짜에서 자동 계산한 결과를 읽기 전용으로 보여 주어 두 값이 어긋나지 않게 합니다. */}
                <div
                    className={`${styles.transportResult} ${!dateValue ? styles.emptyTransportResult : ""}`}
                    aria-live="polite"
                >
                    {dateValue ? (
                        <>
                            <strong>{transportValue}</strong>
                            <small>{weekday} 기준으로 자동 설정됐어요.</small>
                        </>
                    ) : (
                        <span>날짜를 선택하면 자동으로 설정됩니다.</span>
                    )}
                </div>
            </div>
        </div>
    )
}
