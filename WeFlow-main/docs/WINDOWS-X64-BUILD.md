# WeFlow-main Windows x64 (Win10+) 打包执行文档

本文档用于在本地生成 `WeFlow-main` 的 Windows x64 安装包，目标运行环境为 Windows 10 及以上 64 位系统。

## 目标与边界

- 目标产物：Windows x64 `exe` 安装包。
- 项目类型：React + Vite + Electron + electron-builder。
- 打包目录：`D:\work\WeFlow\WeFlow-main`
- 输出目录：`D:\work\WeFlow\WeFlow-main\release`
- 不修改产品逻辑，只做环境检查、依赖确认、构建和产物检查。
- 使用文档：`docs/WINDOWS-X64-USAGE.md`

## 本机已确认信息

- Node.js：`v24.14.0`
- npm：`11.9.0`
- 锁文件：`package-lock.json`，应使用 npm。
- 打包工具：`electron-builder@26.8.1`
- Electron：`electron@41.1.1`
- Windows 打包配置：`package.json` 的 `build.win.target` 为 `nsis`。
- 当前 `release` 目录不存在，后续构建会生成。

## 换电脑运行前必须关注的本地资源

这些资源不能只在开发机存在，必须被安装包带走。当前仓库里已能看到对应文件，但打包后仍要检查安装包解包结果。

1. Windows VC++ 运行时 DLL
   - 源目录：`resources/runtime/win32`
   - 文件：
     - `msvcp140.dll`
     - `msvcp140_1.dll`
     - `vcruntime140.dll`
     - `vcruntime140_1.dll`
   - `package.json` 已通过 `build.win.extraFiles` 复制到安装目录根部。
   - `installer.nsh` 也会检测并提示安装 VC++ Redistributable x64。

2. 微信密钥相关 DLL
   - 源目录：`resources/key/win32/x64`
   - 文件：`wx_key.dll`
   - 代码运行时会从 `process.resourcesPath/resources/key/win32/x64/wx_key.dll` 等路径查找。

3. WCDB 数据服务 DLL
   - 源目录：`resources/wcdb/win32/x64`
   - 文件：
     - `WCDB.dll`
     - `wcdb_api.dll`
     - `SDL2.dll`
   - 这是换电脑后数据库相关功能最容易失败的部分，打包后必须检查它们是否进入 `resources/resources/wcdb/win32/x64`。

4. 图片解密 native addon
   - 源目录：`resources/wedecrypt/win32/x64`
   - 文件：`weflow-image-native-win32-x64.node`
   - `package.json` 已把 `resources/wedecrypt/**/*.node` 加入 `asarUnpack`。

5. wasm 资源
   - 源目录：`electron/assets/wasm`
   - 文件：
     - `wasm_video_decode.js`
     - `wasm_video_decode.wasm`
   - `package.json` 已通过 `extraResources` 放到 `assets/wasm`。

6. npm native/二进制依赖
   - 重点包：
     - `koffi`
     - `sherpa-onnx-node`
     - `ffmpeg-static`
     - `silk-wasm`
     - `fzstd`
   - `package.json` 已在 `asarUnpack` 中列出 `silk-wasm`、`sherpa-onnx-node`、`ffmpeg-static`。
   - 打包后要检查 `resources/app.asar.unpacked/node_modules` 中是否存在这些运行期需要的二进制文件。

## 打包前检查命令

在 `D:\work\WeFlow\WeFlow-main` 执行：

```powershell
node -v
npm -v
npm ls electron electron-builder @electron/rebuild koffi sherpa-onnx-node ffmpeg-static silk-wasm fzstd
Get-ChildItem -Recurse resources\runtime\win32
Get-ChildItem -Recurse resources\key\win32\x64
Get-ChildItem -Recurse resources\wcdb\win32\x64
Get-ChildItem -Recurse resources\wedecrypt\win32\x64
Get-ChildItem -Recurse electron\assets\wasm
```

如果 `node_modules` 缺失或依赖异常，先执行：

```powershell
npm ci
```

`npm ci` 需要访问 npm registry。如果本地网络或代理导致失败，需要先处理网络/镜像源问题。

## 构建命令

推荐显式指定 Windows x64：

```powershell
npm run build -- --win --x64
```

该命令会执行：

1. `tsc`
2. `vite build`
3. `electron-builder --win --x64`

预期产物位于：

```text
D:\work\WeFlow\WeFlow-main\release
```

主要安装包通常类似：

```text
WeFlow-4.3.0-Setup.exe
```

如果后续同时构建多个架构，建议再调整 `artifactName`，把 `${arch}` 放入文件名，避免 x64/arm64 产物互相覆盖。当前只构建 x64 时可以暂不改。

## 产物检查命令

构建完成后执行：

```powershell
Get-ChildItem -Force release
Get-ChildItem -Recurse release | Select-Object FullName,Length
```

如果生成了免安装目录或解包目录，重点检查：

```powershell
Get-ChildItem -Recurse release -Include wx_key.dll,wcdb_api.dll,WCDB.dll,SDL2.dll,weflow-image-native-win32-x64.node,ffmpeg.exe,silk.wasm,wasm_video_decode.wasm
```

如果只生成单个 NSIS 安装包，建议在一台干净 Win10+ x64 机器或虚拟机中安装后检查：

- 应用能启动。
- 首次启动没有缺失 DLL 弹窗。
- 托盘图标显示正常。
- 能进入主界面。
- 选择微信数据目录后，数据库连接功能正常。
- 自动获取密钥、图片解密、语音/视频相关功能按需验证。
- 卸载后重装没有残留路径导致的问题。

