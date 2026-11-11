# Chrome Web Store 上架资料与评估

核对日期：2026-11-11。源码版本：2.3.6。状态：本地草稿，尚未上传商店。

## 当前结论

项目具备提交 Chrome Web Store 的技术基础：Manifest V3、集中且明确的截图用途、本地运行源码和有效安装 ZIP。作者已确认项目全部原创，源码归属已确认。已准备中英文隐私政策、商店素材与发布者信息，并收窄图片权限；公开隐私页面已上线并验证，仍需账号本人完成开发者注册；不应把安装包有效理解为已经符合全部审核要求。

本文件依据当前源码及 Google 官方文档整理，最终审核结果由 Chrome Web Store 决定。

| 项目 | 当前状态 | 提交前处理 |
| --- | --- | --- |
| Manifest / ZIP | 已检查：2.3.6、24 个运行文件，安装包由打包工具生成 | 使用 `scripts/package.py` 生成的 ZIP |
| 源码与功能 | 未发现远程脚本加载、动态执行代码、分析统计或开发者上传服务；检查与 24 项 Node 测试、10 项真实浏览器预览测试通过 | 在正式 Chrome 安装中完成发布前回归 |
| 单一用途 | 明确：选择 ChatGPT 消息并导出原样长截图 | 按下方用途说明填写 |
| 隐私政策 | 中英文页面已在 GitHub Pages 上线，实际访问通过 | 使用下方已验证的公开 URL |
| 域名权限 | 保留两个 ChatGPT 来源及 oaiusercontent 图片来源 | 已移除宽泛 OpenAI/Azure 权限，已验证来源与消息边界 |
| 商店素材 | 已有 128px 图标、3 张 1280×800 截图及 440×280 宣传图 | 素材位于 `dist/store/2.3.6/`，上传商店时使用 |
| 发布者账号 | 用户已有 Google 账号，尚未注册开发者 | 本人重新验证、注册、支付一次性费用并开启两步验证 |
| 品牌与名称 | 名称含 ChatGPT；图标为页面与箭头图形；README 已声明非官方 | 复核第三方品牌使用，商店文案明确独立开发、不暗示官方背书 |

### 已确认事项

- 源码归属：作者于 2026-11-11 确认项目全部原创，包括 2.0.0 原版和随附自制素材，详见 [来源说明](NOTICE.md)。不再将获取其他上游项目的源码授权列为上架待办。
- 仓库公开许可文本：恢复说明中的历史 MIT 声明已保留，当前尚无 `LICENSE` 文件；正式许可文本及版权署名由作者另行确定，不作为“源码归属不明”继续列在待办中。

项目原创确认与第三方品牌使用是不同事项。涉及 ChatGPT 名称的商店条目仍需遵守 Google 的[知识产权与禁止冒充政策](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property)。

## 商店条目

### 名称与基本字段

- 中文当前名称：ChatGPT 原样长截图。
- 英文当前名称：ChatGPT Native Longshot。
- 中文短描述：按会话原样式导出长截图，支持选择消息、保存 PNG 和复制图片。
- 英文短描述：Capture selected ChatGPT messages in their original page style. Save or copy native long screenshots.
- 单一用途：将用户选择的 ChatGPT 对话消息按原页面外观导出为 PNG 长截图，供用户本机保存或复制。
- 分类建议：生产力，按提交时控制台实际可选分类确认。
- 商店主语言建议：简体中文；另提供英文条目。扩展清单的 `default_locale` 当前为 `en`，这是翻译回退设置。

