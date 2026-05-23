# WeFlow 邀请排行榜与溯源筛选修复完成记录

## 修改内容

- 已保存执行计划：`WeFlow-main/docs/INVITE-RANKING-FIX-PLAN.md`。
- `WeFlow-main/electron/services/inviteStatsService.ts`
  - `getDashboard` 默认 `dedupeMembers` 改为 `false`。
  - `buildInviteRanking` 默认不去重时按邀请者显示名称聚合，并直接按邀请溯源记录计数，不再过滤状态、归因有效性或退群标记。
  - `exportInviteRanking` 默认按不去重口径导出；只有传入 `dedupeMembers: true` 时才走原有去重逻辑。
- `WeFlow-main/src/pages/InviteStatsPage.tsx`
  - 排行榜描述从“入群人数”改为“总人数”。
  - 排行榜图片标题使用同屏“总成员数”卡片当前显示值。
- `WeFlow-Web/lib/invite-data.ts`
  - Web 排行榜默认按邀请者显示名称聚合并按邀请溯源记录计数，不再使用有效邀请过滤。
  - 群成员溯源搜索仍只匹配成员昵称，增加成员昵称和关键词的轻量标准化，避免隐藏字符或空白差异导致漏数。
- `WeFlow-Web/app/page.tsx`
  - 排行榜描述和图片标题使用“总人数”。
  - 群成员溯源加载增加请求时序保护，避免旧请求覆盖新筛选结果。
- `WeFlow-Web/README.md` 和 `WeFlow-main/docs/INVITE-STATS.md`
  - 更新邀请排行榜、去重、成员昵称搜索相关口径说明。

## 验证结果

- `WeFlow-main`: `npm run typecheck` 通过。
- `WeFlow-Web`: `npm run typecheck` 通过。

## 剩余风险

- 未连接真实 Supabase/微信数据做端到端人工核对；需要在实际数据中确认默认排行榜人数等于群成员邀请溯源中的邀请记录条数。
- 排行榜图片中的图表数据仍展示排行榜各邀请人的计数；标题中的“总人数”按需求使用总成员数卡片值。
