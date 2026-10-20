# Cloudflare 临时访客联机

日期：2026-10-13

状态：已确定

## 决定

联机服务使用 Cloudflare Workers、一个 SQLite-backed Durable Object 与 WebSocket Hibernation，选择依据见 `docs/research/free-presence-hosting.md`。一个名为 `public-lobby` 的对象接收主页游戏形态的全部在线连接；网页形态与阅读页离开 lobby。

每个连接 attachment 保存身份、最新球体状态和发送额度，连接关闭后结束保存。服务只广播最新位置，保留 ADR 0002 的浏览器本地碰撞规则。Hibernation 后通过连接 attachment 读取当前成员，整个服务不写入访客位置历史。

球体状态允许可选的 `space: 'blivet'`，保留该空间的公共碰撞坐标。浏览器以自己的镜头完成显示映射，范围计算继续使用公共碰撞坐标。`/health` 返回 `protocolVersion: 2`。

对话消息依据发送者和接收者的当前球体距离发送，使用 `src/presence-rules.ts` 定义的范围、文本上限、显示时间和发送间隔。服务发送显示时长，浏览器收到后按自身时间计算结束时刻。服务仅处理本次消息并向附近连接转发，连接 attachment 保留发送时间用于控制频率，文本不会写入 attachment 或消息历史。

浏览器最多每 100 毫秒发送一次；位置变化小于 0.25 世界单位且速度变化小于 0.1 时保留最新状态，直到出现需要同步的变化。重新连接时立即发送最新状态。服务使用允许十条消息的发送额度，按 10 Hz 恢复额度；网络延迟造成的短暂密集到达可以继续广播，持续超额关闭对应连接。入口、Origin、消息长度、UUID 与位置数值使用明确的检查。

服务部署独立于 GitHub Pages，主页构建通过 `VITE_PRESENCE_WS_URL` 使用部署后的 `/lobby` WSS 地址。Cloudflare 登录属于发布前提；本地运行使用 Wrangler 的 Workers runtime。
