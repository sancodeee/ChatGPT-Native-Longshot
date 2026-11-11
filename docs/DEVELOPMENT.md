# 开发与维护

## 运行方式与边界

这是原生 Manifest V3 扩展，没有打包器、运行依赖或服务端。`extension/` 是唯一运行源码目录，也是「加载已解压的扩展程序」时选择的目录。

本次恢复只移动完整运行目录，内部文件名、相对路径、加载顺序、权限和存储键均保持不变。无需为目录整理引入框架或重写截图逻辑。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `manifest.json` | 权限、界面、后台和内容脚本入口 |
| `popup.html` / `popup.css` / `popup.js` | 弹窗结构与样式、消息选择、截图合成、保存与复制 |
| `content.js` | 从对话 DOM 中识别角色、消息和预览内容 |
| `preview-content.js` | 清理不可信预览 HTML、限制图片 URL，缺失原生 API 时使用安全文本 |
| `native-capture.js` | 页面范围计算、滚动、代码块展开与页面恢复 |
| `capture-plan.js` | 合并消息区间、切片坐标、输出尺寸限制 |
| `capture-matte.js` | 从明暗截图恢复前景透明度 |
| `options.html` / `options.css` / `options.js` | 独立背景设置页，选图时不依赖工具栏弹窗存活 |
| `background-settings.js` | 背景图处理、本机持久化与连续背景绘制 |
| `background.js` | 原生视口截图、节流与图片读取 |
| `_locales/*/messages.json` | 界面翻译，`en` 为默认回退语言 |
| `icons/` | 已生成、可直接使用的图标资源 |

`capture-plan.js` 在页面内容脚本和弹窗中共享，必须先于使用它的脚本加载。`capture-matte.js`、`background-settings.js` 与 `preview-content.js` 先于 `popup.js` 加载。程序化注入的文件名也在 `popup.js` 内，移动运行文件时必须同步核对。

弹窗在 `popup.css` 的 `html` 中使用 520×600 CSS 像素提供固有尺寸，`body` 再以 `max-height: 100vh` 适应浏览器允许的高度，保证小窗口中的底部操作可见。不要用 `vw`、`vh` 或 `dvh` 替代外层固有尺寸：浏览器根据内容计算弹窗大小时可能陷入尺寸压缩。样式调整后应直接打开扩展工具栏弹窗验证，普通网页预览不能替代这项检查。

## 本机检查

维护工具使用 Node.js 22+、Python 3.9+，无需安装包。命令可从任意工作目录调用，内部路径以脚本位置为准：

```bash
python3 scripts/check.py
node --test tests/*.test.cjs
python3 scripts/package.py
```

检查覆盖清单与页面的本地资源引用、程序化内容脚本引用、JSON 语言资源和默认语言键、图标尺寸、JavaScript 与 Python 语法。打包前自动运行相同检查，只收集 `extension/` 内通过检查的运行文件。扩展目录中不接受符号链接或开发文件。

`dist/` 保存生成的 ZIP，不提交 Git。安装包解压后即为扩展根目录，不包含外层 `extension/` 前缀。

GitHub Actions 在 push、pull request 和手动触发时运行检查、回归测试及打包。它不自动发布商店版本，也不上传真实对话截图。

## 权限与本机存储

| 配置 | 当前用途 |
| --- | --- |
| `activeTab` | 用户操作后的当前标签页访问及原生截图 |
| `scripting` | 注入消息读取和页面截图控制脚本 |
| `clipboardWrite` | 用户点击复制时写入 PNG |
| `storage` | 在本机保存背景图与模糊度 |
| `host_permissions` | ChatGPT 对话页及现有图片来源域名的读取 |

图片后台只接受本扩展在 HTTPS ChatGPT 页面中的顶层内容脚本消息；只读取两个会话来源和 `*.oaiusercontent.com` 的 HTTPS 图片，拒绝凭据 URL、非默认端口、重定向及跨来源 blob。每次读取限制为 10 秒、20MiB，并校验图片 MIME；仅发送页同源 ChatGPT 图片可以携带已有凭据，CDN 请求不携带 Cookie。网络和图片错误不得打印或回传带签名参数的原地址。

