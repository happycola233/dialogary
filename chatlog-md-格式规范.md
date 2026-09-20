# chatlog-md/2 格式规范

状态：v2。扩展名：`.chat.md`。编码：UTF-8；允许 BOM、LF 和 CRLF。

本格式用于长期保存私人对话与日记。Markdown 文件是完整原本，网页只是阅读、编辑和回顾它的一种方式。普通编辑器可以手工补写，Typora 可以直接阅读，程序应准确解析并完整保存。

v1 规范保存在 [docs/archive/chatlog-md-v1.md](docs/archive/chatlog-md-v1.md)，v1 参考实现保存在 `src/parser/chatlog-v1.ts` 与 `scripts/chatlog_parse.py`。

## 1. 设计约定

- 结构为“文档 → 日期节 → 消息 → 有序内容块”。日期不等于会话边界，允许同一天有多个日期节。
- 文档只声明一次版本。消息不依赖连续编号或上文隐式继承的模型、标签、角色。
- 只知道日期就记录日期，不猜测具体时刻；不知道 token 就省略，不写成零。
- 标签等直接写在所属对象，无需到文档头注册。
- ID 可选。工具需要持久引用时生成 ID；人工补写不需要管理 ID。
- 正文、代码、推理、附件和未知扩展不得因修改标签等无关操作而重新格式化。
- 未知字段与未知内容块必须保留。程序不能因为暂时不支持展示，就在写回时删除。
- 文件里不维护消息总数、累计 token 等派生汇总值。
- 平台和账号来源不属于 v2 标准字段。

## 2. 最小示例

```markdown
---
format: chatlog-md/2
title: 聊天记录
timezone: Asia/Shanghai
---

# @2026-09-19

## 🧑‍💻 @user · 2026-09-19 21:30

今天终于把一直惦记的事情做完了。

## 🤖 @ai

听起来，今天有一种终于可以松口气的感觉。
```

日期节和消息的图标只用于阅读。解析由 `# @YYYY-MM-DD`、`## @role` 确定。允许在消息头的角色前放置其他图标或省略图标。字段分隔符为中点 `·`（U+00B7）。

## 3. 文档头

文档开头用一对独占行的 `---` 包围 YAML：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| format | string | 必须为 `chatlog-md/2` |
| title | string | 文档名称，可省略 |
| timezone | string | IANA 时区，如 `Asia/Shanghai`，建议明确填写 |
| description | string | 可选说明 |
| x-* | 任意 YAML 值 | 扩展字段 |

YAML 使用 1.2 核心类型：字符串、数字、布尔、null、数组与映射。需要保留前导零、日期形状、特殊字符含义时可加引号。重复键和无法解析的 YAML 属于格式错误；程序保留原文并提示定位，不静默丢弃。

## 4. 日期节

```markdown
# @2026-09-19

# @2026-09-20 · 去海边
```

日期是必需的 ISO 日历日期。中点后为可选的自定义标题。星期由阅读器根据日期计算，不写入日期标题；“去海边”等真正有意义的标题保留。

日期节可以没有消息。重复日期节合法，保持文件原顺序。不要求日期或消息时间单调递增，按文件顺序展示；补记较早的内容时无需重排其他记录。第一条消息前没有日期标题时，使用日期为空的隐式日期节，不猜测日期。

日期级元数据紧随日期标题，允许其间空行：

```markdown
# @2026-09-19
<!-- @meta
id: day_example
tags: [生活, 周末]
mood: 轻松
states: [休息]
annotations:
  - id: note_day_example
    text: 今天想给自己留一点空白。
-->
```

日期标签可供界面作为日期筛选条件。它们仍然属于日期，不应复制成每条消息的字段。

## 5. 消息头

角色为 `user`、`ai`、`system`，同角色连续出现合法，单独的 user 消息就是一条独立日记。

```markdown
## 🧑‍💻 @user
## 🧑‍💻 @user · 2026-09-19
## 🤖 @ai · 2026-09-19 21:30
## 🤖 @ai · 2026-09-19 21:30:24
```

允许日、分钟和秒三种精度。时间以文件时区解释。跨时区复制时，调用方可使用消息扩展字段记录特殊时区，或在导入时明确转换；不能默默改写原始时间。

为了无损读取旧文档，消息头继续允许一个旧模型字符串：

```markdown
## 🤖 @ai · 2026-09-19 21:30 · original-model-label
```

旧模型字符串原样保存，不自动猜测为新的模型 ID。新记录推荐使用下文的模型元数据。时间与旧模型字段顺序无关，但各只能出现一次。重复时记录错误并保留完整原文。

