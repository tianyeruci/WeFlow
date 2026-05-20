# 轻量远程刷新、本地同步修复与群人数分页变更记录

## 本次完成的功能
- `WeFlow-Web` 数据大屏新增 `刷新最新数据` 按钮。
- `WeFlow-Web` 新增远程刷新请求接口：
  - `POST /api/invite/sync-request`
  - `GET /api/invite/sync-request/next`
  - `POST /api/invite/sync-request/complete`
- `WeFlow-main` 新增 5 秒轮询远程刷新请求能力。
- 本地自动同步调整为服务启动后立即触发一次，之后每 5 分钟触发一次。
- 本地手动同步和 Web 远程触发同步改为全量 upsert；自动定时同步仍使用 dirty 增量。
- `WeFlow-Web` 同步接口会写入 `sync_batches` 同步日志。
- `WeFlow-main` 和 `WeFlow-Web` 数据大屏的群人数展示改为每页 10 条。

## 原来的问题
- Web 页面没有办法主动通知本地 Windows 端把最新数据同步到 Supabase。
- 本地手动同步走 dirty 增量，遇到“先查询本地数据，再修正派生字段”的场景时，如果某些记录没有正确标记 dirty，远端数据不会变化。
- 脏 `group_tag_bindings` 单独同步时，可能没有携带对应活动标签，远端存在外键或视图关联风险。
- 群人数展示只展示前几条，群多时无法在数据大屏页翻页查看。

## 如何更改
- Web 点击 `刷新最新数据` 后，按访问 IP 写入 `sync_batches.status='requested'` 的刷新请求。
- 同一 IP 15 秒内重复点击不会新增请求，会返回剩余冷却秒数。
- 本地端每 5 秒调用 `GET /api/invite/sync-request/next`，使用现有 `REMOTE_SYNC_TOKEN` 鉴权。
- Web 领取接口只返回最新请求，并把旧的待处理请求标记为 `superseded`。
- 本地领取请求后执行一次全量同步，完成后调用 complete 接口写回 `completed` 或 `failed`。
- 全量同步范围是当前账号下邀请统计相关数据：活动标签、群标签绑定、raw events、invite events、quit events、身份绑定、scan logs。
- 同步导出前仍会刷新有效/无效、raw events、群人数、群名等派生数据。
- dirty 增量导出时，脏群绑定会自动带上它引用的活动标签。
- Web dashboard 自动刷新间隔保持 10 秒，用来从 Supabase 拉取已同步后的最新数据。

## 剩余隐患
- 不改表结构的前提下，全量 upsert 只能覆盖和新增，不能自动删除远端孤儿旧数据；如果本地物理删除了记录，远端旧记录可能仍需后续 tombstone 或清理机制处理。
- IP 冷却是轻量限制，不是完整权限体系；同一出口 IP 会共享 15 秒冷却，不同 IP 仍可分别触发请求。
- 本地端必须保持运行，并且远程同步 URL/token 配置正确；否则 Web 只能创建请求，不能真正同步本地数据。
- 同步日志写入 `sync_batches` 是辅助排查，不参与统计视图。
- 如果一次全量同步数据量很大，payload 会比增量同步大；当前继续使用已有分批上传逻辑降低单次请求体大小。

## 验证结果
- `WeFlow-main`: `npm run typecheck` 通过。
- `WeFlow-Web`: `npm run typecheck` 通过。
- `WeFlow-Web`: `npm run build` 通过。
- `git diff --check` 通过，仅有 Windows CRLF 提示。

## 重启后断点续跑复核
- 已检查新增计划、变更记录、Web `sync-request` API 目录和本地同步服务代码均仍在磁盘上。
- 已确认没有 Git 冲突标记残留。
- 重新执行 `WeFlow-main npm run typecheck` 通过。
- 重新执行 `WeFlow-Web npm run typecheck` 通过。
- 重新执行 `WeFlow-Web npm run build` 通过。

## 邀请人数排行榜图片下载
- `WeFlow-main` 数据大屏的“邀请人数排行榜”新增下载图片按钮。
- `WeFlow-Web` 数据大屏的“邀请人数排行榜”新增下载图片按钮。
- 图片使用当前页面已加载的邀请人数排行榜数据生成，不新增后端接口，不改表结构。
- 图片标题格式为 `【群口径】邀请人数排行榜（招募者 N 名，总人数 X）`。
- 下载内容为 PNG 横向柱状图，颜色、排序和数量均来自当前排行榜数据。
- 当当前筛选条件下没有排行榜数据时，会提示暂无数据，不生成空图片。
- 继续验证：`WeFlow-main npx vite build` 通过；`WeFlow-Web npm run build` 通过；两个项目 `npm run typecheck` 通过。
