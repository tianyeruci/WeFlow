-- WeFlow-Web Vercel hot-path RPC and index patch.
-- Source: production slow query snapshot from 慢查询.json on 2026-05-25.
-- Goal: stop pulling invite_events/group_tag_bindings page-by-page into Vercel functions.

create index if not exists idx_invite_events_tag_id_order
  on invite_events(activity_tag_id, id);

create index if not exists idx_invite_events_tag_group_time
  on invite_events(activity_tag_id, group_id, invite_time desc);

create index if not exists idx_invite_events_tag_inviter_time
  on invite_events(activity_tag_id, inviter_wxid, invite_time desc);

create index if not exists idx_quit_events_tag_group_time
  on quit_events(activity_tag_id, group_id, exit_time desc);

create index if not exists idx_group_tag_bindings_active_tag_group_updated
  on group_tag_bindings(activity_tag_id, group_id, updated_at desc)
  where enabled = true and deleted_at is null;

create index if not exists idx_sync_batches_source_status_started
  on sync_batches(source_client, status, started_at desc);

create or replace function public.weflow_invite_dashboard(
  p_tag_id text default null,
  p_ranking_group_id text default null,
  p_ranking_start timestamptz default null,
  p_ranking_end timestamptz default null
) returns jsonb
language plpgsql
stable
as $$
declare
  v_is_all boolean;
  v_today text;
  v_result jsonb;
