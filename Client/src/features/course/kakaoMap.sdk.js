/**
 * Kakao Maps Web JavaScript SDK를 앱 전체에서 한 번만 불러옵니다.
 *
 * Vite는 `VITE_`로 시작하는 환경 변수만 브라우저 코드에 전달합니다.
 * JavaScript 키는 브라우저에서 사용하는 키이므로, 카카오 개발자 콘솔에
 * `http://localhost:5173`, LAN 테스트 주소(예: `http://192.168.0.10:5173`),
 * 운영 도메인을 카카오 JavaScript SDK 허용 도메인으로 등록해야 합니다.
 */
const KAKAO_SDK_SCRIPT_ID = "routa-kakao-map-sdk";
let sdkLoadingPromise;

export function loadKakaoMapsSdk() {
  const appKey = import.meta.env.VITE_KAKAO_APP_KEY;

  if (!appKey) {
    return Promise.reject(
      new Error(
        "카카오 지도 키가 없습니다. routa/.env의 VITE_KAKAO_APP_KEY를 확인한 뒤 개발 서버를 다시 시작하세요.",
      ),
    );
  }

  // 이미 SDK가 로드된 경우에는 새 script 태그를 만들지 않습니다.
  if (window.kakao?.maps) {
    return new Promise((resolve) => {
      window.kakao.maps.load(() => resolve(window.kakao.maps));
    });
  }

  // React StrictMode 또는 화면 재진입 시에도 하나의 네트워크 요청만 사용합니다.
  if (sdkLoadingPromise) return sdkLoadingPromise;

  sdkLoadingPromise = new Promise((resolve, reject) => {
    const loadMaps = () => {
      if (!window.kakao?.maps) {
        sdkLoadingPromise = undefined;
        reject(new Error("카카오 지도 SDK를 초기화하지 못했습니다."));
        return;
      }

      // autoload=false로 불러온 SDK는 maps.load 이후에만 Map 객체를 생성할 수 있습니다.
      window.kakao.maps.load(() => resolve(window.kakao.maps));
    };

    const existingScript = document.getElementById(KAKAO_SDK_SCRIPT_ID);

    if (existingScript) {
      existingScript.addEventListener("load", loadMaps, { once: true });
      existingScript.addEventListener(
        "error",
        () => {
          sdkLoadingPromise = undefined;
          reject(new Error("카카오 지도 SDK를 불러오지 못했습니다."));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = KAKAO_SDK_SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.addEventListener("load", loadMaps, { once: true });
    script.addEventListener(
      "error",
      () => {
        sdkLoadingPromise = undefined;
        reject(new Error("카카오 지도 SDK를 불러오지 못했습니다."));
      },
      { once: true },
    );

    document.head.appendChild(script);
  });

  return sdkLoadingPromise;
}
