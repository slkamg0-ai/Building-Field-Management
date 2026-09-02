param(
  [string]$Message = "update"
)

Write-Host "빌드 확인 중..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "빌드 실패. 위 에러 로그를 그대로 복사해서 Claude에게 보여주세요." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "빌드 성공. 커밋 및 배포 중..." -ForegroundColor Green
git add -A
git commit -m $Message
git push

Write-Host ""
Write-Host "배포 트리거됨. Vercel에서 1~2분 후 반영됩니다." -ForegroundColor Green
