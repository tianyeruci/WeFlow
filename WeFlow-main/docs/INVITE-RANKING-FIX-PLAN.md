# WeFlow 邀请排行榜与溯源筛选修复计划

## 摘要

修复 `WeFlow-main` 与 `WeFlow-Web` 在“数据大屏 > 邀请人数排行榜”的默认统计口径不一致问题，并修复 Web 端“群成员溯源”按成员昵称筛选后数量偏少的问题。

全部完成后，把实际修改清单、验证结果、剩余风险保存到：

`D:\work\004\WeFlow\WeFlow-main\docs\INVITE-RANKING-FIX-SUMMARY.md`

## 关键改动

- 排行榜默认口径为“不去重”：
  - 同一个邀请人下，只要被邀请人记录存在于“群成员邀请溯源”中，条数就 `+1`。
  - 默认按溯源表展示的邀请者名称聚合。
  - 不过滤状态。
  - 不过滤归因/有效性。
  - 不因是否退群而排除。
- 只有用户打开“去重”按钮时，才走原有去重逻辑。
- 桌面端后端默认值改为和页面一致：不传 `dedupeMembers` 时也按“不去重”统计。
- 排行榜仍只统计邀请类溯源记录；单独退群事件不进入邀请人数排行榜。
- 排行榜描述统一改为：
  `【拉新】招募者 xx 名，总人数 xxx`
- `总人数 xxx` 使用数据大屏“总成员数”卡片当前显示值，下载图片标题也同步改成同一口径。
- Web 端“群成员溯源”搜索保持原状：只按“成员昵称”筛选，不扩展到 wxid、邀请人、群名等字段。
- Web 端修复成员昵称筛选漏数：
  - 使用和表格展示一致的成员昵称字段进行匹配。
  - 对成员昵称和输入关键词做轻量标准化：去首尾空白、统一大小写、移除零宽字符、压缩连续空白。
  - 增加请求时序保护，避免快速输入时旧请求结果覆盖新筛选结果。

## 涉及文件

- `D:\work\004\WeFlow\WeFlow-main\electron\services\inviteStatsService.ts`
  - 调整 `getDashboard` 默认 `dedupeMembers`。
  - 调整 `buildInviteRanking`：默认不去重时直接按邀请溯源记录计数，不过滤状态、归因、退群。
  - 保留去重开启时的原有逻辑。
  - 调整 `exportInviteRanking` 默认口径。
- `D:\work\004\WeFlow\WeFlow-main\src\pages\InviteStatsPage.tsx`
  - 调整排行榜描述和图片标题。
- `D:\work\004\WeFlow\WeFlow-Web\lib\invite-data.ts`
  - 调整排行榜默认计数口径。
  - 修复成员昵称筛选的匹配标准化，不扩大搜索字段。
- `D:\work\004\WeFlow\WeFlow-Web\app\page.tsx`
  - 调整排行榜描述和图片标题。
  - 为群成员溯源加载增加旧请求结果保护。
- `D:\work\004\WeFlow\WeFlow-Web\README.md`
  - 更新 Web 端统计口径说明。
- `D:\work\004\WeFlow\WeFlow-main\docs\INVITE-STATS.md`
  - 新增或更新桌面端邀请统计口径说明。

## 验证计划

- `WeFlow-main` 执行：
  `npm run typecheck`
- `WeFlow-Web` 执行：
  `npm run typecheck`
- 手动核对：
  - 默认不开“去重”时，某邀请人的排行榜人数等于群成员邀请溯源中该邀请人的邀请记录条数。
  - `pending`、无效归因、已退群邀请记录默认都计入排行榜。
  - 打开“去重”后，恢复原有按成员去重的排行榜结果。
  - 数据大屏排行榜描述显示“总人数”，且值等于“总成员数”卡片。
  - 下载图片标题和页面描述一致。
  - Web 端按成员昵称筛选群成员溯源时，只按成员昵称匹配，数量与表中实际成员昵称匹配记录一致。

## 假设与边界

- `WeFlow-mainz` 按当前仓库实际目录理解为 `WeFlow-main`。
- “群成员邀请溯源表”按现有邀请类溯源记录理解，即 `inviteEvents` / `final_stat_events` 中的邀请记录。
- Web 端成员昵称搜索不改成多字段搜索。
- 不新增依赖，不改数据库结构，不改远程同步字段。