消息预览优先使用 `Document.parseHTML`，也可在无浏览上下文的独立文档中使用 `Element.setHTML`。必须先校验图片 URL，再把清理后的节点直接转入弹窗；不要序列化后用 `innerHTML` 重解析。旧版浏览器缺失原生清理 API 时使用文本预览，原生截图导出流程不变。`tests/preview-content.html` 在真实浏览器运行 `await runPreviewTests()`，覆盖 10 项 DOM、安全降级和图片请求时机用例；重新验证源码时禁用测试页缓存，避免动态加载到旧脚本。

存储键为 `exportBackgroundImage`、`exportBackgroundBlur`，保存在 `chrome.storage.local`。不要随意改名；调整结构时应设计兼容读取或迁移。验证时避免覆盖用户已有背景偏好和剪贴板内容。

## 手工回归清单

运行文件或页面兼容性修改后，除自动检查外，还应在真实 ChatGPT 会话中验证：

- 消息读取、刷新、全选、取消、反选和非连续消息选择。
- 短消息与跨多屏会话在深浅主题、1×/2×/3× 下的 PNG 保存、边距和图片尺寸。
- 普通代码块、新版代码区域、长行、表格、公式及图片是否完整。
- 纯色背景和图片背景下的内容清晰度、模糊、白色图片及气泡保留；重新打开弹窗后设置仍可读取。
- 正常结束、主动滚动、切换标签页或读取失败后，页面滚动位置与临时样式是否恢复。
- 普通网页与浏览器内置页显示一般提示，失败后旧预览清空，重试可恢复。
- 复制实际产生 PNG；如自动化拦截剪贴板，记录验证止于写入调用，不能宣称已验证系统粘贴。

背景图选择必须通过 `runtime.openOptionsPage()` 进入独立设置页；EgoLite 的工具栏弹窗可能在系统选图窗口取得焦点时关闭，不能在那里等待文件读取或保存回调。设置页和弹窗复用 `ExportBackgroundSettings` 及相同存储键，重新打开弹窗时加载已保存的图片。

检查脚本不是功能测试。`node --test tests/*.test.cjs` 运行背景设置和图片读取回归测试：`background-settings.test.cjs` 覆盖选图入口委托和已保存背景恢复；`content-images.test.cjs` 覆盖引用图标不触发转码、正文图片转换与缓存，以及后台和 blob 读取回退；`background-images.test.cjs` 覆盖来源、发送方、类型、资源限制与签名日志等边界。恢复副本中的历史几何测试及 `tests/ego-live-capture.mjs` 没有恢复，不能沿用旧验证结论。后续增加测试时优先覆盖截图分段、尺寸边界与页面恢复等风险行为。

Google `t*.gstatic.com/faviconV2` 引用图标保留原地址供浏览器显示，不参与 base64 转换；原生截图直接保留页面像素。外部图标服务不可达时仍可能显示浏览器的占位图，这与正文图片读取或截图失败不同，不应为它扩大域名权限。

## 迭代约定

- 运行逻辑的修改放在 `extension/`；说明放在 `docs/`；开发工具放在 `scripts/`。
- 保留现有文件风格，使用英文代码命名；避免与功能无关的批量格式化。
- 新资源应同步更新清单或引用；新增文件类型应同步更新检查工具允许列表。
- 添加界面文案时优先补齐 `en` 和 `zh_CN`，其他语言允许按浏览器规则回退。
- 新版本同步修改 `extension/manifest.json`、后台版本日志及 `ping` 响应、两份 README 和 `CHANGELOG.md`。打包工具从清单读取版本，无需单独维护。
- 提交前运行检查与打包，并完成与改动相关的手工回归。提交信息使用 `<type>(<module>): <中文说明>`。
- 截图、会话数据、背景图片、密钥、浏览器配置、调试产物和安装包不进入 Git。

## 来源

运行源码的来源和可核实许可情况见仓库根目录的 [NOTICE.md](../NOTICE.md)。

## 商店与公开页面

`CHROMEWEBSTORE.md` 维护条目文案、权限解释和当前提交状态；`docs/index.html`、`docs/privacy.html`、`docs/privacy.en.html` 与 `docs/site.css` 是 GitHub Pages 的无脚本静态站。不要把开发者账号、注册付款或商店审核状态写成已完成，除非实际确认。

商店截图及宣传图保存在忽略目录 `dist/store/<version>/`，只使用无个人信息的演示内容，不将截图或背景图纳入 Git。对话导出示例与商店宣传截图是素材，不能替代真实功能回归。
