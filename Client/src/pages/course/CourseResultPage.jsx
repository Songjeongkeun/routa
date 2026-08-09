import { useRef, useState } from "react";
import {
  mockCourses,
  mockPlaceCandidates,
} from "../../features/course/course.mock";
import { usePlan } from "../../app/providers/planContext.js";
import KakaoCourseMap from "../../features/course/KakaoCourseMap";
import "./CourseResultPage.css";

// 시안에서 한눈에 장소 성격을 구분할 수 있도록, 외부 아이콘 라이브러리 없이 이모지를 사용합니다.
const COURSE_EMOJI = {
  SHORTEST_WALK: "🚶",
  FASTEST_TRANSIT: "🕒",
  BALANCED: "🌿",
};

const PLACE_EMOJI = {
  서울역: "🚆",
  경복궁: "🏛️",
  "북촌 한옥마을": "🏘️",
  북촌담: "🍽️",
  "성수 카페거리": "☕",
  한강공원: "🌳",
};

const getPlaceEmoji = (item) =>
  PLACE_EMOJI[item.placeName] || (item.kind === "MEAL" ? "🍽️" : "📍");

/**
 * 추천 결과·일정 편집의 상위 페이지입니다.
 *
 * 현재는 Mock 데이터로 화면과 상호작용을 먼저 검증합니다. 실제 연동 시에는
 * 이 페이지가 API 모듈(course.api.js)을 호출하고, 하위 컴포넌트는 props와
 * 이벤트만 처리하도록 유지합니다.
 */
