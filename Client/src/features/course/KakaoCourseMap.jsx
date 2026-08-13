import { useEffect, useRef, useState } from "react";
import { loadKakaoMapsSdk } from "./kakaoMap.sdk";

const DEFAULT_CENTER = { latitude: 37.5665, longitude: 126.978 };

/**
 * 일정 장소 목록을 Kakao Maps Web JavaScript SDK 지도에 표시합니다.
 *
 * `items`에는 latitude, longitude가 있어야 마커를 표시하고, `legs`에는 서버가
 * 반환한 대중교통·실제 도보 geometrySegments를 넣어 실제 이동 경로 모양을 표시합니다.
 */
export default function KakaoCourseMap({ items, legs = [] }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const displayedElementsRef = useRef([]);
  const [isMapReady, setIsMapReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  /**
   * 지도 객체는 처음 마운트할 때 한 번만 생성합니다.
   * 코스가 바뀌어도 지도 자체를 새로 만들지 않고, 아래 Effect에서 마커와 선만 갱신합니다.
   */
  useEffect(() => {
    let isDisposed = false;

    loadKakaoMapsSdk()
      .then((maps) => {
        if (isDisposed || !mapContainerRef.current) return;

        const center = new maps.LatLng(
          DEFAULT_CENTER.latitude,
          DEFAULT_CENTER.longitude,
        );

        mapRef.current = new maps.Map(mapContainerRef.current, {
          center,
          level: 8,
        });
        setIsMapReady(true);
      })
      .catch((error) => {
        if (!isDisposed) setErrorMessage(error.message);
      });

    return () => {
      isDisposed = true;
      clearDisplayedElements(displayedElementsRef);
      mapRef.current = null;
    };
  }, []);

  /**
   * 선택 코스·장소 추가·삭제로 items가 바뀔 때마다 마커, 장소명, 경로선을 다시 그립니다.
   * 기존 객체를 먼저 setMap(null)로 제거해 중복 마커가 쌓이지 않도록 합니다.
   */
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !window.kakao?.maps) return;

    const maps = window.kakao.maps;
    const map = mapRef.current;
    const placesWithCoordinates = items.filter(hasCoordinates);

    clearDisplayedElements(displayedElementsRef);

    if (placesWithCoordinates.length === 0) {
      map.setCenter(
        new maps.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
      );
      map.setLevel(8);
      return undefined;
    }

    const bounds = new maps.LatLngBounds();
    const positions = placesWithCoordinates.map((item) => new maps.LatLng(item.latitude, item.longitude));
    const itemsById = new Map(placesWithCoordinates.map((item) => [String(item.itemId), item]));

    /**
     * 변경: 각 일정 구간의 실제 ODsay 노선·카카오 보행 경로를 그립니다.
     * route.geometrySegments에는 지하철·버스·도보가 섞일 수 있으므로 구간별 색으로 Polyline을 만듭니다.
     */
    legs.forEach((leg) => {
      const geometrySegments = Array.isArray(leg.geometrySegments) ? leg.geometrySegments : [];
      const hasActualGeometry = geometrySegments.some((segment) => segment.points?.length >= 2);

      if (hasActualGeometry) {
        geometrySegments.forEach((segment) => {
          if (!Array.isArray(segment.points) || segment.points.length < 2) return;

          const path = segment.points.map(
            (point) => new maps.LatLng(point.latitude, point.longitude),
          );
          const routeLine = new maps.Polyline({
            map,
            path,
            ...getTransitLineStyle(segment.type),
          });
          displayedElementsRef.current.push(routeLine);
          path.forEach((position) => bounds.extend(position));
        });
        return;
      }

      // 변경: 도보 대체·과거 캐시처럼 좌표 그래픽이 없는 구간은 실제 경로처럼 보이지 않도록 점선으로 구분합니다.
      const fromItem = itemsById.get(String(leg.fromItemId));
      const toItem = itemsById.get(String(leg.toItemId));
      if (!fromItem || !toItem) return;

      const estimatedLine = new maps.Polyline({
        map,
        path: [
          new maps.LatLng(fromItem.latitude, fromItem.longitude),
          new maps.LatLng(toItem.latitude, toItem.longitude),
        ],
        strokeWeight: 4,
        strokeColor: "#94a3b8",
        strokeOpacity: 0.8,
        strokeStyle: "shortdash",
        endArrow: true,
      });
      displayedElementsRef.current.push(estimatedLine);
    });

    placesWithCoordinates.forEach((item, index) => {
      const position = positions[index];
      const marker = new maps.Marker({
        map,
        position,
        title: item.placeName,
      });
      const placeLabel = new maps.CustomOverlay({
        map,
        position,
        content: createPlaceLabel(item, index + 1),
        xAnchor: 0.5,
        yAnchor: 1.65,
        zIndex: 3,
      });

      displayedElementsRef.current.push(marker, placeLabel);
      bounds.extend(position);
    });

    // 지도 컨테이너가 보이는 크기를 다시 계산한 후, 모든 마커가 한 화면에 들어오게 합니다.
    map.relayout();

    if (positions.length === 1) {
      map.setCenter(positions[0]);
      map.setLevel(3);
    } else {
      map.setBounds(bounds);
    }

    return () => clearDisplayedElements(displayedElementsRef);
  }, [isMapReady, items, legs]);

  return (
    <section className="kakao-course-map" aria-label="추천 일정 지도">
      <div className="kakao-course-map__canvas" ref={mapContainerRef} />

      {!isMapReady && !errorMessage && (
        <div className="kakao-course-map__status">지도를 불러오는 중입니다…</div>
      )}

      {errorMessage && (
        <div className="kakao-course-map__error">
          <strong>지도를 표시할 수 없습니다.</strong>
          <p>{errorMessage}</p>
        </div>
      )}

      {/* 변경: 지도 선의 색이 의미하는 이동수단과 실제 경로가 없는 추정 구간을 함께 설명합니다. */}
      <div className="kakao-course-map__legend" aria-label="지도 이동 경로 범례">
        <span><i />지하철</span>
        <span><i className="legend-bus" />버스</span>
        <span><i className="legend-walk" />도보</span>
        <span><i className="legend-estimate" />경로 추정</span>
      </div>
    </section>
  );
}