当前 7 组语言的名称均未超过 75 字符、短描述均未超过 132 字符。最终商店名称须与清单的对应本地化名称保持一致；名称调整尚未实施。[OpenAI 品牌指南](https://openai.com/brand/)要求第三方品牌使用遵守其限制，不能把“存在同类扩展”作为授权依据。

### 中文详细说明草稿

选择 ChatGPT 对话中的消息，按原页面外观导出 PNG 长截图，方便本机保存和分享。

支持选择全部或部分消息，保留会话的深浅主题、代码、表格、公式与图片。可选择 1×、2×、3× 导出倍率，将长截图保存为 PNG 或复制为图片。

可选择自己的背景图片，调整模糊程度，或恢复纯色背景。背景设置保存在本机，供以后导出时使用。

使用时打开 ChatGPT 对话，等待回复与图片加载完成，点击扩展图标并选择消息，然后保存或复制。选择背景图后，等待设置页出现缩略图和保存提示，再返回对话并重新打开扩展。截图过程中请保持对话标签页不变，避免滚动或调整窗口。

扩展读取当前页面已显示的最近 50 条消息，不会自动加载全部历史内容。高倍率与长对话可能增加耗时，超出图片尺寸限制时需减少消息或降低倍率。

消息预览与截图在本机处理，不上传到开发者服务器。图片预览可能访问会话中的原图片来源。背景图及模糊设置保存在本机。

本扩展由独立开发者维护，与 OpenAI 无隶属关系或官方背书。

项目与反馈：https://github.com/sancodeee/ChatGPT-Native-Longshot

### English description draft

Select messages from a ChatGPT conversation and export a long PNG screenshot that preserves the original page appearance.

Choose all or selected messages, keep the conversation's theme, code, tables, formulas and images, and export at 1×, 2× or 3×. Save the PNG or copy it as an image. Add your own background image and adjust its blur; background settings stay on your device.

Open a ChatGPT conversation and wait for replies and images to finish loading. Click the extension icon, select messages, then save or copy. To choose a background, use the settings page, wait for the saved preview, then return to the conversation and reopen the extension. Keep the conversation tab unchanged while capturing.

The extension reads up to 50 messages currently available in the page. It does not automatically load the complete conversation history. Very large exports may require fewer messages or a lower scale.

Message previews and screenshots are processed locally and are not uploaded to developer servers. Image previews may request images from their original sources. Background settings are stored locally.

This is an independently developed extension and is not affiliated with or endorsed by OpenAI.

Project and feedback: https://github.com/sancodeee/ChatGPT-Native-Longshot

## 图形素材

| 素材 | 尺寸 | 状态 / 文件 |
| --- | --- | --- |
| 商店图标 | 128×128 PNG | `extension/icons/icon128.png`，与扩展图标一致 |
| 截图 1，必需 | 1280×800 | `dist/store/2.3.6/screenshot-1-plain.png`：消息选择与实际导出效果 |
| 截图 2，建议 | 1280×800 | `dist/store/2.3.6/screenshot-2-background.png`：自定义背景与模糊 |
| 截图 3，建议 | 1280×800 | `dist/store/2.3.6/screenshot-3-dark.png`：代码、表格与深色主题 |
| 小型宣传图，可选 | 440×280 | `dist/store/2.3.6/promo-440x280.png` |
| 大型宣传图，可选 | 1400×560 | 待制作 |

素材使用实际运行的弹窗与原生截图导出结果，由无个人信息的本机示例对话制作；演示素材保存在忽略目录，不将对话截图纳入 Git。Google 要求图标和至少一张截图；宣传图的用途与必填项不同，见[官方图片规范](https://developer.chrome.com/docs/webstore/images)。

## 权限说明

以下说明对应 2.3.6 清单，已移除历史宽泛 OpenAI/Azure 域名权限。

| 权限 / 域名 | 类型 | 当前用途与核对结论 |
| --- | --- | --- |
| `activeTab` | permissions | 用户打开扩展后，对当前对话进行原生视口截图，生成用户请求的长图。 |
| `scripting` | permissions | 注入打包内的消息读取、截图布局与恢复脚本，并读取页面原有 blob 图片。 |
| `clipboardWrite` | permissions | 用户点击复制按钮后，将导出的 PNG 写入剪贴板；不读取剪贴板。 |
| `storage` | permissions | 在本机保存自选背景图与模糊度，重新打开扩展时恢复设置。 |
| `https://chatgpt.com/*` | host_permissions | 识别、预览当前对话，准备截图及恢复页面。 |
| `https://chat.openai.com/*` | host_permissions | 兼容旧版 ChatGPT 会话地址，处理相同截图流程。 |
| `https://*.oaiusercontent.com/*` | host_permissions | 读取会话中的 OpenAI 图片资源，为用户选择预览转换图片；请求不附带 Cookie，限定图片类型、大小与超时。 |

Google 要求逐项说明必要性；范围大于功能所需可能被拒，见[隐私字段与权限说明](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)。当前审查未发现执行远程代码的用途；读取远程图片本身不等于执行远程代码。

## 隐私与数据使用

### 当前实际行为

“没有开发者上传服务器”不等于“不处理用户数据”。Google 明确将网页截图和提取网页内容视为数据处理，即使只在本机处理，也需要披露和隐私政策，见[用户数据政策 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)。

| 数据类别 | 当前处理 | 持久化 / 传输 |
| --- | --- | --- |
| 网站内容、对话文字、会话中的图片 | 提取预览并生成用户选择范围的截图；不发送给开发者 | 对话与转换缓存留在浏览器运行内存；用户可主动保存 PNG 或复制图片 |
| 用户选择的背景图片 | 读取、缩放并转换图片，用于导出背景 | 与模糊度一起保存在 `chrome.storage.local`，不使用同步存储 |
| 图片来源 URL | 为显示预览而请求原图片地址；失败时可能进行后台读取回退 | 原图片服务可接收请求及常规网络信息；后台仅为发送页同源 ChatGPT 图片保留凭据，CDN 图片请求使用 `credentials: omit`；浏览器直接显示图片时仍遵循自身凭据规则 |
| 登录凭据 | 无账号登录表单，不主动读取密码或 Cookie API | 上一行的图片请求可能由浏览器附带已有凭据，不能宣称“绝不使用 Cookie” |
| 姓名、健康、财务、位置、私人通信等 | 不单独提取或建立用户档案，但对话或背景图可能包含这些内容 | 随用户选择的内容在本机处理；最终数据类别披露需按控制台定义与实际行为确认 |
| 浏览历史、用户活动 | 不读取历史记录 API，不进行跨网站活动跟踪 | 当前会话/图片 URL 仅用于对应功能；未发现统计或广告服务 |

隐私表单、公开政策及商店描述必须保持一致。不要复制“完全不收集、不存储、不联网”的通用承诺。

### 有限使用认证

根据当前源码，以下声明与设计一致；正式提交时由发布者核实并在控制台认证：

- 用户数据不出售给第三方。
- 用户数据不用于与上述截图功能无关的用途。
- 用户数据不用于信用评估或借贷决策。

### 隐私政策 URL

中文：https://sancodeee.github.io/ChatGPT-Native-Longshot/privacy.html

English：https://sancodeee.github.io/ChatGPT-Native-Longshot/privacy.en.html

本地文件为 `docs/privacy.html` 与 `docs/privacy.en.html`，包含本机处理、背景图与文件名、删除方式、图片请求、联系渠道和有限使用说明。两个公开页面已通过 EgoLite 实际访问验证，中文地址响应 HTTP 200，中英文互链正常。

恢复纯色会清除保存的背景图片；代码未因此删除模糊度设置。用户保存的 PNG 是独立文件，需由用户自行管理。不要把这两种保留周期写成相同。

## 发布者信息与分发

- 发布者显示名称：sancodeee，用户已确认。
- 公开联系邮箱：wangsen715@gmail.com，用户已提供；控制台要求的邮箱验证由本人完成。
- 项目主页：https://github.com/sancodeee/ChatGPT-Native-Longshot。
- 支持入口：https://github.com/sancodeee/ChatGPT-Native-Longshot/issues，已确认仓库开启 Issues。
- 可见性与价格：免费、公开上架，用户已确认。地区按控制台可用的默认公开范围准备。
- 开发者账号：已有 Google 账号，尚未注册 CWS 开发者，控制台要求本人重新验证。注册与费用按[官方注册流程](https://developer.chrome.com/docs/webstore/register)办理，金额以控制台显示为准。
- 两步验证：发布或更新前必须开启，见[官方账号安全要求](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification)。

## 提交前技术复核

已实施并检查：

1. 图片后台限定可信顶层 ChatGPT 内容脚本、HTTPS 来源及同源 blob；验证 MIME、10 秒超时和 20MiB 大小上限，拒绝后台重定向。
2. 页面 HTML 在无浏览上下文的文档中清理、验证图片 URL 后转移至弹窗，不允许嵌入页面、事件属性、页面样式或可导航链接；旧 API 安全降级为文本。
3. 代码预览直接保留原文，图片失败响应及日志不再包含签名 URL。
4. 独立复核发现的 setHTML 路径早发图片请求问题已增加网络回归用例，先失败后修复，Document.parseHTML 与仅 setHTML 两条路径均为 10/10 通过。
5. EgoLite 中实际验证浅色、图片背景、深色导出：3 张 684×715 PNG 保存成功；页面临时样式与滚动状态恢复，复制流程生成 PNG（测试拦截系统写入，未验证系统粘贴）。

## 版本与审核记录

| 版本 | 日期 | 内容 | 商店状态 |
| --- | --- | --- | --- |
| 2.3.6 | 2026-11-11 | 权限收敛、图片入口与预览安全、隐私政策及商店资料 | 本地草稿，待开发者注册 |
| 2.3.5 | 2026-11-11 | 引用图标转码修复与首次上架可行性评估 | 未提交 |

本项目没有已核实的商店拒绝记录或已发布条目 ID。上传 ZIP、填写资料、提交审核是不同阶段，流程见[官方发布指南](https://developer.chrome.com/docs/webstore/publish)。

本次检查：`python3 scripts/check.py`、`node --test tests/*.test.cjs`（24/24）、`python3 scripts/package.py`；浏览器安全回归为 10/10。Chrome for Testing 149 已实际加载 2.3.6：原生弹窗为 527×498（内容宽 520），背景入口打开独立设置页，选图后持久保存、重新打开读取正常；生产图片背景合成的像素断言通过。真实 Chrome 内容脚本消息链路已验证：强制 blob 读取走 MAIN-world 回退仍可生成图片预览，跨来源 blob 被拒绝。中英文 GitHub Pages 页面已实际访问确认；GitHub 的源码自动检查和 Pages 部署均通过。
