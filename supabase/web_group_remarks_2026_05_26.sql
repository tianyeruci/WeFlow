-- WeFlow-Web group operation remarks
-- Purpose: store editable Web-only remarks for release groups without touching local WeChat data.

create table if not exists web_group_remarks (
  account_scope varchar(128) not null,
  group_id varchar(128) not null,
  remark text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_scope, group_id)
);

comment on table web_group_remarks is 'WeFlow-Web 运营备注表，按账号作用域和群 ID 保存远端页面维护的备注。';
comment on column web_group_remarks.account_scope is '账号作用域，和 group_tag_bindings.account_scope 对齐。';
comment on column web_group_remarks.group_id is '微信群唯一标识；备注绑定群 ID，不绑定群名称。';
comment on column web_group_remarks.remark is 'WeFlow-Web 页面维护的运营备注，不回写本地微信数据。';
comment on column web_group_remarks.created_at is '备注记录创建时间。';
comment on column web_group_remarks.updated_at is '备注记录最近更新时间。';

create index if not exists idx_web_group_remarks_group_id
  on web_group_remarks(group_id);

create index if not exists idx_web_group_remarks_updated_at
  on web_group_remarks(updated_at);

grant select, insert, update, delete on table web_group_remarks to service_role;
