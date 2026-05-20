-- WeFlow-main Invite Stats Supabase schema and grants
-- Source aligned to: supabase/init_invite_stats_v2_raw_events.sql
-- Purpose: create the current remote schema used by WeFlow-main and grant service-role access.

create table if not exists activity_tags (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  name varchar(128) not null,
  enabled boolean not null default true,
  deleted boolean not null default false,
  sort_order integer not null default 0,
  remark text,
  sync_status varchar(32) not null default '',
  sync_error text not null default '',
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

comment on table activity_tags is '活动标签主表，用于区分不同统计活动或业务范围，并作为群绑定和事件归属的基础。';
comment on column activity_tags.id is '标签主键，和本地数据保持一致，用于幂等 upsert。';
comment on column activity_tags.account_scope is '账号作用域，隔离不同 WeChat 账号或数据空间。';
comment on column activity_tags.name is '标签名称，供界面展示和筛选。';
comment on column activity_tags.enabled is '是否启用，控制该标签是否参与同步和统计。';
comment on column activity_tags.deleted is '逻辑删除标记，保留历史但不再生效。';
comment on column activity_tags.sort_order is '排序值，用于列表展示顺序。';
comment on column activity_tags.remark is '备注信息，给人工管理补充说明。';
comment on column activity_tags.sync_status is '同步状态，记录上次写入远端结果。';
comment on column activity_tags.sync_error is '同步错误文本，便于排查失败原因。';
comment on column activity_tags.last_sync_at is '最近一次同步时间。';
comment on column activity_tags.created_at is '本地创建时间。';
comment on column activity_tags.updated_at is '本地更新时间，用于增量同步判断。';
comment on column activity_tags.raw_json is '原始 JSON 备份，便于回溯本地对象。';

create index if not exists idx_activity_tags_account_scope
  on activity_tags(account_scope);
create index if not exists idx_activity_tags_enabled
  on activity_tags(enabled);
create index if not exists idx_activity_tags_sync_status
  on activity_tags(sync_status);

create table if not exists group_tag_bindings (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  group_id varchar(128) not null,
  group_name varchar(255),
  activity_tag_id varchar(64) references activity_tags(id),
  enabled boolean not null default true,
  deleted_at timestamptz,
  last_created_time timestamptz,
  last_invite_time timestamptz,
  last_exit_time timestamptz,
  last_scan_at timestamptz,
  member_count integer,
  scan_status varchar(32),
  scan_error text,
  sync_status varchar(32) not null default '',
  sync_error text not null default '',
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

comment on table group_tag_bindings is '群与活动标签的绑定表，用于决定某个群当前归属哪个活动标签。';
comment on column group_tag_bindings.id is '绑定主键，和本地记录保持一致。';
comment on column group_tag_bindings.account_scope is '账号作用域，避免跨账号串数据。';
comment on column group_tag_bindings.group_id is '微信群唯一标识，用于按群查找绑定。';
comment on column group_tag_bindings.group_name is '微信群名称，供展示和确认。';
comment on column group_tag_bindings.activity_tag_id is '关联活动标签 ID，决定群归属。';
comment on column group_tag_bindings.enabled is '是否启用该绑定，禁用后不参与统计。';
comment on column group_tag_bindings.deleted_at is '删除时间，保留软删除痕迹。';
comment on column group_tag_bindings.last_created_time is '最近一次群记录创建时间。';
comment on column group_tag_bindings.last_invite_time is '最近一次邀请事件时间。';
comment on column group_tag_bindings.last_exit_time is '最近一次退群事件时间。';
comment on column group_tag_bindings.last_scan_at is '最近一次扫描时间。';
comment on column group_tag_bindings.member_count is '群成员数快照，辅助统计与校验。';
comment on column group_tag_bindings.scan_status is '最近一次扫描状态。';
comment on column group_tag_bindings.scan_error is '最近一次扫描错误。';
comment on column group_tag_bindings.sync_status is '同步状态，记录远端写入结果。';
comment on column group_tag_bindings.sync_error is '同步错误详情。';
comment on column group_tag_bindings.last_sync_at is '最近一次同步时间。';
comment on column group_tag_bindings.created_at is '本地创建时间。';
comment on column group_tag_bindings.updated_at is '本地更新时间。';
comment on column group_tag_bindings.raw_json is '原始 JSON 备份。';

create unique index if not exists uk_group_tag_bindings_scope_group
  on group_tag_bindings(account_scope, group_id);
create index if not exists idx_group_tag_bindings_activity_tag_id
  on group_tag_bindings(activity_tag_id);
create index if not exists idx_group_tag_bindings_group_id
  on group_tag_bindings(group_id);
create index if not exists idx_group_tag_bindings_enabled
  on group_tag_bindings(enabled);
create index if not exists idx_group_tag_bindings_sync_status
  on group_tag_bindings(sync_status);

create table if not exists raw_events (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  dedup_key varchar(255) not null,
  event_type varchar(16) not null check (event_type in ('invite', 'quit')),
  group_id varchar(128) not null,
  group_name varchar(255),
  member_name varchar(255),
  member_wxid varchar(128),
  related_name varchar(255),
  related_wxid varchar(128),
  join_type varchar(32),
  quit_type varchar(32),
  status varchar(32),
  valid_flag smallint,
  delete_flag smallint,
  created_time timestamptz not null,
  invite_time timestamptz,
  exit_time timestamptz,
  source_message_id varchar(128),
  source_local_id varchar(128),
  source_create_time timestamptz,
  raw_message text,
  parsed_content text,
  confidence numeric(6, 4),
  sync_status varchar(32) not null default '',
  sync_error text not null default '',
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

comment on table raw_events is '原始系统事件表，统一承载邀请和退群事件，作为后续视图和派生表的源数据。';
comment on column raw_events.id is '原始事件主键，幂等写入用。';
comment on column raw_events.account_scope is '账号作用域。';
comment on column raw_events.dedup_key is '去重键，用于保证同一原始事件只写一条。';
comment on column raw_events.event_type is '事件类型，仅允许 invite 或 quit。';
comment on column raw_events.group_id is '事件所属微信群 ID。';
comment on column raw_events.group_name is '事件发生时的群名称。';
comment on column raw_events.member_name is '事件主体成员昵称。';
comment on column raw_events.member_wxid is '事件主体成员 wxid。';
comment on column raw_events.related_name is '相关角色名称，邀请事件里通常是邀请人，退群事件里通常是操作人。';
comment on column raw_events.related_wxid is '相关角色 wxid。';
comment on column raw_events.join_type is '入群来源类型，如邀请、二维码、直接加入等。';
comment on column raw_events.quit_type is '退群类型，如主动退出或被移出。';
comment on column raw_events.status is '业务状态，如 confirmed/pending/ignored。';
comment on column raw_events.valid_flag is '有效标记，供有效事件筛选使用。';
comment on column raw_events.delete_flag is '删除标记，保留历史判断依据。';
comment on column raw_events.created_time is '事件时间主轴，排序和查询的核心时间。';
comment on column raw_events.invite_time is '邀请时间，仅邀请事件相关。';
comment on column raw_events.exit_time is '退群时间，仅退群事件相关。';
comment on column raw_events.source_message_id is '来源消息 ID，便于追溯原消息。';
comment on column raw_events.source_local_id is '来源本地消息 ID。';
comment on column raw_events.source_create_time is '来源消息创建时间。';
comment on column raw_events.raw_message is '原始消息文本。';
comment on column raw_events.parsed_content is '解析后的结构化文本。';
comment on column raw_events.confidence is '解析置信度。';
comment on column raw_events.sync_status is '同步状态。';
comment on column raw_events.sync_error is '同步错误文本。';
comment on column raw_events.last_sync_at is '最近一次同步时间。';
comment on column raw_events.created_at is '本地创建时间。';
comment on column raw_events.updated_at is '本地更新时间。';
comment on column raw_events.raw_json is '原始 JSON 备份。';

create unique index if not exists uk_raw_events_scope_dedup
  on raw_events(account_scope, dedup_key);
create index if not exists idx_raw_events_group_created
  on raw_events(account_scope, group_id, created_time);
create index if not exists idx_raw_events_group_invite_time
  on raw_events(account_scope, group_id, invite_time);
create index if not exists idx_raw_events_group_exit_time
  on raw_events(account_scope, group_id, exit_time);
create index if not exists idx_raw_events_event_type
  on raw_events(event_type);
create index if not exists idx_raw_events_member_wxid
  on raw_events(member_wxid);
create index if not exists idx_raw_events_related_wxid
  on raw_events(related_wxid);
create index if not exists idx_raw_events_sync_status
  on raw_events(sync_status);

create table if not exists invite_events (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  dedup_key varchar(255),
  activity_tag_id varchar(64) references activity_tags(id),
  group_id varchar(128) not null,
  group_name varchar(255),
  member_name varchar(255),
  member_wxid varchar(128),
  inviter_name varchar(255),
  inviter_wxid varchar(128),
  status varchar(32),
  valid_flag smallint,
  delete_flag smallint,
  created_time timestamptz not null,
  invite_time timestamptz,
  exit_time timestamptz,
  source_message_id varchar(128),
  source_local_id varchar(128),
  source_create_time timestamptz,
  raw_message text,
  confirm_source varchar(32),
  feishu_record_id varchar(128),
  sync_status varchar(32) not null default '',
  sync_error text not null default '',
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

comment on table invite_events is '邀请事件明细表，用于展示、统计和远端管理。';
comment on column invite_events.id is '邀请事件主键。';
comment on column invite_events.account_scope is '账号作用域。';
comment on column invite_events.dedup_key is '去重键，用于避免重复邀请记录。';
comment on column invite_events.activity_tag_id is '归属活动标签 ID。';
comment on column invite_events.group_id is '微信群 ID。';
comment on column invite_events.group_name is '群名称。';
comment on column invite_events.member_name is '被邀请成员昵称。';
comment on column invite_events.member_wxid is '被邀请成员 wxid。';
comment on column invite_events.inviter_name is '邀请人昵称。';
comment on column invite_events.inviter_wxid is '邀请人 wxid。';
comment on column invite_events.status is '事件业务状态。';
comment on column invite_events.valid_flag is '有效性标记。';
comment on column invite_events.delete_flag is '删除标记。';
comment on column invite_events.created_time is '事件时间。';
comment on column invite_events.invite_time is '邀请发生时间。';
comment on column invite_events.exit_time is '关联退群时间，兼容历史模型。';
comment on column invite_events.source_message_id is '来源消息 ID。';
comment on column invite_events.source_local_id is '来源本地消息 ID。';
comment on column invite_events.source_create_time is '来源消息创建时间。';
comment on column invite_events.raw_message is '原始消息文本。';
comment on column invite_events.confirm_source is '确认来源，如人工确认或规则确认。';
comment on column invite_events.feishu_record_id is '飞书记录 ID，若有联动记录则写入。';
comment on column invite_events.sync_status is '同步状态。';
comment on column invite_events.sync_error is '同步错误文本。';
comment on column invite_events.last_sync_at is '最近一次同步时间。';
comment on column invite_events.created_at is '本地创建时间。';
comment on column invite_events.updated_at is '本地更新时间。';
comment on column invite_events.raw_json is '原始 JSON 备份。';

create unique index if not exists uk_invite_events_scope_dedup
  on invite_events(account_scope, dedup_key)
  where dedup_key is not null and dedup_key <> '';
create index if not exists idx_invite_events_activity_tag_id
  on invite_events(activity_tag_id);
create index if not exists idx_invite_events_group_id
  on invite_events(group_id);
create index if not exists idx_invite_events_member_wxid
  on invite_events(member_wxid);
create index if not exists idx_invite_events_inviter_wxid
  on invite_events(inviter_wxid);
create index if not exists idx_invite_events_invite_time
  on invite_events(invite_time);
create index if not exists idx_invite_events_created_time
  on invite_events(created_time);
create index if not exists idx_invite_events_sync_status
  on invite_events(sync_status);

create table if not exists quit_events (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  dedup_key varchar(255),
  activity_tag_id varchar(64) references activity_tags(id),
  group_id varchar(128) not null,
  group_name varchar(255),
  member_name varchar(255),
  member_wxid varchar(128),
  operator_name varchar(255),
  operator_wxid varchar(128),
  status varchar(32),
  valid_flag smallint,
  delete_flag smallint,
  created_time timestamptz not null,
  invite_time timestamptz,
  exit_time timestamptz,
  source_message_id varchar(128),
  source_local_id varchar(128),
  source_create_time timestamptz,
  raw_message text,
  confirm_source varchar(32),
  feishu_record_id varchar(128),
  sync_status varchar(32) not null default '',
  sync_error text not null default '',
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

comment on table quit_events is '退群事件明细表，用于记录成员退出或被移出的事件。';
comment on column quit_events.id is '退群事件主键。';
comment on column quit_events.account_scope is '账号作用域。';
comment on column quit_events.dedup_key is '去重键，用于避免重复退群记录。';
comment on column quit_events.activity_tag_id is '归属活动标签 ID。';
comment on column quit_events.group_id is '微信群 ID。';
comment on column quit_events.group_name is '群名称。';
comment on column quit_events.member_name is '退群成员昵称。';
comment on column quit_events.member_wxid is '退群成员 wxid。';
comment on column quit_events.operator_name is '执行退群动作的操作者名称。';
comment on column quit_events.operator_wxid is '操作者 wxid。';
comment on column quit_events.status is '事件业务状态。';
comment on column quit_events.valid_flag is '有效性标记。';
comment on column quit_events.delete_flag is '删除标记。';
comment on column quit_events.created_time is '事件时间。';
comment on column quit_events.invite_time is '关联的邀请时间。';
comment on column quit_events.exit_time is '实际退群时间。';
comment on column quit_events.source_message_id is '来源消息 ID。';
comment on column quit_events.source_local_id is '来源本地消息 ID。';
comment on column quit_events.source_create_time is '来源消息创建时间。';
comment on column quit_events.raw_message is '原始消息文本。';
comment on column quit_events.confirm_source is '确认来源。';
comment on column quit_events.feishu_record_id is '飞书记录 ID。';
comment on column quit_events.sync_status is '同步状态。';
comment on column quit_events.sync_error is '同步错误文本。';
comment on column quit_events.last_sync_at is '最近一次同步时间。';
comment on column quit_events.created_at is '本地创建时间。';
comment on column quit_events.updated_at is '本地更新时间。';
comment on column quit_events.raw_json is '原始 JSON 备份。';

create unique index if not exists uk_quit_events_scope_dedup
  on quit_events(account_scope, dedup_key)
  where dedup_key is not null and dedup_key <> '';
create index if not exists idx_quit_events_activity_tag_id
  on quit_events(activity_tag_id);
create index if not exists idx_quit_events_group_id
  on quit_events(group_id);
create index if not exists idx_quit_events_member_wxid
  on quit_events(member_wxid);
create index if not exists idx_quit_events_operator_wxid
  on quit_events(operator_wxid);
create index if not exists idx_quit_events_exit_time
  on quit_events(exit_time);
create index if not exists idx_quit_events_created_time
  on quit_events(created_time);
create index if not exists idx_quit_events_sync_status
  on quit_events(sync_status);

create table if not exists member_identity_bindings (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  activity_tag_id varchar(64) references activity_tags(id),
  group_id varchar(128),
  display_name varchar(255) not null,
  wxid varchar(128) not null,
  remark_name varchar(255),
  nick_name varchar(255),
  binding_type varchar(32),
  source varchar(32),
  sync_status varchar(32) not null default '',
  sync_error text not null default '',
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

comment on table member_identity_bindings is '成员身份绑定表，用于把群成员昵称、备注名和 wxid 对齐。';
comment on column member_identity_bindings.id is '绑定主键。';
comment on column member_identity_bindings.account_scope is '账号作用域。';
comment on column member_identity_bindings.activity_tag_id is '关联活动标签 ID。';
comment on column member_identity_bindings.group_id is '所属群 ID，可为空表示全局绑定。';
comment on column member_identity_bindings.display_name is '对外展示名或统一显示名。';
comment on column member_identity_bindings.wxid is '成员 wxid。';
comment on column member_identity_bindings.remark_name is '群备注名。';
comment on column member_identity_bindings.nick_name is '微信昵称。';
comment on column member_identity_bindings.binding_type is '绑定类型，如自动或手工。';
comment on column member_identity_bindings.source is '绑定来源。';
comment on column member_identity_bindings.sync_status is '同步状态。';
comment on column member_identity_bindings.sync_error is '同步错误文本。';
comment on column member_identity_bindings.last_sync_at is '最近一次同步时间。';
comment on column member_identity_bindings.created_at is '本地创建时间。';
comment on column member_identity_bindings.updated_at is '本地更新时间。';
comment on column member_identity_bindings.raw_json is '原始 JSON 备份。';

create index if not exists idx_member_identity_bindings_group_id
  on member_identity_bindings(group_id);
create index if not exists idx_member_identity_bindings_wxid
  on member_identity_bindings(wxid);
create index if not exists idx_member_identity_bindings_display_name
  on member_identity_bindings(display_name);
create index if not exists idx_member_identity_bindings_sync_status
  on member_identity_bindings(sync_status);

create table if not exists scan_logs (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  activity_tag_id varchar(64) references activity_tags(id),
  group_id varchar(128),
  scan_mode varchar(32) not null,
  status varchar(32) not null,
  started_at timestamptz,
  finished_at timestamptz,
  scanned_messages integer,
  new_invite_events integer,
  new_quit_events integer,
  message text,
  error_text text,
  operator_name varchar(128),
  sync_status varchar(32) not null default '',
  sync_error text not null default '',
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

comment on table scan_logs is '扫描日志表，用于记录一次群扫描或退群检查任务的执行过程和结果。';
comment on column scan_logs.id is '扫描日志主键。';
comment on column scan_logs.account_scope is '账号作用域。';
comment on column scan_logs.activity_tag_id is '关联活动标签 ID。';
comment on column scan_logs.group_id is '被扫描的群 ID。';
comment on column scan_logs.scan_mode is '扫描模式，如增量扫描或退群检查。';
comment on column scan_logs.status is '扫描状态。';
comment on column scan_logs.started_at is '开始时间。';
comment on column scan_logs.finished_at is '结束时间。';
comment on column scan_logs.scanned_messages is '扫描到的消息数。';
comment on column scan_logs.new_invite_events is '新增邀请事件数。';
comment on column scan_logs.new_quit_events is '新增退群事件数。';
comment on column scan_logs.message is '过程消息或摘要。';
comment on column scan_logs.error_text is '错误详情。';
comment on column scan_logs.operator_name is '执行人名称。';
comment on column scan_logs.sync_status is '同步状态。';
comment on column scan_logs.sync_error is '同步错误文本。';
comment on column scan_logs.last_sync_at is '最近一次同步时间。';
comment on column scan_logs.created_at is '本地创建时间。';
comment on column scan_logs.updated_at is '本地更新时间。';
comment on column scan_logs.raw_json is '原始 JSON 备份。';

create index if not exists idx_scan_logs_activity_tag_id
  on scan_logs(activity_tag_id);
create index if not exists idx_scan_logs_group_id
  on scan_logs(group_id);
create index if not exists idx_scan_logs_status
  on scan_logs(status);
create index if not exists idx_scan_logs_started_at
  on scan_logs(started_at);
create index if not exists idx_scan_logs_sync_status
  on scan_logs(sync_status);

create table if not exists sync_batches (
  id bigserial primary key,
  account_scope varchar(128) not null,
  source_client varchar(128),
  status varchar(32) not null,
  activity_tags_count integer not null default 0,
  group_tag_bindings_count integer not null default 0,
  raw_events_count integer not null default 0,
  invite_events_count integer not null default 0,
  quit_events_count integer not null default 0,
  member_identity_bindings_count integer not null default 0,
  scan_logs_count integer not null default 0,
  error_text text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  raw_json jsonb
);

comment on table sync_batches is '同步批次表，用于记录一次远端同步、网页刷新请求或清理操作的批次状态。';
comment on column sync_batches.id is '批次主键，自增。';
comment on column sync_batches.account_scope is '账号作用域。';
comment on column sync_batches.source_client is '来源客户端标识，如 weflow-main-sync 或 web-refresh。';
comment on column sync_batches.status is '批次状态，如 requested/completed/failed。';
comment on column sync_batches.activity_tags_count is '本批次写入的活动标签数量。';
comment on column sync_batches.group_tag_bindings_count is '本批次写入的群绑定数量。';
comment on column sync_batches.raw_events_count is '本批次写入的原始事件数量。';
comment on column sync_batches.invite_events_count is '本批次写入的邀请事件数量。';
comment on column sync_batches.quit_events_count is '本批次写入的退群事件数量。';
comment on column sync_batches.member_identity_bindings_count is '本批次写入的成员身份绑定数量。';
comment on column sync_batches.scan_logs_count is '本批次写入的扫描日志数量。';
comment on column sync_batches.error_text is '批次错误详情。';
comment on column sync_batches.started_at is '批次开始时间。';
comment on column sync_batches.finished_at is '批次完成时间。';
comment on column sync_batches.raw_json is '原始 JSON 备份。';

create index if not exists idx_sync_batches_account_scope
  on sync_batches(account_scope);
create index if not exists idx_sync_batches_status
  on sync_batches(status);

create or replace view final_stat_events as
select
  re.id as event_id,
  re.id,
  gtb.activity_tag_id,
  at.name as activity_tag_name,
  re.group_id,
  coalesce(gtb.group_name, re.group_name) as group_name,
  re.event_type::text as event_type,
  re.member_name as "user",
  re.member_name,
  re.member_wxid as wx_id,
  re.member_wxid as wxid,
  coalesce(re.raw_json->>'head_img', re.raw_json->>'avatar_url', re.raw_json->>'avatarUrl', '') as head_img,
  case when re.event_type = 'invite' then re.related_name else null end as inviter,
  case when re.event_type = 'invite' then re.related_name else null end as inviter_name,
  case when re.event_type = 'invite' then re.related_wxid else null end as inviter_wxid,
  case when re.event_type = 'quit' then re.related_name else null end as operator_name,
  case when re.event_type = 'quit' then re.related_wxid else null end as operator_wxid,
  re.invite_time,
  re.exit_time,
  re.created_time,
  re.status,
  re.valid_flag,
  re.delete_flag,
  re.join_type,
  re.quit_type,
  re.confidence,
  re.raw_message as raw_content,
  re.raw_message as source_raw_content,
  re.parsed_content,
  re.source_message_id,
  re.source_local_id,
  re.source_create_time,
  re.raw_json
from raw_events re
join group_tag_bindings gtb
  on gtb.account_scope = re.account_scope
 and gtb.group_id = re.group_id
 and gtb.enabled = true
 and gtb.deleted_at is null
join activity_tags at
  on at.id = gtb.activity_tag_id
 and at.account_scope = re.account_scope
 and at.enabled = true
 and at.deleted = false;

comment on view final_stat_events is '统一事件展示视图，合并原始事件与标签归属信息，供客户端查询和统计。';
comment on column final_stat_events.event_id is '事件展示 ID。';
comment on column final_stat_events.id is '事件主键。';
comment on column final_stat_events.activity_tag_id is '活动标签 ID。';
comment on column final_stat_events.activity_tag_name is '活动标签名称。';
comment on column final_stat_events.group_id is '群 ID。';
comment on column final_stat_events.group_name is '群名称。';
comment on column final_stat_events.event_type is '事件类型。';
comment on column final_stat_events."user" is '成员显示名。';
comment on column final_stat_events.member_name is '成员昵称。';
comment on column final_stat_events.wx_id is '成员 wxid 展示字段。';
comment on column final_stat_events.wxid is '成员 wxid。';
comment on column final_stat_events.head_img is '头像地址。';
comment on column final_stat_events.inviter is '邀请人显示名。';
comment on column final_stat_events.inviter_name is '邀请人名称。';
comment on column final_stat_events.inviter_wxid is '邀请人 wxid。';
comment on column final_stat_events.operator_name is '退群操作者名称。';
comment on column final_stat_events.operator_wxid is '退群操作者 wxid。';
comment on column final_stat_events.invite_time is '邀请时间。';
comment on column final_stat_events.exit_time is '退群时间。';
comment on column final_stat_events.created_time is '事件创建时间。';
comment on column final_stat_events.status is '事件状态。';
comment on column final_stat_events.valid_flag is '有效标记。';
comment on column final_stat_events.delete_flag is '删除标记。';
comment on column final_stat_events.join_type is '入群类型。';
comment on column final_stat_events.quit_type is '退群类型。';
comment on column final_stat_events.confidence is '解析置信度。';
comment on column final_stat_events.raw_content is '原始内容。';
comment on column final_stat_events.source_raw_content is '源原始内容。';
comment on column final_stat_events.parsed_content is '解析后的内容。';
comment on column final_stat_events.source_message_id is '来源消息 ID。';
comment on column final_stat_events.source_local_id is '来源本地消息 ID。';
comment on column final_stat_events.source_create_time is '来源消息创建时间。';
comment on column final_stat_events.raw_json is '原始 JSON。';

create or replace view effective_invite_events as
select *
from final_stat_events
where event_type = 'invite'
  and status = 'confirmed'
  and valid_flag = 1;

comment on view effective_invite_events is '有效邀请事件视图，仅保留确认且有效的邀请记录。';

grant usage on schema public to service_role;

grant select, insert, update, delete on table activity_tags to service_role;
grant select, insert, update, delete on table group_tag_bindings to service_role;
grant select, insert, update, delete on table raw_events to service_role;
grant select, insert, update, delete on table invite_events to service_role;
grant select, insert, update, delete on table quit_events to service_role;
grant select, insert, update, delete on table member_identity_bindings to service_role;
grant select, insert, update, delete on table scan_logs to service_role;
grant select, insert, update, delete on table sync_batches to service_role;
grant usage, select on sequence sync_batches_id_seq to service_role;

grant select on table final_stat_events to service_role;
grant select on table effective_invite_events to service_role;
