import styles from "./RestaurantCard.module.css"

/**
 * 음식점 한 건의 사진, 설명, 평점, 반려동물 가능 여부와 선택 버튼을 표시합니다.
 * 선택 상태는 부모가 전달하므로 카드 내부 상태와 전체 선택 목록이 어긋나지 않습니다.
 */
export default function RestaurantCard({ restaurant, isSelected, onToggle }) {
  return (
    <article
      className={`${styles.card} ${isSelected ? styles.selected : ""}`}
    >
      <div className={styles.imageWrap}>
        <img
          className={styles.image}
          src={restaurant.imageUrl}
          alt={`${restaurant.name} 대표 메뉴`}
        />
        {isSelected && (
          <span className={styles.check} aria-hidden="true">✓</span>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.heading}>
          <h3>{restaurant.name}</h3>
          <span className={styles.rating} aria-label={`평점 ${restaurant.rating}`}>
            ★ {restaurant.rating}
          </span>
        </div>

        <p className={styles.description}>
          {restaurant.district} · {restaurant.description}
        </p>

        <p
          className={`${styles.petStatus} ${
            restaurant.petAllowed ? styles.petAllowed : styles.petNotAllowed
          }`}
        >
          {/* 반려동물 정보는 요구사항에 따라 가능/불가능 두 상태만 표시합니다. */}
          반려동물 {restaurant.petAllowed ? "가능" : "불가능"}
        </p>

        {/* aria-pressed를 사용해 보조 기술에서도 현재 선택 여부를 확인할 수 있습니다. */}
        <button
          className={`${styles.action} ${isSelected ? styles.actionSelected : ""}`}
          type="button"
          aria-pressed={isSelected}
          onClick={() => onToggle(restaurant)}
        >
          {isSelected ? "선택 완료" : "+ 추가"}
        </button>
      </div>
    </article>
  )
}
