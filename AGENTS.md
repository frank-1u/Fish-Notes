# Fish Notes

Bear 风格的本地 Markdown 笔记应用。桌面端使用 Tauri v2 和 Rust，界面使用 React 18、TypeScript 5.7、Vite 5 与 Tailwind CSS 3。编辑器使用 CodeMirror 6，预览由 marked 和 DOMPurify 渲染。

## 开发与验证

准备 Node.js 22、Yarn Classic、Rust stable 及 Clippy。准备系统依赖时，先查阅对应平台的 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)。

```bash
yarn install --frozen-lockfile
yarn start                              # Tauri 开发窗口与 Vite HMR
npx eslint --ext .ts,.tsx --quiet .
yarn format:check
npx tsc --noEmit
npx vite build
(cd src-tauri && cargo test --locked)
(cd src-tauri && cargo clippy --locked --all-targets -- -D warnings)
yarn package                            # 生成 Release 可执行文件
yarn make                               # 生成当前平台原生 bundle，Windows 为 NSIS
```

## 项目结构与数据流

```text
src/renderer/
├── api/                  # 类型化 Tauri invoke 与流式 Channel
├── components/           # 三栏布局、虚拟笔记列表、编辑器、预览、AI 和设置
├── contexts/             # 笔记、标签、加密、主题及 AI 状态
└── styles/               # 主题、Markdown 预览和打印样式
src-tauri/
├── src/
│   ├── desktop.rs        # Tauri 窗口、命令注册、日志、图片与外链协议
│   ├── commands/         # IPC 命令，阻塞任务交给后台线程
│   ├── service.rs        # AppService 与共享应用状态
│   ├── db/               # SQLite schema、连接池和 FTS5
│   ├── ai/               # OpenAI-compatible / Anthropic Messages、SSE 和检索
│   ├── crypto/           # 主密码、会话密钥和笔记加密
│   ├── images/           # 图片存储和协议读取
│   └── import_export/    # 导入格式转换与导出落盘
├── tests/                # 使用真实临时 SQLite 的服务层测试
└── tauri*.conf.json      # 基础窗口与打包配置，平台文件覆盖差异
```

- 笔记列表从 Rust 获取摘要，打开笔记时按需读取正文。CodeMirror 复用编辑器实例，保存通过类型化 IPC 写入 SQLite。
- SQLite 内置编译，使用 WAL、连接池和 FTS5。加密笔记从搜索索引中移除，会话锁定清除内存密钥。默认在 Tauri 应用数据目录写入 `fish-notes.db` 和 `images/`，启动前可用 `FISH_NOTES_USER_DATA` 覆盖。
- Markdown 保存 `fish-image://<uuid>.<ext>` 引用，图片粘贴与拖拽通过 Tauri Raw Request 上传。预览将协议映射为平台展示 URL。
- 文件导入和导出使用 Rust 调用的原生对话框。Markdown 和 HTML 可导出为文件，PDF 通过系统打印对话框生成。预览外链交给系统默认浏览器。
- AI 由 Rust 直连配置的 HTTP 网关，API Key 保存在本地数据库，渲染端读取脱敏配置，通过 Channel 接收可取消的流式回复。

## CI 与 Windows 验收

CI 触发条件与检查项以 [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) 为准。Release 支持手动构建下载 Windows NSIS 安装包和便携 zip，并在匹配版本的 `v*` tag 上发布。macOS 独立验证 Overlay 标题栏构建，Windows 和 Linux 使用系统原生标题栏。

Windows x64 真机验收覆盖两个包的全功能冒烟、核心交互流畅度，以及包体 ≤ 15 MB、冷启动至可交互 ≤ 1.0 秒、空载和日常编辑的应用与 WebView2 进程合计内存 ≤ 120 MB。打包、手动触发和验收步骤见 [README](./README.md#windows-host-acceptance)。

## Agent skills

### Issue tracker

Issues 跟踪在你自己的 GitHub 仓库 `frank-1u/Fish-Notes`（`gh` CLI，`gh repo set-default` 已固定解析）。见 `docs/agents/issue-tracker.md`。

### Triage labels

默认五个 canonical roles，label 字符串与 role 同名。见 `docs/agents/triage-labels.md`。

### Domain docs

Single-context 布局：根目录 `GLOSSARY.md` + `docs/adr/`。见 `docs/agents/domain.md`。

## Agent collaboration

本项目启用 Agent 协作。处理任务前，读取 `docs/agents/collaboration.md`。
所有 skill 的执行者、并发与委派方式遵循该规则；专业方法和交付要求遵循对应 skill。
