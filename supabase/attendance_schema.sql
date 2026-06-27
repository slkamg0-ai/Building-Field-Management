-- ════════════════════════════════════════════════════════════════
--  근로자 신원확인 + 출퇴근 관리 기능용 테이블
--  Supabase → SQL Editor 에 붙여넣고 RUN 한 번만 실행하세요.
-- ════════════════════════════════════════════════════════════════

-- ── 근로자(인적사항 + 등록 얼굴) ──────────────────────────────
CREATE TABLE IF NOT EXISTS "Worker" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "phone"          TEXT,
  "company"        TEXT,                 -- 소속 업체
  "jobType"        TEXT,                 -- 직종/공종
  "birthDate"      DATE,                 -- 생년월일
  "gender"         TEXT,                 -- 성별
  "safetyEduDate"  DATE,                 -- 안전교육 이수일
  "basicSafetyEdu" BOOLEAN DEFAULT FALSE,-- 기초안전보건교육 이수 여부
  "photoUrl"       TEXT,                 -- 등록 기준 얼굴 사진
  "faceDescriptor" JSONB,                -- 얼굴 특징벡터(128차원, 자동매칭용)
  "isActive"       BOOLEAN DEFAULT TRUE,
  "createdAt"      TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 출퇴근 기록(하루 1행 / 근로자) ────────────────────────────
CREATE TABLE IF NOT EXISTS "Attendance" (
  "id"               TEXT PRIMARY KEY,
  "workerId"         TEXT NOT NULL REFERENCES "Worker"("id") ON DELETE CASCADE,
  "siteId"           TEXT,                -- 현장 (Site.id)
  "siteName"         TEXT,                -- 현장명 스냅샷
  "date"             DATE NOT NULL,       -- 근무일 (YYYY-MM-DD)

  "checkInAt"        TIMESTAMPTZ,
  "checkInPhotoUrl"  TEXT,
  "checkInLat"       DOUBLE PRECISION,
  "checkInLng"       DOUBLE PRECISION,
  "checkInScore"     DOUBLE PRECISION,    -- 얼굴 유사도 0~1 (1=완전일치)

  "checkOutAt"       TIMESTAMPTZ,
  "checkOutPhotoUrl" TEXT,
  "checkOutLat"      DOUBLE PRECISION,
  "checkOutLng"      DOUBLE PRECISION,
  "checkOutScore"    DOUBLE PRECISION,

  "workMinutes"      INTEGER,             -- 근무시간(분) 자동계산
  "verifyStatus"     TEXT DEFAULT 'REVIEW', -- AUTO(자동통과)/REVIEW(확인필요)/CONFIRMED(관리자확인)/REJECTED
  "note"             TEXT,
  "createdAt"        TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("workerId", "date")
);

CREATE INDEX IF NOT EXISTS "Attendance_date_idx"   ON "Attendance"("date");
CREATE INDEX IF NOT EXISTS "Attendance_siteId_idx" ON "Attendance"("siteId");
CREATE INDEX IF NOT EXISTS "Attendance_worker_idx" ON "Attendance"("workerId");

-- 익명 키(anon)로 접근하는 앱이므로, 기존 테이블과 동일하게 RLS는 끄거나
-- 정책을 열어둡니다. (기존 Site/User 테이블과 동일한 정책을 사용하세요.)
ALTER TABLE "Worker"     DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" DISABLE ROW LEVEL SECURITY;
