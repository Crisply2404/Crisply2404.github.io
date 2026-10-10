# Godot 参考图

这些 PNG 来自 Godot 4.7.2 对原 `mono-tower` 的真实渲染。导出在网站仓库的忽略目录 `.work/mono-reference/` 中执行，使用原游戏的 `VisualBuilder`、shader、字体和图标。

`circle`、`stroke-*`、`gate-*`、`number-*`、`contact`、`checkpoint-*` 与 `blocks` 使用 1280 × 800 viewport、800 正交尺寸、相机水平距离 800、高度 640、角度 π/4、黑色背景和 Linear tonemapping。相机 near/far 为 1/5000，关闭 3D MSAA。

`preview-*` 来自原游戏 `WasdLayoutOption` 的 SubViewport，分别对应三种 WASD 方向。`0` 和 `1` 后缀在门与检查点中表示未完成/完成、未激活/已激活。

`npm run test:reference` 使用 `pngjs` 解码这些 PNG，并与浏览器直接读取的 GPU 像素进行数值比较。
