# WeFlow-main 定时任务并发与节流重构变更记录（2026-05-21）

## 本次修改
- `WeFlow-main/electron/services/inviteStatsService.ts`
  - 增量扫描与退群检查拆成两把独立运行锁。
  - 同类型任务忙时改为 `skipped` 静默跳过。
  - 退群检查首次触发改为启动后 1 小时，之后每 1 小时一次。
  - 运行态查询与大屏状态改为分别返回扫描/退群的运行状态。
  - 恢复初始化增加对退群检查忙态的拦截。
- `WeFlow-main/electron/services/inviteStatsSyncService.ts`
  - 同步本地数据改为统一单锁，忙时不再排队。
  - 自动同步改为启动后 5 分钟首次执行，之后每 30 秒一次。
  - 远端刷新请求在本地同步忙时会直接完成当前请求，不再挂起等待队列。
- `WeFlow-main/src/pages/InviteStatsPage.tsx`
  - 页面端拆分扫描/退群检查状态。
  - 两个按钮按各自忙闲状态独立控制。
  - 忙时不再弹“已有任务正在运行”的提示。
  - 任务结束后仍会自动刷新大屏与列表。
- `WeFlow-main/src/types/electron.d.ts`
  - 补充 `skipped`、`scanRunning`、`quitCheckRunning` 等返回字段。
- `docs/weflow-main-concurrency-throttle-plan-2026-05-21.md`
  - 保存了完整执行计划。

## 原来问题
- 增量扫描和退群检查共用同一把锁，导致一个任务在跑时另一个也被挡住。
- 同步本地数据采用“忙时排队”语义，导致定时与手动触发无法真正按节拍执行。
- 页面端只认一个总 `running`，视觉上把两类任务绑死了。

## 现在的行为
- 同类型任务运行中时，调用方直接收到 `skipped`，不排队，不补跑。
- 增量扫描与退群检查可互不阻塞。
- 自动同步、手动同步、远端触发同步统一走同一把同步锁。

## 隐患与注意事项
- 两类任务现在可以并发改同一份本地数据对象，后续如果出现偶发顺序问题，再看是否要加更细的写入协调。
- 远端刷新请求在本地同步忙时会被标记为已处理但失败，避免请求悬挂。
- 构建过程仍会提示 Vite / electron-builder 的既有警告，但不影响当前这轮改动通过。

## 验证
- `npm run typecheck` 通过
- `npm run build` 通过
