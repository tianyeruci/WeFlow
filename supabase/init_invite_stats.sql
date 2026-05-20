create table if not exists activity_tags (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  name varchar(128) not null,
  enabled boolean not null default true,
  deleted boolean not null default false,
  sort_order integer not null default 0,
  remark text,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

create index if not exists idx_activity_tags_account_scope
  on activity_tags(account_scope);

create index if not exists idx_activity_tags_enabled
  on activity_tags(enabled);


create table if not exists group_tag_bindings (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  group_id varchar(128) not null,
  group_name varchar(255),
  activity_tag_id varchar(64) not null references activity_tags(id),
  enabled boolean not null default true,
  last_created_time timestamptz,
  last_invite_time timestamptz,
  last_exit_time timestamptz,
  last_scan_at timestamptz,
  member_count integer,
  scan_status varchar(32),
  scan_error text,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

create unique index if not exists uk_group_tag_bindings_scope_group_tag
  on group_tag_bindings(account_scope, group_id, activity_tag_id);

create index if not exists idx_group_tag_bindings_activity_tag_id
  on group_tag_bindings(activity_tag_id);

create index if not exists idx_group_tag_bindings_group_id
  on group_tag_bindings(group_id);


create table if not exists invite_events (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  activity_tag_id varchar(64) not null references activity_tags(id),
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
  sync_status varchar(32),
  sync_error text,
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

create index if not exists idx_invite_events_activity_tag_id
  on invite_events(activity_tag_id);

create index if not exists idx_invite_events_group_id
  on invite_events(group_id);

create index if not exists idx_invite_events_member_wxid
  on invite_events(member_wxid);

create index if not exists idx_invite_events_invite_time
  on invite_events(invite_time);

create index if not exists idx_invite_events_created_time
  on invite_events(created_time);

create unique index if not exists uk_invite_events_msg
  on invite_events(account_scope, group_id, source_message_id, member_wxid);

create unique index if not exists uk_invite_events_local
  on invite_events(account_scope, group_id, source_local_id, source_create_time, member_wxid);


create table if not exists quit_events (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  activity_tag_id varchar(64) not null references activity_tags(id),
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
  sync_status varchar(32),
  sync_error text,
  last_sync_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

create index if not exists idx_quit_events_activity_tag_id
  on quit_events(activity_tag_id);

create index if not exists idx_quit_events_group_id
  on quit_events(group_id);

create index if not exists idx_quit_events_member_wxid
  on quit_events(member_wxid);

create index if not exists idx_quit_events_exit_time
  on quit_events(exit_time);

create index if not exists idx_quit_events_created_time
  on quit_events(created_time);

create unique index if not exists uk_quit_events_msg
  on quit_events(account_scope, group_id, source_message_id, member_wxid);

create unique index if not exists uk_quit_events_local
  on quit_events(account_scope, group_id, source_local_id, source_create_time, member_wxid);


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


create or replace view final_stat_events as
select
  ie.id as event_id,
  ie.id,
  ie.activity_tag_id,
  at.name as activity_tag_name,
  ie.group_id,
  ie.group_name,
  'invite'::text as event_type,
  ie.member_name as "user",
  ie.member_name,
  ie.member_wxid as wx_id,
  ie.member_wxid as wxid,
  coalesce(ie.raw_json->>'head_img', ie.raw_json->>'avatar_url', ie.raw_json->>'avatarUrl', '') as head_img,
  ie.inviter_name as inviter,
  ie.inviter_name,
  ie.inviter_wxid,
  ie.invite_time,
  ie.exit_time,
  ie.created_time,
  ie.status,
  ie.valid_flag,
  ie.delete_flag,
  ie.raw_message as raw_content,
  ie.raw_message as source_raw_content,
  ie.raw_json
from invite_events ie
left join activity_tags at on at.id = ie.activity_tag_id

union all

select
  qe.id as event_id,
  qe.id,
  qe.activity_tag_id,
  at.name as activity_tag_name,
  qe.group_id,
  qe.group_name,
  'exit'::text as event_type,
  qe.member_name as "user",
  qe.member_name,
  qe.member_wxid as wx_id,
  qe.member_wxid as wxid,
  coalesce(qe.raw_json->>'head_img', qe.raw_json->>'avatar_url', qe.raw_json->>'avatarUrl', '') as head_img,
  null::varchar(255) as inviter,
  null::varchar(255) as inviter_name,
  null::varchar(128) as inviter_wxid,
  qe.invite_time,
  qe.exit_time,
  qe.created_time,
  qe.status,
  qe.valid_flag,
  qe.delete_flag,
  qe.raw_message as raw_content,
  qe.raw_message as source_raw_content,
  qe.raw_json
from quit_events qe
left join activity_tags at on at.id = qe.activity_tag_id;


grant usage on schema public to service_role;

grant select, insert, update, delete on table activity_tags to service_role;
grant select, insert, update, delete on table group_tag_bindings to service_role;
grant select, insert, update, delete on table invite_events to service_role;
grant select, insert, update, delete on table quit_events to service_role;
grant select, insert, update, delete on table member_identity_bindings to service_role;
grant select, insert, update, delete on table scan_logs to service_role;

grant select on table final_stat_events to service_role;
