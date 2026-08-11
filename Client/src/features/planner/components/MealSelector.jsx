import { useState } from "react"
import styles from "./MealSelector.module.css"

const SLOT_META = {
  lunch: { label: "점심", fallbackTime: "12:00", minTime: "11:00", maxTime: "14:00" },
  dinner: { label: "저녁", fallbackTime: "19:00", minTime: "17:00", maxTime: "20:00" },
}

/**
 * 변경: 식사마다 지정 음식점·주변 추천·식사 제외를 고를 수 있게 확장했습니다.
 * 실제 선택·저장 상태는 부모가 소유하고, 이 컴포넌트는 화면 이벤트만 전달합니다.
 */
export default function MealSelector({
  selectedMeals,
  mealModes,
  mealTimes,
  onRemove,
  onSwap,
  onTimeChange,
  onModeChange,
}) {
  const [draggingSlot, setDraggingSlot] = useState(null)

  function handleDrop(targetSlot) {
    if (draggingSlot && draggingSlot !== targetSlot) onSwap(draggingSlot, targetSlot)
    setDraggingSlot(null)
  }

  return (
    <section className={styles.panel} aria-labelledby="selected-meals-title">
      <header className={styles.header}>
        <h2 id="selected-meals-title">식사 계획</h2>
        {/* 변경: 점심·저녁은 시간대가 고정된 슬롯이므로 실제 제공하는 방식·시간 변경만 안내합니다. */}
        <span>방식·시간 변경 가능</span>
      </header>

      <div className={styles.list}>
        {Object.keys(SLOT_META).map((slot) => {
          const restaurant = selectedMeals[slot]
          const mode = mealModes[slot] ?? (restaurant ? "DESIGNATED" : "SKIP")
          const isDesignated = mode === "DESIGNATED"

          return (
            <div className={styles.modeGroup} key={slot}>
              <label className={styles.modeControl}>
                <strong>{SLOT_META[slot].label}</strong>
                <select value={mode} onChange={(event) => onModeChange(slot, event.target.value)}>
                  <option value="DESIGNATED">지정 음식점</option>
                  <option value="NEARBY">주변 음식점 추천</option>
                  <option value="SKIP">식사 제외</option>
                </select>
              </label>

              {mode === "NEARBY" && (
                <div className={styles.empty}>
                  이전·다음 장소 반경 500m(없으면 1km)에서 이용 가능한 음식점을 추천합니다.
                </div>
              )}
              {mode === "SKIP" && <div className={styles.empty}>이 식사는 경로에 포함하지 않습니다.</div>}
              {isDesignated && !restaurant && (
                <div className={styles.empty}>위 음식점 목록에서 {SLOT_META[slot].label} 매장을 선택해 주세요.</div>
              )}
              {isDesignated && restaurant && (
                // 변경: 지정 음식점인 경우에만 기존 드래그 순서·시각 변경 UI를 보여 줍니다.
                <article
                  className={styles.row}
                  draggable
                  onDragStart={() => setDraggingSlot(slot)}
                  onDragEnd={() => setDraggingSlot(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(slot)}
                >
                  <button
                    className={styles.dragHandle}
                    type="button"
                    aria-label={`${restaurant.name}의 점심과 저녁 순서 바꾸기`}
                    onClick={() => onSwap("lunch", "dinner")}
                  >
                    ⋮⋮
                  </button>

                  <strong>{restaurant.name}</strong>
                  <span className={styles.meta}>({restaurant.categoryLabel} · {restaurant.district})</span>

                  <button
                    className={styles.remove}
                    type="button"
                    aria-label={`${restaurant.name} 삭제`}
                    onClick={() => onRemove(slot)}
                  >
                    ♲
                  </button>
                </article>
              )}

              {mode !== "SKIP" && (
                // 변경: 주변 음식점 추천도 점심·저녁 도착 시각을 기준으로 계산하므로,
                // 지정 음식점일 때만 숨기던 시간 입력을 모든 포함 식사에 제공합니다.
                <label className={styles.mealTimeControl}>
                  <span>{SLOT_META[slot].label} 예정 시각</span>
                  <input
                    type="time"
                    value={mealTimes[slot] ?? SLOT_META[slot].fallbackTime}
                    min={SLOT_META[slot].minTime}
                    max={SLOT_META[slot].maxTime}
                    onChange={(event) => onTimeChange(slot, event.target.value)}
                  />
                  <small>{SLOT_META[slot].minTime}~{SLOT_META[slot].maxTime} 사이에 도착하도록 경로를 계산합니다.</small>
                </label>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
