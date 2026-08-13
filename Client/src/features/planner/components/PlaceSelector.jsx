import { useEffect, useState } from "react"
import { recommendVisitPlaces, searchPlaces } from "../../place/place.api.js"
import styles from "./PlaceSelector.module.css"

const PLACE_FILTERS = [
    { label: "전체", keyword: "" },
    { label: "문화유적", keyword: "관광명소" },
    { label: "전시 •문화", keyword: "문화시설" },
    // { label: "자연•산책", keyword: "공원 산책" },
    { label: "전망•야경", keyword: "전망대" },
]

const PAGE_SIZE = 6
const PAGE_GROUP_SIZE = 5
// 변경: 관광지(관광명소·문화시설)와 카페를 합친 필수 방문 장소의 최대 개수입니다.
// 음식점은 식사 선택 단계에서 별도로 최대 2개까지 관리하므로 이 제한에 포함하지 않습니다.
const MAX_VISIT_STOPS = 5

// 페이지
function getVisiblePages(currentPage, totalPages) {
    const maxStartPage = Math.max(1, totalPages - PAGE_GROUP_SIZE + 1)
    const startPage = Math.min(Math.max(1, currentPage - 2), maxStartPage)
    const length = Math.min(PAGE_GROUP_SIZE, totalPages)

    return Array.from({ length }, (_, index) => startPage + index)
}

// 변경: API 요청에 사용할 장소 ID를 숫자·중복 없는 형태로 통일합니다.
// sessionStorage에 저장된 이전 계획의 ID 타입이 문자열이어도 추천 제외가 정상 동작합니다.
function collectPlaceIds(...placeIdGroups) {
    return [...new Set(placeIdGroups
        .flat()
        .map(Number)
        .filter((placeId) => Number.isSafeInteger(placeId) && placeId > 0))]
}

