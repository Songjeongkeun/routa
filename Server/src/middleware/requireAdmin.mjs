const ADMIN_ERROR = {message: "관리자 권한이 필요합니다."}

export function requireAdmin(req, res, next){
    if (req.user?.is_admin !== true) {
        return res.status(403).json(ADMIN_ERROR)
    }
    return next()
}