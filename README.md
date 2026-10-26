<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/brand/aogiri-horizontal-dark.svg">
    <img src="design/brand/aogiri-horizontal-light.svg" alt="Aogiri · 梧桐" width="440">
  </picture>

  <p>把编程智能体、代码和项目工具放在同一个桌面工作台里。</p>

  <p>
    <a href="https://www.lynshen.org/download">官网下载</a> ·
    <a href="https://github.com/Libra1337/Aogiri-Desktop/releases">全部版本</a> ·
    <a href="https://github.com/Libra1337/Aogiri-Desktop/issues">问题反馈</a>
  </p>

  <p><strong>简体中文</strong> · <a href="README.en-US.md">English</a></p>
</div>

你可以同时管理多个项目和会话，使用 LynShen、Claude Code、Codex 或兼容 [ACP](https://agentclientprotocol.com) 的智能体，并在对话旁查看文件、Git 改动、终端和网页。支持 macOS、Windows 和 Linux。

## 安装

| 平台 | 安装包 |
| --- | --- |
| macOS | Apple 芯片选 `aarch64.dmg`，Intel 选 `x64.dmg` |
| Windows x64 | `x64-setup.exe` |
| Linux x64 | `AppImage`、`.deb` 或 `.rpm` |

当前安装包尚未经过 Apple 公证或 Windows 代码签名，首次打开可能被系统拦截。各平台的安装和放行步骤见[安装指南](docs/install.md)。

旧版 LynShen Desktop 可直接更新为 Aogiri，登录状态、对话和设置都会保留；应用内引擎、账号和 `lynshen` 命令仍使用 LynShen 名称。

## 开始使用

1. **登录或配置模型。** 首次打开时，可通过浏览器登录 LynShen 账号，也可以跳过登录，在「设置 → 提供商」中使用自己的 API Key 或智能体已有账号。
2. **选择智能体。** 内置 LynShen 可直接使用；Claude Code、Codex 和 ACP 智能体按需安装或添加。OpenCode、oh-my-pi 和 Pi 是内置的 ACP 智能体，装好就能在新对话里选，不用注册命令；选择器会写出它们能做什么，没装时给出安装命令。第一条消息前就可以选模型和思考强度，任何智能体都可以。
3. **打开项目，发送任务。** 一个项目可以有多个会话。让智能体阅读代码、修改文件、运行命令，也可以先使用计划模式讨论方案。

通过 LynShen 账号登录时，应用只获取当前设备的授权凭据，不会获取你的账号密码。退出登录会吊销该设备的凭据。

## 日常使用

- **掌握操作权限：** 按 `Shift+Tab` 切换审批模式；收到审批请求时，按 `1` 允许一次、`2` 始终允许、`3` 或 `Esc` 拒绝。
- **看清智能体在做什么：** 每个工具调用显示状态和用时，正在运行的那一步有流光；连续的调用和其间的思考合成一行，编辑只写「已编辑 N 个文件 +a −b」。停止、重启、换模型等节点在对话里以分隔线标出，状态行末尾显示本轮用时。
- **查看和修改项目：** 每轮结束后，过程折成一行，显示用时和改了哪些文件，点开可以逐个查看；智能体交付的文件以卡片列出，图片和视频直接显示；它提议的定时任务点「创建」才会生效；它另开的对话可以一键打开。工作区的全部改动在 Git 面板里，可以 diff、暂存与提交、拉取与推送；安装 GitHub CLI 后还可处理 Pull Request。并行任务可以使用独立的 Git worktree。在改动列表里点开文件，编辑器显示这一轮改了什么，可以切换成与 git HEAD 对比。标题栏的项目菜单显示当前分支和未提交的行数，可以打开文件夹、换分支、提交、推送和拉取。
- **新对话先选项目：** `⌘N` 先选项目（`⌘1`–`9` 直接选），也可以不放进任何项目。项目是 Git 仓库时，可以让新对话在新 worktree 里开始；在项目页填写 worktree 初始化脚本（比如安装依赖），每个新 worktree 会先运行它。
- **从任意一轮分叉：** 在一轮回复下点「从这里分叉」，新对话带着到这一轮为止的内容继续，原对话不变。分叉可以留在原目录，也可以放进新 worktree（文件是这一轮结束时的样子），侧栏标出它分叉自哪里；「带回结论」把分叉的结果写成一段话，放进原对话的输入框。需要 LynShen CLI 支持分叉的版本。
- **在同一窗口工作：** 打开终端或内置浏览器，将网页元素带入对话；智能体启动开发服务器时，右下角会提示「开发服务器已启动 · 打开」；也可以切回智能体自己的终端界面（TUI）。TUI 属于这个对话：另一个窗口或手机打开的也能在这里查看和输入，关掉面板只是不再查看，TUI 继续运行。
- **按需扩展：** 在设置中管理模型、技能、MCP 服务器、语音输入和生图模型，在「设置 → 应用工具」开关交付物、定时任务提议和对话之间的消息，或从其他编程工具导入历史对话与配置。
- **智能体工作时继续说：** 回合进行中发的消息在输入框里排队，可以插入当前回合（在正在运行的工具结束后插入，不会打断它）、中断并立即发送、撤回修改、删除或调整顺序。附件以文件形式随消息发送，可以把文件拖到窗口任意位置添加。
- **离开窗口也不中断：** 会话由本机后台服务运行。关闭窗口或重启应用不会停止正在执行的任务。一轮结束后仍在运行的子智能体和后台命令列在对话右上角的子智能体卡片里，可以看输出或停止。
- **用自己的 API 跑 Claude Code 和 Codex：** 在「设置 → 编码智能体」为 Claude Code 或 Codex 添加自定义提供商（API 地址、密钥、模型），可以测试连接。请求直接发到这个提供商，用它自己的密钥，不经过 LynShen 账号，不带你的 LynShen 身份，也不计入 LynShen 的用量和计费；密钥只保存在这台电脑上。新对话可以选用哪个提供商，对话一直用开始时的那个。
- **订阅额度一目了然：** 使用 Claude Code 或 Codex 订阅时，快到或用完额度会显示是哪一项额度、用了多少、何时重置，可以选择重置后自动继续。
- **自己的配色：** 在「设置 → 通用」为浅色和深色主题各选一套配色（背景、文字、强调、链接），对比度不达标的配色不会生效；配色随账号同步。

### 常用快捷键

macOS 使用 `⌘`，Windows 和 Linux 使用 `Ctrl`。

| 快捷键 | 作用 |
| --- | --- |
| `⌘K` | 命令面板 |
| `⌘N` | 新建会话（先选项目，`⌘1`–`9` 直接选） |
| `⌘P` | 快速打开文件 |
| `⌘F` | 在对话中查找 |
| `` Ctrl+` `` | 打开终端 |
| `⌘B` | 收起或展开侧栏 |
| `⌘.` | 停止生成 |
| `⌘↵` | 回合进行中：把消息插入当前回合 |
| `⌘⇧↵` | 回合进行中：中断并发送 |
| `⌘/` | 查看全部快捷键 |

## 手机远程访问

远程访问默认关闭。需要时：

1. 登录 LynShen 账号，打开「设置 → 远程访问」，启用中继访问。
2. 在手机或浏览器上用同一个账号登录，在电脑列表里点「请求连接」；电脑上会弹出「请求连接」，核对 6 位数字后点「允许」。不在这个账号下的手机或旧版 Aogiri 可以改用「用配对码添加设备」的二维码。
3. 在手机浏览器中查看会话、发送消息和处理审批，也可以用电脑上装好的内置 ACP 智能体新建会话（Pi 需要这台手机有「切换到全自动」权限）。对话在 TUI 里时，手机可以查看它；有「打开终端」权限的手机还可以输入和打开 TUI，没有的只读。

手机与电脑无需处于同一网络。连接内容经过端到端加密，中继服务无法读取；已配对设备可以随时吊销。以前配对的设备第一次通过账号连接时会自动绑定到账号；电脑换了账号，设备要重新允许一次。局域网 / Tailscale 直连是登录后的高级选项。

## 数据与隐私

- 提示词、代码和附件会发送给当前会话使用的模型服务商；语音输入会发送给你配置的语音识别服务。Claude Code 和 Codex 用自定义提供商时，请求只发给那个提供商，只带它自己的密钥，不带 LynShen 账号信息；这部分用量只记在本机，不上传。
- 凭据默认保存在本机 `~/.lynshen/auth.json`，为明文。可选择启用静态加密，但它不能防御本机恶意程序，启用前请阅读[安全边界与使用说明](docs/secrets.md)。
- 登录账号后，会汇总模型、引擎、Token 用量和耗时，不上报提示词、代码或项目路径。部分基础设置可跨设备同步，密钥、技能和 MCP 配置保留在本机。
- 匿名使用统计默认开启，包含功能使用次数、错误类型和随机安装 ID，不包含对话、代码或文件路径。可在「设置 → 通用」中关闭。
- 应用会从 LynShen 官网检查和下载更新，并在你确认后安装。

## 遇到问题

先在[安装指南](docs/install.md)查看系统拦截、Linux 依赖和权限相关说明。其他问题可通过「设置 → 通用 → 反馈问题」提交，或前往 [GitHub Issues](https://github.com/Libra1337/Aogiri-Desktop/issues)；请附上系统、应用版本、所用智能体和错误信息，不要粘贴 API Key 或访问令牌。

## 从源码运行

本仓库只包含桌面端；智能体引擎与后台服务位于 [Aogiri CLI](https://github.com/Libra1337/Aogiri-CLI)。开发需要 Node.js 22、pnpm、Rust 稳定版和 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

将两个仓库放在同一目录，构建 CLI 后启动桌面端：

```sh
git clone --recurse-submodules https://github.com/Libra1337/Aogiri-CLI.git
(cd Aogiri-CLI && cargo build)
git clone https://github.com/Libra1337/Aogiri-Desktop.git
cd Aogiri-Desktop
pnpm install
pnpm tauri dev
```

也可用 `LYNSHEN_BIN` 指定已有的 `lynshen` 可执行文件。常用检查：`pnpm check`、`pnpm test`，以及先运行 `pnpm build` 再运行 `cargo test --manifest-path src-tauri/Cargo.toml`。架构与开发约定见 [AGENTS.md](AGENTS.md)。

## 许可证

代码采用 [Apache License 2.0](LICENSE)，另见 [NOTICE](NOTICE)。LynShen 名称和图标的商标权归 LynShen Innovations INC. 所有；第三方智能体及工具归各自所有者所有。
