import { useEffect, useRef, useState } from "react";
import { loadKakaoMapsSdk } from "./kakaoMap.sdk";

const DEFAULT_CENTER = { latitude: 37.5665, longitude: 126.978 };
// 변경: API마다 역·정류장 좌표를 반올림하는 정도가 달라 생기는 30m 이하의 미세한 틈은
// 같은 지점으로 간주합니다. 더 먼 구간은 실제 노선으로 오해하지 않도록 연결 점선으로 남깁니다.
const MAX_SNAP_DISTANCE_METERS = 30;

/**
 * 일정 장소 목록을 Kakao Maps Web JavaScript SDK 지도에 표시합니다.
 *
 * `items`에는 latitude, longitude가 있어야 마커를 표시하고, `legs`에는 서버가
 * 반환한 대중교통·실제 도보 geometrySegments를 넣어 실제 이동 경로 모양을 표시합니다.
 */
export default function KakaoCourseMap({
  items,
  legs = [],
  activeItemId = null,
  focusRequestId = 0,
  onItemSelect,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const displayedElementsRef = useRef([]);
  // 변경: 일정 목록에서 선택한 장소를 지도에서 강조·확대하기 위한 마커 정보입니다.
  // 지도 객체를 새로 만들지 않고 DOM class와 중심 좌표만 바꾸므로 목록 클릭 반응이 즉시 보입니다.
  const markerEntriesRef = useRef(new Map());
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
    markerEntriesRef.current = new Map();

    if (placesWithCoordinates.length === 0) {
      map.setCenter(
        new maps.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
      );
      map.setLevel(8);
      return undefined;
    }

    const bounds = new maps.LatLngBounds();
    // 변경: DB numeric 좌표가 문자열로 직렬화돼도 Kakao SDK에는 항상 숫자로 전달합니다.
    const positions = placesWithCoordinates.map(
      (item) => new maps.LatLng(Number(item.latitude), Number(item.longitude)),
    );
    const itemsById = new Map(placesWithCoordinates.map((item) => [String(item.itemId), item]));
    // 변경: 좌표가 없는 항목이 있더라도 지도 번호와 우측 시간표 번호가 달라지지 않도록,
    // 좌표로 필터링하기 전의 전체 일정 배열을 기준으로 순번을 계산합니다.
    const itemIndexById = new Map(items.map((item, index) => [String(item.itemId), index]));

    /**
     * 변경: 각 일정 구간의 실제 ODsay 노선·카카오 보행 경로를 그립니다.
     * 좌표 정리 함수가 중복점 제거·같은 이동수단 병합·미세 틈 보정·연결 점선 추가를 먼저 처리하므로
     * API가 여러 section으로 나눠 준 경로도 지도에서는 한 흐름처럼 자연스럽게 이어집니다.
     */
    legs.forEach((leg) => {
      const geometrySegments = Array.isArray(leg.geometrySegments) ? leg.geometrySegments : [];
      const hasActualGeometry = geometrySegments.some((segment) => segment.points?.length >= 2);
      const fromItem = itemsById.get(String(leg.fromItemId));
      const toItem = itemsById.get(String(leg.toItemId));

      if (hasActualGeometry) {
        const displaySegments = createDisplaySegments({ geometrySegments, fromItem, toItem });

        displaySegments.forEach((segment) => {
          const path = segment.points.map(
            (point) => new maps.LatLng(point.latitude, point.longitude),
          );

          // 변경: 흰색 외곽선을 먼저 그리고 그 위에 이동수단 색 선을 겹쳐
          // 도로·건물·하천처럼 색이 복잡한 지도 위에서도 경로가 또렷하게 보이게 합니다.
          drawRouteSegment({ map, maps, path, type: segment.type, displayedElementsRef });
          path.forEach((position) => bounds.extend(position));
        });
        // 변경: 선의 색만으로는 진행 방향을 알기 어려워 각 장소 사이의 대표 구간에 화살표를 한 개 표시합니다.
        // 실제 geometry가 여러 이동수단 section으로 나뉜 경우에는 가장 긴 section을 선택해 화살표가 과도하게 늘어나지 않습니다.
        drawLegDirectionArrow({ map, maps, displaySegments, displayedElementsRef });
        return;
      }

      // 변경: 도보 대체·과거 캐시처럼 좌표 그래픽이 없는 구간은 실제 경로처럼 보이지 않도록 점선으로 구분합니다.
      if (!fromItem || !toItem) return;

      const estimatedPath = [
        new maps.LatLng(Number(fromItem.latitude), Number(fromItem.longitude)),
        new maps.LatLng(Number(toItem.latitude), Number(toItem.longitude)),
      ];
      drawRouteSegment({
        map,
        maps,
        path: estimatedPath,
        type: "ROUTE_ESTIMATE",
        displayedElementsRef,
      });
      // 변경: 실제 geometry가 없는 추정 구간도 출발지→도착지 방향은 확실하므로 동일한 방향 화살표를 표시합니다.
      drawLegDirectionArrow({
        map,
        maps,
        displaySegments: [{ type: "ROUTE_ESTIMATE", points: estimatedPath.map((position) => ({
          latitude: position.getLat(),
          longitude: position.getLng(),
        })) }],
        displayedElementsRef,
      });
    });

    placesWithCoordinates.forEach((item, coordinateIndex) => {
      const position = positions[coordinateIndex];
      const itemIndex = itemIndexById.get(String(item.itemId)) ?? coordinateIndex;
      const markerInfo = getStopMarkerInfo(item, itemIndex, items);
      // 변경: 기본 핀과 항상 노출된 긴 장소명 라벨 대신, S·순번·E만 보이는 작은 마커를 사용합니다.
      // 클릭하거나 우측 일정에서 선택한 경우에만 장소명·도착 시각을 펼쳐 지도 핀이 겹쳐도 읽기 쉽게 합니다.
      const markerElement = createStopMarker({
        item,
        markerInfo,
        // 변경: 선택 강조는 아래 전용 Effect가 처리합니다.
        // 마커·경로 재생성 Effect가 선택 상태까지 의존하면 목록을 클릭할 때마다 모든 선을 다시 그리게 됩니다.
        isActive: false,
        onSelect: onItemSelect,
      });
      const markerOverlay = new maps.CustomOverlay({
        map,
        position,
        content: markerElement,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 5,
      });

      markerEntriesRef.current.set(String(item.itemId), {
        element: markerElement,
        overlay: markerOverlay,
        position,
      });
      displayedElementsRef.current.push(markerOverlay);
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
  }, [isMapReady, items, legs, onItemSelect]);

  /**
   * 변경: 시간표의 장소를 누르면 같은 itemId의 지도 마커만 강조하고 해당 위치로 확실하게 이동합니다.
   * focusRequestId를 별도로 받아 같은 장소를 연속 클릭해도 Effect가 다시 실행되게 합니다.
   * 이 Effect는 경로선·마커를 다시 생성하지 않아, 목록을 훑어보는 동안 지도 화면이 깜빡이지 않습니다.
   */
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;

    const markerEntries = markerEntriesRef.current;
    markerEntries.forEach((entry, itemId) => {
      const isActive = activeItemId != null && String(itemId) === String(activeItemId);
      entry.element.classList.toggle("kakao-map-stop-marker--active", isActive);
      entry.overlay.setZIndex(isActive ? 8 : 5);
    });

    const activeMarker = activeItemId == null
      ? null
      : markerEntries.get(String(activeItemId));
    if (!activeMarker) return;

    // 변경: panTo 직후 setLevel을 호출하면 카카오 지도의 이동 애니메이션이 취소되어
    // 중심이 움직이지 않는 것처럼 보일 수 있습니다. 확대 수준을 먼저 정한 뒤,
    // setCenter로 선택한 마커 좌표를 즉시 중심에 적용해 클릭마다 확실히 이동시킵니다.
    const currentLevel = mapRef.current.getLevel();
    mapRef.current.setLevel(Math.min(currentLevel, 4));
    mapRef.current.setCenter(activeMarker.position);
  }, [activeItemId, focusRequestId, isMapReady, items, legs]);

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
      <div className="kakao-course-map__order-guide" aria-label="일정 순서 읽는 방법">
        <strong className="map-order-guide__start">S</strong><span>출발</span>
        <b aria-hidden="true">→</b>
        <strong className="map-order-guide__visit">1</strong><span>방문 순서</span>
        <b aria-hidden="true">→</b>
        <strong className="map-order-guide__end">E</strong><span>종료</span>
      </div>
      <div className="kakao-course-map__legend" aria-label="지도 이동 경로 범례">
        <span><i />지하철</span>
        <span><i className="legend-bus" />버스</span>
        <span><i className="legend-walk" />도보</span>
        <span><i className="legend-connector" />환승·연결</span>
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
  // 변경: 노선 좌표 사이의 빈 공간은 실제 도보 경로라고 단정할 수 없으므로
  // 도보와 같은 주황색 계열을 사용하되 점선으로 구분합니다.
  if (type === "WALK_CONNECTOR") {
    return {
      strokeWeight: 4,
      strokeColor: "#f97316",
      strokeOpacity: 0.85,
      strokeStyle: "shortdash",
      zIndex: 3,
    };
  }

  if (type === "ROUTE_ESTIMATE") {
    return {
      strokeWeight: 4,
      strokeColor: "#94a3b8",
      strokeOpacity: 0.8,
      strokeStyle: "shortdash",
      zIndex: 2,
    };
  }

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

