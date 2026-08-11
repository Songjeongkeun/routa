import styles from "./TripTypeSelector.module.css"
import tripTypeIcon from "../../../shared/assets/icons/Travel_conditions/Row icon 0.png"

// 여행 타입 지정
const TRIP_TYPES = [
    {
        value: "GENERAL",
        title: "일반 여행",
        description: "서울의 다양한 명소를 자유롭게 여행해요.",
        icon: "✦",
    },
    {
        value: "PET",
        title: "반려동물 여행",
        description: "반려동물과 함께 갈 수 있는 장소를 둘러봐요.",
        icon: "🐾",
    },
]


export default function TripTypeSelector({ value, onChange }) {
    return (
        <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>
                <span aria-hidden="true"><img className={styles.summaryIcon} src={tripTypeIcon} alt="" /></span>
                여행 성격
            </legend>

            <div className={styles.options}>
                {TRIP_TYPES.map((tripType) => {
                    const isSelected = value === tripType.value

                    return (
                        <button
                            className={`${styles.option} ${isSelected ? styles.selected : ""}`}
                            type="button"
                            key={tripType.value}
                            aria-pressed={isSelected}
                            onClick={() => onChange(tripType.value)}
                        >
                            <span className={styles.icon} aria-hidden="true">{tripType.icon}</span>
                            <span className={styles.text}>
                                <strong>{tripType.title}</strong>
                                <small>{tripType.description}</small>
                            </span>
                            <span className={styles.check} aria-hidden="true">
                                {isSelected ? "✓" : ""}
                            </span>
                        </button>
                    )
                })}
            </div>
        </fieldset>
    )
}
