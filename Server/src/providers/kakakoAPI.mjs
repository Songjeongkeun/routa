import { checkDBConnection, query, closeDB } from '../db/database.mjs'
import { GoogleAPI } from './googleAPI.mjs';
// import { TourAPI } from './tourApi.mjs'

const KAKAO_API_KEY = "d074184c6db715a8b282866ecb23ba6b"
const radius = "2000"; 

// 🚨 [주의] 테스트하실 때는 "AT4" 1개만 남기고 나머지는 지우는 것을 권장합니다.
const allCategoryCodes = [
    "MT1", "SW8",  
    "CT1", "AT4", "AD5", "FD6", "CE7"
];

// const allCategoryCodes = [
//     "MT1", "CS2", "PS3", "SC4", "AC5", "PK6", "OL7", "SW8", "BK9", 
//     "CT1", "AG2", "PO3", "AT4", "AD5", "FD6", "CE7", "HP8", "PM9"
// ];

function category_time(group_name) {
    if (!group_name || group_name.trim() === "") return 60;
    switch (group_name) {
        case "관광명소": return 90;
        case "문화시설": return 120;
        case "음식점":   
        case "카페":     return 60;
        case "대형마트": return 90;
        default:         return 60;  
    }
}

// [테스트용 단일 좌표]
// const seoulGridPoints = [{ x: "126.9786567", y: "37.566826" }]; // 서울 시청
// const seoulGridPoints = [{ x: "127.100133", y: "37.513261" }]; // 잠실역
// const seoulGridPoints = [{ x: "127.025393", y: "37.504734" }]; // 신논현역
// const seoulGridPoints = [{ x: "127.069236", y: "37.540389" }]; // 건대입구역
// const seoulGridPoints = [{ x: "126.923610", y: "37.556670" }]; // 홍대입구역
const seoulGridPoints = [
    { x: "126.9786567", y: "37.566826" }, // 서울 시청
    { x: "127.100133", y: "37.513261" }, // 잠실역
    { x: "127.025393", y: "37.504734" }, // 신논현역
    { x: "127.069236", y: "37.540389" }, // 건대입구역
    { x: "126.923610", y: "37.556670" }, // 홍대입구역
    { x: "126.994276", y: "37.534570" }, // 이태원역
    { x: "127.055811", y: "37.544588" }, // 성수역
    { x: "127.028643", y: "37.526356" }, // 압구정역
    { x: "127.004921", y: "37.504951" }, // 고속터미널역
    { x: "126.924191", y: "37.521570" }, // 여의도역
    { x: "126.891461", y: "37.508849" }, // 신도림역
    { x: "126.951593", y: "37.481232" }, // 서울대입구역
    { x: "127.073215", y: "37.510964" }, // 종합운동장역
    { x: "127.014312", y: "37.485124" }, // 남부터미널역
    { x: "126.882470", y: "37.481272" }, // 가산디지털단지역
    { x: "126.970607", y: "37.554648" }, // 서울역
    { x: "126.913923", y: "37.549463" }, // 합정역
    { x: "126.989736", y: "37.571607" }, // 종로3가역
    { x: "126.997235", y: "37.566723" }, // 을지로4가역
    { x: "126.991873", y: "37.566276" }, // 을지로3가역
    { x: "127.007621", y: "37.559092" }, // 동대입구역
    { x: "126.999718", y: "37.540455" }, // 한강진역
    { x: "127.037130", y: "37.561271" }, // 왕십리역
    { x: "126.946977", y: "37.556272" }  // 이대역
];

