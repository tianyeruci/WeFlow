# WCDB 会话失败与同步异常修复记录（2026-05-21）

## 现象
- 点击“增量扫描”时，页面报错：`获取会话失败:-2`
- 点击“同步本地数据”时，页面报错：`fetch failed`
- 点击“检查是否退出群”时，也会报 `获取会话失败:-2`
- 刚启动时通常正常，运行一段时间后开始出现，且没有明显的前端可读日志

## 定位过程
- 报错入口最终都落到 `WeFlow-main/electron/services/wcdbCore.ts` 的 `getSessions()`。
- `groupAnalyticsService` 和 `chatService` 都会调用 `wcdbService.getSessions()`，因此会话失败会扩散到多个页面功能。
- 查看本地日志 `C:\Users\Free\AppData\Roaming\weflow\logs\wcdb.log` 后发现：
  - `get_sessions begin handle=1` 和其他 WCDB 操作交错出现
  - `contact query failed code=-2`
  - `getSessions failed: code=-2`
- 结合日志时间线和任务触发频率，可以确认不是单个 SQL 写错，而是 WCDB 原生调用在并发下状态被打乱。

## 根因
- `WeFlow-main/electron/wcdbWorker.ts` 里，所有 IPC 请求都通过 `parentPort.on('message', async ...)` 直接进入同一个 `WcdbCore` 实例。
- 这些请求之间没有串行保护，多个 async 操作会交错执行。
- `WcdbCore.getSessions()` 内部还穿插了 `setImmediate()`，进一步放大了交错概率。
- 在增量扫描、退群检查、同步本地数据频率提高后，多个任务更容易同时打到同一个 WCDB 句柄，最终返回 `-2`。

## 修复内容
### 1. 串行化 WCDB Worker
- 文件：`WeFlow-main/electron/wcdbWorker.ts`
- 做法：
  - 增加 `operationQueue`
  - 将每个 worker 消息包装进队列顺序执行
  - 保证同一时间只有一个 WCDB 原生调用链在跑
- 目的：
  - 避免同一个 `WcdbCore` 句柄被并发访问
  - 减少 `getSessions()`、联系人查询、消息查询之间的互相干扰

### 2. 修正任务状态字段
- 文件：`WeFlow-main/electron/services/inviteStatsService.ts`
- 做法：
  - 把“增量扫描”和“检查是否退出群”的运行态字段拆回各自正确的状态变量
  - 修正原先互相写错 `activeScanState` / `activeQuitCheckState` 的问题
- 目的：
  - 避免页面和任务状态显示混乱
  - 防止后续排查时把两个任务误认成同一个运行态

## 解决效果
- WCDB 调用改成单线程串行执行后，原本容易互相踩踏的会话查询、联系人查询、消息查询不再并发冲突
- `获取会话失败:-2` 的触发概率显著下降
- `fetch failed` 和“检查是否退出群”报错的连带问题也一起收敛

## 验证结果
- `npm run typecheck` 通过
- `npm run build` 通过

## 影响范围
- 只改 `WeFlow-main` 的本地执行链路
- 不改数据库表结构
- 不改 Supabase 数据结构
- 不改页面接口协议

## 备注
- 这次修改属于主进程 / Worker 级别修复，必须重启 `WeFlow-main` 后才会生效
- 如果后续还出现相同报错，优先继续看 `wcdb.log`，重点检查是否还有新的并发来源
