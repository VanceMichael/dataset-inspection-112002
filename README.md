# 资料登记审阅端的定额领样的演练来源

这里提供独立来源的本地合成记录，与实际单位、个人和线上业务无关。

## 本地运行

使用 Node.js 22.23.4。只使用 Node.js 自带的运行库。

执行 `npm test` 检查合成来源的接口。执行 `npm start` 启动来源，默认监听 `127.0.0.1:4100`，可通过环境变量 `PORT` 调整端口。访问根路径可看到来源名和当前回放阶段。

## 接口资料

| GET 路由 | 来源约定 |
| --- | --- |
| `/source/register` | application、edition 标识受理版次。每批镜头及其必备原件以 groups 为准。 |
| `/source/gateway` | ticket 是计费领取号。unconfirmed 可能已扣，delivered 取得授权原件，failed 确认未扣；sequence 是受理内状态顺序。 |
| `/source/review` | reading 证明终端已取得的具体原件。closed 关闭一次阅样，不改变网关的账簿。 |

查询参数 `offset` 是从零开始的页偏移，`limit` 默认 3，取值 1 至 100。响应中的 `records` 含 `record` 来源记录键、`availableFrom` 首次出现的回放阶段、`kind` 记录类型、`payload` 业务字段。来源记录键与业务身份分别定义。`next` 为下一页偏移，末页为 `null`。回放阶段中的记录按到达顺序可查。

控制员通过 `POST /control?stage=2` 切换到第 2 阶段，服务会保留更早已可查的记录。每次换阶段后按根路径返回的 `stage` 确认切换成功。
