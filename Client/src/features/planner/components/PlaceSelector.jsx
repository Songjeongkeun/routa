import { useEffect, useState } from "react"
import { searchPlaces } from "../../place/place.api.js"
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

// 페이지
function getVisiblePages(currentPage, totalPages) {
    const maxStartPage = Math.max(1, totalPages - PAGE_GROUP_SIZE + 1)
    const startPage = Math.min(Math.max(1, currentPage - 2), maxStartPage)
    const length = Math.min(PAGE_GROUP_SIZE, totalPages)

    return Array.from({ length }, (_, index) => startPage + index)
}

export default function PlaceSelector({ plannerData, selectedPlaces, onSelectedPlacesChange }) {
    const [keyword, setKeyword] = useState("")
    const [activeFilter, setActiveFilter] = useState(PLACE_FILTERS[0])
    const [searchResults, setSearchResults] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState("")
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

    const handleAddPlace = (place) => {
        if (selectedPlaces.some((selected) => selected.placeId === place.placeId)) return

        onSelectedPlacesChange([
            ...selectedPlaces,
            { ...place, stayMinutes: place.defaultStayMins || 90 },
        ])
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

            {isLoading && <p className={styles.statusMessage}>장소를 불러오는 중입니다.</p>}
            {error && <p className={styles.statusMessage} role="alert">{error}</p>}
            {!isLoading && !error && searchResults.length === 0 && (
                <p className={styles.statusMessage}>검색 결과가 없습니다.</p>
            )}

            <div className={styles.placeGrid}>
                {searchResults.map((place, index) => {
                    const selected = selectedPlaces.some(({ placeId }) => placeId === place.placeId)

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
                                onClick={() => handleAddPlace(place)}
                                disabled={selected}
                            >
                                <span>{selected ? "✓" : "＋"}</span> {selected ? "선택됨" : "추가"}
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
                        aria-label="마지막 페이지"
                        onClick={() => runSearch(activeFilter.keyword || keyword, pagination.totalPages)}
                    >
                        &gt;&gt;
                    </button>
                </nav>
            )}

            <section className={styles.selectedPlaces}>
                <header>
                    <h2>선택한 필수 방문 장소</h2>
                    <span>{selectedPlaces.length}개</span>
                </header>
                {selectedPlaces.length === 0 ? (
                    <p className={styles.emptySelection}>장소의 추가 버튼을 눌러 필수 방문 장소를 선택해 주세요.</p>
                ) : (
                    <ol>
                        {selectedPlaces.map((place) => (
                            <li key={place.placeId}>
                                <span className={styles.drag} aria-hidden="true">⠿</span>
                                <strong>{place.placeName}</strong>
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
