# WeFlow 本地重启指南

本文记录本地重新启动 `WeFlow-main` 的最短路径，以及本次实际遇到的坑。适用于 Windows + PowerShell 环境。

## 关键假设

- 主应用目录是 `D:\work\WeFlow\WeFlow-main`。
- 本地开发启动命令是 `npm run dev`。
- 默认开发端口是 `3000`；如果端口被占用，Vite 可能自动尝试下一个端口。
- 如果在 Codex 沙箱里启动，Vite 加载配置时可能遇到 `spawn EPERM`，需要在沙箱外执行启动命令。

## 快速重启

### 1. 进入主应用目录

```powershell
Set-Location D:\work\WeFlow\WeFlow-main
```

### 2. 启动开发服务

前台启动，适合自己在终端里看日志：

```powershell
npm run dev
```

后台启动并写日志，适合让 Codex 或脚本代跑：

```powershell
$logDir = 'D:\work\WeFlow\.codex-tmp'
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

Start-Process -FilePath 'powershell.exe' `
  -ArgumentList @(
    '-NoLogo',
    '-NoProfile',
    '-Command',
    "Set-Location 'D:\work\WeFlow\WeFlow-main'; npm run dev *> 'D:\work\WeFlow\.codex-tmp\weflow-dev.log'"
  ) `
  -WindowStyle Hidden
```

### 3. 确认端口

```powershell
netstat -ano | Select-String ':3000|:3001|:5173|:4173'
```

看到类似下面的输出，表示服务已经监听成功：

```text
TCP    [::1]:3000    [::]:0    LISTENING    <PID>
```

访问地址通常是：

```text
http://localhost:3000
```

### 4. 查看日志

```powershell
Get-Content D:\work\WeFlow\.codex-tmp\weflow-dev.log -Tail 80
```

## 需要先停旧服务时

先查端口对应的 PID：

```powershell
netstat -ano | Select-String ':3000'
```

确认 PID 对应的进程：

```powershell
Get-Process -Id <PID>
```

确认无误后再停止：

```powershell
Stop-Process -Id <PID>
```

不要直接批量结束所有 `node` / `electron` 进程，因为本机可能还有 Codex、Node REPL 或其他项目在使用它们。

如果应用已经完整打开，通常会同时看到 `node` 和 `electron` 两个相关进程。实际重启时，优先停掉监听 `3000` 的 `node`，必要时把对应的 `electron` 一起停掉，避免窗口还留在桌面上。
有时 `Stop-Process` 不一定能真正清掉旧实例，这时可以改用 `taskkill /PID ... /T /F`，但在当前机器上可能需要提升权限才能成功。

## 常见问题

### `spawn EPERM`

现象：

```text
failed to load config from D:\work\WeFlow\WeFlow-main\vite.config.ts
Error: spawn EPERM
```

处理：

- 如果是在普通 PowerShell 里手动启动，重新运行 `npm run dev` 通常即可。
- 如果是在 Codex 沙箱里启动，需要把 `npm run dev` 放到沙箱外执行。
- 成功后再用端口检查确认 `3000` 是否已经监听。

### `Start-Process` 报 `Key in dictionary: 'Path'`

现象：

```text
Item has already been added. Key in dictionary: 'Path'  Key being added: 'PATH'
```

处理：

- 避免使用 `Start-Process -RedirectStandardOutput/-RedirectStandardError` 直接重定向。
- 改用本文的后台启动命令，在子 PowerShell 里用 `*>` 写入日志。

### 查进程命令被拒绝

现象：

```text
Get-CimInstance Win32_Process: 拒绝访问
Get-WmiObject Win32_Process: Access denied
```

处理：

- 不依赖 WMI/CIM 查询完整命令行。
- 优先用 `netstat -ano` 查端口，再用 `Get-Process -Id <PID>` 做最小确认。

### `Stop-Process` 没停干净

现象：

- 端口 `3000` 仍然在监听。
- `node` / `electron` 进程还留着。

处理：

- 先用 `Stop-Process -Id <PID>` 试一次。
- 如果旧实例还在，再用 `taskkill /PID <PID> /T /F`。
- 本机若出现 `Access denied`，需要用提升权限的方式执行。

## 本次验证记录

- 启动目录：`D:\work\WeFlow\WeFlow-main`
- 启动命令：`npm run dev`
- 日志文件：`D:\work\WeFlow\.codex-tmp\weflow-dev.log`
- 验证方式：`netstat -ano | Select-String ':3000|:3001|:5173|:4173'`
- 成功状态：`[::1]:3000` 处于 `LISTENING`
- 本次新坑：`Stop-Process` 没有清掉旧实例，最终改用 `taskkill` 才完成重启

## 本次重启补充

- 重启前旧实例里有两个 `node` 进程，PID 分别是 `120` 和 `556`。
- 先停掉旧进程，再重新执行 `npm run dev`，新的监听 PID 是 `22376`。
- 启动日志里已经出现 `built in ... ms`，说明这次重新编译和拉起是成功的。
