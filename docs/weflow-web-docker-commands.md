# WeFlow-Web Docker 常用命令

在 `D:\work\WeFlow\WeFlow-Web` 目录下执行。

## 启动 / 重建

```bash
docker compose up -d --build
```

## 停止当前 Compose 项目

```bash
docker compose down
```

## 只重启容器

```bash
docker compose restart
```

## 查看状态

```bash
docker compose ps
docker ps --filter name=weflow-web
```

## 查看日志

```bash
docker compose logs -f
docker compose logs -f weflow-web
```

## 保存日志到文件

```bash
docker compose logs -f 2>&1 | tee -a weflow-web.log
```

如果想覆盖旧文件，把 `-a` 去掉：

```bash
docker compose logs -f 2>&1 | tee weflow-web.log
```

## 进入容器

```bash
docker compose exec weflow-web sh
```

## 查看镜像

```bash
docker image ls weflow-web:latest
```
