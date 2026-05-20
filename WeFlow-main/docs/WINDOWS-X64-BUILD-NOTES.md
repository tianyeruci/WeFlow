# WeFlow-main Windows x64 打包笔记

范围：只打包 `D:\work\WeFlow\WeFlow-main`，不要进入 `WeFlow-Web`。

## 本次可用流程

```powershell
cd D:\work\WeFlow\WeFlow-main
npm run typecheck
npx vite build --configLoader native --emptyOutDir false
npx electron-builder --win --x64 --config.npmRebuild=false
```

## 本次踩坑

1. `vite build` 默认配置加载器在 Windows 上会触发 `net use` 探测，出现 `spawn EPERM`。
   - 解决：改用 `--configLoader native`
2. `dist\assets` 目录在清理阶段可能被 ACL 拦住。
   - 解决：`vite build` 加 `--emptyOutDir false`
3. `sass-embedded` 在本机环境下会触发 `spawn EPERM`。
   - 解决：本地构建链改走 `sass` 纯 JS 路线，不依赖 `sass-embedded`
4. `electron-builder` 默认会重建 native 依赖，可能再次触发 `spawn EPERM`。
   - 解决：加 `--config.npmRebuild=false`

## 产物

- 安装包：`release\WeFlow-4.3.0-Setup.exe`
- 更新文件：`release\latest.yml`
- 解包目录：`release\win-unpacked`

## 备注

- 本次构建看到的 `customResolver` / `inlineDynamicImports` / chunk 过大 warning 都不是阻塞项。
- 如果后续重新安装依赖，可能需要重新确认本地构建环境里与 Windows native binary 相关的处理。

## 2026-05-19 重新打包记录

本轮只在 `D:\work\WeFlow\WeFlow-main` 执行，未进入 `WeFlow-Web`。

实际命令：

```powershell
cd D:\work\WeFlow\WeFlow-main
npx vite build --configLoader native --emptyOutDir false
npx electron-builder --win --x64 --config.npmRebuild=false
```

结果：

- 安装包：`release\WeFlow-4.3.0-Setup.exe`
- 大小：`178322274` bytes
- SHA256：`0D29BE52B7E9BC8AB6BF532530234EEF85C28122B3C240B63EF876F3BA3C480A`
- `latest.yml` 已生成并指向 `WeFlow-4.3.0-Setup.exe`
- `release\win-unpacked` 已生成

本轮额外注意：

- 开始时 `release` 目录不存在，需要重新生成。
- `electron-builder` 需要在允许执行本地 `app-builder.exe` 的环境下运行，否则会出现 `spawn EPERM`。