begin
  v_is_all := coalesce(p_tag_id, '') in ('', '__all__');
  v_today := to_char(now() at time zone 'Asia/Shanghai', 'YYYY-MM-DD');

  with active_bindings as (
    select
      gtb.id,
      gtb.account_scope,
      gtb.group_id,
      coalesce(nullif(gtb.group_name, ''), gtb.group_id) as group_name,
      gtb.activity_tag_id,
      gtb.member_count,
      gtb.updated_at,
      gtb.raw_json
    from group_tag_bindings gtb
    where gtb.enabled = true
      and gtb.deleted_at is null
      and (v_is_all or gtb.activity_tag_id = p_tag_id)
  ),
  deduped_bindings as (
    select *
    from (
      select
        active_bindings.*,
        row_number() over (
          partition by active_bindings.group_id
          order by active_bindings.updated_at desc nulls last, active_bindings.id desc
        ) as rn
      from active_bindings
    ) ranked
    where rn = 1
  ),
  scoped_invites as (
    select
      ie.account_scope,
      ie.id,
      ie.activity_tag_id,
      ie.group_id,
      coalesce(nullif(ie.group_name, ''), ie.group_id) as group_name,
      coalesce(nullif(ie.member_name, ''), nullif(ie.member_wxid, ''), '未知成员') as member_name,
      ie.member_wxid,
      coalesce(nullif(ie.inviter_name, ''), '未知来源') as inviter_name,
      nullif(ie.inviter_wxid, '') as inviter_wxid,
      coalesce(
        nullif(ie.raw_json->>'join_type', ''),
        case when nullif(ie.inviter_name, '') is not null or nullif(ie.inviter_wxid, '') is not null then 'invite' else 'qrcode' end
      ) as join_type,
      ie.invite_time,
      ie.exit_time,
      ie.created_time,
      ie.updated_at,
      coalesce(nullif(ie.status, ''), 'confirmed') as status,
      coalesce(ie.valid_flag, 0) as valid_flag,
      coalesce(ie.delete_flag, 0) as delete_flag,
      ie.raw_message,
      coalesce(ie.raw_json->>'head_img', ie.raw_json->>'avatar_url', ie.raw_json->>'avatarUrl', '') as avatar_url
    from invite_events ie
    where (v_is_all or ie.activity_tag_id = p_tag_id)
      and exists (
        select 1
        from active_bindings b
        where b.account_scope = ie.account_scope
          and b.group_id = ie.group_id
          and b.activity_tag_id = ie.activity_tag_id
      )
  ),
  scoped_quits as (
    select
      qe.account_scope,
      qe.id,
      qe.activity_tag_id,
      qe.group_id,
      coalesce(nullif(qe.group_name, ''), qe.group_id) as group_name,
      coalesce(nullif(qe.member_name, ''), nullif(qe.member_wxid, ''), '未知成员') as member_name,
      qe.member_wxid,
      coalesce(nullif(qe.operator_name, ''), '系统') as operator_name,
      nullif(qe.operator_wxid, '') as operator_wxid,
      coalesce(nullif(qe.raw_json->>'quit_type', ''), 'unknown') as quit_type,
      qe.invite_time,
      qe.exit_time,
      qe.created_time,
      qe.updated_at,
      coalesce(nullif(qe.status, ''), 'confirmed') as status,
      coalesce(qe.valid_flag, 0) as valid_flag,
      coalesce(qe.delete_flag, 1) as delete_flag,
      qe.raw_message,
      coalesce(qe.raw_json->>'head_img', qe.raw_json->>'avatar_url', qe.raw_json->>'avatarUrl', '') as avatar_url
    from quit_events qe
    where (v_is_all or qe.activity_tag_id = p_tag_id)
      and exists (
        select 1
        from active_bindings b
        where b.account_scope = qe.account_scope
          and b.group_id = qe.group_id
          and b.activity_tag_id = qe.activity_tag_id
      )
  ),
  all_events as (
    select
      'invite'::text as event_type,
      id,
      account_scope,
      activity_tag_id,
      group_id,
      group_name,
      member_name,
      member_wxid,
      inviter_name as source_name,
      inviter_wxid as source_wxid,
      join_type as event_subtype,
      invite_time,
      exit_time,
      created_time,
      updated_at,
      status,
      valid_flag,
      delete_flag,
      raw_message,
      avatar_url,
      case
        when delete_flag = 1 then coalesce(updated_at, exit_time, invite_time, created_time)
        else coalesce(invite_time, exit_time, created_time)
      end as event_time
    from scoped_invites

    union all

    select
      'quit'::text as event_type,
      id,
      account_scope,
      activity_tag_id,
      group_id,
      group_name,
      member_name,
      member_wxid,
      operator_name as source_name,
      operator_wxid as source_wxid,
      quit_type as event_subtype,
      invite_time,
      exit_time,
      created_time,
      updated_at,
      status,
      valid_flag,
      delete_flag,
      raw_message,
      avatar_url,
      coalesce(invite_time, exit_time, created_time) as event_time
    from scoped_quits
  ),
  ranking_base as (
    select *
    from scoped_invites i
    where coalesce(i.join_type, '') <> 'direct'
      and i.invite_time is not null
      and (p_ranking_group_id is null or p_ranking_group_id = '' or i.group_id = p_ranking_group_id)
      and (p_ranking_start is null or i.invite_time >= p_ranking_start)
      and (p_ranking_end is null or i.invite_time <= p_ranking_end)
  ),
  ranking_identity as (
    select
      coalesce('person:' || wx_mapping.person_key, 'person:' || name_mapping.person_key, 'name:' || lower(trim(r.inviter_name))) as ranking_key,
      coalesce(wx_mapping.person_name, name_mapping.person_name, r.inviter_name, '未知来源') as inviter_name,
      nullif(r.inviter_wxid, '') as inviter_wxid,
      r.invite_time
    from ranking_base r
    left join lateral (
      select m.*
      from inviter_identity_mappings m
      where m.enabled = true
        and m.account_scope = r.account_scope
        and lower(trim(m.wxid)) = lower(trim(coalesce(r.inviter_wxid, '')))
      order by m.updated_at desc nulls last, m.id
      limit 1
    ) wx_mapping on true
    left join lateral (
      select m.*
      from inviter_identity_mappings m
      where wx_mapping.id is null
        and m.enabled = true
        and m.account_scope = r.account_scope
        and lower(trim(coalesce(m.display_name, m.person_name, ''))) = lower(trim(coalesce(r.inviter_name, '')))
      order by m.updated_at desc nulls last, m.id
      limit 1
    ) name_mapping on true
  ),
  ranking_grouped as (
    select
      ranking_key,
      max(inviter_name) as inviter_name,
      string_agg(distinct inviter_wxid, ', ' order by inviter_wxid) filter (where inviter_wxid is not null and inviter_wxid <> '') as inviter_ids,
      count(*)::integer as invite_count,
      max(invite_time) as recent_time
    from ranking_identity
    group by ranking_key
  ),
  today_quit_members as (
    select coalesce(nullif(member_wxid, ''), group_id || ':' || member_name || ':' || coalesce(event_time::text, '')) as member_key
    from all_events
    where status = 'confirmed'
      and event_type = 'quit'
      and event_time is not null
      and to_char(event_time at time zone 'Asia/Shanghai', 'YYYY-MM-DD') = v_today

    union

    select coalesce(nullif(member_wxid, ''), group_id || ':' || member_name || ':' || coalesce(event_time::text, '')) as member_key
    from all_events
    where status = 'confirmed'
      and event_type = 'invite'
      and delete_flag = 1
      and event_time is not null
      and to_char(event_time at time zone 'Asia/Shanghai', 'YYYY-MM-DD') = v_today
  ),
  metrics as (
    select
      coalesce((select count(*) from deduped_bindings), 0)::integer as monitored_groups,
      coalesce((select sum(greatest(coalesce(member_count, 0), 0)) from deduped_bindings), 0)::integer as total_members,
      coalesce((select count(*) from scoped_invites where invite_time is not null and to_char(invite_time at time zone 'Asia/Shanghai', 'YYYY-MM-DD') = v_today), 0)::integer as today_new,
      coalesce((select count(*) from today_quit_members), 0)::integer as today_quit,
      coalesce((select count(*) from all_events where status = 'pending'), 0)::integer as pending_count,
      coalesce((select count(*) from all_events where status <> 'ignored' and (event_type = 'quit' or delete_flag = 1 or exit_time is not null)), 0)::integer as quit_trace_count
  )
  select jsonb_build_object(
    'cards', (
      select jsonb_build_object(
        'activeRobots', 0,
        'monitoredGroups', monitored_groups,
        'totalMembers', total_members,
        'totalMembersWithQuit', total_members + quit_trace_count + today_quit,
        'todayNew', today_new,
        'todayQuit', today_quit,
        'pendingCount', pending_count
      )
      from metrics
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', group_id,
        'name', group_name,
        'avatarUrl', coalesce(raw_json->>'avatar_url', raw_json->>'avatarUrl', raw_json->>'head_img', '')
      ) order by group_name)
      from deduped_bindings
    ), '[]'::jsonb),
    'hourlyDistribution', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h.hour, 'count', coalesce(c.count, 0)) order by h.hour)
      from generate_series(0, 23) h(hour)
      left join (
        select extract(hour from invite_time at time zone 'Asia/Shanghai')::integer as hour, count(*)::integer as count
        from scoped_invites
        where invite_time is not null
        group by 1
      ) c on c.hour = h.hour
    ), '[]'::jsonb),
    'inviteRanking', coalesce((
      select jsonb_agg(jsonb_build_object(
        'inviterId', coalesce(inviter_ids, inviter_name),
        'inviterName', inviter_name,
        'count', invite_count
      ) order by invite_count desc, recent_time desc)
      from ranking_grouped
    ), '[]'::jsonb),
    'groupRanking', coalesce((
      select jsonb_agg(jsonb_build_object(
        'groupId', group_id,
        'groupName', group_name,
        'count', greatest(coalesce(member_count, 0), 0)
      ) order by greatest(coalesce(member_count, 0), 0) desc, group_name)
      from deduped_bindings
    ), '[]'::jsonb),
    'recentActivities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventType', case when event_type = 'quit' or delete_flag = 1 then 'quit' else 'invite' end,
        'memberName', member_name,
        'avatarUrl', avatar_url,
        'sourceName', case
          when event_type = 'quit' then source_name
          when delete_flag = 1 then '自动检查'
          else source_name
        end,
        'sourceLabel', case
          when event_type = 'quit' and event_subtype = 'self_quit' then '主动退群'
          when event_type = 'quit' and event_subtype = 'removed' then '被移出'
          when event_type = 'quit' then '退群'
          when delete_flag = 1 then '已退出群'
          when event_subtype = 'qrcode' then '扫码'
          when event_subtype = 'direct' then '直接入群'
          when source_name = '未知来源' then '扫码'
          else '邀请'
        end,
        'groupName', group_name,
        'time', event_time
      ) order by event_time desc)
      from (
        select *
        from all_events
        where status <> 'ignored'
        order by event_time desc nulls last
        limit 9
      ) recent
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.weflow_invite_member_trace(
  p_tag_id text default null,
  p_group_id text default null,
  p_keyword text default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_status text default null,
  p_attribution text default null,
  p_include_quit boolean default true,
  p_limit integer default 200,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
as $$
declare
  v_is_all boolean;
  v_keyword text;
  v_limit integer;
  v_offset integer;
  v_result jsonb;
begin
  v_is_all := coalesce(p_tag_id, '') in ('', '__all__');
  v_keyword := lower(trim(coalesce(p_keyword, '')));
  v_limit := greatest(coalesce(p_limit, 200), 0);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  with active_bindings as (
    select
      gtb.id,
      gtb.account_scope,
      gtb.group_id,
      coalesce(nullif(gtb.group_name, ''), gtb.group_id) as group_name,
      gtb.activity_tag_id,
      gtb.updated_at,
      gtb.raw_json
    from group_tag_bindings gtb
    where gtb.enabled = true
      and gtb.deleted_at is null
      and (v_is_all or gtb.activity_tag_id = p_tag_id)
  ),
  deduped_bindings as (
    select *
    from (
      select
        active_bindings.*,
        row_number() over (
          partition by active_bindings.group_id
          order by active_bindings.updated_at desc nulls last, active_bindings.id desc
        ) as rn
      from active_bindings
    ) ranked
    where rn = 1
  ),
  scoped_events as (
    select
      'invite'::text as event_type,
      ie.id,
      ie.account_scope,
      ie.activity_tag_id,
      ie.group_id,
      coalesce(nullif(ie.group_name, ''), ie.group_id) as group_name,
      coalesce(nullif(ie.member_name, ''), nullif(ie.member_wxid, ''), '未知成员') as member_name,
      coalesce(nullif(ie.member_wxid, ''), '') as wxid,
      coalesce(nullif(ie.inviter_name, ''), '未知来源') as related_name,
      coalesce(
        nullif(ie.raw_json->>'join_type', ''),
        case when nullif(ie.inviter_name, '') is not null or nullif(ie.inviter_wxid, '') is not null then 'invite' else 'qrcode' end
      ) as event_subtype,
      ie.invite_time,
      ie.exit_time,
      ie.created_time,
      ie.updated_at,
      coalesce(nullif(ie.status, ''), 'confirmed') as status,
      coalesce(ie.valid_flag, 0) as valid_flag,
      coalesce(ie.delete_flag, 0) as delete_flag,
      ie.raw_message,
      coalesce(ie.raw_json->>'head_img', ie.raw_json->>'avatar_url', ie.raw_json->>'avatarUrl', '') as avatar_url,
      case
        when coalesce(ie.delete_flag, 0) = 1 then coalesce(ie.updated_at, ie.exit_time, ie.invite_time, ie.created_time)
        else coalesce(ie.invite_time, ie.exit_time, ie.created_time)
      end as event_time
    from invite_events ie
    where (v_is_all or ie.activity_tag_id = p_tag_id)
      and (p_group_id is null or p_group_id = '' or ie.group_id = p_group_id)
      and exists (
        select 1
        from active_bindings b
        where b.account_scope = ie.account_scope
          and b.group_id = ie.group_id
          and b.activity_tag_id = ie.activity_tag_id
      )

    union all

    select
      'quit'::text as event_type,
      qe.id,
      qe.account_scope,
      qe.activity_tag_id,
      qe.group_id,
      coalesce(nullif(qe.group_name, ''), qe.group_id) as group_name,
      coalesce(nullif(qe.member_name, ''), nullif(qe.member_wxid, ''), '未知成员') as member_name,
      coalesce(nullif(qe.member_wxid, ''), '') as wxid,
      coalesce(nullif(qe.operator_name, ''), '系统') as related_name,
      coalesce(nullif(qe.raw_json->>'quit_type', ''), 'unknown') as event_subtype,
      qe.invite_time,
      qe.exit_time,
      qe.created_time,
      qe.updated_at,
      coalesce(nullif(qe.status, ''), 'confirmed') as status,
      coalesce(qe.valid_flag, 0) as valid_flag,
      coalesce(qe.delete_flag, 1) as delete_flag,
      qe.raw_message,
      coalesce(qe.raw_json->>'head_img', qe.raw_json->>'avatar_url', qe.raw_json->>'avatarUrl', '') as avatar_url,
      coalesce(qe.invite_time, qe.exit_time, qe.created_time) as event_time
    from quit_events qe
    where (v_is_all or qe.activity_tag_id = p_tag_id)
      and (p_group_id is null or p_group_id = '' or qe.group_id = p_group_id)
      and exists (
        select 1
        from active_bindings b
        where b.account_scope = qe.account_scope
          and b.group_id = qe.group_id
          and b.activity_tag_id = qe.activity_tag_id
      )
  ),
  normalized as (
    select
      *,
      case
        when status = 'pending' then 'pending'
        when status <> 'ignored' and (event_type = 'quit' or delete_flag = 1 or exit_time is not null) then 'quit'
        else 'active'
      end as trace_status,
      case
        when status = 'pending' then 'pending'
        when status = 'ignored' then 'invalid'
        when event_type <> 'invite' then 'none'
        when valid_flag = -1 then 'invalid'
        else 'valid'
      end as trace_attribution
    from scoped_events
    where status <> 'deleted'
      and (event_time is not null)
      and (p_start_time is null or event_time >= p_start_time)
      and (p_end_time is null or event_time <= p_end_time)
      and (v_keyword = '' or lower(trim(member_name)) like '%' || v_keyword || '%')
  ),
  filtered as (
    select *
    from normalized
    where (p_status is null or p_status = '' or trace_status = p_status)
      and (p_attribution is null or p_attribution = '' or trace_attribution = p_attribution)
      and (p_include_quit = true or trace_status <> 'quit')
  ),
  paged as (
    select *
    from filtered
    order by event_time desc nulls last
    limit nullif(v_limit, 0)
    offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'memberName', member_name,
        'avatarUrl', avatar_url,
        'wxid', wxid,
        'source', concat(
          case
            when event_type = 'quit' and event_subtype = 'self_quit' then '主动退群'
            when event_type = 'quit' and event_subtype = 'removed' then '被移出'
            when event_type = 'quit' then '退群'
            when event_subtype = 'qrcode' then '扫码'
            when event_subtype = 'direct' then '直接入群'
            when related_name = '未知来源' then '扫码'
            else '邀请'
          end,
          ' · ',
          related_name
        ),
        'groupId', group_id,
        'groupName', group_name,
        'time', event_time,
        'status', trace_status,
        'attribution', trace_attribution,
        'rawContent', coalesce(raw_message, '')
      ) order by event_time desc)
      from paged
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', group_id,
        'name', group_name,
        'avatarUrl', coalesce(raw_json->>'avatar_url', raw_json->>'avatarUrl', raw_json->>'head_img', '')
      ) order by group_name)
      from deduped_bindings
    ), '[]'::jsonb),
    'limit', v_limit,
    'offset', v_offset,
    'hasMore', case when v_limit > 0 then v_offset + v_limit < (select count(*) from filtered) else false end
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.weflow_invite_dashboard(text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.weflow_invite_member_trace(text, text, text, timestamptz, timestamptz, text, text, boolean, integer, integer) to service_role;
