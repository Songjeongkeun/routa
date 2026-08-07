const GOOGLE_API_KEY = "AIzaSyDQLUUcWCMsScn1ZGMDXM2y5T-Wt5vlie8";
const url = 'https://places.googleapis.com/v1/places:searchText';

export async function GoogleAPI(placeName) {
    const requestBody = { textQuery: placeName, languageCode: "ko" };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_API_KEY,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.photos,places.regularOpeningHours'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 에러: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (data.places && data.places.length > 0) {
            const place = data.places[0]; // 제일 상단에 있는 장소만
            const placeId = place.id;  // 장소 아이디 저장
            const rating = place.rating || null; // 별점 없으면 null
            const photoRef = (place.photos && place.photos.length > 0) ? place.photos[0].name : null;


            // 여기서부터는 운영시간에서 휴무일, 시작 시간, 마감 시간 나누는 로직
            // 추가로 오후 9시면 21시로 바꿈
            let closedDays = [];
            let startTimes = new Set();
            let endTimes = new Set();

            function convertTo24Hour(timeStr) {
                if (!timeStr) return '';
                let isPM = timeStr.includes('오후') || timeStr.includes('밤');
                let isAM = timeStr.includes('오전') || timeStr.includes('새벽');
                let match = timeStr.match(/(\d{1,2}):(\d{2})/);
                
                if (!match) return timeStr.replace(/(오전|오후)\s*/g, '').trim();
                
                let hour = parseInt(match[1], 10);
                let minute = match[2];
                
                if (isPM && hour < 12) hour += 12;
                if (isAM && hour === 12) hour = 0;
                if (!isPM && !isAM && hour > 0 && hour < 12) hour += 12;
                
                return `${String(hour).padStart(2, '0')}:${minute}`;
            }

            if (place.regularOpeningHours?.weekdayDescriptions) {
                place.regularOpeningHours.weekdayDescriptions.forEach(info => {
                    const splitIndex = info.indexOf(':');
                    const day = info.substring(0, splitIndex).trim();
                    const time = info.substring(splitIndex + 1).trim();
                    
                    if (time.includes('휴무') || time.includes('Closed')) {
                        closedDays.push(day);
                    } else if (time.includes('24시간')) {
                        startTimes.add('00:00');
                        endTimes.add('24:00');
                    } else {
                        const times = time.split(',');
                        let rawStart = times[0].split('~')[0].trim();
                        startTimes.add(convertTo24Hour(rawStart));
                        let rawEnd = times[times.length - 1].split('~').pop().trim();
                        endTimes.add(convertTo24Hour(rawEnd));
                    }
                });
            }
            
            // 이미지 url 생성
            const imageURL = photoRef ? `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=400&maxHeightPx=400&key=${GOOGLE_API_KEY}` : null;

            // 정제된 데이터를 객체로 반환
            return {
                google_place_id: placeId,
                rating: rating,
                image_url: imageURL,
                closed_days: closedDays.length ? closedDays.join(', ') : null,
                start_time: [...startTimes][0] || null, 
                end_time: [...endTimes][0] || null,     
                pet_allowed: false 
            };
        } 
        return null;
    } catch (error) {
        console.error(`[구글 API 에러] ${placeName}: `, error);
        return null;
    }
}