import * as inquiryRepository from "./inquiry.repository.mjs";

//커스텀 에러: controller에서 이 이름으로 구분해서 상태코드를 정한다
class ServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "VALIDATION" | "NOT_FOUND" | "CONFLICT"
  }
}

export async function getMyInquiries(userId, { keyword, status }) {
  return inquiryRepository.findInquiriesByUser({ userId, keyword, status });
}

export async function getMyInquiryDetail(userId, inquiryId) {
  const inquiry = await inquiryRepository.findInquiryByIdAndUser(inquiryId, userId);
  if (!inquiry) {
    // 존재하지 않거나 남의 문의 -> 항상 404로 통일 (문서 6번 권장사항)
    throw new ServiceError("NOT_FOUND", "문의를 찾을 수 없습니다.");
  }
  return inquiry;
}

export async function createInquiry(userId, { title, content, itineraryId }) {
  const trimmedTitle = (title ?? "").trim();
  const trimmedContent = (content ?? "").trim();

  if (!trimmedTitle) {
    throw new ServiceError("VALIDATION", "제목을 입력해 주세요.");
  }
  if (trimmedTitle.length > 50) {
    throw new ServiceError("VALIDATION", "제목은 최대 50자까지 입력할 수 있습니다.");
  }
  if (!trimmedContent) {
    throw new ServiceError("VALIDATION", "내용을 입력해 주세요.");
  }

  const inquiryId = await inquiryRepository.createInquiry({
    userId,
    itineraryId,
    title: trimmedTitle,
    content: trimmedContent,
  });

  return { inquiryId };
}

export async function getAllInquiries({ status }) {
  return inquiryRepository.findAllInquiries({ status });
}

export async function getInquiryDetailForAdmin(inquiryId) {
  const inquiry = await inquiryRepository.findInquiryByIdWithRequester(inquiryId);
  if (!inquiry) {
    throw new ServiceError("NOT_FOUND", "문의를 찾을 수 없습니다.");
  }
  return inquiry;
}

export async function replyToInquiry(adminId, inquiryId, answerContent) {
  const trimmed = (answerContent ?? "").trim();
  if (!trimmed) {
    throw new ServiceError("VALIDATION", "답변 내용을 입력해 주세요.");
  }

  const inquiry = await inquiryRepository.findInquiryById(inquiryId);
  if (!inquiry) {
    throw new ServiceError("NOT_FOUND", "문의를 찾을 수 없습니다.");
  }
  if (inquiry.status === "ANSWERED") {
    // MVP 규칙: 이미 답변된 문의는 재등록 막기 (문서 6번)
    throw new ServiceError("CONFLICT", "이미 답변이 등록된 문의입니다.");
  }

  await inquiryRepository.saveAnswer({ inquiryId, answerContent: trimmed, adminId });
}

export { ServiceError };