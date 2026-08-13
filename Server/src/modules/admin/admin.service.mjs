import * as userRepository from "../users/user.repository.mjs"

const VALID_STATUSES = ["ACTIVE", "DORMANT", "WITHDRAWN"]

/** 통계 카드 3개 + 월별 차트 데이터를 한 번에 모아서 반환 */
export async function getUserStats() {
    const [totalUsers, newUsersToday, activeUsers, monthlyTrend] = await Promise.all([
        userRepository.countUsers(),
        userRepository.countNewUsersToday(),
        userRepository.countActiveUsers(),
        userRepository.findMonthlyUserTrend(6),
    ])
    return { totalUsers, newUsersToday, activeUsers, monthlyTrend }
}

/** 유저 목록 조회 (페이지네이션 지원)*/
export async function getUsers({ page = 1, pageSize = 20, status } = {}) {
    const offset = (page - 1) * pageSize
    const [users, total] = await Promise.all([
        userRepository.findUsers({ limit: pageSize, offset, status }),
        userRepository.countUsersByStatus(status),
    ])
    return { users, total }
}

/** 유저 상태 변경 */
export async function updateUserStatus({ targetUserId, status }) {
    // 테이블 제약조건 check을 걸어두지 않았으므로, 서비스 레이어에서 유효한 상태값인지 검증
    if (!VALID_STATUSES.includes(status)) {
        const error = new Error("올바르지 않은 상태값입니다.")
        error.status = 400
        throw error
    }

    const existing = await userRepository.findAccountStatusById(targetUserId)
    if (!existing) {
        const error = new Error("대상 유저를 찾을 수 없습니다.")
        error.status = 404
        throw error
    }

    return userRepository.updateAccountStatus(targetUserId, status)
}