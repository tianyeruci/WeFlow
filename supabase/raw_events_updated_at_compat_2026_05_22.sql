-- raw_events updated_at compatibility migration for WeFlow-main incremental scan watermark.
-- Safe to run repeatedly. It keeps the v2 raw_events model: raw events are shared by group_id,
-- and are not bound to activity_tag_id.

create table if not exists raw_events (
  id text primary key,
  account_scope text not null,
  dedup_key text not null,
  event_type text not null check (event_type in ('invite', 'quit')),
  group_id text not null,
  group_name text,
  member_name text,
  member_wxid text,
  related_name text,
  related_wxid text,
  join_type text,
  quit_type text,
  status text,
  valid_flag integer,
  delete_flag integer,
  created_time timestamptz,
  invite_time timestamptz,
  exit_time timestamptz,
  source_message_id text,
  source_local_id text,
  source_create_time timestamptz,
  raw_message text,
  parsed_content text,
  confidence numeric,
  sync_status text,
  sync_error text,
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

alter table raw_events add column if not exists account_scope text;
alter table raw_events add column if not exists dedup_key text;
alter table raw_events add column if not exists event_type text;
alter table raw_events add column if not exists group_id text;
alter table raw_events add column if not exists group_name text;
alter table raw_events add column if not exists member_name text;
alter table raw_events add column if not exists member_wxid text;
alter table raw_events add column if not exists related_name text;
alter table raw_events add column if not exists related_wxid text;
alter table raw_events add column if not exists join_type text;
alter table raw_events add column if not exists quit_type text;
alter table raw_events add column if not exists status text;
alter table raw_events add column if not exists valid_flag integer;
alter table raw_events add column if not exists delete_flag integer;
alter table raw_events add column if not exists created_time timestamptz;
alter table raw_events add column if not exists invite_time timestamptz;
alter table raw_events add column if not exists exit_time timestamptz;
alter table raw_events add column if not exists source_message_id text;
alter table raw_events add column if not exists source_local_id text;
alter table raw_events add column if not exists source_create_time timestamptz;
alter table raw_events add column if not exists raw_message text;
alter table raw_events add column if not exists parsed_content text;
alter table raw_events add column if not exists confidence numeric;
alter table raw_events add column if not exists sync_status text;
alter table raw_events add column if not exists sync_error text;
alter table raw_events add column if not exists last_sync_at timestamptz;
alter table raw_events add column if not exists created_at timestamptz;
alter table raw_events add column if not exists updated_at timestamptz;
alter table raw_events add column if not exists raw_json jsonb;

update raw_events
set created_at = coalesce(created_at, created_time, source_create_time, invite_time, exit_time)
where created_at is null
  and coalesce(created_time, source_create_time, invite_time, exit_time) is not null;

update raw_events
set updated_at = coalesce(updated_at, created_at, created_time, source_create_time, invite_time, exit_time)
where updated_at is null
  and coalesce(created_at, created_time, source_create_time, invite_time, exit_time) is not null;

create unique index if not exists uk_raw_events_scope_dedup
  on raw_events(account_scope, dedup_key);

create index if not exists idx_raw_events_group_created
  on raw_events(account_scope, group_id, created_time);

create index if not exists idx_raw_events_group_updated
  on raw_events(account_scope, group_id, updated_at);

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
comment on column raw_events.updated_at is '本地更新时间，用作 WeFlow-main 增量扫描水位。';
comment on column raw_events.raw_json is '原始 JSON 备份。';

grant usage on schema public to service_role;
grant select, insert, update, delete on table raw_events to service_role;