export default function PlaceSelector({
    plannerData,
    selectedPlaces,
    recommendedPlaceHistoryIds = [],
    onSelectedPlacesChange,
    onRecommendedPlaceHistoryChange,
}) {
    const [keyword, setKeyword] = useState("")
    const [activeFilter, setActiveFilter] = useState(PLACE_FILTERS[0])
    const [searchResults, setSearchResults] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState("")
    // 변경: 자동 추천 요청 중에는 버튼을 중복 클릭하지 못하도록 별도 로딩 상태를 둡니다.
    const [isRecommending, setIsRecommending] = useState(false)
    // 변경: 추천 결과와 최대 개수 안내를 검색 오류와 구분해서 표시합니다.
    const [recommendationMessage, setRecommendationMessage] = useState("")
    // Pagination : 검색 결과가 많을 때 여러 페이지로 나누어 보여주는 기능
    const [pagination, setPagination] = useState({ page: 1, totalPages: 0, totalItems: 0 })

    // 화면이 처음 열릴 때 전체 장소 목록을 한번 불러오는 코드
    useEffect(() => {
        let ignore = false

        searchPlaces({
            pageSize: PAGE_SIZE,
            tripType: plannerData.tripType,
            travelDate: plannerData.date,
            startLocation: plannerData.startLocation,
            startLatitude: plannerData.startLatitude,
            startLongitude: plannerData.startLongitude,
            startTime: plannerData.startTime,
            endTime: plannerData.endTime,
            // 변경: 이 화면은 관광지·카페 선택 전용이므로 음식점을 조회하지 않습니다.
            visitOnly: true,
        })
            .then((data) => {
                if (!ignore) {
                    setSearchResults(data.places)
                    setPagination(data.pagination)
                }
            })
            .catch(() => {
                if (!ignore) setError("장소 목록을 불러오지 못했습니다.")
            })
            .finally(() => {
                if (!ignore) setIsLoading(false)
            })

        return () => {
            ignore = true
        }
    }, [
        plannerData.date,
        plannerData.endTime,
        plannerData.startLocation,
        plannerData.startLatitude,
        plannerData.startLongitude,
        plannerData.startTime,
        plannerData.tripType,
    ])

    const runSearch = async (searchKeyword, page = 1) => {
        try {
            setIsLoading(true)
            setError("")
            const data = await searchPlaces({
                keyword: searchKeyword,
                page,
                pageSize: PAGE_SIZE,
                tripType: plannerData.tripType,
                travelDate: plannerData.date,
                startLocation: plannerData.startLocation,
                startLatitude: plannerData.startLatitude,
                startLongitude: plannerData.startLongitude,
                startTime: plannerData.startTime,
                endTime: plannerData.endTime,
                // 변경: 검색 결과에서도 음식점을 제외해 식사 선택과 역할을 분리합니다.
                visitOnly: true,
            })
            setSearchResults(data.places)
            setPagination(data.pagination)
        } catch (searchError) {
            setSearchResults([])
            setPagination({ page: 1, totalPages: 0, totalItems: 0 })
            setError(searchError.message || "장소를 검색하지 못했습니다.")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSearch = (event) => {
        event.preventDefault()
        setActiveFilter(PLACE_FILTERS[0])
        runSearch(keyword)
    }

    const handleFilterClick = (filter) => {
        setActiveFilter(filter)
        setKeyword("")

        if (filter.keyword === "공원 산책") {
            runSearch(filter.keyword)
            return
        }

        runSearch(filter.keyword)
    }

    const handleTogglePlace = (place) => {
        const isSelected = selectedPlaces.some((selected) => selected.placeId === place.placeId)

        if (isSelected) {
            onSelectedPlacesChange(selectedPlaces.filter((selected) => selected.placeId !== place.placeId))
            return
        }

        // 변경: 수동 추가도 자동 추천과 동일하게 관광지·카페 최대 5개 제한을 지킵니다.
        if (selectedPlaces.length >= MAX_VISIT_STOPS) {
            setRecommendationMessage("필수 방문 장소는 관광지·카페를 합쳐 최대 5곳까지 선택할 수 있습니다.")
            return
        }

        onSelectedPlacesChange([
            ...selectedPlaces,
            // 변경: 사용자가 직접 고른 장소임을 남겨, 자동 추천 배지와 구분할 수 있게 합니다.
            { ...place, stayMinutes: place.defaultStayMins || 90, selectionSource: "USER" },
        ])
        setRecommendationMessage("")
    }

    const handleRecommendPlaces = async () => {
        // 변경: 새 추천은 직접 선택한 장소만 보존하고 기존 자동 추천 장소는 교체합니다.
        // 따라서 5곳이 이미 채워졌더라도 자동 추천 장소가 있으면 새 추천을 받을 수 있습니다.
        const userSelectedPlaces = selectedPlaces.filter((place) => place.selectionSource !== "RECOMMENDED")
        const currentRecommendedPlaces = selectedPlaces.filter((place) => place.selectionSource === "RECOMMENDED")
        const requestedCount = MAX_VISIT_STOPS - userSelectedPlaces.length

        if (requestedCount <= 0) {
            setRecommendationMessage("직접 선택한 필수 방문 장소가 이미 5곳입니다. 장소를 삭제한 뒤 다시 추천해 주세요.")
            return
        }

        try {
            setIsRecommending(true)
            setRecommendationMessage("")

            // 변경: 직접 선택 장소와 과거 자동 추천 장소를 함께 제외합니다.
            // 현재 자동 추천 장소도 이력에 합쳐, 이전 버전의 저장 데이터에서도 중복을 막습니다.
            const data = await recommendVisitPlaces({
                selectedPlaceIds: userSelectedPlaces.map((place) => place.placeId),
                previouslyRecommendedPlaceIds: collectPlaceIds(
                    recommendedPlaceHistoryIds,
                    currentRecommendedPlaces.map((place) => place.placeId),
                ),
                tripType: plannerData.tripType,
                travelDate: plannerData.date,
                startLatitude: plannerData.startLatitude,
                startLongitude: plannerData.startLongitude,
                endLatitude: plannerData.endLatitude,
                endLongitude: plannerData.endLongitude,
                startTime: plannerData.startTime,
                endTime: plannerData.endTime,
                themes: plannerData.themes,
            })
            const userSelectedPlaceIds = new Set(userSelectedPlaces.map((place) => Number(place.placeId)))
            const recommendedPlaces = (data.places || [])
                .filter((place) => !userSelectedPlaceIds.has(Number(place.placeId)))
                .slice(0, requestedCount)
                .map((place) => ({
                    ...place,
                    // 변경: 추천된 장소도 수동 선택과 동일한 체류시간 형식으로 계획에 저장합니다.
                    stayMinutes: place.defaultStayMins || 90,
                    selectionSource: "RECOMMENDED",
                }))

            // 변경: 조건에 맞는 새 후보가 전혀 없으면 기존 자동 추천 장소를 지킵니다.
            // 추천 새로고침 한 번으로 사용자의 일정이 빈 목록이 되는 상황을 방지합니다.
            if (recommendedPlaces.length === 0 && currentRecommendedPlaces.length > 0) {
                setRecommendationMessage("현재 조건에서 새로운 추천 장소가 없습니다. 기존 추천 장소를 유지합니다.")
                return
            }

            // 변경: 직접 선택 장소는 보존하고 자동 추천 장소만 새 후보로 교체합니다.
            onSelectedPlacesChange([...userSelectedPlaces, ...recommendedPlaces])
            // 변경: 교체 전·후 자동 추천 장소 모두 이력에 남깁니다.
            // 이후 추천 요청에서 삭제했거나 교체한 장소가 다시 나오는 것을 막습니다.
            onRecommendedPlaceHistoryChange(collectPlaceIds(
                recommendedPlaceHistoryIds,
                currentRecommendedPlaces.map((place) => place.placeId),
                recommendedPlaces.map((place) => place.placeId),
            ))
            setRecommendationMessage(
                currentRecommendedPlaces.length > 0
                    ? `${recommendedPlaces.length}곳의 추천 장소로 새로 바꿨습니다. 직접 선택한 장소는 유지됩니다.`
                    : recommendedPlaces.length === requestedCount
                        ? `${recommendedPlaces.length}곳을 추천 장소로 추가했습니다.`
                        : `조건에 맞는 장소 ${recommendedPlaces.length}곳을 추가했습니다. 더 많은 장소는 직접 선택해 주세요.`,
            )
        } catch (recommendationError) {
            setRecommendationMessage(recommendationError.message || "추천 장소를 불러오지 못했습니다.")
        } finally {
            setIsRecommending(false)
        }
    }

    const changeStayMinutes = (placeId, amount) => {
        onSelectedPlacesChange(selectedPlaces.map((place) =>
            place.placeId === placeId
                ? { ...place, stayMinutes: Math.max(30, place.stayMinutes + amount) }
                : place
        ))
    }

    const removePlace = (placeId) => {
        onSelectedPlacesChange(selectedPlaces.filter((place) => place.placeId !== placeId))
    }

    return (
        <div className={styles.selector}>
            <form className={styles.searchBox} role="search" onSubmit={handleSearch}>
                <label htmlFor="place-search">장소 검색</label>
                <input
                    id="place-search"
                    type="search"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="관광지, 동네, 명소를 검색해 주세요"
                />
                <button type="submit" disabled={isLoading}>
                    {isLoading ? "검색 중" : "검색"}
                </button>
            </form>

            <div className={styles.filters} aria-label="장소 카테고리">
                {PLACE_FILTERS.map((filter) => (
                    <button
                        className={activeFilter.label === filter.label ? styles.activeFilter : ""}
                        type="button"
                        key={filter.label}
                        onClick={() => handleFilterClick(filter)}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            <section className={styles.recommendationBar} aria-label="필수 방문 장소 자동 추천">
                <div>
                    <strong>필수 방문 장소 {selectedPlaces.length} / {MAX_VISIT_STOPS}</strong>
                    <span>
                        {selectedPlaces.some((place) => place.selectionSource === "RECOMMENDED")
                            ? "직접 선택은 유지하고 추천 장소만 새 후보로 바꿉니다."
                            : "부족한 수만큼 관광지·카페를 추천합니다."}
                    </span>
                </div>
                <button
                    className={styles.recommendationButton}
                    type="button"
                    // 변경: 자동 추천 장소가 있으면 5곳을 채운 뒤에도 새로고침할 수 있습니다.
                    // 직접 선택 장소만 5곳일 때는 교체할 대상이 없으므로 비활성화합니다.
                    disabled={isRecommending || (selectedPlaces.length >= MAX_VISIT_STOPS
                        && !selectedPlaces.some((place) => place.selectionSource === "RECOMMENDED"))}
                    onClick={handleRecommendPlaces}
                >
                    {isRecommending
                        ? "추천 중..."
                        : selectedPlaces.some((place) => place.selectionSource === "RECOMMENDED")
                            ? "추천 새로고침"
                            : "관광지 추천"}
                </button>
            </section>
            {recommendationMessage && <p className={styles.recommendationMessage} role="status">{recommendationMessage}</p>}

            {isLoading && <p className={styles.statusMessage}>장소를 불러오는 중입니다.</p>}
            {error && <p className={styles.statusMessage} role="alert">{error}</p>}
            {!isLoading && !error && searchResults.length === 0 && (
                <p className={styles.statusMessage}>검색 결과가 없습니다.</p>
            )}

            <div className={styles.placeGrid}>
                {searchResults.map((place, index) => {
                    const selected = selectedPlaces.some(({ placeId }) => placeId === place.placeId)
                    const isSelectionLimitReached = !selected && selectedPlaces.length >= MAX_VISIT_STOPS

                    return (
                        <article className={`${styles.placeCard} ${selected ? styles.selected : ""}`} key={place.placeId}>
                            <div
                                className={`${styles.thumbnail} ${styles[`thumbnail${index + 1}`] || ""}`}
                                style={place.thumbnailUrl ? { backgroundImage: `url(${place.thumbnailUrl})` } : undefined}
                            >
                                {selected && <span className={styles.check} aria-label="선택됨">✓</span>}
                            </div>
                            <div className={styles.placeInfo}>
                                <h3>{place.placeName}</h3>
                                <p>{place.address}</p>
                                <strong>★ {place.averageRating ?? "평점 없음"}</strong>
                            </div>
                            <button
                                className={styles.addButton}
                                type="button"
                                onClick={() => handleTogglePlace(place)}
                                aria-pressed={selected}
                                disabled={isSelectionLimitReached}
                            >
                                <span>{selected ? "−" : "＋"}</span> {selected ? "선택 취소" : "추가"}
                            </button>
                        </article>
                    )
                })}
            </div>

            {pagination.totalPages > 1 && (
                <nav className={styles.pagination} aria-label="장소 목록 페이지">
                    <button
                        type="button"
                        disabled={isLoading || pagination.page === 1}
                        aria-label="첫 페이지"
                        onClick={() => runSearch(activeFilter.keyword || keyword, 1)}
                    >
                        &lt;&lt;
                    </button>
                    <button
                        type="button"
                        disabled={isLoading || pagination.page === 1}
                        aria-label="이전 페이지"
                        onClick={() => runSearch(activeFilter.keyword || keyword, pagination.page - 1)}
                    >
                        &lt;
                    </button>
                    {getVisiblePages(pagination.page, pagination.totalPages).map((page) => (
                        <button
                            className={page === pagination.page ? styles.currentPage : ""}
                            type="button"
                            key={page}
                            disabled={isLoading}
                            aria-current={page === pagination.page ? "page" : undefined}
                            onClick={() => runSearch(activeFilter.keyword || keyword, page)}
                        >
                            {page}
                        </button>
                    ))}
                    <button
                        type="button"
                        disabled={isLoading || pagination.page === pagination.totalPages}
                        aria-label="다음 페이지"
                        onClick={() => runSearch(activeFilter.keyword || keyword, pagination.page + 1)}
                    >
                        &gt;
                    </button>
                    <button
                        type="button"
                        disabled={isLoading || pagination.page === pagination.totalPages}
                        aria-label="5페이지 앞으로"
                        onClick={() => runSearch(
                            activeFilter.keyword || keyword,
                            Math.min(pagination.page + PAGE_GROUP_SIZE, pagination.totalPages),
                        )}
                    >
                        &gt;&gt;
                    </button>
                </nav>
            )}

            <section className={styles.selectedPlaces}>
                <header>
                    <h2>선택한 필수 방문 장소</h2>
                    <span>{selectedPlaces.length} / {MAX_VISIT_STOPS}개</span>
                </header>
                {selectedPlaces.length === 0 ? (
                    <p className={styles.emptySelection}>장소의 추가 버튼을 눌러 필수 방문 장소를 선택해 주세요.</p>
                ) : (
                    <ol>
                        {selectedPlaces.map((place) => (
                            <li key={place.placeId}>
                                <span className={styles.drag} aria-hidden="true">⠿</span>
                                <div className={styles.selectedPlaceName}>
                                    <strong>{place.placeName}</strong>
                                    {/* 변경: 자동 추천으로 추가된 장소만 표시해 사용자의 직접 선택과 구분합니다. */}
                                    {place.selectionSource === "RECOMMENDED" && <span className={styles.recommendedBadge}>추천</span>}
                                </div>
                                <div className={styles.duration}>
                                    <button type="button" onClick={() => changeStayMinutes(place.placeId, -30)} aria-label={`${place.placeName} 체류시간 줄이기`}>−</button>
                                    <span>{place.stayMinutes}분</span>
                                    <button type="button" onClick={() => changeStayMinutes(place.placeId, 30)} aria-label={`${place.placeName} 체류시간 늘리기`}>＋</button>
                                </div>
                                <button className={styles.deleteButton} type="button" onClick={() => removePlace(place.placeId)} aria-label={`${place.placeName} 삭제`}>삭제</button>
                            </li>
                        ))}
                    </ol>
                )}
            </section>
        </div>
    )
}
