# WeFlow-Web 上下文压缩

## 1. 这是什么

`WeFlow-Web` 是当前仓库里的远程 Web 端项目，目录在 `D:\work\WeFlow\WeFlow-Web`。

它目前定位为： 

- 基于 `Next.js 16 + React 18 + TypeScript`
- 面向“邀请统计远程用户版”的只读 Web 应用
- 可部署到 `Vercel` 这类 Serverless 平台
- 不读取本地微信数据
- 通过远程数据库 / 远程 API 读取邀请统计结果

目前它已经不是纯 Demo，已经有基础页面和 API。

## 2. 当前代码结构

关键目录：

- `app/page.tsx`
  - 主页面
  - 当前只有两个视图：`数据大屏`、`群成员溯源`
- `app/api/invite/*`
  - 远程读取与导出接口
- `app/api/invite/sync/route.ts`
  - 本地 WeFlow 向远端同步数据的入口
- `lib/invite-data.ts`
  - 从远程表 / 视图读数据并组装 dashboard、trace
- `lib/invite-sync.ts`
  - 处理同步写入
- `lib/supabase-rest.ts`
  - Supabase REST 封装
- `types/invite.ts`
  - 页面和接口的核心类型

## 3. 当前已实现能力

### 3.1 页面

`app/page.tsx` 当前已经实现：

- 顶部导航两个页签：
  - `数据大屏`
  - `群成员溯源`
- 活动标签选择
- 数据大屏：
  - 指标卡
  - 进群时段分布
  - 邀请人数排行榜
  - 群人数展示
  - 实时动态
  - 排行榜群筛选
  - 排行榜时间范围筛选
  - 排行榜导出
- 群成员溯源：
  - 群筛选
  - 成员昵称筛选
  - 时间范围筛选
  - 状态筛选
  - 归因筛选
  - 含退群筛选
  - 导出
  - 原始消息弹窗

### 3.2 API

当前已存在接口：

- `GET /api/invite/tags`
- `GET /api/invite/dashboard`
- `GET /api/invite/member-trace`
- `GET /api/invite/export/ranking`
- `GET /api/invite/export/member-trace`
- `POST /api/invite/sync`

其中：

- 前 5 个是远程只读查询 / 导出接口
- `POST /api/invite/sync` 是本地 WeFlow 往远端同步数据的入口

## 4. 当前数据口径

### 4.1 读取口径

`lib/invite-data.ts` 当前的读取方式：

- 活动标签读 `activity_tags`
- 大屏和成员溯源主要读 `final_stat_events`

`final_stat_events` 当前被当成“最终展示口径”：

- 大屏统计从这里算
- 排行榜从这里算
- 成员溯源从这里算
- 导出也从这里算

这和文档方向是一致的：页面统一读“最终统计视图”。

### 4.2 Dashboard 当前逻辑

`getDashboard()` 当前会：

- 读取当前标签下 `final_stat_events`
- 排除 `pending / ignored`
- 用 `invite_time` 的邀请事件生成：
  - 总成员数
  - 含退群总成员数
  - 今日新增
  - 进群时段分布
  - 邀请排行榜
  - 群人数排行
  - 最近动态

排行榜支持：

- `rankingGroupId`
- `rankingStart`
- `rankingEnd`

注意：这些筛选只影响排行榜，不影响整张大屏其他模块。

### 4.3 Member Trace 当前逻辑

`getMemberTrace()` 当前支持：

- `groupId`
- `keyword`
- `startTime`
- `endTime`
- `status`
- `attribution`
- `includeQuit`

映射规则：

- `status = pending` -> 待确认
- `delete_flag = 1` 或 `event_type = exit` 或有 `exit_time` -> 退出
- 其他 -> 未退出

- `valid_flag = -1` -> 无效
- `status = pending` -> 待确认
- 其他 -> 有效

## 5. 当前同步实现

`POST /api/invite/sync` 会要求同步 token，然后调用 `lib/invite-sync.ts`。

当前同步 payload 包含：

- `activityTags`
- `groupTagBindings`
- `inviteEvents`
- `quitEvents`
- `memberIdentityBindings`
- `scanLogs`

### 5.1 当前同步策略的特点

当前 `syncInvitePayload()` 是按 `accountScope` 整体替换：

1. 先删除该 `account_scope` 下面的远端旧数据
2. 再整批 upsert 新数据

删除顺序包括：

- `scan_logs`
- `member_identity_bindings`
- `quit_events`
- `invite_events`
- `group_tag_bindings`
- `activity_tags`

这说明：

