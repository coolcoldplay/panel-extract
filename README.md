# panel-extract

从论文图片或 PDF 提取可独立编辑的 Panel，在浏览器中校正边界，再导出 PNG、ZIP 或 PowerPoint。[打开网页版](https://coolcoldplay.github.io/panel-extract/)

## 使用

1. 把图片或 PDF 拖入空白页面，或点击「选择文件」。也可以复制截图、图片文件或 PDF 文件，然后在页面按 **Ctrl+V**（macOS 用 **⌘V**）。从文件管理器复制 PDF 时，浏览器需要能从剪贴板读到文件本身。
2. 打开图片后，选择一个 Panel 查看清理结果。滚轮缩放原图，「移动」拖动视图。「剪除矩形」和「橡皮檫」可直接在放大预览里校正，滚轮调节橡皮檫直径，Ctrl+Z 撤销。共用图例的相邻 Panel 可以合并。
3. 打开 PDF 后，点击 Figure 名称逐图检查。需要时用「调整整图范围」或「从 PDF 页补选」校正。密集拼图、跨页图注和扫描页尤其值得复核。
4. 单个 Panel 可直接复制到 PPT 或下载为 PNG。「预览与导出整篇」提供 ZIP 和 PPTX。输入 Figure 名称后，文件名形如 `Fig 1A.png` 或 `Fig 1E-F.png`。PPTX 每页对应一幅 Figure，每个 Panel 都是按原图位置排列的独立图片。

文件解析、图像处理和导出都在当前浏览器中完成。发布页本身也是一个可离线使用的 HTML 文件。下载后直接用现代桌面浏览器打开即可。[下载独立网页](https://raw.githubusercontent.com/coolcoldplay/panel-extract/main/docs/index.html)

## 开源来源

| 项目 | 在本工具中的作用 |
| --- | --- |
| BREVESS | 改编其 Figure 图注标题识别规则，并参考阅读工具的界面布局。[对应源码](https://github.com/coolcoldplay/Brevess/blob/6acab0f3d6b507dd0c072c5751516deba89a411e/extension/core/pdf-native-figures.js) |
| Mozilla PDF.js 5.4.624 | 在浏览器解析 PDF、读取文字与绘图操作并渲染页面。[上游版本](https://github.com/mozilla/pdf.js/tree/v5.4.624) |
| python-pptx 1.0.2 | 构建网页时生成空白 PPTX 模板。浏览器把 Panel PNG 和坐标写入该模板。[上游版本](https://github.com/scanny/python-pptx/tree/v1.0.2) |

Panel 字母序列匹配、沿留白估计边界、按前景像素修正归属、手工遮罩和原位导出由本项目实现。PDFFigures 2.0、连通域复合图分割和 SimCFS 用作方法比较。各项来源、随附字体与解码器的许可见[第三方声明](THIRD_PARTY_NOTICES.md)。

## 本地构建

使用 Python 3.10 或更新版本，在仓库根目录运行以下命令。

```sh
python -m pip install -r requirements.txt
python scripts/build.py
```

输出文件为 `docs/index.html`。首次构建会从 npm 官方注册表下载固定版本的 PDF.js 发布包并校验 SHA-512。离线重建可传入已下载的同版本发布包。

```sh
python scripts/build.py --pdfjs-archive /path/to/pdfjs-dist-5.4.624.tgz
```

浏览器回归测试使用运行时生成的几何图和 PDF。安装 Node.js 后可运行以下命令。

```sh
npm ci
npx playwright install chromium
npm test
```

GitHub Pages 的发布源为 `main` 分支的 `/docs` 目录。修改 `src/` 下的文件后，重新构建并一并提交生成的网页，即可更新网站。

## 许可

本项目与 BREVESS 同样采用 GNU Affero General Public License 第 3 版或更新版本（SPDX 标识 `AGPL-3.0-or-later`）。第三方组件按各自许可分发。[项目许可证](LICENSE) · [第三方许可](licenses/)