/**
 * 변경: 같은 좌표가 연속으로 들어오면 선 끝에 작은 점·두꺼운 모서리가 생길 수 있어 한 번만 남깁니다.
 * 원본 props는 수정하지 않고 숫자로 정규화한 새 좌표 배열을 반환합니다.
 */
function normalizeSegmentPoints(points) {
  const normalizedPoints = [];

  for (const point of points ?? []) {
    const latitude = Number(point?.latitude);
    const longitude = Number(point?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const normalizedPoint = { latitude, longitude };
    const previousPoint = normalizedPoints.at(-1);
    if (previousPoint && getDistanceMeters(previousPoint, normalizedPoint) < 0.5) continue;
    normalizedPoints.push(normalizedPoint);
  }

  return normalizedPoints;
}

function toCoordinate(item) {
  if (!hasCoordinates(item)) return null;
  return {
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
  };
}

/** 두 WGS84 좌표 사이의 직선거리를 미터로 계산해 좌표 보정 범위를 판단합니다. */
function getDistanceMeters(first, second) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const latitudeDifference = toRadians(second.latitude - first.latitude);
  const longitudeDifference = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude)
    * Math.sin(longitudeDifference / 2) ** 2;
  // 부동소수점 오차로 값이 아주 조금 1을 넘으면 sqrt가 NaN이 될 수 있어 유효 범위로 고정합니다.
  const normalizedHaversine = Math.min(1, Math.max(0, haversine));

  return 6371000 * 2 * Math.atan2(
    Math.sqrt(normalizedHaversine),
    Math.sqrt(1 - normalizedHaversine),
  );
}

