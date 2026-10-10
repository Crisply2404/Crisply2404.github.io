# Crisply2404

主页使用 Three.js 移植 `mono-tower` 的物件和绘制规则：平台、尖刺、球体、门框、编号、出口图案、检查点、接触标记和方向预览。Game view 使用直走廊连接内容入口，List view 按顺序显示同一组入口。

线宽采用原游戏的 2.5 世界单位，通过投影计算屏幕宽度；各个方向使用相同规则。字体图集和出口纹理由 Godot 导出，球体、线条和旗帜保留原游戏的深度与遮挡处理。

## Local development

```sh
npm ci
npm run dev
```

Set `VITE_PRESENCE_WS_URL` to an available WSS endpoint when testing visitor presence. Without it, the local ball and doors remain usable.

## Content

Add Markdown files to `src/content/notes/` or `src/content/essays/`. The collection page and article route are generated during the Vite build.

## 验证

```sh
npm run check
npm test
npm run build
```

浏览器检查使用真实 Chrome 和 WebGL。启动 `npm run dev -- --port 5174 --strictPort` 后，在另一个终端运行：

```sh
npm run test:browser
npm run test:reference
```

物件比较使用 `tests/fixtures/mono-tower/` 中由 Godot 4.7.2 实际渲染的 PNG，检查球体、三个轴向线条、两种门框与编号、接触标记、两种检查点、平台、尖刺和三种方向预览。浏览器操作检查覆盖键盘、镜头旋转、跳跃、安全寻路、自动进入门、触控和 DPR 2/3。

## Deployment

The Pages workflow creates the public site and builds the private `Crisply2404/chuan-zi` repository into `/chuan-zi/`. Configure `CHUAN_ZI_TOKEN`, `VITE_PRESENCE_WS_URL`, and `CHUAN_ZI_WS_URL` in the public repository secrets. The token needs read access to the private repository.

