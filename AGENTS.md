# 项目要求

## 聊天记录

- 每轮对话结束前，将双方公开消息按出现顺序追加到根目录 `CHAT_HISTORY.md`。
- 用户消息保留完整原文，包含链接、换行、代码和 skill 内容；助手保留公开进度消息与最终回复。工具调用、工具输出和内部推理不写入记录。
- 日期与时间使用 `Asia/Shanghai`。收到图片时，将原图保存到 `docs/chat-assets/`，并在对应用户原文下使用相对 Markdown 图片链接；没有图片时只保存原文。
- 用户更新设计要求时，将原文追加到 `CHAT_HISTORY.md`，并同步更新 `GLOSSARY.md` 或 `docs/adr/` 中已经确定的领域语言与决定。

## 修改范围

- `mono-tower` 游戏和 `chuan-zi` 源代码保持原样。主站只连接 `chuan-zi` 的构建产物。
- 主站根目录的 `chuan-zi/` 源目录属于本地参考内容，使用 `.gitignore` 排除，不发布到主站仓库。
- 使用 `apply_patch` 编辑文本文件。中间文件使用仓库内的忽略目录；不使用 `/tmp`。
- 实现完成后运行与修改相关的检查、构建和可运行验证，直到结果正确。

## Agent skills

### Issue tracker

Issues and project tasks are tracked in GitHub Issues for `Crisply2404/Crisply2404.github.io`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. Read `GLOSSARY.md` and relevant records under `docs/adr/` when they exist. See `docs/agents/domain.md`.

