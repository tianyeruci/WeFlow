# WeFlow-main 同步 Supabase 表结构与授权说明

> 范围：梳理 `WeFlow-main` 本地邀请统计数据同步到 Supabase 时，使用的远端表结构、视图和授权。
> 结论：当前同步链路对应的是 **v2 raw_events 结构**，不是旧版 `init_invite_stats.sql`。

## 1. 同步链路

本地数据来源：
- `WeFlow-main/electron/services/inviteStatsService.ts`

远端写入入口：
- `WeFlow-Web/lib/invite-sync.ts`
- `WeFlow-Web/app/api/invite/sync/route.ts`
- `WeFlow-Web/app/api/invite/reset/route.ts`

本地同步时上送的 payload 字段：
- `activityTags`
- `groupTagBindings`
- `rawEvents`
- `inviteEvents`
- `quitEvents`
- `memberIdentityBindings`
- `scanLogs`

对应的 Supabase 写入表：
- `activity_tags`
- `group_tag_bindings`
- `raw_events`
- `invite_events`
- `quit_events`
- `member_identity_bindings`
- `scan_logs`
- `sync_batches`

只读视图：
- `final_stat_events`
- `effective_invite_events`

## 2. 当前使用的表结构

### 2.1 `activity_tags`

字段：
- `id`
- `account_scope`
- `name`
- `enabled`
- `deleted`
- `sort_order`
- `remark`
- `sync_status`
- `sync_error`
- `last_sync_at`
- `created_at`
- `updated_at`
- `raw_json`

索引/约束：
- 主键：`id`
- 索引：`account_scope`、`enabled`、`sync_status`

### 2.2 `group_tag_bindings`

字段：
- `id`
- `account_scope`
- `group_id`
- `group_name`
- `activity_tag_id`
- `enabled`
- `deleted_at`
- `last_created_time`
- `last_invite_time`
- `last_exit_time`
- `last_scan_at`
- `member_count`
- `scan_status`
- `scan_error`
- `sync_status`
- `sync_error`
- `last_sync_at`
- `created_at`
- `updated_at`
- `raw_json`

索引/约束：
- 主键：`id`
- 唯一索引：`(account_scope, group_id)`
- 索引：`activity_tag_id`、`group_id`、`enabled`、`sync_status`

### 2.3 `raw_events`

字段：
- `id`
- `account_scope`
- `dedup_key`
- `event_type`
- `group_id`
- `group_name`
- `member_name`
- `member_wxid`
- `related_name`
- `related_wxid`
- `join_type`
- `quit_type`
- `status`
- `valid_flag`
- `delete_flag`
- `created_time`
- `invite_time`
- `exit_time`
- `source_message_id`
- `source_local_id`
- `source_create_time`
- `raw_message`
- `parsed_content`
- `confidence`
- `sync_status`
- `sync_error`
- `last_sync_at`
- `created_at`
- `updated_at`
- `raw_json`

索引/约束：
- 主键：`id`
- 唯一索引：`(account_scope, dedup_key)`
- 索引：`(account_scope, group_id, created_time)`、`(account_scope, group_id, invite_time)`、`(account_scope, group_id, exit_time)`、`event_type`、`member_wxid`、`related_wxid`、`sync_status`
- `event_type` 只允许 `invite` / `quit`

### 2.4 `invite_events`

字段：
- `id`
- `account_scope`
- `dedup_key`
- `activity_tag_id`
- `group_id`
- `group_name`
- `member_name`
- `member_wxid`
- `inviter_name`
- `inviter_wxid`
- `status`
- `valid_flag`
- `delete_flag`
- `created_time`
- `invite_time`
- `exit_time`
- `source_message_id`
- `source_local_id`
- `source_create_time`
- `raw_message`
- `confirm_source`
- `feishu_record_id`
- `sync_status`
- `sync_error`
- `last_sync_at`
- `created_at`
- `updated_at`
- `raw_json`

索引/约束：
- 主键：`id`
- 唯一索引：`(account_scope, dedup_key)`，且 `dedup_key` 非空时才生效
- 索引：`activity_tag_id`、`group_id`、`member_wxid`、`inviter_wxid`、`invite_time`、`created_time`、`sync_status`

### 2.5 `quit_events`

