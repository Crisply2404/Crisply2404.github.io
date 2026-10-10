# 调整门名字重

门名使用网页标题的系统字体，默认字重为 500。配置位于 `src/styles.css` 的 `:root`：

```css
--door-title-font-weight: 500;
```

本地运行 `npm run dev`，打开命令给出的地址。浏览器开发者工具选择 `<html>`，在样式面板的 `:root` 中编辑 `--door-title-font-weight`。门名会即时更新，可以尝试 400、500、600、700，比较适合的笔画宽度。各个系统字体支持的字重由浏览器选择，部分相邻数值会使用相同字形。

也可以在浏览器 Console 输入：

```js
document.documentElement.style.setProperty('--door-title-font-weight', '600');
```

确定数值后，把该数值写入 `src/styles.css`。开发者工具中的修改只在当前页面有效；保存文件后，Vite 会更新本地页面。此设置只调整门名，操作按键文字继续使用字重 400。