## 常见失败点

1. 缺少 VC++ 运行时
   - 症状：启动时报 `VCRUNTIME140.dll`、`MSVCP140.dll`、`0xc000007b` 或 native 模块加载失败。
   - 当前应对：安装包根目录带 DLL，安装脚本也会提示安装 VC++ Redistributable x64。
   - 仍失败时：手动安装 Microsoft Visual C++ 2015-2022 Redistributable x64。

2. native 模块没有进入安装包
   - 症状：`Cannot find module`、`koffi` 加载失败、`sherpa-onnx-node` 加载失败、图片解密失败。
   - 检查：安装目录的 `resources/app.asar.unpacked/node_modules` 和 `resources/resources`。

3. WCDB DLL 路径不对
   - 症状：数据库初始化失败、`wcdb_api.dll` 加载失败。
   - 检查：安装后应存在 `resources/resources/wcdb/win32/x64/wcdb_api.dll`。

4. 安装脚本文字乱码
   - 当前 `installer.nsh` 在 PowerShell 中显示为乱码，可能是历史编码与当前读取编码不一致。
   - 这通常不影响打包成功，但可能影响安装器中文提示显示。
   - 如需正式分发，建议单独确认 `installer.nsh` 编码和 NSIS 提示文本。

5. 自动更新配置
   - `package.json` 配置了 GitHub release provider。
   - 本地打包不会自动发布，除非显式传入发布参数或相关环境变量。
   - 正式分发前要确认版本号、更新通道和 GitHub release 文件命名。

## 本次执行记录

执行时按下面顺序记录结果：

```text
1. 环境检查：已执行
   - Node.js v24.14.0
   - npm 11.9.0
   - npm 依赖检查通过，关键包存在：electron、electron-builder、koffi、sherpa-onnx-node、ffmpeg-static、silk-wasm、fzstd。
   - 已新增使用文档：docs/WINDOWS-X64-USAGE.md
2. 资源检查：已执行
   - resources/runtime/win32 存在 VC++ 运行时 DLL。
   - resources/key/win32/x64 存在 wx_key.dll。
   - resources/wcdb/win32/x64 存在 WCDB.dll、wcdb_api.dll、SDL2.dll。
   - resources/wedecrypt/win32/x64 存在 weflow-image-native-win32-x64.node。
   - electron/assets/wasm 存在 wasm_video_decode.js 和 wasm_video_decode.wasm。
3. 类型检查/构建：已执行
   - npm run typecheck：通过。
   - npm run build -- --win --x64 -c.directories.output=release-win10-x64：Electron 打包阶段失败，原因是该参数被解析为配置文件路径；此前 tsc 与 Vite 构建已通过。
   - npx electron-builder --win --x64：通过，使用 package.json 中的 release 输出目录。
   - electron-builder 使用 Electron v41.1.1 win32-x64、winCodeSign、NSIS、NSIS resources；本机已有缓存时不会重复下载。
4. release 产物检查：已执行
   - 生成安装包：release/WeFlow-4.3.0-Setup.exe
   - 安装包大小：178128642 bytes
   - SHA256：C9BC95150D0E214B45D5748460CAB5D140A5711981FDB3CB64DA7FD9DDFF64A6
   - latest.yml 已生成，指向 WeFlow-4.3.0-Setup.exe。
   - 生成解包目录：release/win-unpacked
   - 已确认关键运行文件存在：
     - release/win-unpacked/msvcp140.dll
     - release/win-unpacked/msvcp140_1.dll
     - release/win-unpacked/vcruntime140.dll
     - release/win-unpacked/vcruntime140_1.dll
     - release/win-unpacked/resources/resources/key/win32/x64/wx_key.dll
     - release/win-unpacked/resources/resources/wcdb/win32/x64/wcdb_api.dll
     - release/win-unpacked/resources/resources/wcdb/win32/x64/WCDB.dll
     - release/win-unpacked/resources/resources/wcdb/win32/x64/SDL2.dll
     - release/win-unpacked/resources/resources/wedecrypt/win32/x64/weflow-image-native-win32-x64.node
     - release/win-unpacked/resources/assets/wasm/wasm_video_decode.js
     - release/win-unpacked/resources/assets/wasm/wasm_video_decode.wasm
     - release/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe
     - release/win-unpacked/resources/app.asar.unpacked/node_modules/silk-wasm/lib/silk.wasm
     - release/win-unpacked/resources/app.asar.unpacked/node_modules/koffi/build/koffi/win32_x64/koffi.node
     - release/win-unpacked/resources/app.asar.unpacked/node_modules/sherpa-onnx-win-x64/sherpa-onnx.node
     - docs/WINDOWS-X64-BUILD.md
     - docs/WINDOWS-X64-USAGE.md
5. 残余风险：
   - release/WeFlow-4.3.0-Setup.exe 未做代码签名，Windows SmartScreen 可能提示风险。
   - 尚未在干净 Win10+ x64 机器或虚拟机中执行安装、启动和微信数据功能验证。
   - release 目录中还保留旧产物 release/WeFlow-4.3.0-Setup001.exe；本次最新产物是 release/WeFlow-4.3.0-Setup.exe。
   - installer.nsh 在当前 PowerShell 中显示为乱码，可能影响安装器中文提示文本，正式发布前建议单独确认编码。
   - 构建日志存在 Vite/Rolldown deprecated warning 和 chunk 体积 warning，不影响本次产物生成，但后续升级 Vite 9 前需要处理。
```