/**
 * 실제 노선 사이의 틈을 화면용 경로 구간으로 보완합니다.
 *
 * - 30m 이하: API 좌표 오차로 보고 두 선의 끝점을 정확히 맞춥니다.
 * - 30m 초과: 도로를 가로지르는 가짜 실선을 만들지 않고 WALK_CONNECTOR 점선을 추가합니다.
 * - 같은 이동수단이 30m 안에서 이어지면 하나로 합쳐 Polyline 경계가 보이지 않게 합니다.
 */
function createDisplaySegments({ geometrySegments, fromItem, toItem }) {
  const normalizedSegments = geometrySegments
    .map((segment) => ({
      type: segment.type || "TRANSIT",
      points: normalizeSegmentPoints(segment.points),
    }))
    .filter((segment) => segment.points.length >= 2);

  if (normalizedSegments.length === 0) return [];

  const displaySegments = [];
  let previousPoint = toCoordinate(fromItem);

  for (const segment of normalizedSegments) {
    const points = [...segment.points];
    const gapMeters = previousPoint
      ? getDistanceMeters(previousPoint, points[0])
      : null;

    if (previousPoint && gapMeters <= MAX_SNAP_DISTANCE_METERS) {
      // 변경: 새로운 배열만 수정하므로 서버 응답과 React props는 그대로 보존됩니다.
      points[0] = previousPoint;
    } else if (previousPoint) {
      displaySegments.push({
        type: "WALK_CONNECTOR",
        points: [previousPoint, points[0]],
      });
    }

    const previousSegment = displaySegments.at(-1);
    if (
      previousSegment?.type === segment.type
      && gapMeters != null
      && gapMeters <= MAX_SNAP_DISTANCE_METERS
    ) {
      // 변경: 같은 이동수단 section의 공통 끝점은 한 번만 유지해 선이 겹쳐 두꺼워지는 현상을 막습니다.
      previousSegment.points.push(...points.slice(1));
    } else {
      displaySegments.push({ type: segment.type, points });
    }

    previousPoint = points.at(-1);
  }

  const destinationPoint = toCoordinate(toItem);
  if (!previousPoint || !destinationPoint) return displaySegments;

  const destinationGapMeters = getDistanceMeters(previousPoint, destinationPoint);
  if (destinationGapMeters <= MAX_SNAP_DISTANCE_METERS) {
    const lastSegment = displaySegments.at(-1);
    lastSegment.points[lastSegment.points.length - 1] = destinationPoint;
  } else {
    displaySegments.push({
      type: "WALK_CONNECTOR",
      points: [previousPoint, destinationPoint],
    });
  }

  return displaySegments;
}

