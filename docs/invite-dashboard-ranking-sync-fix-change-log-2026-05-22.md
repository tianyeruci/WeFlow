# 增量扫描、全部活动口径与排行榜统计修复变更记录

## 已完成
- 已保存执行计划：`docs/invite-dashboard-ranking-sync-fix-plan-2026-05-22.md`。
- 增量扫描继续只读取系统消息 `localType=10000`，并改为倒序分页读取；已有 `rawEvents.updated_at` 水位的群会读到水位后停止，不再一次性拉取全部历史系统消息。
- Web 刷新请求认领后才联动增量扫描，且最多等待 10 秒；Main 手动同步和定时同步不再等待或触发增量扫描。
- 排行榜按当前活动/全部活动、群、时间段筛选后的排行结果计算标题中的“招募者”和“总人数”。
- Web 排行榜日期筛选在浏览器端转为绝对 ISO 时间传给接口，避免部署环境时区导致筛选偏移。
- Web 今日新增和进群时段分布改为北京时间口径，和 Main 数据大屏一致。
- 邀请排行榜聚合过滤为 confirmed 且 valid 的邀请事件；Main 不去重时按事件数统计，去重时仍按成员键统计。
- 修复导出 worker 启动时可能和邀请统计后台任务同时打开 WCDB 的问题：批量会话导出、单会话导出、联系人导出和朋友圈导出都会先进入导出忙碌保护，并最多等待邀请统计扫描/同步任务 30 秒收尾。

## 修改文件
- `WeFlow-main/electron/main.ts`
- `WeFlow-main/electron/services/inviteStatsService.ts`
- `WeFlow-main/electron/services/inviteStatsSyncService.ts`
- `WeFlow-main/src/pages/InviteStatsPage.tsx`
- `WeFlow-Web/app/page.tsx`
- `WeFlow-Web/lib/invite-data.ts`
- `docs/invite-dashboard-ranking-sync-fix-plan-2026-05-22.md`

## 验证结果
- `WeFlow-main`: `npm run typecheck` 通过。
- `WeFlow-Web`: `npm run typecheck` 通过。
- `git diff --check` 通过；仅提示 Windows 工作区中部分文件下次由 Git 触碰时 LF 会替换为 CRLF。

## 说明
- 本次未改数据库结构，未新增 SQL，未重做邀请/退群解析器。
- `__all__` 仍作为“全部活动”虚拟范围使用；事件过滤继续依赖有效的 `group_id + activity_tag_id` 绑定关系。
