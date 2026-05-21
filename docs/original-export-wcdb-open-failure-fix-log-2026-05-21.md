# 原始导出 WCDB 打开失败修复记录（2026-05-21）

## 现象
- 在“导出”模块里创建原始导出任务后，任务可以正常创建。
- 但进入任务中心查看进度时，任务报错：`WCDB 打开失败`
- 这个问题在上一个对话之前就已经存在，不是后续邀请统计 worker 串行修复引入的

## 定位过程
- 原始导出不是走主进程里已经打开的 WCDB，而是走 `WeFlow-main/electron/main.ts` 里的 `exportWorker.ts`
- `exportWorker.ts` 会在独立 worker 中重新引入：
  - `wcdbService`
  - `exportService`
- 失败入口落在 `WeFlow-main/electron/services/exportService.ts` 的 `ensureConnected()`
- `ensureConnected()` 内部会：
  - 读取当前账号 wxid / dbPath / decryptKey
  - 通过 `configService.getAccountDir(dbPath, wxid)` 找账号目录
  - 调用 `wcdbService.open(accountDir, decryptKey)`
- 当 `open()` 返回 `false` 时，导出任务直接报出 `WCDB 打开失败`

## 根因判断
- 原始导出是独立 worker 进程链路，和主进程里的邀请统计、聊天页、其他任务并不是同一条执行线
- 但原来导出 worker 在结束时没有显式释放自己创建的 WCDB 句柄/worker，导出完成后可能残留状态
- `ensureConnected()` 只做了一次打开，没有重试，也没有把 `getLastInitError()` 带到报错里
- 结果就是：
  - 导出任务创建成功
  - 但真正开始执行时，WCDB 打开失败只留下一个很笼统的提示

## 本次修复
### 1. 给导出打开增加重试和更完整的错误
- 文件：`WeFlow-main/electron/services/exportService.ts`
- 做法：
  - `ensureConnected()` 最多重试 3 次
  - 每次失败后短暂等待再试
  - 打开失败时携带 `wcdbService.getLastInitError()` 的详细信息
- 目的：
  - 避免瞬时状态抖动直接导致导出失败
  - 让报错从“WCDB 打开失败”变成更可定位的信息

### 2. 导出 worker 结束时主动关闭自己的 WCDB
- 文件：`WeFlow-main/electron/exportWorker.ts`
- 做法：
  - 在 worker 成功结束后主动 `shutdown()` 自己持有的 `wcdbService`
  - 在异常退出分支里也做同样清理
- 目的：
  - 释放导出 worker 自己打开的 WCDB 句柄
  - 避免后续导出任务继续继承上一次残留状态

### 3. 导出期间临时阻断邀请统计后台任务
- 文件：
  - `WeFlow-main/electron/services/inviteStatsService.ts`
  - `WeFlow-main/electron/services/inviteStatsSyncService.ts`
  - `WeFlow-main/electron/main.ts`
- 做法：
  - 导出任务运行时，后台增量扫描、退群检查、同步/远程轮询会先判断是否被阻断
  - 导出完成后恢复正常
- 目的：
  - 避免导出与后台 WCDB 任务抢同一套原生资源
  - 降低“导出能创建任务，但执行时打开失败”的概率

### 4. 增强 WCDB 初始化日志
- 文件：`WeFlow-main/electron/services/wcdbCore.ts`
- 做法：
  - `wcdb_init` 失败时写入更明确的日志
  - 同时打印 WCDB 内部日志
- 目的：
  - 以后如果再失败，可以直接判断是 `InitProtection`、`wcdb_init`，还是后续 `open_account`

## 结果
- 原始导出链路不再只依赖一次打开
- 导出 worker 会在结束时释放自己的 WCDB
- 导出执行期间会尽量避免被邀请统计后台任务打断
- 后续如果仍失败，日志会比以前更完整，便于继续定位

## 验证
- `npm run typecheck` 通过

## 影响范围
- 只影响 `WeFlow-main` 的导出链路和邀请统计后台任务协作
- 不改表结构
- 不改 Supabase 结构
- 不改导出数据格式
