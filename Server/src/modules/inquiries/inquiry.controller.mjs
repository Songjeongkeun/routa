//문의 관련 요청을 처리하는 controller

// GET/api/inquiries


import * as inquiryService from "./inquiry.service.mjs";


import { ServiceError } from "./inquiry.service.mjs";

// 공통 응답 형식 
function ok(res, data) {
  return res.status(200).json({ success: true, data });
}
function created(res, data) {
  return res.status(201).json({ success: true, data });
}
function handleError(res, error) {
  if (error instanceof ServiceError) {
    const statusMap = { VALIDATION: 400, NOT_FOUND: 404, CONFLICT: 409 };
    return res.status(statusMap[error.code] ?? 400).json({
      success: false,
      message: error.message,
    });
  }
  console.error(error);
  return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
}

// GET /api/inquiries
export async function getMyInquiries(req, res) {
  try {
    const userId = req.userId; // 인증 미들웨어가 넣어준다고 가정
    const { keyword, status } = req.query;
    const inquiries = await inquiryService.getMyInquiries(userId, { keyword, status });
    return ok(res, inquiries);
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/inquiries/:inquiryId
export async function getMyInquiryDetail(req, res) {
  try {
    const userId = req.userId;
    const { inquiryId } = req.params;
    const inquiry = await inquiryService.getMyInquiryDetail(userId, inquiryId);
    return ok(res, inquiry);
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /api/inquiries
export async function createInquiry(req, res) {
  try {
    const userId = req.userId;
    const { title, content, itineraryId } = req.body;
    const result = await inquiryService.createInquiry(userId, { title, content, itineraryId });
    return created(res, result);
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/admin/inquiries
export async function getAllInquiries(req, res) {
  try {
    const { status } = req.query;
    const inquiries = await inquiryService.getAllInquiries({ status });
    return ok(res, inquiries);
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/admin/inquiries/:inquiryId
export async function getInquiryDetailForAdmin(req, res) {
  try {
    const { inquiryId } = req.params;
    const inquiry = await inquiryService.getInquiryDetailForAdmin(inquiryId);
    return ok(res, inquiry);
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /api/admin/inquiries/:inquiryId/reply
export async function replyToInquiry(req, res) {
  try {
    const adminId = req.userId;
    const { inquiryId } = req.params;
    const { answerContent } = req.body;
    await inquiryService.replyToInquiry(adminId, inquiryId, answerContent);
    return ok(res, { inquiryId });
  } catch (error) {
    return handleError(res, error);
  }
}