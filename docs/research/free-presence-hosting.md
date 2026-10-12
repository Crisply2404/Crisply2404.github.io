# 个人站游戏联机服务调研

调研日期：2026-10-13（Asia/Shanghai）

目标是为 GitHub Pages 上的 Game view 提供一个公开的临时 Presence lobby。浏览器发送当前球体位置，服务把最新位置广播给同一 lobby 的其他浏览器；服务不保存历史位置，不计算碰撞。浏览器本地阻止球体重叠，碰撞只改变位置，不产生推动效果。客户端位置上报目标频率为最多每 100 毫秒一次（10 Hz）。

当前代码中的 [`PresenceClient`](../../src/presence.ts) 连接一个 WSS 地址，发送 `state` 消息，接收 `snapshot`、`state` 和 `leave` 消息。当前 [`game.ts`](../../src/game.ts) 以 60 Hz 更新物理，客户端每 100 毫秒最多发送一次变化状态，静止时停止重复广播。浏览器只发送联网需要的最新状态。[`presence/src/worker.ts`](../../presence/src/worker.ts) 使用 Cloudflare Worker 与 Durable Object Hibernation，连接 attachment 保存在线球体最新状态。物理规则记录于 [`docs/adr/0002-client-local-presence-physics.md`](../adr/0002-client-local-presence-physics.md)。

## 估算方法

以下持续活动估算使用 30 天月份，即 2,592,000 秒；每个在线浏览器每秒发送 10 条位置消息；每条消息都向同一 lobby 的其他浏览器广播一次。设同一 lobby 有 `N` 个在线浏览器：

- 客户端上报：`N × 10` 条/秒。
- 服务接收：与客户端上报相同。
- 广播扇出：`N × (N - 1) × 10` 条/秒。
- Supabase Realtime、Ably 这类按发送与接收消息计数的服务：全体客户端每轮更新计 `N²` 条消息，每秒为 `N² × 10`。这里按发送者不接收自己消息计算，与当前 relay 一致；若服务把消息也发回发送者，需要额外计算接收量。

为了给网络量一个直观范围，下面另按每条 JSON 状态消息 100 字节估算。实际大小取决于数值格式与协议封装，服务配额仍然按各平台定义的消息计数方式计算。

| 在线浏览器 | 客户端上报/月 | 广播扇出/月 | 双向消息总数/月（发送 + 接收） | 约公网下行数据/月（100 字节/条） |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 51,840,000 | 51,840,000 | 103,680,000 | 5.184 GB |
| 5 | 129,600,000 | 518,400,000 | 648,000,000 | 51.84 GB |
| 10 | 259,200,000 | 2,332,800,000 | 2,592,000,000 | 233.28 GB |
| 20 | 518,400,000 | 9,849,600,000 | 10,368,000,000 | 984.96 GB |

对应每天的客户端上报、广播扇出和双向消息总数为：

| 在线浏览器 | 客户端上报/日 | 广播扇出/日 | 双向消息总数/日 |
| ---: | ---: | ---: | ---: |
| 2 | 1,728,000 | 1,728,000 | 3,456,000 |
| 5 | 4,320,000 | 17,280,000 | 21,600,000 |
| 10 | 8,640,000 | 77,760,000 | 86,400,000 |
| 20 | 17,280,000 | 328,320,000 | 345,600,000 |

这些数字表示整月每个访客都持续移动的负载，实际个人网站用量应按移动时间计算。例如 10 人每天同时移动 10 分钟，每月客户端上报为 1,800,000 条、广播扇出为 16,200,000 条；发送与接收合计 18,000,000 条。发送频率从现有 60 Hz 调整为 10 Hz 后，位置消息数变为原来的六分之一。

空闲时停止发送重复状态后，空闲访客只产生加入、离开、断线重连以及可选的低频保活消息。Presence lobby 只保存在线成员的最新状态，服务端不应写入数据库或消息历史。

## Cloudflare Workers + Durable Objects

Cloudflare 的官方 Durable Objects 定价文档确认，Durable Objects 可以在 Workers Free 与 Workers Paid 使用；Workers Free 只允许 SQLite storage backend。Free 额度为每天 100,000 requests、每天 13,000 GB-s duration；超过任意一项后，该类型后续操作会报错，额度在每天 00:00 UTC 重置。文档还说明，创建 WebSocket 连接需要一个 request，发送方向的 WebSocket 消息不收费；用于计算 request 的 incoming WebSocket 消息按 20:1 折算，100 条 incoming 消息按 5 条 request 计。来源：[Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/index.md)（Cloudflare，2026-09-30）。

