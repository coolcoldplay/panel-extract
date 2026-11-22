# panel-extract

从论文图片或 PDF 提取可独立编辑的 Panel，在浏览器中校正边界，再导出 PNG、ZIP 或 PowerPoint。[打开网页版](https://coolcoldplay.github.io/panel-extract/)

## 使用

1. 把图片或 PDF 拖入空白页面，或点击「选择文件」。也可以复制截图、图片文件或 PDF 文件，然后在页面按 **Ctrl+V**（macOS 用 **⌘V**）。从文件管理器复制 PDF 时，浏览器需要能从剪贴板读到文件本身。
2. 打开图片后，选择一个 Panel 查看清理结果。工具栏右端的「自动划分」图标高亮时使用自动结果，点至灰色即可从空白手动绘制，再点一次恢复自动划分。滚轮缩放原图，用手掌图标「移动」拖动视图。矩形、套索和剪除都可以从图外灰色区域起笔或松开，选区自动裁到实际图边。「剪除矩形」和「橡皮檫」可直接在放大预览里校正，滚轮调节橡皮檫直径，Ctrl+Z 撤销。悬停或用 Tab 聚焦图标可查看工具名称。共用图例的相邻 Panel 可以合并。
3. 打开 PDF 后，点击 Figure 名称逐图检查。如果漏掉了 Panel 或混入图注，点击「原始整图」旁的「从原页重新框选」。在完整 PDF 原页上对照虚线所示的原范围，重新拖框，保留字母、坐标轴和图例，把图注留在框外。「确认范围并提取」会重建这一幅 Figure 的 Panel 并更新导出预览。整篇预览中也可直接重框指定 Figure，取消会保留原来的裁切和编辑。整幅 Figure 都未识别时可用「从 PDF 页补选」。
4. PDF 解析完后，点击文件名旁的「导出整篇 PPT」可直接下载 PPTX，默认使用 PDF 文件名。每页左上角是可编辑的 Figure 名称，下方是按原图位置排列的独立 Panel 图片。旁边的「整篇预览」可更改勾选、改名、预览或下载 ZIP。单个 Panel 可复制或下载为 PNG，文件名形如 `Fig 1A.png` 或 `Fig 1E-F.png`。

在编辑区或预览中，用 **← / →** 切换 Panel，用 **↑ / ↓** 切换 PDF 的 Figure。编辑名称、页码或绘制选区时保留原有键盘操作。

文件解析、图像处理和导出都在当前浏览器中完成。发布页本身也是一个可离线使用的 HTML 文件。下载后直接用现代桌面浏览器打开即可。[下载独立网页](https://raw.githubusercontent.com/coolcoldplay/panel-extract/main/docs/index.html)

## 访问量

官方 GitHub Pages 网页使用 Cloudflare Web Analytics 统计访问和加载性能。站点管理员可在 Web Analytics 中打开 `coolcoldplay.github.io`，添加 `Path equals /panel-extract/` 筛选，然后查看 **Visits** 和 **Page views**。切换 Figure 或 Panel 属于同一次页面浏览。本地 HTML、开发预览及其他域名均跳过统计。[Cloudflare 数据说明](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)

## 开源来源

| 项目 | 在本工具中的作用 |
| --- | --- |
| BREVESS | 改编其 Figure 图注标题识别规则，并参考阅读工具的界面布局。[对应源码](https://github.com/coolcoldplay/Brevess/blob/6acab0f3d6b507dd0c072c5751516deba89a411e/extension/core/pdf-native-figures.js) |
| Mozilla PDF.js 5.4.624 | 在浏览器解析 PDF、读取文字与绘图操作并渲染页面。[上游版本](https://github.com/mozilla/pdf.js/tree/v5.4.624) |
| python-pptx 1.0.2 | 构建网页时生成包含标题文本框的 PPTX 模板。浏览器写入 Figure 名称、Panel PNG 和坐标。[上游版本](https://github.com/scanny/python-pptx/tree/v1.0.2) |
| Lucide 1.55.0 | 提供随网页内嵌、支持离线使用的工具图标。[上游项目](https://github.com/lucide-icons/lucide) |

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
