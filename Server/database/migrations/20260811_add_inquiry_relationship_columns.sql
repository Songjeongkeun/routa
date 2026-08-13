-- 문의가 어떤 저장 일정에 관한 것인지, 어떤 관리자가 답변했는지를 실제 DB에 남긴다.
-- 이 파일은 이미 존재하는 INQUIRY 행을 보존하는 방식으로 한 번만 적용한다.
BEGIN;

ALTER TABLE public."INQUIRY"
  ADD COLUMN IF NOT EXISTS itinerary_id INTEGER,
  ADD COLUMN IF NOT EXISTS answered_by INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 기존 문의의 수정 시각은 답변 시각이 있으면 그 시각으로, 없으면 작성 시각으로 초기화한다.
UPDATE public."INQUIRY"
SET updated_at = COALESCE(answered_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public."INQUIRY"
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'INQUIRY_itinerary_id_fkey'
      AND conrelid = 'public."INQUIRY"'::regclass
  ) THEN
    -- 저장 일정이 삭제되어도 문의 자체는 보존하고, 연결만 NULL로 바꾼다.
    ALTER TABLE public."INQUIRY"
      ADD CONSTRAINT "INQUIRY_itinerary_id_fkey"
      FOREIGN KEY (itinerary_id) REFERENCES public."COURSE"(course_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'INQUIRY_answered_by_fkey'
      AND conrelid = 'public."INQUIRY"'::regclass
  ) THEN
    -- 답변 관리자 계정이 삭제되어도 답변 내용과 이력은 남긴다.
    ALTER TABLE public."INQUIRY"
      ADD CONSTRAINT "INQUIRY_answered_by_fkey"
      FOREIGN KEY (answered_by) REFERENCES public."USER"(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 사용자별 목록·관리자 상태 필터·일정 연결 조회에 필요한 인덱스다.
CREATE INDEX IF NOT EXISTS "INQUIRY_user_created_at_index"
  ON public."INQUIRY" (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "INQUIRY_status_created_at_index"
  ON public."INQUIRY" (status, created_at DESC);
CREATE INDEX IF NOT EXISTS "INQUIRY_itinerary_id_index"
  ON public."INQUIRY" (itinerary_id)
  WHERE itinerary_id IS NOT NULL;

COMMIT;
