import * as adminService from "./admin.service.mjs"
import { collectAndSaveData } from "../../providers/kakaoPlaceCollector.mjs"

/** 동시에 여러 장소 수집 작업이 실행되지 않도록 서버 메모리에서 상태를 관리합니다. */
let isCollecting = false

/** 장소 수집을 비동기로 시작하고 즉시 202 응답을 반환합니다. */
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

/** 통계 카드와 월별 차트 데이터를 함께 반환합니다. */
export async function getUserStats(req, res) {
    try {
        const stats = await adminService.getUserStats()
        return res.status(200).json(stats)
    } catch (error) {
        console.error("관리자 통계 조회 오류: ", error)
        return res.status(500).json({ message: "통계를 불러오지 못했습니다." })
    }
}

/** 가입일 최신순의 사용자 목록을 페이지 단위로 반환합니다. */
export async function getUsers(req, res) {
    try {
        const page = Number(req.query.page) || 1
        const pageSize = Number(req.query.pageSize) || 20
        const status = req.query.status || undefined
        const { users, total } = await adminService.getUsers({ page, pageSize, status })
        return res.status(200).json({ users, total })
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
