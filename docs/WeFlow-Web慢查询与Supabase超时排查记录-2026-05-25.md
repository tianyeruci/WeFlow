# WeFlow-Web 慢查询与 Supabase 超时排查记录（2026-05-25）

## 结论摘要

本次以生产慢查询文件 `D:\收藏\桌面\慢查询.json` 为事实来源。

页面端部署在 Vercel，报错表现为：

- `upstream request timeout`
- Supabase：`{"code":"57014","message":"canceling statement due to statement timeout"}`

根因不是单纯的 React 页面渲染问题，也不是只需要调大 Vercel 超时时间。慢查询显示，最大压力来自 `invite_events` 按 `activity_tag_id` 分页读取：

- 调用次数：`64,959`
- 总执行时间占比：约 `75.00%`
- 平均耗时：约 `159.73ms`
- 最大耗时：约 `7.99s`

这说明页面端热路径正在把明细表一页一页拉回 Vercel 函数，再由 JavaScript 做聚合、筛选和分页。数据增长后，这种模式会稳定触发 Supabase statement timeout。

## 慢查询 Top 记录

| 排名 | 表 / 操作 | calls | 总耗时占比 | mean | max | 判断 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | `invite_events` select by `activity_tag_id` + `order by id limit/offset` | 64,959 | 75.00% | 159.73ms | 7.99s | P0，页面热路径整表分页拉取 |
| 2 | `raw_events` upsert on `(account_scope, dedup_key)` | 2,817 | 7.51% | 368.68ms | 5.92s | P1，同步批量写入压力 |
| 3 | `member_identity_bindings` upsert | 3,755 | 4.64% | 170.87ms | 6.21s | P1，同步批量写入压力 |
| 4 | `group_tag_bindings` select by `enabled + activity_tag_id` | 12,121 | 3.56% | 40.66ms | 5.45s | P1，大屏和筛选重复读取 |
| 5 | `sync_batches` delete old web-refresh rows | 31,815 | 2.42% | 10.54ms | 7.96s | P1，刷新轮询触发高频清理 |
| 6 | `invite_events` upsert | 2,006 | 1.77% | 122.36ms | 4.74s | P1，同步写入压力 |
| 7 | `final_stat_events` select all by `order by id limit/offset` | 3,862 | 1.13% | 40.37ms | 0.89s | 不是本次最大根因 |

## 对应代码路径

主要读取链路：

- `WeFlow-Web/app/api/invite/dashboard/route.ts`
- `WeFlow-Web/app/api/invite/member-trace/route.ts`
- `WeFlow-Web/lib/invite-data.ts`
- `WeFlow-Web/lib/supabase-rest.ts`

原有风险点：

- `getDashboard()` 通过 `loadFinalEvents()` / `loadCompatibilityEvents()` 拉取事件明细，再在 Vercel 函数内聚合。
- `getMemberTrace()` 先拉取匹配范围内的全部事件，再在 JS 里筛选、排序、分页。
- `supabaseSelectAll()` 采用 `limit + offset` 循环拉全量数据，正好对应慢查询里的高频 `invite_events order by id limit/offset`。
- Web 页面大屏自动刷新原为 `10s`，会不断重复打同一组高成本查询。
- “刷新最新数据”按钮会创建远端刷新请求，原页面还会立刻再查 dashboard，和自动刷新叠压。

## 本轮修复动作

新增 SQL 补丁：

- `supabase/weflow_web_invite_rpc_hotpath_2026_05_25.sql`

核心内容：

- 新增 `weflow_invite_dashboard(...)` RPC，让大屏卡片、群列表、排行榜、时段分布、最近动态在 Supabase 内聚合。
- 新增 `weflow_invite_member_trace(...)` RPC，让成员溯源在数据库侧筛选、排序、分页。
- 补充热路径索引：
  - `invite_events(activity_tag_id, id)`
  - `invite_events(activity_tag_id, group_id, invite_time desc)`
  - `invite_events(activity_tag_id, inviter_wxid, invite_time desc)`
  - `quit_events(activity_tag_id, group_id, exit_time desc)`
  - `group_tag_bindings(activity_tag_id, group_id, updated_at desc)`，仅启用绑定
  - `sync_batches(source_client, status, started_at desc)`

Web 端改动：

- `WeFlow-Web/lib/supabase-rest.ts` 增加 `supabaseRpc()`。
- `WeFlow-Web/lib/invite-data.ts` 的 `getDashboard()` 和 `getMemberTrace()` 改为调用 RPC。
- `GET /api/invite/dashboard` 增加短 TTL CDN 缓存头：
  - `s-maxage=10`
  - `stale-while-revalidate=60`
  - `stale-if-error=300`
- 页面自动刷新从 `10s` 调整到 `60s`，错误后退避到 `120s`。
- 点击“刷新最新数据”只提交同步请求，不立即触发 dashboard 重查。

同步与刷新改动：

- `WeFlow-main` 远程刷新认领后改为默认 dirty 增量同步，不再每次 Web 刷新都强制 full sync。
- `sync_batches` 旧刷新请求清理改为最少 5 分钟一次，并停止在热路径中高频 `DELETE`。

## 验证重点

上线后重点观察：

1. Supabase 慢查询中不应再出现高频：
   `invite_events activity_tag_id order by id limit offset`
2. `GET /api/invite/dashboard` 不应再触发 `57014 statement timeout`。
3. 成员溯源翻页时只应返回当前页，不应拉全量后再分页。
4. 点击“刷新最新数据”后，只创建轻量刷新请求，不应立即叠加 dashboard 重查。
5. `sync_batches` 的 `DELETE` 慢查询次数应明显下降。

## 后续风险

- 如果活动数据继续增长到百万级，RPC 仍可能需要升级为汇总表或物化视图。
- 导出全部成员或批量群员仍可能是大数据量操作，应单独做异步导出或分片导出。
- 如果生产库还未执行 SQL 补丁，Web 新代码会因为 RPC 不存在而报错；部署顺序必须是先执行 Supabase SQL，再部署 Vercel。
