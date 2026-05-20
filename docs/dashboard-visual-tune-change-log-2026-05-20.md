# 数据大屏视觉修正变更记录

## 本次修改
- `WeFlow-main` 和 `WeFlow-Web` 的数据大屏指标卡布局做了调整，勾选区改为正常占位，不再绝对定位压住卡片内容。
- `WeFlow-main` 和 `WeFlow-Web` 的群人数展示进度条改为按全部群的最大人数计算，分页后不再出现“当前页第一条总是 100%”的问题。
- `WeFlow-main` 和 `WeFlow-Web` 的邀请人数排行榜“饼图”改成真实饼图展示，不再用列表替代。
- `WeFlow-main` 远程同步设置里的恢复初始化确认词从英文口令改成了“恢复初始化”。
- `WeFlow-main` 打开窗口标题已去掉 `WeFlow` 前缀。
- `WeFlow-Web` 页面标题也同步去掉了 `WeFlow` 前缀，保持两端一致。

## 原因
- 指标卡的勾选项布局在窄卡片里容易显得挤和乱。
- 群人数条如果按分页最大值计算，会把当前页最大项错误地放大成 100%。
- 饼图区域原来在 Web 端只是占比列表，不符合预期。
- 恢复初始化的确认词和页面标题保留了旧前缀，和当前界面风格不一致。

## 验证
- `WeFlow-main`: `npm run typecheck` 通过。
- `WeFlow-Web`: `npm run typecheck` 通过。
- `WeFlow-Web`: `npm run build` 通过。
- `WeFlow-main`: `npx vite build` 通过。
- `git diff --check` 通过，仅有 CRLF 提示。
