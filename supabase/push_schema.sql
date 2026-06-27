-- ════════════════════════════════════════════════════════════════
--  웹 푸시 알림 구독 저장 테이블
--  Supabase → SQL Editor 에 붙여넣고 RUN 한 번만 실행하세요.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "PushSub" (
  "id"        TEXT PRIMARY KEY,
  "endpoint"  TEXT NOT NULL UNIQUE,   -- 브라우저 푸시 엔드포인트
  "p256dh"    TEXT NOT NULL,
  "auth"      TEXT NOT NULL,
  "label"     TEXT,                   -- 누구/어느 기기인지 메모
  "userName"  TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- anon 키로 직접 접근하므로 RLS 비활성화 (기존 테이블과 동일 정책)
ALTER TABLE "PushSub" DISABLE ROW LEVEL SECURITY;
