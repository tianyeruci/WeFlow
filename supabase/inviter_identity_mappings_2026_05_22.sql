-- 邀请人多微信身份映射表。
-- 该表由后台维护，不属于扫描产生的数据，恢复初始化时不要清空。

create table if not exists inviter_identity_mappings (
  id varchar(64) primary key,
  account_scope varchar(128) not null,
  person_key varchar(128) not null,
  person_name varchar(255) not null,
  wxid varchar(128) not null,
  display_name varchar(255),
  enabled boolean not null default true,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb
);

comment on table inviter_identity_mappings is '邀请人身份映射表，用于把同一人的多个微信账号合并到同一排行榜身份。';
comment on column inviter_identity_mappings.account_scope is '账号作用域。';
comment on column inviter_identity_mappings.person_key is '统一人员标识。';
comment on column inviter_identity_mappings.person_name is '统一展示名。';
comment on column inviter_identity_mappings.wxid is '邀请人 wxid。';
comment on column inviter_identity_mappings.display_name is '该 wxid 对应的显示名，可为空。';
comment on column inviter_identity_mappings.enabled is '是否启用该映射。';

create unique index if not exists uk_inviter_identity_mappings_scope_wxid_enabled
  on inviter_identity_mappings(account_scope, wxid)
  where enabled = true;

create index if not exists idx_inviter_identity_mappings_scope_person
  on inviter_identity_mappings(account_scope, person_key);

create index if not exists idx_inviter_identity_mappings_scope_wxid
  on inviter_identity_mappings(account_scope, wxid);

create index if not exists idx_inviter_identity_mappings_enabled
  on inviter_identity_mappings(enabled);

grant select, insert, update, delete on table inviter_identity_mappings to service_role;
