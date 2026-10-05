# 阿里云部署说明

## 首次配置

在服务器项目目录执行：

```bash
cp server/.env.example server/.env
```

编辑 `server/.env`，至少填写真实的 `DATABASE_URL`、`JWT_SECRET`、
`ADMIN_TOKEN` 和 `TOAPIS_API_KEY`。发布编号建议填写 Git commit：

```dotenv
APP_RELEASE=<git-commit>
AI_DEFAULT_MODEL=gpt-5.6-sol
AI_OCR_MODEL=gpt-5.6-sol
AI_FALLBACK_MODELS=gpt-5.5,gpt-4o
```

不要提交 `server/.env`。

本地开发可使用仓库根目录的 `docker-compose.yml` 启动自带 PostgreSQL。生产部署不自动创建数据库，必须通过 `DATABASE_URL` 显式连接已备份、受监控的生产 PostgreSQL。发布脚本使用 `/api/ready` 验证数据库连接和 AI 密钥配置，`/api/health` 仅表示 API 进程存活。实时网关连通性可在后端容器运行 `npm run doctor` 检查。

## 构建发布

从仓库根目录执行一键发布脚本：

```bash
./deploy/release.sh
```

Web 镜像同时包含 Nginx 配置，并将 `/api/` 转发到后端容器。后端启动时会自动应用
`database/schema.sql`。脚本会使用当前 Git commit 作为发布编号，并等待就绪接口确认数据库可连接且 AI 密钥已配置；验证不通过时会打印后端日志并返回失败。

生产 Compose 仅将 Web 容器发布到服务器本机的 `127.0.0.1:8080`，避免与宝塔 Nginx
占用的 80/443 端口冲突。在宝塔站点中将域名反向代理到 `http://127.0.0.1:8080`，
公网流量和 HTTPS 证书继续由宝塔 Nginx 处理。

## 发布验收

```bash
curl -fsS https://www.qiuzhijianli.xyz/api/ready
```

返回结果中必须满足（数据库可连接，AI 密钥已配置；不代表上游网关可达）：

```json
{
  "status": "ready",
  "database": { "ready": true },
  "ai": { "configured": true }
}
```

模型和发布编号可另外通过 `/api/health` 查看。`/api/ready` 不调用 AI 供应商，不能用它证明真实模型请求已通过。

查看后端日志：

```bash
docker compose -f deploy/docker-compose.prod.yml logs --tail=200 server
```
