# 「Termless」商标与名称检索

> 检索日期：2026-10-05。对应产品笔记 14 节 P0 第 0.4 项。
> ⚠️ 这是用公开数据库做的初步检索，**不构成法律意见**。正式提交商标申请前，建议请商标代理人或律师复核，尤其是下文「风险」一节列出的几项。

## 结论

1. **没有找到在用的「TERMLESS」注册商标或申请**。美国（USPTO）、欧盟（EUIPO）、英国（UKIPO）以及 WIPO 全球品牌数据库覆盖的约 90 个局里，唯一包含 TERMLESS 的商标是 2017 年就已放弃的「FOREVER START TERMLESS BATTERY WARRANTY」。它属于第 36 类（电池保修服务），而且「TERMLESS」一词被声明放弃专用，和软件无关。
2. **最近似的在册商标是 TERMLY / THERMLY**，不是 Termless。它们在第 9 / 42 类（软件）有有效注册，详见下文。读音和拼写都有差别（-ly 和 -less），含义也不同。我的判断是风险不高，但在英国最好请专业人士看一下。
3. **实际风险最大的不是商标，而是同名产品**：npm 上的 `termless` 包、termless.dev 网站和 GitHub 仓库 beorn/termless，是一个「终端应用的无头测试工具」（类似 Playwright）。它也在终端软件领域，域名注册于 2026-03-05，比本项目（2026-09-18）早；它没有注册商标，但在美国，在先使用本身就可能产生权利。
4. **中国还没有检索**：WIPO 数据库不包含中国国家知识产权局（CNIPA）的数据，中国商标网又需要接受使用条款并通过滑块验证，需要你本人去查（步骤见下文）。
5. **域名**：termless.app、termless.ai、termless.io、termlessapp.com 都还没被注册；termless.com（2000 年起）和 termless.dev（上面那个测试工具）已被注册。

**建议**（💡 待确认）：
- 如果保留 Termless 这个名字：尽快注册 termless.app（以及 termless.ai），并在发布前向 USPTO 和 EUIPO 提交第 9 类（可下载软件）和第 42 类（软件服务）的申请；对外宣传时用「Termless for Mac」这样更有区分度的写法，和那个开发者测试工具拉开距离。
- 也可以趁还没发布认真考虑改名：同名的开发者工具在搜索结果和开发者圈子里会长期混淆，我们的目标用户又恰好会去搜「终端」相关内容。
- 不管用哪个名字，都要先补查中国，再决定是否需要一个中文名并一起检索。

## 检索范围和方法

| 数据库 | 覆盖 | 数据截止 | 检索方式 |
|---|---|---|---|
| USPTO Trademark Search（tmsearch.uspto.gov） | 美国，含已失效的商标 | 2026-09-27（据 WIPO 同步日期） | 文字商标包含检索：`termless`、`termless*`、`*termless*`、`termles`、`terminalless`、`turmless` |
| WIPO Global Brand Database（branddb.wipo.int） | 约 90 个局 + 马德里国际注册，含 EUIPO（至 2026-10-02）、USPTO、UKIPO（至 2026-10-04）、JPO、IPA（澳）、CIPO（加）、DPMA（德）等；**不含中国 CNIPA** | 见左 | 品牌名称：包含（Embedded）、模糊（Fuzzy）、读音（Phonetic）三种策略；读音检索的结果再按尼斯分类第 9 类筛选 |
| npm、GitHub、Homebrew | 开发者生态里的同名项目 | 2026-10-05 | `npm view termless`、`gh search repos termless`、`brew info termless` |
| 域名 | .com .app .ai .dev .io | 2026-10-05 | whois / RDAP |

尼斯分类：第 9 类 = 可下载的软件 / 应用；第 42 类 = 软件设计开发、SaaS 等软件服务。Termless 主要涉及这两类。

## 详细结果

### 完全相同或包含「TERMLESS」

| 商标 | 权利人 | 类别 | 地区 | 状态 |
|---|---|---|---|---|
| FOREVER START TERMLESS BATTERY WARRANTY（申请号 87116836） | Dent Defense Group, Inc | 36 | 美国 | 2017-10-02 放弃；「TERMLESS」被声明放弃专用 |

WIPO 全球库的「包含」检索也只返回这一条。`termles`、`terminalless`、`turmless` 在 USPTO 都没有结果。

### 读音或拼写近似（只列软件相关类别）

| 商标 | 权利人 | 类别 | 地区 | 状态 | 说明 |
|---|---|---|---|---|---|
| Termly | Full Clarity Ltd | 9, 42 | 英国 | 已注册（2026-03-13） | 最近似的一项；需要专业人士判断 |
| THERMLY | THERMLY LIMITED | 9, 35, 36 | 英国 | 已注册（2023-06-30） | 偏金融服务 |
| TERMLY | Quad Equities Pty Ltd | 9, 36 | 澳大利亚 | 已注册 | 偏金融服务 |
| TERMLY（两件） | Termly LLC | 35, 45, 42 | 美国 | 已终止（2025-01-17） | 隐私政策 SaaS「Termly」的申请，已失效 |
| testless | Testless GmbH | 9, 41, 42 | 德国 | 已注册（2019-07-03） | 拼写近似（模糊检索） |
| SEAMLESS / FORMLESS 等 | 多家 | 9 / 42 等 | 多地 | 部分有效 | 只是同样以 -less 结尾，词根不同，属于泛泛相似 |

读音检索按相似度排序：读音最接近的是法国的 THERMILLIS / Therm-liss，属于建筑材料类（17、19），与软件无关。模糊检索一共返回 2,408 条，绝大多数是 SEAMLESS、GERMLESS、HARMLESS 这类只是结尾相同的词。

### 同名项目（未注册商标）

| 名称 | 是什么 | 时间 |
|---|---|---|
| npm 包 `termless`、termless.dev、GitHub beorn/termless（36★，仍在活跃开发） | 「Headless terminals: test, record, replay, and run sessions」，终端应用测试工具 | 域名注册于 2026-03-05；npm 最近更新 2026-10-03 |
| GitHub 上其他同名仓库 | 个人小项目，0★ | — |
| Homebrew | 没有叫 termless 的 formula / cask | — |

## 需要你本人完成的检索：中国

中国商标网（sbj.cnipa.gov.cn → 商标查询）要先点「我接受」同意使用说明，查询时通常还有滑块验证，所以需要你本人操作：

1. 打开 https://sbj.cnipa.gov.cn/sbj/sbcx/ → 我接受 → 进入查询 → **商标近似查询**。
2. 国际分类填 9，查询方式选「汉字 / 拼音 / 英文」中的英文，商标名称填 `TERMLESS`，检索要素全选；然后把分类换成 42 再查一次。
3. 再用「商标综合查询」按名称 `TERMLESS` 查一次，看有没有任何类别的申请。
4. 将来如果起了中文名，用同样的方法检索中文名。

## 局限

- 只检索了文字商标，没有检索图形商标。
- 读音检索因为页面限制，只逐条看了按相似度排在最前面的结果，第 42 类没有单独筛选一遍（第 9 类已筛选，共 38 条）。
- 普通法（未注册的在先使用）只查了 npm / GitHub / Homebrew，没有做全网检索。
- 数据库本身会有几天到几周的延迟，正式提交前应该再查一次。
