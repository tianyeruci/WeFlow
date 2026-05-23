grant usage on schema public to service_role;

grant select, insert, update, delete on table activity_tags to service_role;
grant select, insert, update, delete on table group_tag_bindings to service_role;
grant select, insert, update, delete on table invite_events to service_role;
grant select, insert, update, delete on table quit_events to service_role;
grant select, insert, update, delete on table member_identity_bindings to service_role;
grant select, insert, update, delete on table inviter_identity_mappings to service_role;
grant select, insert, update, delete on table scan_logs to service_role;

grant select on table final_stat_events to service_role;
