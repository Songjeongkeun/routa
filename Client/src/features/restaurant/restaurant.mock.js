// 화면 필터의 라벨과 Mock 음식점 데이터의 category 값을 연결합니다.
export const FOOD_CATEGORIES = [
  { value: "ALL", label: "전체" },
  { value: "KOREAN", label: "한식" },
  { value: "JAPANESE", label: "일식" },
  { value: "CHINESE", label: "중식" },
  { value: "WESTERN", label: "양식" },
]

/**
 * 음식점 검색 API가 준비되기 전 화면과 선택 흐름을 검증하기 위한 데이터입니다.
 * petAllowed는 가능/불가능 두 상태만 사용합니다.
 */
export const mockRestaurants = [
  {
    placeId: "restaurant-wooraeok",
    name: "우래옥",
    category: "KOREAN",
    categoryLabel: "한식",
    district: "중구",
    description: "대를 이어온 깊은 맛의 전통 평양냉면과 옛날식 불고기",
    rating: 4.8,
    petAllowed: false,
    imageUrl:
      "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=640&q=85",
  },
  {
    placeId: "restaurant-sushi-aoki",
    name: "스시 아오키",
    category: "JAPANESE",
    categoryLabel: "일식",
    district: "강남구",
    description: "신선한 제철 식재료로 선보이는 정통 일식 오마카세",
    rating: 4.9,
    petAllowed: false,
    imageUrl:
      "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=640&q=85",
  },
  {
    placeId: "restaurant-mongjungheon",
    name: "몽중헌",
    category: "CHINESE",
    categoryLabel: "중식",
    district: "청담동",
    description: "정갈하게 빚어낸 딤섬과 고급 광둥 요리를 즐기는 공간",
    rating: 4.7,
    petAllowed: false,
    imageUrl:
      "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=640&q=85",
  },
  {
    placeId: "restaurant-volpino",
    name: "볼피노",
    category: "WESTERN",
    categoryLabel: "양식",
    district: "신사동",
    description: "생면 파스타와 화덕 피자를 선보이는 이탈리안 다이닝",
    rating: 4.6,
    petAllowed: true,
    imageUrl:
      "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=640&q=85",
  },
  {
    placeId: "restaurant-insadong-chatjip",
    name: "인사동 찻집",
    category: "KOREAN",
    categoryLabel: "한식",
    district: "종로구",
    description: "한옥의 고즈넉한 분위기에서 즐기는 수제 대추차와 한과",
    rating: 4.5,
    petAllowed: true,
    imageUrl:
      "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=640&q=85",
  },
  {
    placeId: "restaurant-saedeuluhouse",
    name: "새들러하우스",
    category: "WESTERN",
    categoryLabel: "양식",
    district: "성동구",
    description: "겉바속촉 버터 풍미가 가득한 오리지널 크로플의 성지",
    rating: 4.7,
    petAllowed: true,
    imageUrl:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=640&q=85",
  },
]