/**
 * 변경: 한 지도에서 이동수단을 빠르게 구분할 수 있게 노선 종류마다 색을 고정합니다.
 * WALK는 카카오가 반환한 실제 보행로이고, geometrySegments가 없는 WALK_FALLBACK만 회색 점선으로 표시합니다.
 */
function getTransitLineStyle(type) {
  if (type === "SUBWAY") {
    return {
      strokeWeight: 5,
      strokeColor: "#4f46e5",
      strokeOpacity: 0.9,
      strokeStyle: "solid",
      zIndex: 2,
    };
  }

  if (type === "BUS") {
    return {
      strokeWeight: 5,
      strokeColor: "#16a34a",
      strokeOpacity: 0.9,
      strokeStyle: "solid",
      zIndex: 2,
    };
  }

  if (type === "WALK") {
    return {
      strokeWeight: 5,
      strokeColor: "#f97316",
      strokeOpacity: 0.9,
      strokeStyle: "solid",
      zIndex: 2,
    };
  }

  return {
    strokeWeight: 5,
    strokeColor: "#0ea5e9",
    strokeOpacity: 0.9,
    strokeStyle: "solid",
    zIndex: 2,
  };
}

function hasCoordinates(item) {
  return Number.isFinite(item.latitude) && Number.isFinite(item.longitude);
}

/**
 * 서버에서 받은 장소명을 HTML 문자열에 직접 합치지 않고 DOM의 textContent로 넣습니다.
 * 이렇게 하면 장소명에 HTML 문자가 포함되어도 지도 오버레이에서 실행되지 않습니다.
 */
function createPlaceLabel(item, order) {
  const label = document.createElement("div");
  label.className = "kakao-map-place-label";

  const orderBadge = document.createElement("span");
  orderBadge.className = "kakao-map-place-label__order";
  orderBadge.textContent = String(order);

  const placeName = document.createElement("span");
  placeName.className = "kakao-map-place-label__name";
  placeName.textContent = item.placeName;

  label.append(orderBadge, placeName);
  return label;
}

function clearDisplayedElements(displayedElementsRef) {
  displayedElementsRef.current.forEach((element) => element.setMap(null));
  displayedElementsRef.current = [];
}
