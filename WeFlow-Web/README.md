# WeFlow 远程用户版

`WeFlow-Web` 是邀请统计的远程普通用户只读版。它可以部署到 Vercel 或类似 Serverless 平台，只读取 Supabase 中的最终统计视图，不读取本地微信数据，也不提供扫描、修复、确认、忽略、编辑或删除入口。

## 功能范围

- 数据大屏：活动标签筛选、核心指标、进群时段、邀请排行榜、群人数、实时动态、排行榜导出。
- 群成员溯源：活动标签、群、成员昵称、时间段、状态、归因、含退群筛选、原始消息查看、溯源导出。
- 不包含：发售群列表、待确认记录、活动标签管理、增量扫描、全局扫描、人工修复。

## 环境变量

Vercel 生产环境需要配置：

```bash
SUPABASE_URL=https://dmbgthvxmnozitczusxj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REMOTE_SYNC_TOKEN=change-this-sync-token
```

浏览器端不会拿到 `SUPABASE_SERVICE_ROLE_KEY`。普通用户只读页面不再需要访问口令；任何知道页面地址的人都可以查看远程统计结果。`REMOTE_SYNC_TOKEN` 只给本地同步程序使用，不要给普通用户。

## Supabase 数据要求

当前 V1 读取两类对象：

- `activity_tags`：活动标签表，建议字段包含 `id`、`tag_name`、`enabled`。
- `final_stat_events`：最终统计视图或等价表，页面和导出统一读取该视图。

`final_stat_events` 建议字段：

```text
event_id, activity_tag_id, group_id, group_name, event_type,
user, wx_id, inviter, inviter_wx_id,
invite_time, exit_time, created_time,
status, valid_flag, delete_flag, raw_content
```

口径要求：

- 如果原始消息存在人工修正，视图返回人工修正后的统计明细。
- 如果没有人工修正，视图返回机器确认的统计明细。
- `pending` 和 `ignored` 不进入大屏统计；`ignored` 不进入溯源展示。
- 一条原始消息被管理员拆分成多条统计明细后，视图返回多条明细。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 验证

```bash
npm run typecheck
npm run build
```

没有配置 Supabase 环境变量时，构建不会失败；运行时 API 会返回清晰配置错误。

构建脚本固定使用 `next build --webpack`，用于避开部分 Windows 环境中 Turbopack 写入 `.next` 临时文件时的权限问题；Vercel 也可以直接使用该脚本。