## 6. 格式 A：不可见 YAML 元数据

每个日期节、消息或显式内容块最多有一个元数据块。它必须是标题或内容块起始标记后的第一个非空白元素：

```markdown
## 🤖 @ai · 2026-09-19 21:30
<!-- @meta
id: msg_example
model:
  id: example-model
  name: 示例模型
reasoning:
  effort: high
usage:
  input_tokens: 1200
  output_tokens: 300
  cache_read_tokens: 800
  cache_write_tokens: 200
  reasoning_tokens: 100
tags: [随想]
reactions: [🌱]
-->

正文从这里开始。
```

起始行为 `<!-- @meta`，结束行为独占一行的 `-->`。Typora 等 Markdown 阅读器会隐藏注释，普通编辑器仍能直接维护。

正文开始后的 `@meta` 注释作为普通 Markdown 保留，不改变上层字段。YAML 字符串若需要包含 HTML 结束标记，应写成双引号转义，例如 `"例子 --\u003e"`；写回器自动处理。

v2 继续读取 v1 的单行 `<!-- @meta key=value -->` 以便原文件最小迁移。新增或修改这些元数据时写为 YAML 形式，原有值保持原类型，程序不得自动推测旧字符串的含义。

## 7. 个人整理字段

以下字段可用于日期节与消息：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| id | string | 可选稳定标识，不随排序变化 |
| tags | string[] | 自由标签，空数组表示无标签 |
| reactions | string[] | 表情回应，可有多个 |
| mood | string | 自己填写的心情 |
| states | string[] | 个人状态，如疲惫、忙碌、休息 |
| starred | boolean | 是否收藏 |
| annotations | object[] | 批注列表 |

批注格式：

```yaml
annotations:
  - id: note_example
    text: 后来回头看，这一天是一个开始。
    quote: 可选的原文摘录
    createdAt: 2026-09-19T12:30:00Z
    updatedAt: 2026-09-20T08:00:00Z
```

`id` 与 `text` 为必需；`quote` 和时间戳可省略。未提供 quote 表示整条消息或整个日期节的批注。原文变化导致摘录无法定位时，批注仍须保留；应用可以提示重新关联。未知定位字段同样保留。

个人状态与模型生成状态无关。需要保存完成、中断等生成状态时，放入扩展字段，例如 `x-generation.status`。

## 8. 模型与 Token 用量

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| model.id | string | 模型标识 |
| model.name | string | 显示名称 |
| reasoning.effort | string | 推理强度，允许未来的自定义值 |
| usage.input_tokens | 非负整数 | **完整输入量，包含缓存读取和缓存写入部分** |
| usage.output_tokens | 非负整数 | **完整输出量，包含推理 token** |
| usage.cache_read_tokens | 非负整数 | 输入中从缓存读取的部分 |
| usage.cache_write_tokens | 非负整数 | 输入中写入缓存的部分 |
| usage.reasoning_tokens | 非负整数 | 输出中的推理部分 |
| usage.total_tokens | 非负整数 | 上游提供的总量，可省略 |
| usage.x-* | 任意 YAML 值 | 音频、图像、缓存周期等未来明细 |

汇总原则：

1. 输入、输出齐全时，总量为 `input_tokens + output_tokens`。
2. 缓存读取、缓存写入、推理是明细，不能再次加到总量中。
3. 缺失字段表示“未记录”。真实的 0 必须保存为数字 0。
4. 只有部分记录带用量时，统计必须展示覆盖率，不能把缺失消息当成 0。
5. 导入器负责将原平台口径转换为上述完整输入、完整输出，原始细分可放入扩展。
6. 上游总量与已知分量不一致时保留所有原始数值，并明确差异，不能自行改写。
7. 字数、token 和费用是不同概念，不用字数伪造真实 token。

例如 Anthropic 原始 input 字段不包含缓存读写，而本格式的 input 必须包含；OpenAI 的缓存读取通常位于输入明细中。集成应遵循当时官方 API 文档：

