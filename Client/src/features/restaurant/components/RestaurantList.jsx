import RestaurantCard from "./RestaurantCard.jsx"
import styles from "./RestaurantList.module.css"

/** 검색·카테고리 필터를 통과한 음식점들을 카드 그리드로 표시합니다. */
export default function RestaurantList({ restaurants, selectedPlaceIds, onToggle }) {
  // 결과가 없더라도 빈 화면 대신 다음 행동을 안내합니다.
  if (restaurants.length === 0) {
    return (
      <section className={styles.empty} aria-live="polite">
        <strong>조건에 맞는 음식점이 없어요.</strong>
        {/* 변경: 실제 DB에는 음식 종류 분류가 없으므로 존재하지 않는 카테고리 선택을 안내하지 않습니다. */}
        <p>검색어를 바꾸어 다시 검색해 주세요.</p>
      </section>
    )
  }

  return (
    <section className={styles.grid} aria-label="음식점 검색 결과">
      {restaurants.map((restaurant) => {
        // ID 목록을 기준으로 각 카드의 선택 상태를 계산합니다.
        const isSelected = selectedPlaceIds.includes(restaurant.placeId)

        return (
          <RestaurantCard
            key={restaurant.placeId}
            restaurant={restaurant}
            isSelected={isSelected}
            onToggle={onToggle}
          />
        )
      })}
    </section>
  )
}
