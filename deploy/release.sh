#!/bin/sh

set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"

if ! command -v docker >/dev/null 2>&1; then
  echo "错误：服务器未安装 Docker。" >&2
  exit 1
fi

if [ ! -f server/.env ]; then
  echo "错误：缺少 server/.env，请先从 server/.env.example 创建并填写生产配置。" >&2
  exit 1
fi

APP_RELEASE=${APP_RELEASE:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}
export APP_RELEASE

docker compose -f deploy/docker-compose.prod.yml up -d --build --remove-orphans
docker compose -f deploy/docker-compose.prod.yml ps

health_url=${HEALTH_URL:-http://127.0.0.1:8080/api/health}
attempt=1
while [ "$attempt" -le 20 ]; do
  health_response=$(curl -fsS "$health_url" 2>/dev/null || true)
  if printf '%s' "$health_response" | grep -q '"defaultModel":"gpt-5.6-sol"'; then
    echo "发布成功：release=$APP_RELEASE，defaultModel=gpt-5.6-sol"
    printf '%s\n' "$health_response"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "错误：服务未在预期时间内报告 defaultModel=gpt-5.6-sol。" >&2
docker compose -f deploy/docker-compose.prod.yml logs --tail=200 server >&2
exit 1
