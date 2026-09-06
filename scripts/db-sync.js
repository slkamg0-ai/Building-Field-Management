const { execSync } = require('child_process');

if (process.env.DATABASE_URL) {
  try {
    console.log('🔄 Syncing database schema with Neon PostgreSQL...');
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('✅ Database schema synced successfully.');
  } catch (err) {
    console.warn('⚠️ db push warning (will rely on runtime self-healing):', err.message);
  }
} else {
  console.log('ℹ️ DATABASE_URL not set; skipping build-time db push.');
}
