import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { usePlan } from "../../app/providers/planContext.js"
import MealSelector from "../../features/planner/components/MealSelector.jsx"
import RestaurantList from "../../features/restaurant/components/RestaurantList.jsx"
import { searchRestaurants } from "../../features/restaurant/restaurant.api.js"
import { saveTripPlan } from "../../features/planner/api/tripPlan.api.js"
import styles from "./PlanMealsPage.module.css"

const RESTAURANT_PAGE_SIZE = 6
const PAGE_GROUP_SIZE = 5

// 객체의 내부 키는 API 요청에 사용하고, 화면에는 한글 라벨을 표시합니다.
const SLOT_META = {
  // 변경: MealSelector와 같은 권장 시간 범위를 사용해 저장 전에도 일관되게 검사합니다.
  lunch: { label: "점심", minTime: "11:00", maxTime: "14:00" },
  dinner: { label: "저녁", minTime: "17:00", maxTime: "20:00" },
}

function isTimeInMealWindow(slot, time) {
  const meta = SLOT_META[slot]
  return Boolean(
    meta
      && typeof time === "string"
      // 변경: sessionStorage의 수동 수정값처럼 HH:mm 형식이 아닌 값도 저장 전에 차단합니다.
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
      && time >= meta.minTime
      && time <= meta.maxTime,
  )
}

// 변경: 장소 선택 화면과 같은 개수의 페이지 번호를 보여 주기 위해 현재 페이지 주변 번호만 계산합니다.
function getVisiblePages(currentPage, totalPages) {
  const maxStartPage = Math.max(1, totalPages - PAGE_GROUP_SIZE + 1)
  const startPage = Math.min(Math.max(1, currentPage - 2), maxStartPage)
  const length = Math.min(PAGE_GROUP_SIZE, totalPages)

  return Array.from({ length }, (_, index) => startPage + index)
}

