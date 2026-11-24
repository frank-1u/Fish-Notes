# Fish Notes

这份术语表约定了布局面板、正文、编辑视图和选区操作在需求、代码与测试中的名称。

## Language

**Navigation Sidebar**（导航侧栏）是最左侧的 `Sidebar` 面板，提供搜索、所有笔记、回收站、标签和设置入口。

_Avoid_：Note List、笔记侧栏。

**Note List**（笔记列表）是 `NoteList` 面板，列出当前视图或标签下的笔记，供用户选择并在编辑区打开。

_Avoid_：Navigation Sidebar、导航列表。

**Note Source** 是每篇笔记唯一的 Markdown 正文。两种视图都读写这份正文，连续空行也是正文的一部分。

_Avoid_：富文本副本、预览源码。

**Edit View** 是直接在排版后的正文中编辑的视图，界面标签为「编辑」或「Edit」。

_Avoid_：Preview、Live Preview。

**MD View** 是显示并允许直接编辑 Note Source 字符的视图，界面标签为「MD」。

_Avoid_：代码模式、原始视图。

**Resized Image Exception** 是 Note Source 的唯一 HTML 存储例外。用户手动调整过宽度的图片以带 `width` 的 `<img>` 表示，其他图片使用 Markdown 图片语法。

_Avoid_：富文本图片、HTML 图片模式。

**Inline Hashtag** 是正文中以 `#` 开头、与侧栏标签关联的文本，如 `#work/weekly`。标题的 `# ` 前缀和代码中的字面量不计入标签。

_Avoid_：标题标记、标签节点。

**Selection Action Bubble** 是选中正文后出现的浮层，提供「AI 润色」和「问 Fish」操作。

_Avoid_：格式工具栏、链接浮层。
