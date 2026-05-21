# 增量扫描水位、同步前扫描与 Web 刷新防抖计划

## Summary

- 执行阶段第一步保存本计划到 `docs/invite-scan-sync-watermark-plan-2026-05-22.md`；全部完成后保存变更记录到 `docs/invite-scan-sync-watermark-change-log-2026-05-22.md`。
- 以代码现状为准：本地 `rawEvents` 和远端 `raw_events` 当前已有 `updated_at`，但仍补一份兼容 SQL，保证旧库缺字段时可一键补齐、回填和授权。
- 增量扫描水位改用 `rawEvents.updated_at`；Web 刷新仍每 5 秒查一次远端刷新请求表，但 30 秒内只允许 main 处理一次成功同步，避免多用户连续刷新导致 main 一直扫描/同步。
- 所有同步入口都先执行或等待增量扫描，再同步；扫描完成不再自动触发同步，避免频率叠加。

## Key Changes

- 定时频率：
  - 增量扫描：启动后第 10 分钟首次执行，之后每 3 分钟一次。
  - 同步本地数据：启动后第 11 分钟首次执行，之后每 3 分钟一次。
  - 检查是否退出群：启动后第 30 分钟首次执行，之后每 30 分钟一次。
  - 手动增量扫描、手动同步、手动退群检查入口保留。
- 增量扫描水位：
  - `tagId` 只用于找启用活动下绑定的群；`rawEvents` 水位继续按群维护，不新增 `activity_tag_id`。
  - 每个群起扫时间取该群 `max(rawEvent.updated_at)`。
  - 查询窗口为 `message.createTime > lastUpdatedAt && message.createTime <= scanStartedAt`。
  - 旧 rawEvent 缺 `updated_at/created_at` 时，用 `created_time/source_create_time/invite_time/exit_time` 回填，避免直接填当前时间跳过历史。
  - 若本轮无新增 rawEvent，且该群已有 rawEvent，则把该群 `updated_at` 最大的一条 rawEvent 的 `updated_at` 推进到本次扫描时间并标记 dirty。
  - 若该群历史 rawEvent 为空，则保持首次扫描逻辑，不推进空水位。
- 同步链路：
  - `queueSync` 先判断同步锁；若已有同步在跑，跳过本次同步，不额外触发扫描。
  - 没有同步在跑时，先等待正在执行的增量扫描；若没有扫描在跑，则执行一次后台增量扫描。
  - 增量扫描完成后再执行原同步逻辑，自动同步仍走 dirty 增量，手动同步和 Web 刷新仍按现有 full 参数走全量 upsert。
  - 移除 `main.ts` 中“扫描成功后自动同步”的回调绑定。
- Web 刷新防抖：
  - 保留 5 秒轮询远端请求表。
  - 新增轻量 peek 能力：main 先查是否有最新 `requested` 请求，不修改状态。
  - 若无成功同步记录，或距离最近一次成功本地同步完成时间已超过 30 秒，则调用现有 `/next` 认领最新请求并同步。
  - 若仍在 30 秒冷却内，只查不认领；冷却结束后 `/next` 会认领最新一条，并让旧请求走现有 superseded 逻辑。
  - 成功同步后更新 main 内部最近成功同步完成时间；失败、跳过、同步锁占用不更新时间。
- SQL 与授权文件：
  - 新增 `supabase/raw_events_updated_at_compat_2026_05_22.sql`。
  - 内容包含 `raw_events` 完整表结构声明、`updated_at/created_at` 幂等补列、旧数据回填、必要索引、字段注释、`service_role` 授权。
  - 即使当前库已经有字段，SQL 也应可重复执行且无破坏性。

## Public Interfaces

- Electron IPC 对外签名不变。
- 新增 WeFlow-Web 内部接口：`GET /api/invite/sync-request/latest`，只返回最新待处理刷新请求，不认领、不 supersede。
- 现有 `POST /api/invite/sync-request`、`GET /api/invite/sync-request/next`、`POST /api/invite/sync-request/complete` 行为保持兼容。
- 不改变远端业务表口径：`raw_events` 继续按群共享，不绑定活动标签。

## Test Plan

- `WeFlow-main`: `npm run typecheck`
- `WeFlow-Web`: `npm run typecheck`
- `git diff --check`
- 验收场景：
  - 三个定时器符合 10/3、11/3、30/30 分钟。
  - 已有 rawEvent 且无新邀请/退出系统消息时，只推进该群最大 `updated_at` rawEvent。
  - 有新邀请/退出系统消息时，新增 rawEvent，并保持现有邀请/退群派生逻辑不变。
  - 多个用户短时间点击 Web 刷新时，main 每 5 秒能看到请求，但 30 秒内不重复认领和同步。
  - 第一次 Web 刷新或冷却已过时，main 在下一次 5 秒轮询内即可认领并同步。
  - 同步触发顺序为：等待/执行增量扫描 -> 同步本地数据 -> 回写刷新请求状态。

## Assumptions

- 30 秒冷却只限制 Web 刷新请求的认领处理；本地手动同步和 3 分钟定时同步仍可按自身入口触发。
- “成功同步”包括同步成功但本次没有 dirty payload；被跳过不算成功同步。
- 用 `updated_at` 作为水位后，晚到但 `message.createTime` 早于水位的历史消息会被跳过，这是该水位策略的预期取舍。
