# 阿里云部署说明

1. 构建前端镜像和后端镜像。
2. 配置 `server/.env` 中的数据库和 AI 服务密钥。
3. 使用 `deploy/docker-compose.prod.yml` 启动服务。
4. Nginx 使用 `deploy/nginx-qiuzhijianli.conf` 转发前端和 API。
