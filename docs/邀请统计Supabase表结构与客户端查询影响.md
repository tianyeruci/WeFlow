# 邀请统计 Supabase 表结构与客户端查询影响

记录时间：2026-05-18

## 1. 结论

本次本地模型调整会影响远端 Supabase 表结构和客户端查询口径。

核心变化：

- 新增 `raw_events` 表，保存微信群系统消息解析后的原始邀请 / 退群事件。
- `raw_events` 不保存 `activity_tag_id`，不随活动标签切换而删除。
- 群属于哪个活动标签，由 `group_tag_bindings` 当前绑定决定。
- 客户端展示仍建议统一读取 `final_stat_events`，但这个视图需要改为从 `raw_events + group_tag_bindings + activity_tags` 派生。
- 同步接口需要从“按账号全量删除再 upsert”改为“dirty 增量 upsert”。

建表 SQL 已生成到：

```text
D:\work\WeFlow\supabase\init_invite_stats_v2_raw_events.sql
```

## 2. 受影响的表

### 2.1 `activity_tags`

含义：活动标签，例如“拉新”“自动”。

本次影响：

- 表继续保留。
- 补充同步字段：

```text
sync_status
sync_error
last_sync_at
```

客户端查询影响：

- 活动标签下拉仍读取 `activity_tags`。
- 只展示 `enabled = true` 且 `deleted = false` 的标签。
- 字段名建议统一使用 `id` 和 `name`。

### 2.2 `group_tag_bindings`

含义：微信群和活动标签的当前绑定关系。

本次影响最大的是语义变化：

以前可以理解为：

```text
群 + 活动标签 -> 一组已经写死活动标签的数据
```

现在应理解为：

```text
group_id 当前绑定 activity_tag_id
```

群从 A 标签切到 B 标签时：

- 只更新 `group_tag_bindings.activity_tag_id`。
- 不删除 `raw_events`。
- 不重扫已有原始事件。
- `final_stat_events` 会自动把这个群的原始事件归到 B 标签下。

建议唯一约束：

```text
account_scope + group_id
```

原因：同一微信群同一时间只允许属于一个有效活动标签。

### 2.3 `raw_events`

含义：原始事件缓存表，保存扫描到的邀请 / 退群系统消息解析结果。

这是新增核心表。

关键字段：

```text
id
account_scope
dedup_key
event_type
group_id
group_name
member_name
member_wxid
related_name
related_wxid
join_type
quit_type
status
valid_flag
delete_flag
created_time
invite_time
exit_time
source_message_id
source_local_id
source_create_time
raw_message
parsed_content
confidence
sync_status
sync_error
last_sync_at
created_at
updated_at
raw_json
```

时间字段规则：

```text
created_time = 微信系统消息时间，用于增量扫描游标
invite_time = 邀请 / 入群消息时间；退群事件为空
exit_time = 退群消息时间；邀请事件为空
```

去重规则：

```text
account_scope + dedup_key
```

客户端查询影响：

- 普通展示页不建议直接读 `raw_events`。
- 管理端排查原始消息、同步问题、待确认问题时可以读。
- 数据大屏、排行榜、成员溯源仍读 `final_stat_events`。

### 2.4 `invite_events`

含义：邀请事件兼容 / 物化表。

本次影响：

- 继续保留，兼容当前本地同步 payload。
- 补充 `dedup_key` 和同步字段。
- 不再建议作为远端唯一事实源。

推荐定位：

```text
本地或远端兼容缓存；最终展示以 final_stat_events 为准。
```

### 2.5 `quit_events`

含义：退群事件兼容 / 物化表。

本次影响：

- 继续保留，兼容当前本地同步 payload。
- 补充 `dedup_key` 和同步字段。
- `exit_time` 是退群时间。
- `invite_time` 对退群事件为空。

推荐定位同 `invite_events`。

### 2.6 `member_identity_bindings`

含义：人工确认昵称、群昵称、wxid 的绑定关系。

本次影响：

- 补充同步字段：

```text
sync_status
sync_error
last_sync_at
```

客户端查询影响：

- 普通用户端通常不直接查。
- 管理端处理待确认、人工修复时使用。

### 2.7 `scan_logs`

含义：本地扫描日志。

本次影响：

- 补充同步字段。
- `scan_mode` 后续只应出现 `incremental`。
- 不再有全局扫描。

客户端查询影响：

- 普通用户端不需要查。
- 管理端可以用于展示最近扫描状态、同步排错。

### 2.8 `sync_batches`

含义：远端接收同步批次的审计表。

用途：

- 记录每次同步多少条标签、绑定、原始事件、邀请事件、退群事件、扫描日志。
- 记录同步成功或失败。
- 方便排查本地和远端数据是否一致。

## 3. `final_stat_events` 查询口径变化

旧口径：

```text
final_stat_events = invite_events union quit_events
```

问题：

- `invite_events / quit_events` 内部带有 `activity_tag_id`。
- 群从 A 标签切到 B 标签后，如果不删除 / 重写事件，远端仍可能看到旧标签数据。

新口径：

```text
final_stat_events =
  raw_events
  join group_tag_bindings on account_scope + group_id
  join activity_tags on group_tag_bindings.activity_tag_id
```

