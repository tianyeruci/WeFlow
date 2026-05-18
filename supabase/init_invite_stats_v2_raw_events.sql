-- WeFlow 邀请统计 Supabase V2 表结构
-- 目标：
-- 1. 原始系统消息只保存一份到 raw_events，不再绑定 activity_tag_id。
-- 2. 群当前属于哪个活动标签，由 group_tag_bindings 决定。
-- 3. 客户端展示统一读取 final_stat_events 视图。
-- 4. 同步使用 dirty 增量 upsert，不建议再按 account_scope 全量删除。

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


-- 兼容表：当前本地仍会同步 invite_events / quit_events。
-- 远程展示建议优先读 final_stat_events；后续可以逐步减少对这两张物化表的依赖。
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
  re.source_create_time
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


create or replace view effective_invite_events as
select *
from final_stat_events
where event_type = 'invite'
  and status = 'confirmed'
  and valid_flag = 1;


grant usage on schema public to service_role;

grant select, insert, update, delete on table activity_tags to service_role;
grant select, insert, update, delete on table group_tag_bindings to service_role;
grant select, insert, update, delete on table raw_events to service_role;
grant select, insert, update, delete on table invite_events to service_role;
grant select, insert, update, delete on table quit_events to service_role;
grant select, insert, update, delete on table member_identity_bindings to service_role;
grant select, insert, update, delete on table scan_logs to service_role;
grant select, insert, update, delete on table sync_batches to service_role;

grant select on table final_stat_events to service_role;
grant select on table effective_invite_events to service_role;