字段：
- `id`
- `account_scope`
- `dedup_key`
- `activity_tag_id`
- `group_id`
- `group_name`
- `member_name`
- `member_wxid`
- `operator_name`
- `operator_wxid`
- `status`
- `valid_flag`
- `delete_flag`
- `created_time`
- `invite_time`
- `exit_time`
- `source_message_id`
- `source_local_id`
- `source_create_time`
- `raw_message`
- `confirm_source`
- `feishu_record_id`
- `sync_status`
- `sync_error`
- `last_sync_at`
- `created_at`
- `updated_at`
- `raw_json`

索引/约束：
- 主键：`id`
- 唯一索引：`(account_scope, dedup_key)`，且 `dedup_key` 非空时才生效
- 索引：`activity_tag_id`、`group_id`、`member_wxid`、`operator_wxid`、`exit_time`、`created_time`、`sync_status`

### 2.6 `member_identity_bindings`

字段：
- `id`
- `account_scope`
- `activity_tag_id`
- `group_id`
- `display_name`
- `wxid`
- `remark_name`
- `nick_name`
- `binding_type`
- `source`
- `sync_status`
- `sync_error`
- `last_sync_at`
- `created_at`
- `updated_at`
- `raw_json`

索引/约束：
- 主键：`id`
- 索引：`group_id`、`wxid`、`display_name`、`sync_status`

### 2.7 `scan_logs`

字段：
- `id`
- `account_scope`
- `activity_tag_id`
- `group_id`
- `scan_mode`
- `status`
- `started_at`
- `finished_at`
- `scanned_messages`
- `new_invite_events`
- `new_quit_events`
- `message`
- `error_text`
- `operator_name`
- `sync_status`
- `sync_error`
- `last_sync_at`
- `created_at`
- `updated_at`
- `raw_json`

索引/约束：
- 主键：`id`
- 索引：`activity_tag_id`、`group_id`、`status`、`started_at`、`sync_status`

### 2.8 `sync_batches`

字段：
- `id`
- `account_scope`
- `source_client`
- `status`
- `activity_tags_count`
- `group_tag_bindings_count`
- `raw_events_count`
- `invite_events_count`
- `quit_events_count`
- `member_identity_bindings_count`
- `scan_logs_count`
- `error_text`
- `started_at`
- `finished_at`
- `raw_json`

索引/约束：
- 主键：`id`
- 索引：`account_scope`、`status`

用途：
- 记录一次远端同步或网页刷新请求的批次状态和计数。

## 3. 只读视图

### `final_stat_events`

用途：
- 统一聚合邀请/退群事件展示。

在 v2 结构中，它从 `raw_events`、`group_tag_bindings`、`activity_tags` 组合生成。

### `effective_invite_events`

用途：
- 过滤后的有效邀请事件视图。

规则：
- `event_type = 'invite'`
- `status = 'confirmed'`
- `valid_flag = 1`

## 4. 授权

当前仓库中能看到的授权只有 `service_role`：

- `grant usage on schema public to service_role;`
- 所有可写表都授予 `select, insert, update, delete`
- 两个视图只授予 `select`

具体范围：
- `activity_tags`
- `group_tag_bindings`
- `raw_events`
- `invite_events`
- `quit_events`
- `member_identity_bindings`
- `scan_logs`
- `sync_batches`
- `final_stat_events`
- `effective_invite_events`

未看到：
- `anon` 授权
- `authenticated` 授权
- RLS policy 配置

## 5. 旧版结构说明

`supabase/init_invite_stats.sql` 是旧版结构，主要差异：
- 没有 `raw_events`
- 没有 `sync_batches`
- 没有大部分 `sync_status / sync_error / last_sync_at` 字段
- `group_tag_bindings` 仍是按 `account_scope + group_id + activity_tag_id` 做唯一约束的旧模型

如果你现在要跟 `WeFlow-main` 的同步代码对齐，应该以 `init_invite_stats_v2_raw_events.sql` 为准。

## 6. 参考文件

- `supabase/init_invite_stats_v2_raw_events.sql`
- `supabase/init_invite_stats.sql`
- `supabase/grant_invite_stats_service_role.sql`
- `WeFlow-main/electron/services/inviteStatsService.ts`
- `WeFlow-Web/lib/invite-sync.ts`
- `WeFlow-Web/lib/invite-sync-requests.ts`

