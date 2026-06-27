#!/bin/bash
# ═══════════════════════════════════════════════════
#  현장관리 앱 - Mac 빌드 & Docker Hub 업로드 스크립트
#  사용법: ./deploy.sh          → latest 태그로 빌드
#         ./deploy.sh v1.1.0   → 버전 태그로 빌드
# ═══════════════════════════════════════════════════

DOCKER_USERNAME="prince211"
IMAGE_NAME="field-management"
VERSION=${1:-latest}
FULL_IMAGE="$DOCKER_USERNAME/$IMAGE_NAME"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔨 빌드 시작: $FULL_IMAGE:$VERSION"
echo "  📌 NAS 아키텍처(linux/amd64)로 빌드"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Mac M칩 → NAS(Intel)용 amd64 이미지로 빌드
docker build --platform linux/amd64 -t $FULL_IMAGE:$VERSION .

if [ $? -ne 0 ]; then
  echo "❌ 빌드 실패. 오류를 확인해주세요."
  exit 1
fi

echo ""
echo "📤 Docker Hub에 업로드 중..."
docker push $FULL_IMAGE:$VERSION

# 버전 태그가 latest가 아닐 경우 latest도 함께 업데이트
if [ "$VERSION" != "latest" ]; then
  docker tag $FULL_IMAGE:$VERSION $FULL_IMAGE:latest
  docker push $FULL_IMAGE:latest
  echo "✅ latest 태그도 업데이트 완료"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ 완료! $FULL_IMAGE:$VERSION"
echo ""
echo "  📱 NAS 업데이트 방법 (SSH에서):"
echo "  cd /volume1/docker/Building-Field-Management-main"
echo "  sudo docker-compose pull"
echo "  sudo docker-compose up -d"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
