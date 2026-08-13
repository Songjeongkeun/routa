-- 저장 일정은 별도 복사 테이블을 만들지 않고 COURSE의 상태로 관리한다.
-- 추천을 다시 계산할 때 DRAFT만 교체하고 SAVED는 남겨, 사용자가 저장한 일정이 사라지지 않게 한다.
BEGIN;

ALTER TABLE public."COURSE"
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS title VARCHAR(50),
  ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS save_request_id UUID,
  -- ROUTE_SECTION은 장소 쌍별 공용 캐시이므로, 저장 시점의 items·legs·지도 좌표를
  -- TEXT JSON으로 복사해 이후 재추천 또는 경로 캐시 갱신에도 저장 일정을 보존한다.
  ADD COLUMN IF NOT EXISTS saved_snapshot_json TEXT;

-- 기존에 이미 생성된 추천 코스는 사용자가 저장 버튼을 누르기 전까지 DRAFT로 취급한다.
UPDATE public."COURSE"
SET status = 'DRAFT'
WHERE status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'COURSE_status_check'
      AND conrelid = 'public."COURSE"'::regclass
  ) THEN
    ALTER TABLE public."COURSE"
      ADD CONSTRAINT "COURSE_status_check"
      CHECK (status IN ('DRAFT', 'SAVED'));
  END IF;
END $$;

-- 목록 조회와 재추천 시 DRAFT 정리에 쓰는 복합 인덱스다.
CREATE INDEX IF NOT EXISTS "COURSE_plan_status_index"
  ON public."COURSE" (plan_id, status, saved_at DESC);

-- 같은 브라우저 요청이 재전송되어도 저장을 한 번으로 제한한다.
CREATE UNIQUE INDEX IF NOT EXISTS "COURSE_save_request_id_unique"
  ON public."COURSE" (save_request_id)
  WHERE save_request_id IS NOT NULL;

COMMIT;
