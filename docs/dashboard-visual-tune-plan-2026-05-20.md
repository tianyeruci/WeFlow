# 数据大屏视觉修正执行计划

## Summary
- 只改展示和文案，不改表结构。
- 范围覆盖 `WeFlow-main` 和 `WeFlow-Web` 的数据大屏与主窗体标题。
- 目标是把当前页面里看得见的展示问题一次性修顺，减少歧义。

## 变更项
1. 数据大屏指标卡布局
   - 修正“含退群 / 去重”勾选项在 `WeFlow-main` 和 `WeFlow-Web` 中的对齐与占位方式。
   - 避免勾选区绝对定位导致卡片内布局不协调。

2. 群人数展示进度条
   - 修正群人数条的百分比基准。
   - 分页场景下仍按全部群的最大人数计算，不再按当前页最大值计算。

3. 邀请人数排行榜饼图
   - `WeFlow-Web` 目前是占比列表，改成真正的饼图展示。
   - `WeFlow-main` 的饼图展示同步修正，保证两端一致。

4. 恢复初始化确认文案
   - `WeFlow-main` 远程同步设置里的恢复初始化确认词，从原来的英文口令改为“恢复初始化”。

5. 页面标题
   - `WeFlow-main` 打开后的页面标题去掉 `WeFlow` 前缀。
   - 如有必要，同步收敛 Web 标题前缀，保持两端一致。

## Implementation Order
1. 先修布局样式和群人数条基准。
2. 再替换饼图展示。
3. 然后修恢复初始化文案。
4. 最后统一页面标题。

## Verification
- `WeFlow-main`: `npm run typecheck`
- `WeFlow-main`: `npx vite build`
- `WeFlow-Web`: `npm run typecheck`
- `WeFlow-Web`: `npm run build`
- `git diff --check`

## Notes
- 不新增表结构。
- 不引入新的后端接口。
- 所有改动应能直接从截图问题回溯到具体实现。