export default function CourseResultPage() {
  const { plan } = usePlan();
  // courses는 코스 카드 세 개와 각 코스의 상세 일정 전체를 보관합니다.
  const [courses, setCourses] = useState(mockCourses);

  // 코스 카드, 지도, 타임라인, 통계가 함께 참조하는 현재 선택 코스 ID입니다.
  const [selectedCourseId, setSelectedCourseId] = useState(
    mockCourses[2].itineraryId,
  );

  // 한 번에 하나의 이동 상세만 펼치도록 itemId를 저장합니다.
  const [expandedItemId, setExpandedItemId] = useState(null);

  // 삭제 대상이 존재할 때만 삭제 확인 모달을 표시합니다.
  const [deleteTarget, setDeleteTarget] = useState(null);

  // 장소 추가 Drawer와 일정 저장 완료 모달의 열림 상태입니다.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  // Mock 재계산 중임을 보여주는 로딩 오버레이 상태입니다.
  const [isRecalculating, setIsRecalculating] = useState(false);

  // HTML Drag & Drop에서 현재 끌고 있는 일정 항목을 기억합니다.
  const [draggingItemId, setDraggingItemId] = useState(null);

  // 장소 추가 시 브라우저 렌더링과 무관하게 고유한 임시 itemId를 만들기 위한 값입니다.
  const localItemSequenceRef = useRef(1);

  // 선택된 itineraryId에 해당하는 코스 상세 데이터입니다.
  const activeCourse = courses.find(
    (course) => course.itineraryId === selectedCourseId,
  );
  // 변경: 추천 API가 연결되기 전에도 직전 단계에서 입력한 여행 날짜·시간·장소 수를 결과 화면에 표시합니다.
  const travelDate = plan.date || activeCourse.travelDate;
  const startTime = plan.startTime || activeCourse.startTime;
  const endTime = plan.endTime || activeCourse.endTime;
  const selectedPlaceCount = plan.selectedPlaces.length;

  /**
   * 선택된 코스만 안전하게 갱신하는 공통 함수입니다.
   * 실제 API 연동 전에는 서버 대신 이 함수가 로컬 화면 상태를 갱신합니다.
   */
  const updateActiveCourse = (updater) => {
    setCourses((previousCourses) =>
      previousCourses.map((course) =>
        course.itineraryId === selectedCourseId
          ? updater(course)
          : course,
      ),
    );
  };

  /**
   * 현재는 0.7초짜리 가짜 로딩을 보여줍니다.
   * 실제 연동 시에는 수정 API 성공 후 POST /recalculate를 호출하고,
   * 최신 itinerary 또는 runId를 받아 화면을 갱신하는 흐름으로 바꿉니다.
   */
  const runMockRecalculate = () => {
    setIsRecalculating(true);

    setTimeout(() => {
      setIsRecalculating(false);
    }, 700);
  };

  /**
   * 체류시간은 요구사항에 따라 30분 단위로만 조절합니다.
   * START, END 항목은 버튼을 렌더링하지 않으므로 이 함수가 호출되지 않습니다.
   */
  const changeStayMinutes = (itemId, difference) => {
    updateActiveCourse((course) => ({
      ...course,
      items: course.items.map((item) => {
        if (item.itemId !== itemId) return item;

        return {
          ...item,
          stayMinutes: Math.max(30, item.stayMinutes + difference),
        };
      }),
    }));

    runMockRecalculate();
  };

  /**
   * 모달에서 삭제를 확정했을 때만 항목을 제거합니다.
   * 실제 연동 시에는 DELETE 요청 성공 이후 재계산을 시작해야 합니다.
   */
  const confirmDelete = () => {
    if (!deleteTarget) return;

    updateActiveCourse((course) => ({
      ...course,
      items: course.items.filter(
        (item) => item.itemId !== deleteTarget.itemId,
      ),
    }));

    setDeleteTarget(null);
    runMockRecalculate();
  };

  /**
   * Drawer에서 고른 장소를 END 바로 앞에 임시로 추가합니다.
   * 실제 API에서는 사용자가 선택한 afterItemId를 함께 전송해야 하며,
   * 서버의 재계산 결과를 기준으로 도착시간을 다시 받아야 합니다.
   */
  const addPlace = (place) => {
    const endIndex = activeCourse.items.findIndex(
      (item) => item.kind === "END",
    );

    const newItem = {
      itemId: `local-${localItemSequenceRef.current}`,
      kind: place.kind,
      placeName: place.name,
      arrivalTime: "16:30",
      stayMinutes: place.defaultStayMinutes,
      mealSlot: place.kind === "MEAL" ? "DINNER" : null,
      // 장소 후보의 좌표를 그대로 넘겨, 추가 직후 지도에도 마커를 표시합니다.
      latitude: place.latitude,
      longitude: place.longitude,
    };

    localItemSequenceRef.current += 1;

    updateActiveCourse((course) => ({
      ...course,
      items: [
        ...course.items.slice(0, endIndex),
        newItem,
        ...course.items.slice(endIndex),
      ],
    }));

    setIsDrawerOpen(false);
    runMockRecalculate();
  };

  /**
   * 드래그한 관광지 또는 음식점을 대상 항목의 위치로 이동합니다.
   * 출발지와 종료지는 일정의 경계이므로 이동할 수 없게 막습니다.
   */
  const moveItem = (targetItemId) => {
    if (!draggingItemId || draggingItemId === targetItemId) return;

    updateActiveCourse((course) => {
      const sourceIndex = course.items.findIndex(
        (item) => item.itemId === draggingItemId,
      );
      const targetIndex = course.items.findIndex(
        (item) => item.itemId === targetItemId,
      );

      const sourceItem = course.items[sourceIndex];
      const targetItem = course.items[targetIndex];

      if (
        !sourceItem ||
        !targetItem ||
        sourceItem.kind === "START" ||
        sourceItem.kind === "END" ||
        targetItem.kind === "START" ||
        targetItem.kind === "END"
      ) {
        return course;
      }

      const nextItems = [...course.items];
      nextItems.splice(sourceIndex, 1);

      const newTargetIndex =
        sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;

      nextItems.splice(newTargetIndex, 0, sourceItem);

      return {
        ...course,
        items: nextItems,
      };
    });

    setDraggingItemId(null);
    runMockRecalculate();
  };

  return (
    <main className="course-result-page">
      <section className="course-content">
        <div className="course-title-row">
          <div>
            <p className="breadcrumb">🧭 여행 조건 입력 › 추천 경로</p>
            <h1>서울에서 보내는 하루, 이렇게 이동해 보세요</h1>
            <p className="course-subtitle">
              {travelDate} · {startTime}–
              {endTime} · 필수 장소 {selectedPlaceCount}곳
            </p>
          </div>

          <div className="course-title-actions">
            <button className="button button--secondary">조건 수정</button>
            <button
              className="button button--primary"
              onClick={() => setIsSaveModalOpen(true)}
            >
              일정 저장
            </button>
          </div>
        </div>

        <section className="course-options">
          {/* 코스 카드 선택 시 같은 course 데이터로 아래 모든 영역이 갱신됩니다. */}
          {courses.map((course) => (
            <button
              key={course.itineraryId}
              className={`course-option ${
                selectedCourseId === course.itineraryId
                  ? "course-option--selected"
                  : ""
              }`}
              onClick={() => {
                setSelectedCourseId(course.itineraryId);
                setExpandedItemId(null);
              }}
            >
              <span className="course-option__icon" aria-hidden="true">
                {COURSE_EMOJI[course.courseKind]}
              </span>
              <span className="course-option__content">
                <span className="course-option__title">{course.title}</span>
                <span className="course-option__description">
                  {course.description}
                </span>
              </span>
              <span className="course-option__right" aria-hidden="true">
                {selectedCourseId === course.itineraryId && (
                  <span className="course-option__selected-label">✓</span>
                )}
                <span className="course-option__arrow">›</span>
              </span>
            </button>
          ))}
        </section>

        <section className="course-main-grid">
          {/* 일정 항목의 위도·경도를 기준으로 Kakao Maps 지도·마커·경로선을 표시합니다. */}
          <KakaoCourseMap items={activeCourse.items} />

          <section className="timeline-panel">
            <div className="timeline-panel__header">
              <div>
                <p className="timeline-panel__eyebrow">
                  {activeCourse.title}
                </p>
              </div>
            </div>

            <div className="timeline-list">
              {activeCourse.items.map((item, index) => {
                // 현재 장소로 들어오는 이동 구간을 찾아 이동 상세에 전달합니다.
                const inboundLeg =
                  index === 0
                    ? null
                    : activeCourse.legs.find(
                        (leg) => leg.toItemId === item.itemId,
                      );

                return (
                  <TimelineItem
                    key={item.itemId}
                    item={item}
                    index={index}
                    inboundLeg={inboundLeg}
                    isExpanded={expandedItemId === item.itemId}
                    onToggle={() =>
                      setExpandedItemId((previousId) =>
                        previousId === item.itemId ? null : item.itemId,
                      )
                    }
                    onDelete={() => setDeleteTarget(item)}
                    onDecreaseStay={() =>
                      changeStayMinutes(item.itemId, -30)
                    }
                    onIncreaseStay={() =>
                      changeStayMinutes(item.itemId, 30)
                    }
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", item.itemId);
                      setDraggingItemId(item.itemId);
                    }}
                    onDrop={() => moveItem(item.itemId)}
                  />
                );
              })}
            </div>

            <button
              className="timeline-add-button"
              onClick={() => setIsDrawerOpen(true)}
            >
              ＋ 장소 추가
            </button>
          </section>
        </section>

        <SummaryStats
          summary={activeCourse.summary}
          onRecalculate={runMockRecalculate}
        />

        <p className="mock-guide">
          현재 화면은 Mock 데이터입니다. 실제 연동 시 장소 편집 후 서버의
          재계산 결과를 다시 받아 타임라인과 통계를 갱신하면 됩니다.
        </p>
      </section>

      {isRecalculating && (
        // API 연동 후에는 재계산 runId의 진행 상태와 연결합니다.
        <div className="loading-layer">
          <div className="loading-box">
            <span className="loading-spinner" />
            <strong>경로를 다시 계산하고 있어요.</strong>
            <p>운영시간, 이동시간, 종료시간을 확인하는 중입니다.</p>
          </div>
        </div>
      )}

      {deleteTarget && (
        // 삭제 확인 전에는 화면 상태를 변경하지 않도록 모달을 분리합니다.
        <ConfirmModal
          title="이 장소를 삭제할까요?"
          description={`“${deleteTarget.placeName}”을 삭제하면 이후 이동 경로와 시간이 다시 계산됩니다.`}
          confirmLabel="삭제하기"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {isSaveModalOpen && (
        // 실제 저장 성공 응답을 받은 뒤에만 이 모달을 열어야 합니다.
        <ConfirmModal
          title="일정이 저장되었습니다"
          description="저장한 일정에서 언제든 다시 확인하고 수정할 수 있습니다."
          confirmLabel="저장 목록 보기"
          onClose={() => setIsSaveModalOpen(false)}
          onConfirm={() => setIsSaveModalOpen(false)}
        />
      )}

      {isDrawerOpen && (
        // 실제 연동 시 mockPlaceCandidates를 장소 검색 API 결과로 교체합니다.
        <aside className="place-drawer">
          <div className="place-drawer__header">
            <div>
              <p className="breadcrumb">일정 편집</p>
              <h2>장소 추가</h2>
            </div>

            <button
              className="drawer-close"
              onClick={() => setIsDrawerOpen(false)}
            >
              닫기
            </button>
          </div>

          <input
            className="place-search-input"
            placeholder="장소명 또는 지역으로 검색"
          />

          <div className="place-candidate-list">
            {mockPlaceCandidates.map((place) => (
              <article className="place-candidate-card" key={place.placeId}>
                <div>
                  <span className="place-kind">
                    {place.kind === "MEAL" ? "식사" : "관광"}
                  </span>
                  <h3>{place.name}</h3>
                  <p>{place.description}</p>
                  <small>기본 체류시간 {place.defaultStayMinutes}분</small>
                </div>

                <button
                  className="button button--primary button--small"
                  onClick={() => addPlace(place)}
                >
                  추가
                </button>
              </article>
            ))}
          </div>
        </aside>
      )}
    </main>
  );
}