结果：

- 群切换标签只改 `group_tag_bindings`。
- 旧原始事件不用删除。
- 客户端按新活动标签查询时，会立即看到该群已有原始事件。
- 客户端按旧活动标签查询时，不再看到该群数据。

## 4. 对客户端页面的影响

### 4.1 远程普通用户端

需要读：

```text
activity_tags
final_stat_events
```

不需要读：

```text
raw_events
invite_events
quit_events
member_identity_bindings
scan_logs
group_tag_bindings
```

页面影响：

- 数据大屏按 `final_stat_events.activity_tag_id` 筛选。
- 邀请排行榜按 `event_type = invite`、`status != pending/ignored`、`valid_flag = 1` 统计。
- 群成员溯源按 `final_stat_events` 查询邀请和退群记录。

### 4.2 远程管理端

需要读：

```text
activity_tags
group_tag_bindings
raw_events
final_stat_events
member_identity_bindings
scan_logs
sync_batches
```

可选读：

```text
invite_events
quit_events
```

页面影响：

- 发售群列表应读 `group_tag_bindings` 和 `final_stat_events` 聚合结果。
- 群切换活动标签时只更新 `group_tag_bindings.activity_tag_id`。
- 待确认记录建议从 `raw_events` 中查 `status = pending`。
- 数据大屏和成员溯源仍读 `final_stat_events`，不要自己拼 `raw_events`。

### 4.3 本地 WeFlow 同步 API

当前 `WeFlow-Web/lib/invite-sync.ts` 仍是：

```text
delete scan_logs
delete member_identity_bindings
delete quit_events
delete invite_events
delete group_tag_bindings
delete activity_tags
再 upsert
```

这和本次模型不匹配，需要调整。

新同步策略：

```text
1. 不再按 account_scope 全量 delete。
2. activity_tags 按 id upsert。
3. group_tag_bindings 按 account_scope + group_id upsert。
4. raw_events 按 account_scope + dedup_key upsert。
5. invite_events / quit_events 按 id 或 account_scope + dedup_key upsert。
6. member_identity_bindings 按 id upsert。
7. scan_logs 按 id upsert。
8. 删除或清除类操作使用 enabled=false 或 deleted_at，不做物理删除。
```

## 5. 同步哪些数据

本地增量扫描成功后，建议同步 dirty 数据：

```text
activityTags
groupTagBindings
rawEvents
inviteEvents
quitEvents
memberIdentityBindings
scanLogs
```

最重要的是：

```text
activityTags
groupTagBindings
rawEvents
```

`inviteEvents / quitEvents` 目前用于兼容，后续远端完全改为 `raw_events + final_stat_events` 后，可以降低依赖。

## 6. 需要调整的客户端查询

### 6.1 活动标签列表

继续：

```text
select * from activity_tags where enabled = true and deleted = false
```

### 6.2 数据大屏

继续查询：

```text
final_stat_events
```

筛选：

```text
activity_tag_id = 当前标签
status != pending
status != ignored
```

今日新增：

```text
event_type = invite
invite_time >= 北京时间今日 00:00:00
```

今日退群：

```text
event_type = quit
exit_time >= 北京时间今日 00:00:00
```

### 6.3 邀请排行榜

查询：

```text
final_stat_events
```

筛选：

```text
event_type = invite
valid_flag = 1
status = confirmed
activity_tag_id = 当前标签
可选 group_id
可选 invite_time 时间范围
```

聚合：

```text
按 inviter_wxid 或 inviter_name 分组 count
```

### 6.4 群成员溯源

查询：

```text
final_stat_events
```

筛选：

```text
activity_tag_id = 当前标签
可选 group_id
可选 member_name
可选 created_time / invite_time / exit_time 时间范围
可选 status
可选 valid_flag / delete_flag
```

### 6.5 待确认记录

管理端建议查询：

```text
raw_events where status = 'pending'
```

原因：

- 待确认本质是原始消息解析不完整。
- 一条原始消息后续可能被人工拆分或替换。

## 7. 迁移建议

如果 Supabase 里已有旧表：

1. 先执行 `init_invite_stats_v2_raw_events.sql`，补齐新表、字段、索引和视图。
2. 修改同步接口，先不要再执行按账号全量删除。
3. 本地跑一次增量扫描，让 `raw_events` 开始写入远端。
4. 确认 `final_stat_events` 能查到当前活动标签下的数据。
5. 再调整远程普通用户端和管理端页面查询。

如果旧表已有数据但还没有 `raw_events`：

- 可以保留旧 `invite_events / quit_events`。
- 后续通过本地重新增量扫描或一次性迁移脚本补齐 `raw_events`。
- 不建议继续靠删除旧标签事件来处理群切换标签。

## 8. 风险点

- 如果远程同步接口仍然全量删除，会把 `raw_events` 的增量缓存价值抵消掉。
- 如果客户端绕过 `final_stat_events` 直接查 `invite_events.activity_tag_id`，群切换标签后会看到旧标签数据。
- 如果 `group_tag_bindings` 仍允许同一 `account_scope + group_id` 多条有效绑定，统计会重复。
- 如果远端没有 `account_scope + dedup_key` 唯一约束，重复同步可能产生重复原始事件。

