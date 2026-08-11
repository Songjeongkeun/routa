import * as inquiryRepository from "./inquiry.repository.mjs";

//커스텀 에러: controller에서 이 이름으로 구분해서 상태코드를 정한다
class ServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "VALIDATION" | "NOT_FOUND" | "CONFLICT"
  }
}

const INQUIRY_STATUSES = new Set(["WAITING", "ANSWERED"]);

// 변경: 잘못된 id·status를 PostgreSQL까지 보내 500 오류로 만들지 않고 요청 단계에서 400으로 처리합니다.
function normalizeInquiryId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ServiceError("VALIDATION", "올바른 문의 번호가 아닙니다.");
  }
  return id;
}

function normalizeOptionalItineraryId(value) {
  if (value === undefined || value === null || value === "") return null;

  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ServiceError("VALIDATION", "올바른 저장 일정 번호가 아닙니다.");
  }
  return id;
}

function normalizeStatus(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!INQUIRY_STATUSES.has(value)) {
    throw new ServiceError("VALIDATION", "올바른 문의 상태가 아닙니다.");
  }
  return value;
}

export async function getMyInquiries(userId, { keyword, status }) {
  return inquiryRepository.findInquiriesByUser({ userId, keyword, status: normalizeStatus(status) });
}

/** 변경: 검색·상태 필터와 독립된 "내 문의" 전체 통계를 제공합니다. */
export async function getMyInquirySummary(userId) {
  return inquiryRepository.getInquirySummaryByUser(userId);
}

export async function getMyInquiryDetail(userId, inquiryId) {
  const inquiry = await inquiryRepository.findInquiryByIdAndUser(normalizeInquiryId(inquiryId), userId);
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

  const normalizedItineraryId = normalizeOptionalItineraryId(itineraryId);
  if (normalizedItineraryId) {
    // 변경: DB 외래 키만으로는 "현재 사용자의 SAVED 일정"인지 보장할 수 없어 서비스에서 소유권을 확인합니다.
    const ownedItinerary = await inquiryRepository.findOwnedSavedItinerary({
      userId,
      itineraryId: normalizedItineraryId,
    });
    if (!ownedItinerary) {
      throw new ServiceError("NOT_FOUND", "연결할 저장 일정을 찾을 수 없습니다.");
    }
  }

  const inquiryId = await inquiryRepository.createInquiry({
    userId,
    itineraryId: normalizedItineraryId,
    title: trimmedTitle,
    content: trimmedContent,
  });

  return { inquiryId };
}

export async function getAllInquiries({ status }) {
  return inquiryRepository.findAllInquiries({ status: normalizeStatus(status) });
}

export async function getInquiryDetailForAdmin(inquiryId) {
  const inquiry = await inquiryRepository.findInquiryByIdWithRequester(normalizeInquiryId(inquiryId));
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

  const normalizedInquiryId = normalizeInquiryId(inquiryId);
  const inquiry = await inquiryRepository.findInquiryById(normalizedInquiryId);
  if (!inquiry) {
    throw new ServiceError("NOT_FOUND", "문의를 찾을 수 없습니다.");
  }
  if (inquiry.status === "ANSWERED") {
    // MVP 규칙: 이미 답변된 문의는 재등록 막기 (문서 6번)
    throw new ServiceError("CONFLICT", "이미 답변이 등록된 문의입니다.");
  }

  await inquiryRepository.saveAnswer({ inquiryId: normalizedInquiryId, answerContent: trimmed, adminId });
}

export { ServiceError };
