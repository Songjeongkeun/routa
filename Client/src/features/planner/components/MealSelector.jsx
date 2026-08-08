import { useState } from "react"
import styles from "./MealSelector.module.css"

// 식사 슬롯마다 화면에 표시할 라벨과 시간 데이터가 없을 때 사용할 기본값입니다.
const SLOT_META = {
  lunch: { label: "점심", fallbackTime: "12:00" },
  dinner: { label: "저녁", fallbackTime: "19:00" },
}

/**
 * 선택된 점심·저녁 매장을 목록으로 표시하고 순서·시간·삭제 이벤트를 부모에게 전달합니다.
 * 실제 선택 데이터는 PlanMealsPage가 소유하며, 이 컴포넌트는 드래그 중인 슬롯만 관리합니다.
 */
export default function MealSelector({
  selectedMeals,
  mealTimes,
  onRemove,
  onSwap,
  onTimeChange,
}) {
  // HTML Drag & Drop에서 현재 끌고 있는 점심 또는 저녁 슬롯을 기억합니다.
  const [draggingSlot, setDraggingSlot] = useState(null)

  // 값이 null인 빈 슬롯은 화면 목록에서 제외합니다.
  const selectedEntries = Object.entries(selectedMeals).filter(([, restaurant]) => restaurant)

  // 다른 슬롯 위에 놓으면 부모의 교환 함수를 호출하고 드래그 상태를 초기화합니다.
  function handleDrop(targetSlot) {
    if (draggingSlot && draggingSlot !== targetSlot) onSwap(draggingSlot, targetSlot)
    setDraggingSlot(null)
  }

  return (
    <section className={styles.panel} aria-labelledby="selected-meals-title">
      <header className={styles.header}>
        <h2 id="selected-meals-title">매장 목록</h2>
        <span>순서 및 세부 시간 변경 가능 ↕</span>
      </header>

      {selectedEntries.length === 0 ? (
        <div className={styles.empty}>
          선택한 매장이 없습니다. 위 목록에서 최대 2곳을 추가해 주세요.
        </div>
      ) : (
        <div className={styles.list}>
          {selectedEntries.map(([slot, restaurant]) => (
            // 마우스로 두 행을 드래그해도 점심·저녁 순서를 교환할 수 있습니다.
            <article
              className={styles.row}
              key={slot}
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
              <span className={styles.meta}>
                ({restaurant.categoryLabel} · {restaurant.district})
              </span>

              <label className={styles.timeControl}>
                {/* 시각적으로 숨긴 라벨을 제공해 스크린 리더에서도 입력 목적을 알 수 있게 합니다. */}
                <span className="sr-only">{restaurant.name} 방문 시간</span>
                <input
                  type="time"
                  value={mealTimes[slot] ?? SLOT_META[slot].fallbackTime}
                  onChange={(event) => onTimeChange(slot, event.target.value)}
                />
                <span>({SLOT_META[slot].label})</span>
              </label>

              <button
                className={styles.remove}
                type="button"
                aria-label={`${restaurant.name} 삭제`}
                onClick={() => onRemove(slot)}
              >
                ♲
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
