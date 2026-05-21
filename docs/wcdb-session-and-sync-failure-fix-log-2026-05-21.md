# WCDB 会话读取与同步失败修复记录（2026-05-21）

## 问题现象
- 点击「增量扫描」时报 `获取会话失败：-2`。
- 点击「同步本地数据」时报 `fetch failed`。
- 点击「检查是否退出群」也会报 `获取会话失败：-2`。
- 刚启动时正常，运行一段时间后开始出现。

## 排查结论
- `getSessions()` 没有像消息游标那样做失效后重开，WCDB 句柄在运行一段时间后可能进入脏状态。
- 同步请求失败时只返回了 `fetch failed`，没有把 endpoint 和底层 cause 打出来，导致无法定位是网络、DNS 还是远端不可达。
- 「检查是否退出群」也会经过同一套群会话/群信息读取链路，所以同一个 `getSessions()` 根因会同时影响它。

## 本次修复
- `WeFlow-main/electron/services/wcdbCore.ts`
  - 为 `getSessions()` 增加失败后自动 `forceReopen()` 的自愈逻辑。
  - 增加 15 秒冷却，避免持续重开抖动。
  - 失败时补充更明确的内部日志。
- `WeFlow-main/electron/services/inviteStatsSyncService.ts`
  - 为 `fetch` 增加两次重试。
  - 同步请求优先使用 Electron `net.fetch`，让主进程同步走 Chromium 网络栈，尽量复用系统代理/网络能力。
  - 同步、轮询刷新请求、完成刷新请求、恢复初始化都走统一的网络失败上下文。
  - 失败时会返回带 endpoint 和底层 cause 的错误信息，方便直接定位。

## 验证结果
- `WeFlow-main` `npm run typecheck` 通过。
- `WeFlow-main` `npm run build` 通过。

## 仍需留意
- 这次改动在 Electron 主进程，必须重启 WeFlow-main 后才会生效。
- 如果远端地址本身不可达，网络请求仍会失败，但现在会直接显示更具体原因。
- 如果 WCDB 本身初始化已损坏，自动重开后仍可能失败，需要再看底层日志。
