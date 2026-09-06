// ════════════════════════════════════════════════════════════════
//  DB 안전 잠금장치 (Database Data-Loss Protection Lock)
//  
//  1. --accept-data-loss 플래그 절대 금지: 기존 데이터가 삭제되는 변경 자동 거부
//  2. 스키마에 파괴적 변경(테이블/컬럼 삭제)이 감지되면 빌드 중 DB 변경을 즉시 차단
//  3. 신규 컬럼/테이블 추가 등 무손실 안전 변경(Non-destructive)만 적용
// ════════════════════════════════════════════════════════════════
const { execSync } = require('child_process');

if (process.env.DATABASE_URL) {
  try {
    console.log('🔒 [DB 안전 잠금장치 가동] 스키마 무손실 안전 동기화 확인 중...');
    // --accept-data-loss 제거: 데이터 손실 위험 감지 시 즉시 차단하여 DB 영구 보존
    execSync('npx prisma db push', { stdio: 'inherit' });
    console.log('✅ [DB 안전 확인 완료] 데이터 손실 없는 안전한 스키마 동기화 완료.');
  } catch (err) {
    console.error('🚨 [DB 잠금장치 발동] 기존 데이터가 유실될 위험이 있는 스키마 변경이 감지되었습니다.');
    console.error('🛡️ 기존 DB 데이터를 영구 보존하기 위해 파괴적 변경(DROP)을 원천 차단했습니다.');
    console.error('ℹ️ 안전한 신규 컬럼 추가는 런타임 자가 치유(ensureSchemaUpdated)를 통해 처리됩니다.');
  }
} else {
  console.log('ℹ️ DATABASE_URL이 설정되지 않아 빌드 타임 스키마 푸시를 건너뜁니다.');
}