/** 흰색 외곽선과 실제 색 선을 같은 경로에 겹쳐 지도 배경과 경로를 시각적으로 분리합니다. */
function drawRouteSegment({ map, maps, path, type, displayedElementsRef }) {
  const style = getTransitLineStyle(type);
  const outline = new maps.Polyline({
    map,
    path,
    strokeWeight: style.strokeWeight + 4,
    strokeColor: "#ffffff",
    strokeOpacity: 0.88,
    strokeStyle: style.strokeStyle,
    zIndex: Math.max(1, style.zIndex - 1),
  });
  const routeLine = new maps.Polyline({ map, path, ...style });

  displayedElementsRef.current.push(outline, routeLine);
}

/** 화면에서 가장 긴 실제 이동 구간 하나를 골라 진행 방향 화살표를 놓습니다. */
function drawLegDirectionArrow({ map, maps, displaySegments, displayedElementsRef }) {
  const directionSegment = displaySegments
    .filter((segment) => Array.isArray(segment.points) && segment.points.length >= 2)
    .map((segment) => ({ ...segment, distanceMeters: getPathDistanceMeters(segment.points) }))
    .sort((first, second) => second.distanceMeters - first.distanceMeters)[0];

  if (!directionSegment) return;

  const direction = getDirectionAtPathMiddle(directionSegment.points);
  if (!direction) return;

  const style = getTransitLineStyle(directionSegment.type);
  const arrow = document.createElement("div");
  arrow.className = "kakao-map-route-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "▲";
  arrow.style.setProperty("--route-arrow-color", style.strokeColor);
  // ▲의 기본 방향은 지도 위쪽(북쪽)이므로 북쪽 기준 bearing을 그대로 CSS 회전에 사용합니다.
  arrow.style.transform = `rotate(${direction.bearingDegrees}deg)`;

  const overlay = new maps.CustomOverlay({
    map,
    position: new maps.LatLng(direction.latitude, direction.longitude),
    content: arrow,
    xAnchor: 0.5,
    yAnchor: 0.5,
    zIndex: 4,
  });
  displayedElementsRef.current.push(overlay);
}

