import styles from "./DateSelector.module.css"

export default function DateSelector({
    dateValue,
    transportValue,
    onDateChange,
    onTransportChange,
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

            <label className={styles.field}>
                <span>교통 기준</span>
                <select
                    className={styles.transportInput}
                    value={transportValue}
                    onChange={(e) => onTransportChange(e.target.value)}
                >
                    <option value="">선택해 주세요</option>
                    <option value="평일">평일</option>
                    <option value="주말">주말</option>
                </select>
            </label>
        </div>
    )
}
