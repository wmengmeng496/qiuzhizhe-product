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

## 构建发布

从仓库根目录执行一键发布脚本：

```bash
./deploy/release.sh
```

Web 镜像同时包含 Nginx 配置，并将 `/api/` 转发到后端容器。后端启动时会自动应用
`database/schema.sql`。脚本会使用当前 Git commit 作为发布编号，并等待健康接口确认默认模型
已经切换为 `gpt-5.6-sol`；验证不通过时会打印后端日志并返回失败。

生产 Compose 仅将 Web 容器发布到服务器本机的 `127.0.0.1:8080`，避免与宝塔 Nginx
占用的 80/443 端口冲突。在宝塔站点中将域名反向代理到 `http://127.0.0.1:8080`，
公网流量和 HTTPS 证书继续由宝塔 Nginx 处理。

## 发布验收

```bash
curl -fsS https://www.qiuzhijianli.xyz/api/health
```

返回结果中必须满足：

```json
{
  "status": "ok",
  "release": "本次发布编号",
  "ai": {
    "configured": true,
    "defaultModel": "gpt-5.6-sol",
    "ocrModel": "gpt-5.6-sol"
  }
}
```

如果模型仍是旧值，说明后端容器没有使用本次镜像或 `server/.env` 仍保留旧配置。

查看后端日志：

```bash
docker compose -f deploy/docker-compose.prod.yml logs --tail=200 server
```