function getPathDistanceMeters(points) {
  return points.slice(1).reduce(
    (totalDistance, point, index) => totalDistance + getDistanceMeters(points[index], point),
    0,
  );
}

/**
 * 선의 길이 절반 지점과 그 지점에서의 진행 각도를 반환합니다.
 * 긴 노선에서도 첫 점이나 끝 점에 화살표가 겹치지 않아 방향을 알아보기 쉽습니다.
 */
function getDirectionAtPathMiddle(points) {
  const totalDistance = getPathDistanceMeters(points);
  if (totalDistance <= 0) return null;

  const targetDistance = totalDistance / 2;
  let traveledDistance = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const segmentDistance = getDistanceMeters(from, to);
    if (segmentDistance <= 0) continue;

    if (traveledDistance + segmentDistance >= targetDistance) {
      const ratio = (targetDistance - traveledDistance) / segmentDistance;
      return {
        latitude: from.latitude + (to.latitude - from.latitude) * ratio,
        longitude: from.longitude + (to.longitude - from.longitude) * ratio,
        bearingDegrees: getBearingDegrees(from, to),
      };
    }
    traveledDistance += segmentDistance;
  }

  return null;
}

/** 두 좌표를 잇는 선의 북쪽 기준 시계 방향 각도입니다. */
function getBearingDegrees(from, to) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const toDegrees = (value) => (value * 180) / Math.PI;
  const longitudeDifference = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const y = Math.sin(longitudeDifference) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDifference);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function hasCoordinates(item) {
  // 변경: PostgreSQL 숫자가 문자열로 직렬화된 경우는 허용하되 null·빈 문자열을 0도로 오인하지 않습니다.
  if (item?.latitude == null || item?.longitude == null) return false;
  if (String(item.latitude).trim() === "" || String(item.longitude).trim() === "") return false;

  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

/** START·END는 문자로, 중간 일정은 START·END를 제외한 실제 방문 순번으로 표시합니다. */
function getStopMarkerInfo(item, itemIndex, items) {
  if (item.kind === "START") return { label: "S", type: "start", description: "출발" };
  if (item.kind === "END") return { label: "E", type: "end", description: "종료" };

  const order = items
    .slice(0, itemIndex + 1)
    .filter((scheduledItem) => scheduledItem.kind !== "START" && scheduledItem.kind !== "END")
    .length;

  return {
    label: String(order),
    type: item.kind === "MEAL" ? "meal" : "visit",
    description: `${order}번째 방문`,
  };
}

/**
 * 서버에서 받은 장소명을 HTML 문자열에 직접 합치지 않고 DOM의 textContent로 넣습니다.
 * 기본 화면은 순번만 보여 주고, 클릭·목록 선택 시에만 장소명과 도착 시간을 펼쳐 마커 겹침을 줄입니다.
 */
function createStopMarker({ item, markerInfo, isActive, onSelect }) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = [
    "kakao-map-stop-marker",
    `kakao-map-stop-marker--${markerInfo.type}`,
    isActive ? "kakao-map-stop-marker--active" : "",
  ].filter(Boolean).join(" ");
  marker.setAttribute(
    "aria-label",
    `${markerInfo.description}: ${item.placeName}${item.arrivalTime ? `, ${item.arrivalTime} 도착` : ""}`,
  );
  marker.title = `${markerInfo.description} · ${item.placeName}`;

  const badge = document.createElement("span");
  badge.className = "kakao-map-stop-marker__badge";
  badge.textContent = markerInfo.label;

  const detail = document.createElement("span");
  detail.className = "kakao-map-stop-marker__detail";
  detail.textContent = item.arrivalTime ? `${item.placeName} · ${item.arrivalTime}` : item.placeName;

  marker.append(badge, detail);
  marker.addEventListener("click", () => onSelect?.(item.itemId));
  return marker;
}

function clearDisplayedElements(displayedElementsRef) {
  displayedElementsRef.current.forEach((element) => element.setMap(null));
  displayedElementsRef.current = [];
}
