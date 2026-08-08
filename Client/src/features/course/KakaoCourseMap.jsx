import { useEffect, useRef, useState } from "react";
import { loadKakaoMapsSdk } from "./kakaoMap.sdk";

const DEFAULT_CENTER = { latitude: 37.5665, longitude: 126.978 };

/**
 * 일정 장소 목록을 Kakao Maps Web JavaScript SDK 지도에 표시합니다.
 *
 * `items`에는 latitude, longitude가 있어야 마커를 표시할 수 있습니다.
 * 실제 API 연동 시에도 같은 필드를 일정 항목 응답에 포함하면 이 컴포넌트를
 * 변경하지 않고 재사용할 수 있습니다.
 */
export default function KakaoCourseMap({ items }) {
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
    const positions = placesWithCoordinates.map(
      (item) => new maps.LatLng(item.latitude, item.longitude),
    );

    // 현재는 장소 좌표를 순서대로 잇는 시각적 경로입니다.
    // 실제 도로·대중교통 경로는 백엔드 길찾기 API가 반환한 좌표 배열로 교체합니다.
    if (positions.length > 1) {
      const routeLine = new maps.Polyline({
        map,
        path: positions,
        strokeWeight: 5,
        strokeColor: "#00bfa5",
        strokeOpacity: 0.85,
        strokeStyle: "solid",
        endArrow: true,
      });
      displayedElementsRef.current.push(routeLine);
    }

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
  }, [isMapReady, items]);

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
    </section>
  );
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