async function collectAndSaveData() {
    try {
        await checkDBConnection(); 
        
        // 💡 [추가] API 호출 횟수를 기록할 변수 선언
        let kakaoCallCount = 0;
        let googleCallCount = 0;

        for (const point of seoulGridPoints) {
            const { x, y } = point;
            console.log(`\n=== 📍 기준 좌표 탐색 시작 [X: ${x}, Y: ${y}] ===`);

            for (const categoryCode of allCategoryCodes) {
                let page = 1; 
                let isEnd = false; 

                // 테스트할 때 45가 아니라 1로 바꾸는게 API를 아낄 수 있음
                while (!isEnd && page <= 45) { 
                    // const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${categoryCode}&x=${x}&y=${y}&radius=${radius}&page=${page}`;
                    const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${categoryCode}&x=${x}&y=${y}&radius=${radius}&page=${page}&sort=distance`;
                    try { 
                        kakaoCallCount++;
                        console.log(`\n📡 [카카오 API] 호출 횟수: ${kakaoCallCount}회 (카테고리: ${categoryCode}, 페이지: ${page})`);

                        const response = await fetch(url, {
                            method: 'GET',
                            headers: { 'Authorization': `KakaoAK ${KAKAO_API_KEY}` }
                        }); 

                        if (!response.ok) {
                            console.error(`[카카오 API 에러] 카테고리: ${categoryCode}`);
                            break; 
                        }

                        const data = await response.json();
                        const documents = data.documents;

                        if (documents.length > 0) {
                            for (const place of documents) {
                                
                                // 서울만
                                const roadAddress = place.road_address_name || "";
                                const oldAddress = place.address_name || "";
                                if (!roadAddress.startsWith("서울") && !oldAddress.startsWith("서울")) {
                                    continue; 
                                }

                                // 2. DB 중복 검사 (구글 API 호출 방어)
                                const checkSql = `SELECT 1 FROM "PLACE" WHERE place_id = $1 LIMIT 1;`;
                                const checkRes = await query(checkSql, [Number(place.id)]); 

                                if (checkRes.rowCount > 0) {
                                    console.log(`[패스] ${place.place_name}는 이미 DB에 있습니다.`);
                                    continue; 
                                }

                                // 구글 API 호출 카운트 증가 및 터미널 출력
                                googleCallCount++;
                                console.log(`🛰️ [구글 API] 호출 횟수: ${googleCallCount}회 (장소: ${place.place_name})`);

                                // 구글 모듈에 넘겨서 상세 정보 받아오기
                                let googleData = await GoogleAPI(place.place_name) || {};
                                
                                // // TourAPI에 넘겨서 반려동물 동반 가능 여부 받아오기
                                // tourCallCount++;
                                // console.log(`🐾 [TourAPI] 호출 횟수: ${tourCallCount}회 (${place.place_name})`);
                                // let petAllowed = await TourAPI(place.place_name) || false;

                                // 4. DB 쿼리에 넣을 파라미터 매핑
                                const params = [
                                    Number(place.id),                               
                                    place.place_name,                               
                                    place.category_group_name,                      
                                    roadAddress || oldAddress,                      
                                    parseFloat(place.y),                            
                                    parseFloat(place.x),                            
                                    googleData.image_url || null,                   
                                    googleData.start_time || null,                  
                                    googleData.closed_days || null,                 
                                    null, // last_order
                                    googleData.rating || null,                      
                                    category_time(place.category_group_name),       
                                    // petAllowed, // 팻 체크임              
                                    googleData.google_place_id || null,             
                                    googleData.end_time || null                     
                                ];

                                // DB 저장 쿼리 실행
                                const insertSql = `
                                    INSERT INTO "PLACE" (
                                        place_id, place_name, place_category, address, latitude, longitude,
                                        thumbnail_url, start_time, closed_days, last_order, average_rating,
                                        default_stay_mins, google_place_id, end_time
                                    ) VALUES (
                                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                                    ) ON CONFLICT (place_id) DO NOTHING;
                                `;
                                await query(insertSql, params);
                                console.log(`✅ [${place.place_name}] DB 저장 완료`);
                            }
                        }
                        isEnd = data.meta.is_end;
                        page++; 
                    } catch (error) {
                        console.error("카카오/저장 에러 발생: ", error);
                        break;
                    }
                } 
            } 
        } 
    } catch (globalError) {
        console.error("전체 프로세스 에러 발생:", globalError);
    } finally {
        await closeDB(); 
    
        console.log("\n\n🎉 모든 데이터 수집 및 DB 적재 프로세스가 종료되었습니다.");
        console.log(`📊 [최종 결산] 카카오 API: 총 ${kakaoCallCount}회 호출`);
        console.log(`📊 [최종 결산] 구글 API: 총 ${googleCallCount}회 호출`);
    }
}

collectAndSaveData();