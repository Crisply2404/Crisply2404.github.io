# 项目要求

## 聊天记录

- 每轮对话结束前，将双方公开消息按出现顺序追加到根目录 `CHAT_HISTORY.md`。
- 用户消息使用可读 Markdown 保留原文、链接、换行、代码和 skill 内容。结构化回答保留完整问题与回答；用户自身的代码保留原格式。助手保留公开进度消息与最终回复。工具调用、工具输出和内部推理不写入记录。
- 日期与时间使用 `Asia/Shanghai`。收到图片时，将原图保存到 `docs/chat-assets/`，并在对应用户原文下使用相对 Markdown 图片链接；没有图片时只保存原文。
- 用户更新设计要求时，将原文追加到 `CHAT_HISTORY.md`，并同步更新 `GLOSSARY.md` 或 `docs/adr/` 中已经确定的领域语言与决定。

## 修改范围

- `mono-tower` 游戏和 `chuan-zi` 源代码保持原样。主站只连接 `chuan-zi` 的构建产物。
- 主站根目录的 `chuan-zi/` 源目录属于本地参考内容，使用 `.gitignore` 排除，不发布到主站仓库。
- 使用 `apply_patch` 编辑文本文件。中间文件使用仓库内的忽略目录；不使用 `/tmp`。
- 实现完成后运行与修改相关的检查、构建和可运行验证，直到结果正确。

## MONO TOWER 复刻

- 修改游戏物件或绘制逻辑时，阅读原游戏对应的完整代码与 `DESIGN.md`，同时检查 `docs/adr/0003-browser-monotower-rendering.md`。
- 保留原游戏物件的尺寸、图案、字体、线宽、深度、遮挡与操作细节。线宽使用原游戏的 2.5 世界单位，并通过投影计算各个方向的相同显示宽度。
- 完成修改后运行物理检查、浏览器检查和 Godot 参考图比较。参考 PNG 位于 `tests/fixtures/mono-tower/`；记录实际误差数据。
- 网站场景与入口要求见 `docs/adr/0004-corridor-interaction.md`。提交消息采用 Conventional Commits。

## Agent skills

### Issue tracker

Issues and project tasks are tracked in GitHub Issues for `Crisply2404/Crisply2404.github.io`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. Read `GLOSSARY.md` and relevant records under `docs/adr/` when they exist. See `docs/agents/domain.md`.

