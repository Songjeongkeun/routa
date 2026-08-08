import { useState } from "react"
import TripTypeSelector from "../../features/planner/components/TripTypeSelector.jsx"
import styles from "./PlanConditionPage.module.css"

export default function PlanConditionPage() {
  const [selectOption, setSelectOption] = useState("GENERAL")

  return (
    <main className={styles.page}>
      <section className={styles.selectionSection}>
        <p className={styles.step}>STEP 1</p>
        <h1>여행 조건을 선택해 주세요</h1>
        <TripTypeSelector
          value={selectOption}
          onChange={setSelectOption}
        />
      </section>

      <aside className={styles.summary} aria-label="선택한 여행 조건">
        <h2>나의 여행 조건</h2>
        <div className={styles.summaryRow}>
          <span>여행 성격</span>
          <strong>{selectOption === "GENERAL" ? "일반 여행" : "반려동물 여행"}</strong>
        </div>
      </aside>
    </main>
  )
}