- [OpenAI Responses 用量结构](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create)
- [Anthropic 缓存用量](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

## 9. 正文与有序内容块

普通消息直接写 Markdown 即可。普通正文在数据模型中对应 answer 块。

复杂模型回复使用显式块，按原顺序出现：

```markdown
<!-- @part reasoning -->
<!-- @meta
label: 已思考 8 秒
duration_ms: 8000
-->
思考摘要……
<!-- @endpart -->

<!-- @part commentary -->
我会先查找相关资料。
<!-- @endpart -->

<!-- @part search -->
<!-- @meta
action:
  type: search
  queries: [示例查询]
results:
  - title: 示例页面
    url: https://example.com
    snippet: 可选摘要
-->
<!-- @endpart -->

<!-- @part answer -->
最终回答……
<!-- @endpart -->
```

标准 kind：

| kind | 含义 |
| --- | --- |
| answer | 用户正文或模型最终回答 Markdown |
| reasoning | 模型推理摘要，元数据可含 label、duration_ms |
| commentary | 模型过程说明 Markdown |
| search | 检索动作与来源 |
| open_page | 打开网页动作 |
| find_in_page | 页内查找动作 |
| attachment | 具有结构化属性的附件 |
| x-* / 未知名称 | 完整保留的扩展块 |

kind 区分大小写，允许英文字母开头，后续为字母、数字、下划线、中横线或点。内容块不得嵌套。块内元数据是可选映射；任意来源结构均可保存在其中，程序不得只保留自己认识的键。

普通正文可以与显式块交错。重复 reasoning、commentary 和 search 合法。内容块可以只有数据没有文本，例如检索动作。模型不能补造实际未记录的推理或检索过程。

`search` 元数据建议使用 `action: {type: search, queries: [...]}`，来源数组 `results` 保存 `title`、`url`、`snippet` 等；open_page 可保存 url，find_in_page 可保存 url 和 pattern。引用标识、页码及未来 API 明细直接作为嵌套扩展保存，不强制扁平化。

## 10. v1 思考块兼容

v2 保留消息正文首块的 v1 思考写法：

```markdown
> 🤔 已思考 12s
>
> 思考摘要……
> 第二行摘要。

最终回答。
```

这允许真实 v1 原件迁移时不改写思考内容。只有消息首块这样解释；正文中间相同引用是普通 Markdown。新建复杂交错过程推荐使用显式 reasoning 块。

## 11. 附件

简单附件仍然易于手写：

```markdown
🖼️ [照片.jpg](assets/照片.jpg)
📄 [笔记.pdf](assets/笔记.pdf)
🖼️ 一张暂时没有文件的照片.jpg
```

普通附件默认写为上述简写。编辑正文、名称或路径不应把整条消息展开成显式块；只改收藏、标签等元数据时，附件行及正文必须原样保留。新增、删除或重排附件时，保留相邻正文的位置，附件自己的 ID、说明和扩展属性随附件一起移动。

显示名称与实际路径分别保存。无路径形式合法，意味着只记下名称。相对路径以当前 Markdown 文件所在目录为基准；跨目录复制记录需要同时搬运文件或修改相对路径。远程 URL 与本地附件分开处理。

复杂附件使用显式块：

```markdown
<!-- @part attachment -->
<!-- @meta
kind: image
name: 照片.jpg
path: assets/照片.jpg
meta:
  width: 1600
  height: 1200
  x-caption: 一次虚构的散步
-->
<!-- @endpart -->
```

附件 kind 为 image 或 file。附件属性继续保留未知嵌套字段。旧附件后的单行 `@meta` 继续读取。

## 12. 边界、代码与转义

结构标记必须从行首开始。块引用、四空格缩进代码中的相似文字不构成日期或消息。反引号或波浪线围栏内的标题、附件及过程标记都作为原文，不需要额外转义；围栏闭合遵循相同字符、至少相同长度的规则。

要在普通正文顶层写出类似结构的文字，在行首加反斜杠：

```markdown
\# @2026-09-19
\## 🤖 @ai
\🖼️ 这一行只是正文
\<!-- @part answer -->
\<!-- @endpart -->
```

读取时还原这一个转义。显式内容块内的日期和消息标题本来就是正文，但字面的 part/endpart 标记仍要转义。正文中需要按字面展示的 `<!-- @meta` 起始行或单行元数据标记也可以加反斜杠转义，防止移动到开头时被识别为元数据。围栏内无需转义。

HTML 多行注释里的日期与消息头不参与结构识别。结构不完整、元数据损坏等问题定位到原文行号；修复前不应自动格式化文档。

## 13. 手写追加、复制与合并

- 给最后一条消息续写：直接追加正文。
- 新增消息：追加消息头与正文；ID、token、模型等都不是手写前提。
- 新增日期：追加日期标题，再写消息。
- 搬运记录：复制完整日期节或完整消息，包含其元数据、内容块与批注。
- 第二份文件的 YAML 文档头不粘贴到正文，只保留目标文档的一份头。
- 重复日期可以保留，顺序就是文件中的顺序。
- 重复 ID 不允许静默覆盖消息。读取器保留全部记录并提示冲突；复制功能应给副本分配新 ID。
- 不需要重排任何连续编号，不修改未搬运的其他消息。
- 日期时区、附件相对路径、跨消息引用是跨文件搬运时需局部核对的内容。

## 14. TypeScript 数据模型与保真写回

公开入口在 `src/parser/chatlog.ts`：

```ts
parseChatlog(text: string): ChatDoc
serializeChatlog(doc: ChatDoc): string
migrateV1ToV2(text: string): { text: string; report: MigrationReport }
verifyMigration(source: string, candidate: string): MigrationReport
```

解析器自动识别 v1/v2。共享类型位于 `src/parser/types.ts`，保留 v1 必需字段：

- ChatDoc：format、meta、sessions、issues。
- Session：date、title、meta、messages、line，加个人字段。
- Message：role、time、timePrecision、model、meta、thinking、attachments、content、line，加个人字段、modelInfo、usage、parts。
- modelInfo 的 reasoningEffort 对应 YAML `reasoning.effort`。
- parts 每项有 kind、可选 text、可选 data 和 id；data 对应块内 YAML。
- 多个显式 answer 块的 content 投影用两个换行连接；thinking 投影第一段 reasoning。原始 parts 才是完整顺序。
- 兼容 v1 简洁写法时，content 保持旧解析的空行含义，不为构造投影而改写原文。

规范化字段可直接编辑；原始 meta 用于完整保存未知字段。若直接修改 meta 而对应规范化属性未改动，写回尊重 meta 的修改。parts 发生修改时，以 parts 为准；编辑普通 content 时保留已有过程。

每个对象的内部 `_source` 保存源片段及语义快照。不可变编辑时使用对象展开保留它。未改动片段逐字节返回；只改标签时仅替换元数据，正文、空行、缩进、代码、附件路径不变化。该缓存不是规范字段，导出纯 JSON 时应过滤所有 `_source`。

## 15. v1 迁移与核验

运行：

```powershell
npx tsx scripts/chatlog-migrate.ts "public/data/聊天记录.chat.md" --dry-run
npx tsx scripts/chatlog-migrate.ts "public/data/聊天记录.chat.md"
npx tsx scripts/chatlog-migrate.ts "原始.v1.chat.md" --verify "候选.v2.chat.md"
```

默认输出到被 Git 忽略的 `.tmp/migration/<原件哈希前缀>/`：

- 原始字节 v1 备份；
- 独立 v2 候选；
- JSON 校验报告，含源文件与候选 SHA-256、编码、BOM、换行、消息数量和附件哈希。

迁移永远不覆盖输入，已有输出与报告也不覆盖。需要独立路径时用 `--out`、`--report`。真实私人记录与报告应留在 Git 忽略的目录。

输入 v1 是放在其他目录的备份时，可以用 `--asset-root <原日记所在目录>` 指定附件核验基准。默认以输入 v1 文件所在目录查找；覆盖基准不会修改文件中的附件路径。路径先尝试字面文件名，再尝试 URL 百分号解码，因此真实含 `%` 的文件名仍可核验。

允许的迁移变化严格限定为：

1. format 从 chatlog-md/1 改为 chatlog-md/2；
2. 去除纯星期日期标题；
3. **无其他变化**。不强制补 ID，不补造模型 ID、时间或用量。

核验同时比较结构语义与原始文本：日期、标题、消息顺序、角色、时间及精度、旧模型字符串、元数据、正文、思考、附件；每条消息的原始片段完全相同；整份候选与允许变更得到的预期文本完全相同；v2 无操作读写完全相同；本地附件存在且记录 SHA-256。

迁移报告通过后，由维护者再将候选切换为正式文件。原始 v1 备份长期保留。程序不把私人日记写进测试夹具、构建输出或公开规范。

## 16. 扩展与后续版本

命名建议使用 `x-主题` 映射收纳扩展。扩展字段不改变既有字段含义，未知值的类型必须保留。新增数据内容使用新的 part kind，避免在正文中约定未经标记的特殊行。

若未来版本改变已有字段的含义、结构边界或 token 口径，应提升主版本，而不是继续使用 chatlog-md/2。读取器可以提示版本未知，但应提供完整原文，不尝试“修复”成自己认识的格式。

可直接阅读和试用的完整虚构示例：[示例日记-v2.chat.md](examples/示例日记-v2.chat.md)。
