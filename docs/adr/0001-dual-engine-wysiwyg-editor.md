# ADR-0001 使用 TipTap 和 CodeMirror 6 编辑同一份 Note Source

Fish Notes 需要让用户直接编辑排版后的段落、任务和表格，同时保留逐字修改 Markdown 的能力。项目决定用 TipTap（ProseMirror）实现 Edit View，继续用 CodeMirror 6 实现 MD View。顶部工具栏通过统一的命令适配器向当前编辑器发送格式操作。#24 先接入现有 MD View，Edit View 由后续工单实现。[父规格 #23](https://github.com/frank-1u/Fish-Notes/issues/23)

## 存储约定

两个引擎共享唯一的 Note Source。切换视图时传递最新的 Markdown，保留用户输入的连续空行、GFM 表格、任务和 Inline Hashtag。搜索、加密、AI 和导出继续消费这份正文。

未调宽的本地图片保存为 `![示例](fish-image://photo.png)`。用户手动调宽后，Resized Image Exception 允许保存 `<img src="fish-image://photo.png" alt="示例" width="320" />`。显示时再解析本地 URI，HTML/PDF 导出保留清洗后的宽度。

## 权衡

- 只用 CodeMirror 6 实现所见即所得，需要在文本编辑器上实现表格单元格、图片手柄和富文本选区。只用 TipTap 提供源码编辑，又需要重建现有 MD View 的光标、快捷键和文本编辑行为。
- Live Preview 会在光标所在行重新显示语法标记，与 Edit View 直接在排版结果中写作的交互相冲突。
- 持久化 HTML 或引擎文档树会引入新的存储格式及转换路径，增加现有 Markdown 笔记和导出的兼容成本。
- 双引擎的代价是额外的包体和 Markdown 往返转换。按需引入 TipTap 扩展，通过共同的编辑器接缝验证格式命令、视图切换和保存后的正文。
