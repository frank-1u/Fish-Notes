<div align="center">

# 🐟 Fish Notes

一款类似 [Bear](https://bear.app/zh/) 的桌面 Markdown 笔记应用 · React + Tauri v2 + TypeScript

本地优先 · AI 助手· 全文搜索 · 端到端加密 · 多主题 · 标签组织

[English](./README.md) · 简体中文

[![Release](https://img.shields.io/github/v/release/frank-1u/Fish-Notes?label=下载&logo=github)](https://github.com/frank-1u/Fish-Notes/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-lightgrey.svg)](https://github.com/frank-1u/Fish-Notes/releases/latest)

![Fish Notes](./docs/screenshots/hero.png)

</div>

## 下载

在 [GitHub Releases](https://github.com/frank-1u/Fish-Notes/releases) 下载 Windows x64 打包产物。

| 版本 | 文件 |
| --- | --- |
| NSIS 安装包 | `*-setup.exe` |
| 便携版 | `Fish-Notes-<version>-windows-x64-portable.zip`，内含 `fish-notes.exe` |

应用使用系统 Microsoft Edge WebView2 Runtime。安装包在需要时下载 WebView2 引导程序。运行便携版前，请确认系统已安装 WebView2。

## 界面预览

|              编辑器（分屏）               |               多主题                |
| :---------------------------------------: | :---------------------------------: |
| ![编辑器](./docs/screenshots/editor.png) | ![主题](./docs/screenshots/themes.png) |

## 技术栈

| 层面     | 选型                                                |
| -------- | --------------------------------------------------- |
| 桌面框架 | Tauri v2 + Rust + 系统 WebView               |
| 前端     | React 18 + TypeScript 5.7 + Vite 5                           |
| UI/样式  | Tailwind CSS 3 + CSS Variables                      |
| 编辑器   | CodeMirror 6（Markdown 源码 + 实时高亮）            |
| 预览渲染 | marked（GFM + breaks）                              |
| 数据库   | rusqlite 内置 SQLite，使用 WAL 和 r2d2                        |
| 全文搜索 | SQLite FTS5                                         |
| 加密     | AES-256-GCM + scrypt                                |
| AI       | OpenAI-compatible 与 Anthropic Messages HTTP API    |
| 国际化   | i18next + react-i18next                             |
| 导出     | Markdown / 净化后的 HTML / 系统打印为 PDF |
| 包管理   | Yarn Classic                                                |

## 功能

### AI 助手

- **生成标题与润色文字** — 概括笔记标题，或保留 Markdown 语法润色选中文本
- **流式聊天** — 支持当前笔记与知识库上下文、思考过程展示、取消与历史会话
- **网关设置** — 在 **设置 → AI** 选择 OpenAI-compatible 或 Anthropic Messages，填写 Base URL、API Key 和模型。Rust 后端直连网关，在本地保存密钥。

### 编辑

- **Markdown 编辑器** — 基于 CodeMirror 6，源码 + 实时高亮，4 主题适配
- **3 视图切换** — MD 源码 / Preview 渲染 / Split 左右分屏（带同步滚动），状态持久化
- **快捷输入** — 工具栏 + 键盘快捷键，覆盖加粗 / 斜体 / 标题 / 引用 / 链接 / 代码 / 列表 / 任务等
- **表格支持** — 网格选择器插入对齐表格、一键格式化整理列宽（CJK / 全角字符正确计算显示宽度）
- **智能行为** — 列表续行、空列表回车退出、括号自动闭合
- **平台感知** — 工具栏 tooltip 自动显示 `⌘` (Mac) 或 `Ctrl+` (Win/Linux)

### 组织

- **标签系统** — 通过 TagBar 直接管理，支持嵌套标签 `#parent/child`，侧边栏标签树展示
- **全文搜索** — 基于 SQLite FTS5，纯文本索引（去 Markdown 语法）
- **回收站** — 软删除、恢复、永久删除
- **置顶** — 笔记和标签都支持置顶

### 体验

- **多主题** — Light / Dark / Solarized / Anime 四套主题
- **多语言** — 中文 / 英文
- **自动保存** — 500ms 防抖，Cmd/Ctrl+S 立即保存
- **三栏布局** — 侧边栏 | 笔记列表 | 编辑器，可拖拽调整宽度
- **原生窗口控件** — Windows 和 Linux 使用系统标题栏，macOS 使用 Overlay 标题栏和红绿灯
- **外链处理** — 预览中点击链接用系统默认浏览器打开

### 安全

- **端到端加密** — AES-256-GCM 加密笔记内容，scrypt 派生密钥
- **会话锁定** — 密钥仅缓存在内存，锁定即清除
- **加密笔记不进 FTS** — 不被搜索命中

### 媒体

- **图片支持** — 拖拽、粘贴、`![]()` 工具栏按钮三种方式
- **本地存储** — 自定义 `fish-image://` 协议，UUID 命名

### 导入导出

- **导入** — 通过原生对话框读取 Markdown、纯文本和 HTML。HTML 会转换为 Markdown。
- **导出** — 通过原生对话框保存 Markdown 或带样式的 HTML，通过系统打印对话框另存为 PDF。

## 快捷键

### 编辑器视图

| 快捷键         | 功能             |
| -------------- | ---------------- |
| `Cmd/Ctrl + 1` | MD 源码模式      |
| `Cmd/Ctrl + 2` | Preview 预览模式 |
| `Cmd/Ctrl + 3` | Split 分屏模式   |

### Markdown 格式

| 快捷键                 | 功能        |
| ---------------------- | ----------- |
| `Cmd/Ctrl + B`         | 粗体        |
| `Cmd/Ctrl + I`         | 斜体        |
| `Cmd/Ctrl + Shift + S` | 删除线      |
| `Cmd/Ctrl + 1~6`       | 一~六级标题 |
| `Cmd/Ctrl + K`         | 链接        |
| `Cmd/Ctrl + E`         | 行内代码    |
| `Cmd/Ctrl + Shift + E` | 代码块      |
| `Cmd/Ctrl + Shift + .` | 引用        |
| `Cmd/Ctrl + Shift + L` | 无序列表    |
| `Cmd/Ctrl + Shift + O` | 有序列表    |
| `Cmd/Ctrl + Shift + T` | 任务列表    |

### 应用

| 快捷键         | 功能     |
| -------------- | -------- |
| `Cmd/Ctrl + S` | 立即保存 |

## 开发

准备 Node.js 22、Yarn Classic、Rust stable、Clippy 和对应平台的系统依赖。Windows 需要 MSVC C++ 生成工具和 WebView2，Linux 需要 GTK 和 WebKitGTK 4.1，macOS 需要 Xcode 命令行工具。[Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)

```bash
yarn install --frozen-lockfile
yarn start
npx tsc --noEmit
npx vite build
(cd src-tauri && cargo test --locked)
(cd src-tauri && cargo clippy --locked --all-targets -- -D warnings)
yarn package
yarn make
```

[CI](./.github/workflows/ci.yml) 在 PR 和推送到 `main`、`feat/**` 时运行前端检查和 Linux Rust 门禁。

## Windows 打包和发布

在默认分支具备手动触发配置后，从 **Actions → Release → Run workflow** 选择候选分支，在运行详情下载 Windows x64 Artifact。也可在 Windows x64 主机安装依赖后运行 `npx tauri build --target x86_64-pc-windows-msvc -- --locked`，在 `src-tauri/target/x86_64-pc-windows-msvc/release/` 找到 `fish-notes.exe`，在该目录的 `bundle/nsis/` 找到安装包。

同步更新 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 的版本号，并刷新 `src-tauri/Cargo.lock`。完成真机验收后，推送匹配的 tag，例如 `v1.0.1`。[Release 工作流](./.github/workflows/release.yml) 会将两个 Windows 包上传至对应的 GitHub Release。macOS 独立验证 Overlay 窗口配置的构建。

分别对 NSIS 安装版和便携版完成真机验收。两个包的体积均须 ≤ 15 MB（不含系统 WebView2 Runtime）。冷启动至可交互须 ≤ 1.0 秒，空载与日常编辑时 Fish Notes 和 WebView2 进程合计内存均须 ≤ 120 MB。完整功能与流畅度清单见 [Windows 真机验收](./README.md#windows-host-acceptance)。

## 项目结构

```text
src/renderer/
├── api/                  # 类型化 Tauri 命令和聊天 Channel
├── components/           # 笔记列表、CodeMirror 编辑器、预览、AI 与设置
├── contexts/             # 应用、主题和助手状态
└── styles/               # 主题、Markdown 预览与打印样式
src-tauri/
├── src/
│   ├── desktop.rs        # Tauri 窗口、插件和协议注册
│   ├── commands/         # 连接应用服务的 IPC 命令
│   ├── service.rs        # 应用共享状态与服务入口
│   ├── db/               # SQLite Schema、连接池和 FTS5
│   ├── ai/               # HTTP 网关、SSE 流式响应和检索
│   ├── crypto/           # 密码、会话密钥与笔记加密
│   ├── images/           # 本地图片存储与协议响应
│   └── import_export/    # 导入格式转换与导出落盘
├── tests/                # 使用真实临时 SQLite 数据库的服务层测试
└── tauri*.conf.json      # 公共及平台专用桌面配置
```

## 本地数据

默认将 `fish-notes.db` 和 `images/` 写入 `com.fishnotes.desktop` 的 Tauri 应用数据目录。启动前设置 `FISH_NOTES_USER_DATA` 可指定独立的数据目录。SQLite 保存笔记、标签、笔记标签关联、应用设置、聊天会话和消息，FTS5 索引未加密笔记的标题和正文纯文本。

## License

MIT