- 现在的 `WeFlow-Web` 更接近“远程只读展示 + 粗粒度同步”的第一版
- 还没有完成“远程数据库作为唯一事实源，并保留人工修复结果不被后续同步覆盖”的最终方案

## 6. 和后续目标的偏差

结合仓库内已有文档，当前实现和目标之间最关键的差异有这些：

### 6.1 远端事实源方向已明确，但代码还没完全对齐

文档已经明确：

- 远程数据库应作为唯一事实源
- 本地 WeFlow 负责扫描微信系统消息
- 本地把“原始消息 + 机器解析结果”同步到远端
- 远程管理员 / 本地管理员都应读写同一套远程数据
- 页面展示统一读取最终统计视图

但当前 `WeFlow-Web` 还没有完整覆盖这些层次，尤其缺少：

- 原始消息层与最终统计层的完整分层落地
- 人工修复层不会被本地同步覆盖的机制
- 远程管理端页面与写接口

### 6.2 当前同步策略会覆盖人工修复

这是当前最重要的结构性风险。

因为现有同步是“整 scope 删除再重写”，如果后面远端加了：

- 待确认处理
- 人工拆分
- 替换机器解析结果
- 忽略原始消息

那么这些人工修复结果会被后续本地同步冲掉。

所以后续一定要改成：

- 原始消息层 upsert
- 机器解析层 upsert
- 人工修复层单独存储
- 最终统计视图按“人工优先、机器兜底”生成

## 7. 仓库内与 WeFlow-Web 强相关的文档

最值得继续参考的文件：

- `docs/需求文档远程用户.md`
  - 远程普通用户版需求
- `docs/需求文档远程管理.md`
  - 远程管理版需求
- `docs/邀请统计远程版执行计划.md`
  - 本地扫描调整、远端数据分层、同步、远程用户版、远程管理版的整体计划
- `docs/邀请统计远程用户Demo.html`
  - 远程用户版页面 Demo
- `docs/邀请统计远程管理Demo.html`
  - 远程管理版页面 Demo
- `docs/邀请统计Demo.html`
  - 本地邀请统计原始视觉参考

## 8. 当前远程版产品边界

### 8.1 远程用户版

文档要求的远程用户版：

- 保留：
  - 数据大屏
  - 群成员溯源
- 移除：
  - 发售群列表
  - 待确认记录
  - 活动标签编辑/删除/新增
  - 增量扫描 / 全局扫描
  - 任何会改数据的入口

### 8.2 远程管理版

文档要求的远程管理版：

- 基本相当于远程操作完整邀请统计
- 但数据源不是本地微信数据库
- 数据源是远程数据库
- 本地继续负责扫描和同步
- 远程管理端负责查看、修复、确认、拆分、忽略、审计

## 9. 当前用户最近明确过的 UI 方向

和 `WeFlow-Web` 最相关、需要记住的最近要求：

1. 参考 `docs/邀请统计远程用户Demo.html`
2. 远程用户版整体布局尽量沿用现有邀请统计视觉
3. 用户刚明确要求：
   - 移除左侧品牌区最左方勾选图标
   - 移除右上“只读访问”
   - 移除“数据来自远程最终统计视图，当前账号无编辑和扫描权限”等提示文案
4. 用户之前还要求先本地跑起来查看效果

如果后面继续做远程用户版，这几条应该直接作为当前 UI 基线。

## 10. 环境与运行

`WeFlow-Web/package.json` 关键脚本：

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run typecheck`

当前 `build` 使用：

- `next build --webpack`

这通常是为了避开部分 Windows 环境下 Turbopack 写 `.next` 的权限问题。

## 11. 当前环境变量

从 `README.md` 可以确认当前项目依赖：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REMOTE_SYNC_TOKEN`

含义大致是：

- `SUPABASE_URL`：远端数据库地址
- `SUPABASE_SERVICE_ROLE_KEY`：服务端读写远端数据库
- `REMOTE_SYNC_TOKEN`：本地 WeFlow 调用 `/api/invite/sync` 的认证

## 12. 一句话判断当前状态

当前 `WeFlow-Web` 已经有“远程用户版第一版”的页面和只读接口雏形，也已经有本地到远端的同步入口；但同步策略仍然偏粗，会覆盖未来的人工修复层，因此它还不等于最终的“远程单一事实源架构”。

## 13. 后续接手时最重要的三件事

1. 不要继续沿用“整 scope 删除再重写”去承接远程管理能力。
2. 页面展示继续统一读 `final_stat_events` 或等价最终视图。
3. 本地扫描、远端机器解析、远端人工修复、最终展示四层必须分开。