function formatTimeWithPeriod(time) {
  if (!time) return "시간을 선택해 주세요"

  const [hour, minute] = time.split(":").map(Number)
  const period = hour < 12 ? "오전" : "오후"
  const displayHour = hour % 12 || 12

  return `${period} ${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function formatLocation(address, placeName) {
  if (address && placeName) return `${address} (${placeName})`
  return address || placeName || "입력해 주세요"
}

/**
 * 변경: DB PLACE 행의 camelCase 응답을 기존 RestaurantCard가 사용하는 화면 모델로 변환합니다.
 * DB에는 음식 종류·소개글·구 단위 주소가 없으므로, 대분류·전체 주소·주소 앞부분을 대신 표시합니다.
 */
function toRestaurant(place) {
  const address = place.address || "주소 정보 없음"

  return {
    placeId: place.placeId,
    name: place.placeName,
    categoryLabel: place.placeCategory,
    district: address.split(" ").slice(0, 2).join(" "),
    description: address,
    rating: Number.isFinite(place.averageRating) ? place.averageRating : null,
    // 요구사항대로 true는 가능, false 또는 누락값은 불가능으로만 표시합니다.
    petAllowed: place.petIsAllowed === true,
    imageUrl: place.thumbnailUrl || "",
  }
}

/**
 * 음식점 검색부터 점심·저녁 매장 선택, 시간 변경, 경로 화면 이동까지 조정하는 페이지입니다.
 * RestaurantCard와 MealSelector는 상태를 직접 소유하지 않고 이 페이지의 상태를 props로 받습니다.
 */
export default function PlanMealsPage() {
  const navigate = useNavigate()
  const { plan, updatePlan } = usePlan()

  // searchInput은 사용자가 입력 중인 값이고, keyword는 검색 버튼을 누른 뒤 적용된 값입니다.
  // 두 값을 분리해 입력할 때마다 결과 목록이 즉시 바뀌지 않도록 합니다.
  const [searchInput, setSearchInput] = useState("")
  const [appliedKeyword, setAppliedKeyword] = useState("")
  // 변경: Mock 배열 대신 GET /places?placeCategory=음식점 응답을 보관합니다.
  const [restaurants, setRestaurants] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0, totalItems: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  // 변경: 여행 계획 저장 중에는 중복 클릭으로 같은 추천 요청이 여러 번 생기지 않게 합니다.
  const [isSavingPlan, setIsSavingPlan] = useState(false)

  // 추가·삭제·선택 제한 등의 결과를 사용자에게 안내하는 메시지입니다.
  const [message, setMessage] = useState("")
  // 변경: 점심·저녁 선택과 식사 시간을 전역 여행 계획에 저장해 결과 화면까지 같은 값을 사용합니다.
  const selectedMeals = plan.meals
  // 변경: 각 식사 슬롯의 지정·주변 추천·제외 방식을 전역 계획에 함께 저장합니다.
  const mealModes = plan.mealModes
  const mealTimes = plan.mealTimes

  const updateMeals = (updater) => {
    updatePlan((current) => ({ meals: updater(current.meals) }))
  }

  const updateMealTimes = (updater) => {
    updatePlan((current) => ({ mealTimes: updater(current.mealTimes) }))
  }

  const updateMealModes = (updater) => {
    updatePlan((current) => ({ mealModes: updater(current.mealModes) }))
  }

  /**
   * 변경: API 요청은 음식점 전용 모듈에만 맡기고, 페이지는 로딩·오류·페이지 누적 상태만 관리합니다.
   * 장소 선택 화면과 동일하게 한 번에 한 페이지를 표시하므로, 페이지 번호를 누르면 해당 결과로 교체합니다.
   */
  const loadRestaurants = useCallback(async ({ keyword = "", page = 1 } = {}) => {
    try {
      setIsLoading(true)
      setLoadError("")

      const data = await searchRestaurants({
        keyword,
        page,
        pageSize: RESTAURANT_PAGE_SIZE,
        // 변경: 음식점 목록 단계부터 반려동물·여행 날짜·출발지 기준 후보만 우선 노출합니다.
        tripType: plan.tripType,
        travelDate: plan.date,
        startLocation: plan.startLocation,
        startLatitude: plan.startLatitude,
        startLongitude: plan.startLongitude,
        startTime: plan.startTime,
        endTime: plan.endTime,
      })
      const nextRestaurants = data.places.map(toRestaurant)

      setRestaurants(nextRestaurants)
      setPagination(data.pagination)
    } catch (error) {
      setRestaurants([])
      setLoadError(error.message || "음식점 목록을 불러오지 못했습니다.")
    } finally {
      setIsLoading(false)
    }
  }, [plan.date, plan.endTime, plan.startLatitude, plan.startLocation, plan.startLongitude, plan.startTime, plan.tripType])

  useEffect(() => {
    // 변경: 초기 요청을 다음 이벤트 루프로 예약해 React Effect 안에서 동기 state 갱신이 발생하지 않게 합니다.
    // 화면 진입 시 실제 DB의 첫 번째 음식점 페이지를 자동으로 표시하는 동작은 그대로 유지합니다.
    const initialLoadTimer = window.setTimeout(() => {
      loadRestaurants()
    }, 0)

    return () => window.clearTimeout(initialLoadTimer)
  }, [loadRestaurants])

  // 선택된 음식점 목록과 ID 목록은 원본 상태에서 파생하므로 별도 state로 중복 저장하지 않습니다.
  const selectedRestaurants = Object.values(selectedMeals).filter(Boolean)
  const selectedPlaceIds = selectedRestaurants.map((restaurant) => restaurant.placeId)

  function handleSearch(event) {
    event.preventDefault()
    // 변경: 브라우저에서 Mock 배열을 필터링하지 않고, 입력한 검색어를 실제 DB API로 전송합니다.
    const nextKeyword = searchInput.trim()
    setAppliedKeyword(nextKeyword)
    loadRestaurants({ keyword: nextKeyword })
  }

  function handlePageChange(page) {
    // 변경: '더 보기' 누적 방식 대신 장소 선택 화면과 같은 페이지 번호 방식으로 이동합니다.
    loadRestaurants({
      keyword: appliedKeyword,
      page,
    })
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
      ([slot, selectedRestaurant]) => mealModes[slot] === "DESIGNATED" && !selectedRestaurant,
    )?.[0]

    if (!emptySlot) {
      setMessage("지정 음식점 방식으로 선택된 빈 식사 슬롯이 없습니다. 식사 계획에서 방식을 변경해 주세요.")
      return
    }

    // 변경: 음식점 선택값을 페이지 local state가 아닌 전역 여행 계획에 반영합니다.
    updateMeals((current) => ({ ...current, [emptySlot]: restaurant }))
    setMessage(`${restaurant.name}을(를) ${SLOT_META[emptySlot].label} 매장으로 추가했어요.`)
  }

  // 선택 해제 시 슬롯 키는 유지하고 음식점 값만 null로 바꿉니다.
  function handleRemove(slot) {
    // 변경: 선택 해제도 전역 계획에 저장해 화면 이동 후에도 유지합니다.
    updateMeals((current) => ({ ...current, [slot]: null }))
    setMessage(`${SLOT_META[slot].label} 매장 선택을 해제했어요.`)
  }

  /**
   * 변경: 주변 추천·식사 제외로 전환하면 기존 지정 음식점은 함께 해제합니다.
   * 다시 지정 음식점으로 바꾸면 목록에서 새 매장을 고르게 하므로 모드와 선택값이 충돌하지 않습니다.
   */
  function handleMealModeChange(slot, mode) {
    updateMealModes((current) => ({ ...current, [slot]: mode }))
    if (mode !== "DESIGNATED") updateMeals((current) => ({ ...current, [slot]: null }))
    setMessage("")
  }

  // 두 슬롯에 음식점이 모두 있을 때 점심과 저녁 음식점만 서로 교환합니다.
  // 방문 시간은 각 식사 슬롯에 속하므로 변경하지 않습니다.
  function handleSwap(firstSlot, secondSlot) {
    if (!selectedMeals[firstSlot] || !selectedMeals[secondSlot]) return

    // 변경: 점심·저녁 순서 변경 결과를 전역 계획에 저장합니다.
    updateMeals((current) => ({
      ...current,
      [firstSlot]: current[secondSlot],
      [secondSlot]: current[firstSlot],
    }))
    setMessage("점심과 저녁 매장 순서를 변경했어요.")
  }

  // 사용자가 선택 목록의 time input을 수정하면 해당 식사 슬롯의 시간만 갱신합니다.
  function handleTimeChange(slot, value) {
    // 변경: type="time"의 min/max를 직접 입력 등으로 벗어나는 경우에도 전역 상태에는 잘못된 시간을 넣지 않습니다.
    // 최종적으로는 서버의 normalizeMeals가 동일한 규칙을 다시 확인합니다.
    if (!isTimeInMealWindow(slot, value)) {
      const { label, minTime, maxTime } = SLOT_META[slot]
      setMessage(`${label} 시간은 ${minTime}~${maxTime} 사이로 선택해 주세요.`)
      return
    }

    updateMealTimes((current) => ({ ...current, [slot]: value }))
    setMessage("")
  }

  /**
   * 선택한 음식점은 PlanProvider에 저장되어 있으므로 결과 화면은 동일한 계획 상태를 읽을 수 있습니다.
   * 실제 API 연동 시에는 여기서 식사 조건 저장과 추천 계산 요청을 먼저 호출합니다.
   */
  async function handleConfirmRoute() {
    const missingDesignatedSlot = Object.keys(mealModes).find(
      (slot) => mealModes[slot] === "DESIGNATED" && !selectedMeals[slot],
    )
    if (missingDesignatedSlot) {
      setMessage(`${SLOT_META[missingDesignatedSlot].label} 음식점을 선택하거나 식사 방식을 변경해 주세요.`)
      return
    }

    // 변경: 지정·주변 추천 식사만 시간 창을 검사하고, 식사 제외는 시간 검사 대상에서 뺍니다.
    const invalidMealSlot = Object.keys(selectedMeals).find(
      (slot) => mealModes[slot] !== "SKIP" && !isTimeInMealWindow(slot, mealTimes[slot]),
    )
    if (invalidMealSlot) {
      const { label, minTime, maxTime } = SLOT_META[invalidMealSlot]
      setMessage(`${label} 시간은 ${minTime}~${maxTime} 사이로 선택해 주세요.`)
      return
    }

    try {
      setIsSavingPlan(true)
      setMessage("")
      // 변경: sessionStorage의 임시 선택값을 먼저 TRIP_PLAN에 저장한 뒤, 서버가 반환한 ID로 추천을 요청합니다.
      const { tripPlan } = await saveTripPlan(plan)
      updatePlan({ tripPlanId: tripPlan.tripPlanId })
      navigate(`/course/loading?tripPlanId=${tripPlan.tripPlanId}`)
    } catch (saveError) {
      setMessage(saveError.message || "여행 계획을 저장하지 못했습니다.")
    } finally {
      setIsSavingPlan(false)
    }
  }

  return (
    <main className={styles.page}>
      {/* 변경: 장소 선택 화면과 동일하게 제목·단계 표시를 페이지 최상단에 배치합니다. */}
      <header className={styles.intro}>
        <h1>어디서 식사하고 싶나요?</h1>
        <p>원하시는 음식점을 선택하고 점심·저녁 시간을 정해 주세요.</p>
      </header>

      <ol className={styles.stepper} aria-label="여행 계획 단계">
        <li className={styles.completedStep}><span>✓</span>여행 설정</li>
        <li className={styles.completedStep}><span>✓</span>장소 · 테마</li>
        <li className={styles.currentStep} aria-current="step"><span>3</span>취향 · 식사</li>
      </ol>

      <div className={styles.layout}>
        {/* 변경: 장소 선택 화면의 왼쪽 콘텐츠 영역과 같은 폭·흐름으로 검색, 목록, 선택 목록을 배치합니다. */}
        <section className={styles.content} aria-label="음식점 검색과 선택">
          <form className={styles.searchBox} role="search" onSubmit={handleSearch}>
            <label htmlFor="restaurant-keyword">음식점 검색</label>
            <input
              id="restaurant-keyword"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="음식점명 또는 지역명으로 검색해 주세요"
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? "검색 중" : "검색"}
            </button>
          </form>

          <div className={styles.filters} aria-label="음식점 데이터 필터 상태">
            <span className={styles.activeFilter}>전체 음식점</span>
            {/* 변경: PLACE 테이블에는 한식·일식 등의 음식 종류 컬럼이 없어 실제로 동작하지 않는 필터는 표시하지 않습니다. */}
            <span className={styles.categoryNotice}>음식 종류 정보는 아직 제공되지 않습니다.</span>
          </div>

          {isLoading && <p className={styles.statusMessage}>음식점 목록을 불러오는 중입니다.</p>}
          {loadError && <p className={styles.statusMessage} role="alert">{loadError}</p>}
          {!isLoading && !loadError && (
            <>
              <RestaurantList
                restaurants={restaurants}
                selectedPlaceIds={selectedPlaceIds}
                onToggle={handleToggleRestaurant}
              />

              {/* 변경: 누적형 '더 보기' 대신 장소 선택 화면과 같은 이전·페이지 번호·다음 이동을 제공합니다. */}
              {pagination.totalPages > 1 && (
                <nav className={styles.pagination} aria-label="음식점 목록 페이지">
                  <button
                    type="button"
                    disabled={pagination.page === 1}
                    onClick={() => handlePageChange(pagination.page - 1)}
                  >
                    이전
                  </button>
                  {getVisiblePages(pagination.page, pagination.totalPages).map((page) => (
                    <button
                      className={page === pagination.page ? styles.currentPage : ""}
                      key={page}
                      type="button"
                      aria-current={page === pagination.page ? "page" : undefined}
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => handlePageChange(pagination.page + 1)}
                  >
                    다음
                  </button>
                </nav>
              )}
            </>
          )}

          {/* 변경: 장소 선택 화면의 '선택한 필수 방문 장소' 영역처럼 선택 매장을 목록으로 확인·수정합니다. */}
      <MealSelector
        selectedMeals={selectedMeals}
        mealModes={mealModes}
        mealTimes={mealTimes}
        onRemove={handleRemove}
        onSwap={handleSwap}
        onTimeChange={handleTimeChange}
        onModeChange={handleMealModeChange}
      />

          {message && <p className={styles.message} role="status">{message}</p>}

          <div className={styles.actions}>
            <button
              className={styles.cancelButton}
              type="button"
              onClick={() => navigate("/planner/places")}
            >
              이전
            </button>
            <button className={styles.nextButton} type="button" onClick={handleConfirmRoute} disabled={isSavingPlan}>
              {isSavingPlan ? "계획 저장 중..." : "경로 확인"}
            </button>
          </div>
        </section>

        {/* 변경: 장소 선택 화면과 같은 우측 여행 조건 요약을 제공해 단계 간 화면 밀도를 맞춥니다. */}
        <aside className={styles.summary} aria-label="입력한 여행 조건">
          <h2>입력한 여행 조건</h2>
          <dl>
            <div>
              <dt>▥ 여행 성격</dt>
              <dd>{plan.tripType === "PET" ? "반려동물 여행" : plan.tripType === "GENERAL" ? "일반 여행" : "선택해 주세요"}</dd>
            </div>
            <div><dt>▦ 날짜</dt><dd>{plan.date || "날짜를 선택해 주세요"}</dd></div>
            <div><dt>▣ 교통 기준</dt><dd>{plan.transport || "교통 기준을 선택해주세요"}</dd></div>
            <div><dt>⌖ 출발 위치</dt><dd>{formatLocation(plan.startAddress, plan.startLocation)}</dd></div>
            <div><dt>⌖ 종료 위치</dt><dd>{formatLocation(plan.endAddress, plan.endLocation)}</dd></div>
            <div>
              <dt>◷ 여행 시간</dt>
              <dd>{formatTimeWithPeriod(plan.startTime)} {" ~ "} {formatTimeWithPeriod(plan.endTime)}</dd>
            </div>
          </dl>

          <section className={styles.summarySection} aria-label="선택한 식사 요약">
            <div className={styles.summaryTitle}>
              <span>♜ 선택한 식사</span>
              <strong>{selectedRestaurants.length}개</strong>
            </div>
            {selectedRestaurants.length > 0 ? (
              <ul>
                {Object.entries(selectedMeals).map(([slot, restaurant]) => (
                  restaurant ? (
                    <li key={slot}>
                      <span>{restaurant.name}</span>
                      <time>{mealTimes[slot]} ({SLOT_META[slot].label} {SLOT_META[slot].minTime}~{SLOT_META[slot].maxTime})</time>
                    </li>
                  ) : null
                ))}
              </ul>
            ) : (
              <p className={styles.summaryEmpty}>음식점을 선택해 주세요.</p>
            )}
          </section>

          <div className={styles.summaryRow}><span>⌖ 필수 방문 장소</span><strong>{plan.selectedPlaces.length}개 선택</strong></div>
          <div className={styles.summaryRow}><span>♥ 관심 테마</span><strong>다음 단계에서 선택</strong></div>
        </aside>
      </div>
    </main>
  )
}
