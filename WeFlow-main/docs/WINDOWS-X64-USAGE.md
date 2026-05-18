# WeFlow Windows x64 (Win10+) 使用文档

本文档面向拿到 Windows x64 安装包的使用者，用于安装和验证 WeFlow 是否能在另一台 Win10+ x64 电脑上正常运行。

## 适用范围

- 系统：Windows 10 或更高版本，64 位。
- 安装包：`WeFlow-4.3.0-Setup.exe` 或同版本号的 Windows x64 安装包。
- 架构：x64，不适用于 Windows ARM64 专用验证。

## 安装前准备

1. 确认系统是 Windows x64

   ```powershell
   $env:PROCESSOR_ARCHITECTURE
   ```

   常见返回值应为 `AMD64`。

2. 确认磁盘空间

   安装包约 170 MB，安装后占用会更大。建议预留至少 1 GB 可用空间。

3. 准备微信客户端

   如果需要使用微信数据读取、密钥获取、图片解密等功能，目标电脑上需要安装并登录 Windows 微信客户端。

4. 准备权限

   自动获取密钥、内存扫描、读取微信数据等能力可能需要较高权限。若功能失败，可尝试右键 WeFlow，选择“以管理员身份运行”。

## 安装步骤

1. 双击运行安装包。
2. 按安装向导选择安装目录。
3. 如果安装器提示缺少 Visual C++ Redistributable x64，建议允许安装。
4. 安装完成后，从桌面快捷方式或开始菜单启动 WeFlow。

如果 Windows SmartScreen 提示风险，通常是因为安装包没有代码签名或签名信誉不足。确认安装包来源可信后，可以选择继续运行。

## 首次启动检查

启动后按顺序确认：

1. Splash/启动页能正常显示。
2. 主界面能进入。
3. 托盘图标正常显示。
4. 没有出现缺失 DLL、native module、`VCRUNTIME140.dll`、`MSVCP140.dll`、`0xc000007b` 等错误。

如果启动失败，优先检查：

- 是否安装 Visual C++ 2015-2022 Redistributable x64。
- 是否被杀毒软件隔离了安装目录中的 `.dll`、`.node` 或 `ffmpeg.exe`。
- 是否安装到了无权限访问的目录。

## 微信数据配置

具体入口以当前界面为准，通常需要完成以下配置：

1. 选择微信数据目录。
2. 确认目录下包含当前账号相关数据，例如 `wxid_...` 账号目录或 `db_storage`。
3. 获取或填写数据库密钥。
4. 测试数据库连接。

常见注意点：

- 微信需要先登录。
- 如果自动获取密钥失败，尝试以管理员身份运行 WeFlow。
- 如果微信本身以管理员身份运行，WeFlow 也通常需要以管理员身份运行。
- 如果数据目录在移动硬盘、网络盘或权限受限目录，建议先复制到本机普通用户可读写目录再测试。

## 图片、语音和视频功能检查

安装后建议按需验证：

1. 图片解密
   - 检查图片预览或导出是否正常。
   - 若失败，重点排查图片密钥、`wedecrypt` native addon、微信缓存目录权限。

2. 语音转写
   - 检查语音消息读取和转写是否正常。
   - 若失败，重点排查 `sherpa-onnx` 相关 native 文件是否被安全软件拦截。

3. 视频处理
   - 检查视频预览、导出或转码是否正常。
   - 若失败，重点排查 `ffmpeg.exe` 是否存在且未被隔离。

## 日志与诊断

遇到问题时，可以优先查看：

1. 应用数据目录

   常见位置：

   ```text
   %APPDATA%\WeFlow
   ```

2. WCDB 日志

   常见位置：

   ```text
   %APPDATA%\WeFlow\logs\wcdb.log
   ```

3. 安装目录

   默认位置取决于安装时选择的目录。检查安装目录下是否存在：

   ```text
   resources\resources\wcdb\win32\x64\wcdb_api.dll
   resources\resources\key\win32\x64\wx_key.dll
   resources\resources\wedecrypt\win32\x64\weflow-image-native-win32-x64.node
   resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe
   resources\app.asar.unpacked\node_modules\koffi\build\koffi\win32_x64\koffi.node
   resources\app.asar.unpacked\node_modules\sherpa-onnx-win-x64\sherpa-onnx.node
   ```

## 常见问题

### 启动时报缺少 VCRUNTIME140.dll 或 MSVCP140.dll

安装 Microsoft Visual C++ 2015-2022 Redistributable x64，然后重启 WeFlow。

### 启动时报 0xc000007b

通常是运行库架构或 DLL 混用问题。确认系统是 x64，安装 VC++ Redistributable x64，并重新安装 WeFlow。

### 数据库连接失败

检查：

- 微信数据目录是否选择正确。
- 微信是否已经登录。
- 数据库密钥是否正确。
- `resources\resources\wcdb\win32\x64` 下的 `WCDB.dll`、`wcdb_api.dll`、`SDL2.dll` 是否存在。
- 是否有安全软件拦截 DLL 加载。

### 自动获取密钥失败

尝试：

- 先启动并登录微信。
- 关闭微信后由 WeFlow 引导启动。
- 右键 WeFlow，选择“以管理员身份运行”。
- 确认微信和 WeFlow 权限级别一致。

### 图片解密失败

检查：

- 是否已获取正确图片密钥。
- 微信图片缓存目录是否可访问。
- `weflow-image-native-win32-x64.node` 是否存在。
- 安全软件是否隔离了 `.node` 文件。

### 安装包被杀毒软件拦截

当前本地构建包未做代码签名，安全软件可能误报。正式分发建议使用代码签名证书签名安装包和主程序。

## 卸载与重装

1. 通过 Windows “应用和功能”卸载 WeFlow。
2. 如需完全清理本机配置，可手动备份后删除：

   ```text
   %APPDATA%\WeFlow
   ```

3. 重新运行安装包安装。

注意：删除 `%APPDATA%\WeFlow` 会清除本机 WeFlow 配置、缓存和日志。不要误删微信原始数据目录。

## 最小验收清单

换电脑验证时，至少确认：

- 安装包能完成安装。
- 应用能启动并进入主界面。
- 没有缺失 DLL 或 native module 报错。
- 托盘图标正常。
- 能选择微信数据目录。
- 能连接数据库。
- 图片/语音/视频相关能力按实际需要至少抽测一项。
- 卸载和重装流程正常。
