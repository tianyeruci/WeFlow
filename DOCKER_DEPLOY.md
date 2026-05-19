# WeFlow-Web Docker 部署

这份文档只针对 `WeFlow-Web` 的公开访问和远程同步入口：

- 浏览器访问 `WeFlow-Web`
- `WeFlow-main` 通过 `POST /api/invite/sync` 把数据发过来
- `WeFlow-Web` 再从 Supabase 读取最终统计数据

## 需要的文件

- `WeFlow-Web/Dockerfile`
- `WeFlow-Web/docker-compose.yml`
- `WeFlow-Web/.dockerignore`
- `WeFlow-Web/public/.gitkeep`

## 环境变量

在 `WeFlow-Web/.env` 里填写：

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REMOTE_SYNC_TOKEN=change-this-sync-token
```

说明：

- `SUPABASE_SERVICE_ROLE_KEY` 只放在服务端容器里，不能给浏览器
- `REMOTE_SYNC_TOKEN` 由 `WeFlow-main` 和 `WeFlow-Web` 共用
- `WeFlow-Web` 页面默认不加访问口令，知道地址就能看

## 启动方式

在 `WeFlow-Web` 目录执行：

```bash
docker compose up -d --build
```

默认对外端口是 `3000`，也可以改 `WEFLOW_WEB_PORT`。

## 常用命令

常用命令单独记在：

[`docs/weflow-web-docker-commands.md`](./docs/weflow-web-docker-commands.md)

## 双击构建

如果只是改了样式、页面或前端逻辑，想重新打包镜像，可以直接双击：

`WeFlow-Web/build-image.bat`

它会在项目目录里执行 `docker compose build`，构建完成后保留窗口，方便看日志。

## 用户访问

- 直接访问：`http://你的服务器IP:3000`
- 如果有域名和反向代理，把 `80/443` 转发到容器 `3000`
- 如果前面挂了 Nginx，记得把 `client_max_body_size` 调大一点，否则 `WeFlow-main` 的同步请求可能会被代理层拦住

## WeFlow-main 接入

在 `WeFlow-main` 里把远程同步地址设置成：

```text
http://你的服务器IP:3000/api/invite/sync
```

如果走 HTTPS 和域名，就改成：

```text
https://你的域名/api/invite/sync
```

Token 要和 `REMOTE_SYNC_TOKEN` 保持一致。

## 验证顺序

1. 容器能启动
2. 浏览器能打开 `WeFlow-Web`
3. `WeFlow-main` 能同步成功
4. 页面能从 Supabase 读到最新数据