/**
 * 타임라인의 장소 한 줄입니다.
 * 수정 가능한 항목(VISIT, MEAL)만 체류시간 변경·삭제·순서 변경을 허용합니다.
 */
function TimelineItem({
  item,
  index,
  inboundLeg,
  isExpanded,
  onToggle,
  onDelete,
  onDecreaseStay,
  onIncreaseStay,
  onDragStart,
  onDrop,
}) {
  // 출발지와 종료지는 사용자가 수정하거나 이동할 수 없는 고정 항목입니다.
  const canEdit = item.kind !== "START" && item.kind !== "END";

  return (
    <article
      className="timeline-item"
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="timeline-item__top">
        <time>{item.arrivalTime}</time>

        <div className="timeline-item__body">
          <div className="timeline-item__place">
            <span className="timeline-icon" aria-hidden="true">
              {getPlaceEmoji(item)}
            </span>

            <div>
              <strong>
                {item.placeName}
                {inboundLeg && <span className="place-chevron">⌄</span>}
              </strong>

              {item.kind === "MEAL" && (
                <span className="meal-label">
                  🍴 {item.mealSlot === "DINNER" ? "저녁" : "점심"} · 한식 · 체류 {item.stayMinutes}분
                </span>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="timeline-item__actions">
              <span>체류 {item.stayMinutes}분</span>
              <span className="stay-controls">
                <button
                  className="stay-button"
                  onClick={onDecreaseStay}
                  aria-label="체류시간 30분 줄이기"
                >
                  −
                </button>
                <button
                  className="stay-button"
                  onClick={onIncreaseStay}
                  aria-label="체류시간 30분 늘리기"
                >
                  +
                </button>
              </span>
              <button
                className="delete-button"
                onClick={onDelete}
                aria-label={`${item.placeName} 삭제`}
              >
                🗑️
              </button>
            </div>
          )}
        </div>

        {inboundLeg && (
          <button className="transit-toggle" onClick={onToggle}>
            {isExpanded ? "이동 상세 닫기 ▲" : "이동 상세 보기 ▼"}
          </button>
        )}
      </div>

      {isExpanded && inboundLeg && (
        <div className="transit-detail">
          <strong>이동 약 {inboundLeg.durationMinutes}분</strong>

          <ol>
            {inboundLeg.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {index > 0 && <div className="timeline-divider" />}
    </article>
  );
}

/**
 * 선택 코스의 요약 수치를 표시합니다.
 * 값은 코스 카드가 아니라 선택된 itinerary 상세의 summary를 기준으로 합니다.
 */
function SummaryStats({ summary, onRecalculate }) {
  const hour = Math.floor(summary.totalMinutes / 60);
  const minute = summary.totalMinutes % 60;

  return (
    <section className="summary-stats">
      <Stat icon="⏱️" label="총 이동" value={`${hour}시간 ${minute}분`} />
      <Stat icon="🔀" label="환승" value={`${summary.transferCount}회`} />
      <Stat
        icon="🚌"
        label="예상 교통비"
        value={`${summary.estimatedFare.toLocaleString()}원`}
      />
      <Stat
        icon="🚶"
        label="총 도보"
        value={`${(summary.walkingDistanceMeters / 1000).toFixed(1)}km`}
      />
      <button className="summary-recalculate" onClick={onRecalculate}>
        ✨ 이 경로 다시 계산
      </button>
    </section>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="summary-stat">
      <span>{icon} {label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/**
 * 삭제 확인과 저장 완료에 공통으로 쓰는 간단한 Modal입니다.
 * 추후 shared/components/Modal.jsx가 완성되면 이 컴포넌트를 공통 Modal로 교체합니다.
 */
function ConfirmModal({
  title,
  description,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-modal">
        <h2>{title}</h2>
        <p>{description}</p>

        <div className="confirm-modal__actions">
          <button className="button button--secondary" onClick={onClose}>
            취소
          </button>
          <button
            className={`button ${
              danger ? "button--danger" : "button--primary"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