官方 WebSocket 文档推荐 Hibernation WebSocket API。使用 `ctx.acceptWebSocket(server)` 后，Durable Object 在没有事件时可以休眠，客户端连接保持，休眠期间不累计 billable duration；新消息到来时运行时重新初始化对象并调用构造函数。必须使用 `serializeAttachment` / `deserializeAttachment` 保存跨休眠的连接信息，单个 attachment 最大 16,384 字节。来源：[Use WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/index.md)（Cloudflare，2026-09-30）。

Free Durable Objects 的 SQLite 账号存储上限为 5 GB、每个账号最多 100 个 Durable Object classes；收到的单条 WebSocket 消息最大 32 MiB。单个 Durable Object 是单线程，官方给出的单对象参考限制为每秒 1,000 requests。来源：[Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/index.md)（Cloudflare，2026-06-01）。Hibernation API 每个对象最多接受 32,768 个 WebSocket，实际连接能力仍取决于 CPU 与内存，来源：[Durable Object State，acceptWebSocket](https://developers.cloudflare.com/durable-objects/api/state/index.md)。本站的 5/10/20 人场景需要验证实际广播耗时，不能把连接上限当作性能保证。

按 10 Hz 位置更新计算，Cloudflare Free 的 incoming 消息折算量为 `N × 10 × 86,400 / 20` requests/日：2 人约 86,400、5 人约 216,000、10 人约 432,000、20 人约 864,000。2 人整天持续移动仍在每天 100,000 request 额度内；5、10、20 人整天持续移动会超出额度。Outgoing 广播不产生 Cloudflare WebSocket message request 费用，但会消耗网络与处理能力；上述请求额度结论只针对 incoming 折算，还需增加建连、加入等少量请求。

每天 100,000 requests 约相当于 2,000,000 条 incoming WebSocket 消息，即 55.56 个访客小时的 10 Hz 持续移动。该数字是累计发送时间：5 人同时移动约 11.11 小时、10 人约 5.56 小时、20 人约 2.78 小时。10 人每天同时移动 10 分钟仅消耗约 3,000 requests/日。实际可用额度由同账号其他业务、建连请求和保活消息共同消耗。20:1 只用于 compute request 计费，官方 metrics 和 analytics 仍显示原始消息数量。[Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/index.md)

Duration 按对象分配的 128 MB 计算。即使这一个 lobby 对象全天保持活动，按官方计费示例的算法为 `86,400 × 0.128 = 11,059.2 GB-s/日`，低于 13,000 GB-s/日。多人共用这个对象时，duration 不按连接数量重复计算；同账号其他对象仍然共享免费额度。Hibernation 进一步减少空闲期间的 duration，满足休眠条件的空闲对象在实际移出内存之前也停止计算 duration。[Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/index.md)

单 lobby 可以使用 `getByName("public-lobby")`，用 Hibernation API 保持空闲连接，通过连接 attachment 保存每个在线球体的最新状态，收到状态后立即广播，连接关闭时广播 `leave`。Attachment 随连接关闭消失，既能恢复休眠后的成员状态，也符合只保存在线位置的要求。Hibernation 接收消息时仍运行正常的事件处理；服务器定时器、普通 `ws.accept()` 和持续未完成的操作会阻止休眠，服务应采用 `ctx.acceptWebSocket()` 与 `webSocketMessage()`。代码部署会断开现有 WebSocket，客户端需要自动重连。[Use WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/index.md)

Workers Free 无需信用卡，官方产品页明确写出 “Start building for free — no credit card required”：[Cloudflare Workers](https://www.cloudflare.com/developer-platform/products/workers/)。本次读取的 Workers/Durable Objects 免费文档没有提供 Free 可用性 SLA，因此无法承诺全年持续在线。

Workers Free 本身每天有 100,000 requests 和每次调用 10 ms CPU 时间；建立 WebSocket 的 Upgrade 算作一个 request，经过 Worker 路由的 WebSocket message 不算 Worker requests。来源：[Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/index.md)（Cloudflare，2026-10-02）。实际实现应让 Worker 只验证 Upgrade 与路径，再把连接转交一个 Durable Object；Hibernation 和消息计费主要由 Durable Objects 页面定义。

## Supabase Realtime

Supabase Free 计划提供 2,000,000 Realtime messages、200 个峰值并发连接；Free 计划还有 5 GB egress。来源：[About billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase.md)。Realtime Free 限制包括 200 concurrent connections、100 messages/s、100 channel joins/s、每个连接 100 channels、20 presence messages/s，以及每个客户端 30 秒内最多 5 次 Presence calls。来源：[Realtime Limits](https://supabase.com/docs/guides/realtime/quotas.md)。

Supabase 将 Broadcast 计算为发送 1 条加上每个订阅客户端接收 1 条；Free 每月 2,000,000 条，超过后进入通知与宽限期，持续超额可能触发服务限制。来源：[Manage Realtime Messages usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages.md) 与 [Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq.md)。Free 项目连续一周无活动可能暂停，Free 不提供 Uptime SLA；来源：[Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod.md) 与 [Supabase Pricing](https://supabase.com/pricing)。此次读取的计费与开通资料没有明确说明免费开户的信用卡要求，本文保留这一点为未确认信息。

Supabase Presence 的 5 次/30 秒限制不允许把 Presence API 当作 10 Hz 位置传输；Broadcast 可以传状态，但 20 人以 10 Hz 时会产生 10,368,000,000 条发送与接收消息/月。5 人持续活动也有 648,000,000 条/月。Free 的 100 messages/s 包括发送与接收，5 人 10 Hz 会有 250 messages/s，超过速率限制；2 人为 40 messages/s。官方说明超过消息速率会断开连接，速率恢复后 SDK 自动重连。[Realtime Limits](https://supabase.com/docs/guides/realtime/quotas.md)

若采用 Supabase，应使用 Broadcast、公开 lobby 或通过 `realtime.messages` 的 RLS 只允许固定 topic；官方授权资料说明可以用 RLS 控制客户端读取和发送 Broadcast/Presence，并可关闭 public access 使用 private channel。权限检查使用的 `realtime.messages` 表不保存消息。[Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization.md)

## Ably Free

Ably Free package 不要求信用卡、没有试用时长限制；额度为每月 6,000,000 messages、每秒 500 message rate、200 个并发 channels、200 个并发 connections。免费支持是 best-effort SLO 与社区支持。来源：[Ably Free package](https://ably.com/docs/platform/pricing/free.md)。

Ably 的消息计数为发布 1 条加上每个订阅者接收 1 条；Free 还有每小时 250,000 消息、每月 28.6 GiB message bandwidth、每 channel 50 条消息/秒、每 channel 200 个 Presence members。来源：[Ably Limits](https://ably.com/docs/platform/pricing/limits.md)。

按该计数，5 人 10 Hz 为 648,000,000 条/月，10 人为 2,592,000,000 条/月，20 人为 10,368,000,000 条/月，全部超过 6,000,000 条/月。5 人在同一 channel 总发布速率为 50 messages/s，达到单 channel 上限；10 人与 20 人分别为 100 和 200 messages/s。10 人的总发送与接收速率为 1,000 messages/s，也超过 Free 的 500 messages/s。Ably 对超限采用限制新资源、拒绝发布或速率抑制，部分限制有缓冲并通知升级；不能依赖超额继续运行。[Ably Limits](https://ably.com/docs/platform/pricing/limits.md)

Ably 推荐客户端使用 token authentication：在受信任服务中保存 API key，给浏览器签发只允许固定 lobby 的短时 token。GitHub Pages 前端无法保存秘密，因此还需要一个 token 签发服务。[Token auth](https://ably.com/docs/auth/token.md) Ably 的免费 SLO 是 best effort，无法作为本站的可用性保证。

## Render Free Web Service

Render Free web service 可以接受公网 WebSocket。官方文档说明，空闲 15 分钟（HTTP 请求与已有 WebSocket 消息都算 inbound traffic）后服务会 spin down；再次收到 HTTP 请求或新的 WebSocket 连接时约需一分钟启动。Free 服务可能随时重启，部署会中断已有连接。来源：[Deploy for Free](https://render.com/docs/free.md) 与 [WebSockets on Render](https://render.com/docs/websocket.md)。

Free workspace 每月有 750 Free instance hours；用完后 Free web services 会暂停到下个月。Render Hobby 工作区每月包含 5 GB outbound bandwidth，公网 WebSocket 响应计入 outbound bandwidth；没有支付方式时超出带宽会把服务 spin down。来源：[Deploy for Free](https://render.com/docs/free.md) 与 [Outbound Bandwidth](https://render.com/docs/outbound-bandwidth.md)。

Render 可以运行 Node.js 与 `ws` 实现的 WebSocket 服务。持续 5 人房间按每条广播 100 字节估算约 51.84 GB 下行/月，超过 5 GB outbound。Render 文档说明 WebSocket 不设固定连接时长和连接数量限制，实际能力取决于实例资源；Free 实例为 0.1 CPU、512 MB RAM。无支付方式可以使用免费服务，超额时暂停；账号开通时的验证要求仍由平台决定。服务重启与 spin down 会让在线球体暂时消失。Render 文档没有为 Free 服务提供本项目所需的可用性 SLA，免费实例也明确不建议用于 production applications。[Deploy for Free](https://render.com/docs/free.md)、[WebSockets on Render](https://render.com/docs/websocket.md)

## 选择结果

推荐 **Cloudflare Workers + 一个 SQLite-backed Durable Object + WebSocket Hibernation** 作为实现方向，理由如下：

1. 它直接提供一个 Durable Object 实例协调单 lobby，符合“只保存在线球体最新位置”的数据模型。
2. Hibernation 可以在没有事件时保留连接并停止 Durable Object duration 计费，适合访客稀疏的个人网站。
3. Workers 与 Durable Objects 都有官方 WebSocket 服务端 API，GitHub Pages 只需要通过 `VITE_PRESENCE_WS_URL` 连接 WSS。
4. Durable Object 可以在一个进程内维护成员集合并广播 `snapshot`、`state`、`leave`，无需数据库和历史数据。

免费预算按每天约 55.56 个累计访客移动小时计算，并为连接、保活和同账号其他业务留出额度；10 人每天同时移动 10 分钟约为 3,000 requests/日。客户端静止时停止重复上报，重新连接时立即发送最新状态。服务保持一个公开临时 lobby，最多每 100 毫秒接受一个连接的位置更新，校验消息长度与数值范围，球体身份绑定到连接；Worker 校验网站 Origin、Upgrade 和固定路径，并限制异常连接频率。Origin 只能约束普通浏览器跨站连接，公网客户端能够自行设置请求头，所以服务端频率和数据检查仍然必要。

Cloudflare China Network 是单独的 Enterprise subscription，官方资料明确说明跨境线路存在延迟与可靠性问题，普通免费 Workers 不包含该专用服务：[Cloudflare China Network](https://developers.cloudflare.com/china-network/index.md)。中国大陆访问速度与 WSS 连通性尚未实测，本文不作保证。

本次资料没有提供适用于本站免费方案的商业可用性 SLA。免费额度、暂停规则与网络路径可能变化，正式发布前应在 GitHub Pages 域名上进行浏览器连接、断线重连、手机网络切换、5/10/20 人消息量与中国大陆网络测试。本文只记录调研结论，没有部署或发布联机服务。

## 完整官方来源

- [Cloudflare Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/index.md)
- [Cloudflare Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/index.md)
- [Cloudflare Use WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/index.md)
- [Cloudflare Durable Object State](https://developers.cloudflare.com/durable-objects/api/state/index.md)
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/index.md)
- [Cloudflare Workers product page](https://www.cloudflare.com/developer-platform/products/workers/)
- [Cloudflare China Network](https://developers.cloudflare.com/china-network/index.md)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/quotas.md)
- [Supabase Realtime message usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages.md)
- [Supabase billing overview](https://supabase.com/docs/guides/platform/billing-on-supabase.md)
- [Supabase Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq.md)
- [Supabase Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod.md)
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization.md)
- [Supabase Pricing](https://supabase.com/pricing)
- [Ably Free package](https://ably.com/docs/platform/pricing/free.md)
- [Ably Limits](https://ably.com/docs/platform/pricing/limits.md)
- [Ably Token auth](https://ably.com/docs/auth/token.md)
- [Render Deploy for Free](https://render.com/docs/free.md)
- [Render WebSockets](https://render.com/docs/websocket.md)
- [Render Outbound Bandwidth](https://render.com/docs/outbound-bandwidth.md)
- [Current client](../../src/presence.ts)
- [Current server](../../presence/src/worker.ts)
- [Client-local presence physics ADR](../adr/0002-client-local-presence-physics.md)
