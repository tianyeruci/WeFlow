# 增量扫描水位、同步前扫描与 Web 刷新防抖变更记录

## 本次完成

- 已保存执行计划：`docs/invite-scan-sync-watermark-plan-2026-05-22.md`。
- 增量扫描定时任务调整为启动后第 10 分钟开始，之后每 3 分钟执行一次。
- 同步本地数据定时任务调整为启动后第 11 分钟开始，之后每 3 分钟执行一次。
- 检查是否退出群定时任务调整为启动后第 30 分钟开始，之后每 30 分钟执行一次。
- 增量扫描水位从原始事件时间切换为 `rawEvents.updated_at`，并对旧本地 rawEvent 缺失的 `created_at/updated_at` 使用事件时间回填。
- 增量扫描在没有新增 rawEvent 且该群已有 rawEvent 时，会推进该群 `updated_at` 最大的 rawEvent，避免下一轮重复扫同一段空窗口。
- 所有同步入口在真正同步前都会等待或执行一次后台增量扫描；已有同步任务执行中时仍跳过本次同步。
- 移除了应用启动时“扫描完成后自动同步”的回调绑定，避免定时扫描和定时同步频率叠加。
- Web 刷新轮询保留 5 秒一次；main 端先 peek 最新 requested 请求，30 秒冷却内只查不认领，冷却后再认领最新一条并同步。
- 新增内部接口 `GET /api/invite/sync-request/latest`，只查看最新待处理刷新请求，不改变请求状态。
- 新增 Supabase 兼容 SQL：`supabase/raw_events_updated_at_compat_2026_05_22.sql`，包含 `raw_events` 完整结构、幂等补列、回填、索引、注释和 `service_role` 授权。

## 后续修复

- 修复水位改造时误把两处通用当前时间变量替换为 `event.updated_at` 的问题，避免 WeFlow-main 在打开页面或点击按钮时抛出 `ReferenceError: event is not defined`。

## 修改文件

- `WeFlow-main/electron/services/inviteStatsService.ts`
- `WeFlow-main/electron/services/inviteStatsSyncService.ts`
- `WeFlow-main/electron/main.ts`
- `WeFlow-Web/lib/invite-sync-requests.ts`
- `WeFlow-Web/app/api/invite/sync-request/latest/route.ts`
- `supabase/raw_events_updated_at_compat_2026_05_22.sql`
- `docs/invite-scan-sync-watermark-plan-2026-05-22.md`

## 验证结果

- `WeFlow-main`: `npm run typecheck` 通过。
- `WeFlow-Web`: `npm run typecheck` 通过。
- `git diff --check` 通过；仅提示 Windows 工作区中部分文件下次由 Git 触碰时 LF 会替换为 CRLF。

## 剩余风险

- `updated_at` 作为扫描水位后，若微信数据库中出现创建时间早于水位的晚到历史消息，会按计划被跳过。
- Web 刷新冷却状态保存在 WeFlow-main 进程内，应用重启后会重新从无成功同步记录开始判断。
