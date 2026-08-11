/**
 * ==========================================
 * 문의 API의 URL을 관리하는 파일.
 *
 * 이 파일에서는 URL만 정의한다.
 *
 * 실제 비즈니스 로직은 controller에서 처리한다.
 * ==========================================
 */

import { Router } from "express"; // 👈 이 줄을 파일 맨 위에 추가해 주세요!

// Controller 가져오기
import * as inquiryController from "./inquiry.controller.mjs";
import { isAuth } from "../../middleware/auth.mjs"; //현규님 미들웨어 위치에 맞게 수정

const router = Router();

router.use(isAuth); // 이 라우터의 모든 요청은 로그인 필요

router.get("/", inquiryController.getMyInquiries);
router.post("/", inquiryController.createInquiry);
// 변경: 동적 /:inquiryId보다 먼저 두어 /summary를 상세 id로 처리하지 않습니다.
router.get("/summary", inquiryController.getMyInquirySummary);
router.get("/:inquiryId", inquiryController.getMyInquiryDetail);

export default router;
