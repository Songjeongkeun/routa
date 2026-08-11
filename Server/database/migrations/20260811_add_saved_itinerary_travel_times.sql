-- 저장 일정은 이후 TRIP_PLAN이 수정되어도 원래 여행 날짜를 유지해야 한다.
-- 따라서 SAVED로 확정된 시점의 시작·종료 시각을 COURSE에 별도로 보관한다.
BEGIN;

ALTER TABLE public."COURSE"
  ADD COLUMN IF NOT EXISTS saved_travel_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS saved_travel_end_time TIMESTAMPTZ;

-- 이미 저장된 일정도 saved_snapshot_json에 보관된 날짜·시각을 우선 복원한다.
-- 과거 데이터가 비정상 JSON이거나 해당 값이 없다면, 기존처럼 TRIP_PLAN 시각을 안전한 대체값으로 사용한다.
DO $$
DECLARE
  saved_course RECORD;
  snapshot JSONB;
  snapshot_start_time TIMESTAMPTZ;
  snapshot_end_time TIMESTAMPTZ;
BEGIN
  FOR saved_course IN
    SELECT
      course.course_id,
      course.saved_snapshot_json,
      plan.start_time AS plan_start_time,
      plan.end_time AS plan_end_time
    FROM public."COURSE" AS course
    JOIN public."TRIP_PLAN" AS plan ON plan.plan_id = course.plan_id
    WHERE course.status = 'SAVED'
      AND (course.saved_travel_start_time IS NULL OR course.saved_travel_end_time IS NULL)
  LOOP
    snapshot_start_time := saved_course.plan_start_time;
    snapshot_end_time := saved_course.plan_end_time;

    BEGIN
      snapshot := saved_course.saved_snapshot_json::JSONB;

      IF (snapshot ->> 'travelDate') ~ '^\d{4}-\d{2}-\d{2}$'
        AND (snapshot ->> 'startTime') ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
        snapshot_start_time := (
          (snapshot ->> 'travelDate') || 'T' || (snapshot ->> 'startTime') || ':00+09:00'
        )::TIMESTAMPTZ;
      END IF;

      IF (snapshot ->> 'travelDate') ~ '^\d{4}-\d{2}-\d{2}$'
        AND (snapshot ->> 'endTime') ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
        snapshot_end_time := (
          (snapshot ->> 'travelDate') || 'T' || (snapshot ->> 'endTime') || ':00+09:00'
        )::TIMESTAMPTZ;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- 저장 스냅샷이 없거나 읽을 수 없으면 위에서 준비한 계획 시각을 그대로 사용한다.
      NULL;
    END;

    UPDATE public."COURSE"
    SET
      saved_travel_start_time = COALESCE(saved_travel_start_time, snapshot_start_time),
      saved_travel_end_time = COALESCE(saved_travel_end_time, snapshot_end_time)
    WHERE course_id = saved_course.course_id;
  END LOOP;
END $$;

-- 지난·다가오는 여행 목록의 기간 필터와 정렬에 사용하는 인덱스다.
CREATE INDEX IF NOT EXISTS "COURSE_saved_travel_period_index"
  ON public."COURSE" (status, saved_travel_start_time, saved_travel_end_time);

COMMIT;
