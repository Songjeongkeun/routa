import "dotenv/config";

// tourAPI.mjs
const TOUR_API_KEY = process.env.TOUR_API_KEY;

export async function TourAPI(placeName) {
    try {
        if (!TOUR_API_KEY) {
            throw new Error("TOUR_API_KEY environment variable is required");
        }
        console.log(`\n🔍 [TourAPI] 검색 시작: '${placeName}'`);

        // 1. 최신 키워드 조회 엔드포인트 (/searchKeyword2) 활용
        const searchUrl = `https://apis.data.go.kr/B551011/KorPetTourService2/searchKeyword2?serviceKey=${TOUR_API_KEY}&keyword=${encodeURIComponent(placeName)}&MobileOS=ETC&MobileApp=AppTest&_type=json&numOfRows=1`;
        
        const searchRes = await fetch(searchUrl);
        console.log(`📡 키워드 검색 응답 코드: ${searchRes.status}`);
        
        if (!searchRes.ok) {
            console.log("❌ 키워드 검색 요청 실패");
            return false;
        }
        
        const searchData = await searchRes.json();
        let rawItems = searchData?.response?.body?.items?.item;
        
        if (!rawItems) {
            console.log(`📍 [TourAPI 결과] 장소 이름: ${placeName} | 검색 결과 없음 (false)`);
            return false;
        }
        
        const items = Array.isArray(rawItems) ? rawItems : [rawItems];
        const contentId = items[0].contentid;
        const apiPlaceName = items[0].title;
        console.log(`✅ contentId 확인 완료: ${contentId} (${apiPlaceName})`);

        // 2. 최신 반려동물 동반여행 상세 조회 엔드포인트 (/detailPetTour2) 활용
        const petUrl = `https://apis.data.go.kr/B551011/KorPetTourService2/detailPetTour2?serviceKey=${TOUR_API_KEY}&contentId=${contentId}&MobileOS=ETC&MobileApp=AppTest&_type=json`;
        
        const petRes = await fetch(petUrl);
        console.log(`📡 반려동물 상세 정보 응답 코드: ${petRes.status}`);
        
        if (!petRes.ok) {
            console.log("❌ 반려동물 상세 정보 요청 실패");
            return false;
        }

        const petData = await petRes.json();
        let rawPetItems = petData?.response?.body?.items?.item;

        if (!rawPetItems) {
            console.log(`[TourAPI 결과] 장소 이름: ${apiPlaceName} | 반려동물 동반 정보 없음 (false)`);
            return false; 
        }

        const petItems = Array.isArray(rawPetItems) ? rawPetItems : [rawPetItems];
        const petInfo = petItems[0];
        
        // 3. 반려동물 동반 가능 관련 텍스트 조합 분석
        const possibleText = (petInfo.acmpyPsblCpAb || "") + " " + (petInfo.petTursDtl || "");
        
        let isAllowed = false;
        if (possibleText.includes("가능") && !possibleText.includes("불가")) {
            isAllowed = true;
        }

        console.log(`[TourAPI 결과] 장소 이름: ${apiPlaceName} | 반려동물 동반 여부: ${isAllowed}`);
        return isAllowed;

    } catch (error) {
        console.error(`🚨 [TourAPI 에러 발생] ${placeName}:`, error);
        return false;
    }
}

// 단독 테스트 실행
(async () => {
    await TourAPI("경복궁");
})();
