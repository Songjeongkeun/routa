import { useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import MealSelector from "../../features/planner/components/MealSelector.jsx"
import RestaurantList from "../../features/restaurant/components/RestaurantList.jsx"
import {
  FOOD_CATEGORIES,
  mockRestaurants,
} from "../../features/restaurant/restaurant.mock.js"
import styles from "./PlanMealsPage.module.css"

// API 연동 전 시안과 선택 흐름을 확인하기 위한 초기 Mock 선택값입니다.
// 실제 연동 시에는 PlanProvider의 lunch, dinner 값으로 교체합니다.
const INITIAL_MEALS = {
  lunch: mockRestaurants[0],
  dinner: mockRestaurants[1],
}

// 점심과 저녁의 기본 방문 시간입니다. 식사 체류시간은 경로 요청에서 90분으로 전달합니다.
const INITIAL_TIMES = {
  lunch: "12:00",
  dinner: "19:00",
}

// 객체의 내부 키는 API 요청에 사용하고, 화면에는 한글 라벨을 표시합니다.
const SLOT_META = {
  lunch: { label: "점심" },
  dinner: { label: "저녁" },
}

/**
 * 음식점 검색부터 점심·저녁 매장 선택, 시간 변경, 경로 화면 이동까지 조정하는 페이지입니다.
 * RestaurantCard와 MealSelector는 상태를 직접 소유하지 않고 이 페이지의 상태를 props로 받습니다.
 */
export default function PlanMealsPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // searchInput은 사용자가 입력 중인 값이고, keyword는 검색 버튼을 누른 뒤 적용된 값입니다.
  // 두 값을 분리해 입력할 때마다 결과 목록이 즉시 바뀌지 않도록 합니다.
  const [searchInput, setSearchInput] = useState("")
  const [keyword, setKeyword] = useState("")
  const [category, setCategory] = useState("ALL")

  // 점심과 저녁 슬롯에 선택한 음식점 객체와 방문 시간을 각각 보관합니다.
  const [selectedMeals, setSelectedMeals] = useState(INITIAL_MEALS)
  const [mealTimes, setMealTimes] = useState(INITIAL_TIMES)

  // 추가·삭제·선택 제한 등의 결과를 사용자에게 안내하는 메시지입니다.
  const [message, setMessage] = useState("")

  // 선택된 음식점 목록과 ID 목록은 원본 상태에서 파생하므로 별도 state로 중복 저장하지 않습니다.
  const selectedRestaurants = Object.values(selectedMeals).filter(Boolean)
  const selectedPlaceIds = selectedRestaurants.map((restaurant) => restaurant.placeId)

  // 검색어 또는 카테고리가 바뀔 때만 Mock 목록을 다시 필터링합니다.
  const visibleRestaurants = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()

    return mockRestaurants.filter((restaurant) => {
      const matchesCategory = category === "ALL" || restaurant.category === category
      const matchesKeyword =
        normalizedKeyword.length === 0 ||
        restaurant.name.toLowerCase().includes(normalizedKeyword) ||
        restaurant.district.toLowerCase().includes(normalizedKeyword) ||
        restaurant.description.toLowerCase().includes(normalizedKeyword)

      return matchesCategory && matchesKeyword
    })
  }, [category, keyword])

  function handleSearch(event) {
    event.preventDefault()
    // 입력값을 확정된 검색어로 복사해 필터링을 실행합니다.
    setKeyword(searchInput)
  }

  /**
   * 카드 선택 버튼을 한 번 더 누르면 선택을 해제합니다.
   * 새 매장은 비어 있는 점심 슬롯부터, 그 다음 저녁 슬롯에 들어갑니다.
   */
  function handleToggleRestaurant(restaurant) {
    // 현재 음식점이 이미 점심 또는 저녁으로 선택되어 있는지 확인합니다.
    const selectedSlot = Object.entries(selectedMeals).find(
      ([, selectedRestaurant]) => selectedRestaurant?.placeId === restaurant.placeId,
    )?.[0]

    if (selectedSlot) {
      handleRemove(selectedSlot)
      return
    }

    // 점심과 저녁 중 아직 음식점이 없는 첫 번째 슬롯을 찾습니다.
    const emptySlot = Object.entries(selectedMeals).find(
      ([, selectedRestaurant]) => !selectedRestaurant,
    )?.[0]

    if (!emptySlot) {
      setMessage("점심과 저녁 매장으로 최대 2곳까지 선택할 수 있어요.")
      return
    }

    setSelectedMeals((current) => ({ ...current, [emptySlot]: restaurant }))
    setMessage(`${restaurant.name}을(를) ${SLOT_META[emptySlot].label} 매장으로 추가했어요.`)
  }

  // 선택 해제 시 슬롯 키는 유지하고 음식점 값만 null로 바꿉니다.
  function handleRemove(slot) {
    setSelectedMeals((current) => ({ ...current, [slot]: null }))
    setMessage(`${SLOT_META[slot].label} 매장 선택을 해제했어요.`)
  }

  // 두 슬롯에 음식점이 모두 있을 때 점심과 저녁 음식점만 서로 교환합니다.
  // 방문 시간은 각 식사 슬롯에 속하므로 변경하지 않습니다.
  function handleSwap(firstSlot, secondSlot) {
    if (!selectedMeals[firstSlot] || !selectedMeals[secondSlot]) return

    setSelectedMeals((current) => ({
      ...current,
      [firstSlot]: current[secondSlot],
      [secondSlot]: current[firstSlot],
    }))
    setMessage("점심과 저녁 매장 순서를 변경했어요.")
  }

  // 사용자가 선택 목록의 time input을 수정하면 해당 식사 슬롯의 시간만 갱신합니다.
  function handleTimeChange(slot, value) {
    setMealTimes((current) => ({ ...current, [slot]: value }))
  }

  /**
   * 선택한 음식점을 React Router state에 API 요청과 비슷한 구조로 담아 결과 화면으로 이동합니다.
   * 실제 API 연동 시에는 여기서 식사 조건 저장과 추천 계산 요청을 먼저 호출합니다.
   */
  function handleConfirmRoute() {
    if (selectedRestaurants.length === 0) {
      setMessage("경로에 포함할 매장을 한 곳 이상 선택해 주세요.")
      return
    }

    // 로그인 없이 시연하는 /dev 화면에서는 보호 Route를 거치지 않는 결과 화면으로 연결합니다.
    const resultPath = location.pathname.startsWith("/dev/")
      ? "/dev/course-result"
      : "/course/result"

    navigate(resultPath, {
      state: {
        meals: Object.entries(selectedMeals)
          .filter(([, restaurant]) => restaurant)
          .map(([slot, restaurant]) => ({
            mealSlot: slot.toUpperCase(),
            placeId: restaurant.placeId,
            stayMinutes: 90,
            scheduledTime: mealTimes[slot],
          })),
      },
    })
  }

  return (
    <main className={styles.page}>
      <section className={styles.container}>
        {/* 화면 제목과 여행 계획 진행 단계를 표시합니다. */}
        <header className={styles.intro}>
          <h1>어디서 식사하고 싶나요?</h1>
          <p>원하시는 스타일의 맛집을 선택하시고 예약을 진행해 주세요.</p>
        </header>

        <ol className={styles.stepper} aria-label="여행 계획 진행 단계">
          <li className={styles.complete}>
            <span>✓</span>
            여행 설정
          </li>
          <li className={styles.active} aria-current="step">
            <span>2</span>
            장소 · 테마
          </li>
          <li>
            <span>3</span>
            취향 · 식사
          </li>
        </ol>

        <div className={styles.topGrid}>
          {/* 왼쪽 영역: 검색, 음식 종류 필터, 음식점 카드 목록 */}
          <section className={styles.finder} aria-label="음식점 검색과 결과">
            <form className={styles.searchBar} onSubmit={handleSearch}>
              <label htmlFor="restaurant-keyword">음식점 검색</label>
              <input
                id="restaurant-keyword"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="한식, 일식, 지역명으로 검색해 주세요"
              />
              <button type="submit">검색</button>
            </form>

            <div className={styles.chips} aria-label="음식 종류 필터">
              {FOOD_CATEGORIES.map((item) => (
                <button
                  className={category === item.value ? styles.chipActive : ""}
                  key={item.value}
                  type="button"
                  aria-pressed={category === item.value}
                  onClick={() => setCategory(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <RestaurantList
              restaurants={visibleRestaurants}
              selectedPlaceIds={selectedPlaceIds}
              onToggle={handleToggleRestaurant}
            />
          </section>

          {/* 오른쪽 영역: 현재 점심·저녁으로 선택된 매장을 간단히 요약합니다. */}
          <aside className={styles.selectedSummary}>
            <h2>선택된 매장 ({selectedRestaurants.length}개)</h2>
            {selectedRestaurants.length === 0 ? (
              <p className={styles.summaryEmpty}>선택한 매장이 없습니다.</p>
            ) : (
              <ul>
                {Object.entries(selectedMeals).map(([slot, restaurant]) =>
                  restaurant ? (
                    <li key={slot}>
                      <strong>{restaurant.name}</strong>
                      <span>{mealTimes[slot]} ({SLOT_META[slot].label})</span>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </aside>
        </div>

        {message && <p className={styles.message} role="status">{message}</p>}

        {/* 선택 매장의 순서, 방문 시간, 삭제 기능을 담당하는 하위 컴포넌트입니다. */}
        <MealSelector
          selectedMeals={selectedMeals}
          mealTimes={mealTimes}
          onRemove={handleRemove}
          onSwap={handleSwap}
          onTimeChange={handleTimeChange}
        />

        {/* 취소는 여행 조건 화면으로, 경로 확인은 선택 내용을 가진 결과 화면으로 이동합니다. */}
        <div className={styles.actions}>
          <button
            className={styles.cancel}
            type="button"
            onClick={() => navigate("/planner/condition")}
          >
            취소
          </button>
          <button
            className={styles.confirm}
            type="button"
            onClick={handleConfirmRoute}
          >
            경로 확인
          </button>
        </div>
      </section>
    </main>
  )
}
