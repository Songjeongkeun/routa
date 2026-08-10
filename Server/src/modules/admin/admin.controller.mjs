import * as adminService from "./admin.service.mjs"
// kakakoAPI 불러오기
import { collectAndSaveData } from "../../providers/kakakoAPI.mjs"

// <========================================
// isCollecting : 이미 돌아가는 중에 버튼을 또 눌러서 중복 실행되는 것을 막아준다.
let isCollecting = false

// collectPlaces : 장소 수집
export async function collectPlaces(req, res) {
    if (isCollecting) {
        return res.status(409).json({ success: false, message: "이미 데이터 수집이 진행 중입니다." })
    }
    isCollecting = true
    res.status(202).json({ success: true, message: "장소 데이터 수집을 시작했습니다. 서버 콘솔에서 진행 상황을 확인하세요." })

    collectAndSaveData()
        .catch((error) => console.error("장소 데이터 수집 실패:", error))
        .finally(() => { isCollecting = false })
}
// ========================================>

/** 통계 카드 3개 + 월별 차트 데이터를 한 번에 모아서 반환 */
export async function getUserStats(req, res) {
    try {
        const stats = await adminService.getUserStats()
        return res.status(200).json(stats)
    } catch (error) {
        console.error("관리자 통계 조회 오류: ", error)
        return res.status(500).json({ message: "통계를 불러오지 못했습니다." })
    }
}

/** 
 * 유저 목록을 가입일 최신순으로 조회
 * 페이지 번호와 한 번에 몇 명씩 받을지 받아서 처리
*/
export async function getUsers(req, res) {
    try {
        const page = Number(req.query.page) || 1
        const pageSize = Number(req.query.pageSize) || 20
        const users = await adminService.getUsers({ page, pageSize })
        return res.status(200).json({ users })
    } catch (error) {
        console.error("유저 목록 조회 오류: ", error)
        return res.status(500).json({ message: "유저 목록을 불러오지 못했습니다." })
    }
}

export async function updateUserStatus(req, res) {
    try {
        const updated = await adminService.updateUserStatus({
            targetUserId: Number(req.params.userId),
            status: req.body.status,
        })
        return res.status(200).json({ userId: updated.user_id, accountStatus: updated.account_status })
    } catch (error) {
        const status = error.status ?? 500
        if (status >= 500) console.error("유저 상태 변경 오류: ", error)
        return res.status(status).json({ message: error.status ? error.message : "상태 변경에 실패했습니다." })
    }
}