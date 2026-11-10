# ChatGPT 原样长截图图标

靛蓝色圆角底板、白色长页面和青色双向滚动箭头。与原扩展的相机图标区分。

- `icon16.png`：工具栏。
- `icon48.png`：扩展管理页、弹窗标题。
- `icon128.png`：高分辨率图标。

生成的 PNG 位于 `extension/icons/`，可以直接使用，不需要安装绘图依赖。图标通过代码绘制，不依赖系统表情字体。

需要修改图标时，可在仓库根目录执行以下可选步骤：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install Pillow
.venv/bin/python scripts/generate_icons.py
python3 scripts/check.py
```

脚本按自身位置定位输出目录，运行前后请检查三个 PNG 的实际变化。`.venv/` 不纳入 Git，Pillow 也不是扩展运行、检查或打包的依赖。
