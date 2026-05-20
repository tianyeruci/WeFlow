# 邀请统计改造变更记录

## 已改文件
- `WeFlow-main/electron/services/inviteStatsService.ts`
- `WeFlow-main/electron/services/inviteStatsSyncService.ts`
- `WeFlow-main/electron/main.ts`
- `WeFlow-main/electron/preload.ts`
- `WeFlow-main/src/types/electron.d.ts`
- `WeFlow-main/src/pages/InviteStatsPage.tsx`
- `WeFlow-main/src/pages/InviteStatsPage.scss`
- `WeFlow-Web/lib/invite-data.ts`
- `WeFlow-Web/app/page.tsx`

## 主要变更
- 待确认记录增加“复制”按钮，复制被邀请人昵称。
- 保留“添加信息”入口，不删除现状。
- 本地同步改为启动后 1 分钟首次执行，之后每 3 分钟一次。
- 检查是否退出群改为启动后 1 分钟首次执行，之后每 30 分钟一次。
- 本地统计端支持“全部活动”和“是否去重”切换，默认不去重。
- Web 端支持“全部活动”默认口径，不展示去重按钮。
- Web 端和本地端都按 `__all__` 支持全量活动聚合。
- 修正待确认里 wxid 已知但昵称漂移时的重复统计处理。
- 远端同步仍保持 Supabase 作为 Web 唯一数据源，不新增表。

## 验证情况
- 已完成 `git diff --check`。
- `npm run typecheck` / `npm run build` 因当前环境缺少 `node_modules`，`tsc` 无法启动，未能执行。

## 同步与时间口径补充
- 当前统计口径里的“活动标签”指的是当前账号下已启用并绑定的全部群范围，再按页面选择的单活动或全部活动做聚合。
- 统计时间一律取事件本身的业务时间：邀请看 `invite_time`，退群看 `quit_time`，不是扫描消息时的创建时间。
- 本地同步的流程是先在本地读取/修正/标记脏数据，再由同步服务按脏数据批量导出并 POST 到远端。
- 远端接收后使用 Supabase 的 upsert 方式写入对应表，不是先回查远端再反写本地。
- 对于“先查后更新”的本地数据，例如群成员数、昵称修正、已知 wxid 归档、待确认转有效，这些更新都会先落到本地记录里并置为 dirty，随后在下一次自动同步或手动同步时一起上送。
- `WeFlow-Web` 继续只读 Supabase，不直接触发本机同步接口；Web 侧刷新只会重新读取远端数据。

## 本次同步问题排查记录
- 原问题 1：`group_tag_bindings` 这种“先查后改”的数据在本地已经变脏，但远端同步时被错误过滤掉了，原因是远端同步逻辑要求它必须绑定到“本次也一起上传的活动标签”才允许 upsert。
- 原问题 2：同步完成时，服务会把同步期间新产生的脏数据也一起标成已同步，导致后续改动可能被吞掉，看起来像“同步过了但远端没变化”。
- 原问题 3：清空群标签时，本地把 `activity_tag_id` 置空，但远端原逻辑不能正确表达这个状态，容易要么被过滤，要么触发关联错误。
- 处理方式 1：远端同步不再按“本次上传的活动标签”去过滤 `group_tag_bindings`，只要绑定本身变脏就允许同步。
- 处理方式 2：本地同步结果改成“只确认这次导出时的快照”，并且用行的更新时间校验，避免把同步过程中后来新增的脏数据误判为已同步。
- 处理方式 3：绑定解绑时把 `activity_tag_id` 按空值语义上送，避免空字符串和外键语义冲突。
- 仍有隐患：本地“删除活动标签”以及“确认时清理掉的重复旧行”目前仍属于物理删除语义，远端如果没有对应删除动作，旧数据可能残留；这块需要单独做删除同步或墓碑同步才能彻底闭环。
- 仍有隐患：快照校验依赖 `updated_at` 的秒级时间戳，极端情况下同一秒内多次修改可能被误判为同一版，虽然概率不高，但这是当前实现的边界。
