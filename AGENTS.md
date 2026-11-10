# 项目维护约定

- 使用中文回复，代码命名使用英文；提交信息遵循 `<type>(<module>): <中文说明>`。
- 修改前先阅读 `README.md`、`docs/DEVELOPMENT.md` 及相关运行代码。
- 这是原生 Manifest V3 扩展；保持现有架构，不引入未经需求支持的构建框架或运行依赖。
- `extension/` 只放运行文件；文档放 `docs/`；开发工具放 `scripts/`；生成文件放 `dist/`。
- 不修改用户已安装的扩展目录或浏览器配置；不要提交对话、截图、背景图、凭据和本机绝对路径。
- 保持权限、脚本加载顺序及持久化存储的兼容性；新增行为前理解截图、合成、恢复链路。
- 默认说明为 `README.md`（中文），对应英文为 `README.en.md`；功能、版本、安装命令变更时同步维护。
- 提交前运行 `python3 scripts/check.py` 和 `python3 scripts/package.py`。功能修改还需验证实际保存、复制及页面恢复，报告实际验证范围。
- 用户可见 Web 改动优先通过 EgoLite 和 `ego-browser` 验证，同一功能复用同一 Task Space。
- 来源与许可信息保存在 `NOTICE.md`，不要编造上游许可证或版权持有人。
