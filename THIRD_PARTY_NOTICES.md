# 开源项目与方法来源

## 直接使用或改编

| 项目 / 版本 | 用途 | 许可与来源 |
| --- | --- | --- |
| BREVESS | 本项目在 `src/pdf.js` 的 `matchesCaptionHeader` 中改编了上游 `parseCaptionHeader` 的匹配和排除规则，用于识别正文图、补图与扩展数据图的标题。界面布局也参考了该项目。 | GNU AGPL-3.0-or-later。[公开源码快照](https://github.com/coolcoldplay/Brevess/blob/6acab0f3d6b507dd0c072c5751516deba89a411e/extension/core/pdf-native-figures.js) · [上游许可](https://github.com/coolcoldplay/Brevess/blob/main/LICENSE) |
| Mozilla PDF.js / pdfjs-dist 5.4.624 | 在浏览器内解析 PDF、读取字形坐标和绘图操作、渲染整图。构建脚本从官方 npm 发布包取主模块、Worker 和所需资源，压缩嵌入网页。 | Mozilla Foundation 与贡献者，Apache-2.0。[项目源码](https://github.com/mozilla/pdf.js/tree/v5.4.624) · [官方发布包](https://www.npmjs.com/package/pdfjs-dist/v/5.4.624) · [许可副本](licenses/pdfjs/LICENSE) |
| python-pptx 1.0.2 | 构建时从默认模板生成空白演示文稿，网页随附其 Open XML 部件。加入图片、设置名称和幻灯片尺寸、按原图定位均由 `src/slides.js` 执行。 | Steve Canny 与贡献者，MIT。[项目源码](https://github.com/scanny/python-pptx/tree/v1.0.2) · [许可副本](licenses/python-pptx-MIT.txt) |
| Microsoft Playwright | 开发测试工具。测试脚本用浏览器验证空白界面、文件导入和导出。 | Apache-2.0。[项目源码与许可](https://github.com/microsoft/playwright) |
| Lucide / lucide-static 1.55.0 | 工具栏、预览与导出按钮的图标。所选 SVG 路径合并在 `src/icons.svg` 中，直接内嵌到独立网页。 | Lucide Icons and Contributors，ISC。源自 Feather 的部分由 Cole Bemis 授权，使用 MIT。[上游项目](https://github.com/lucide-icons/lucide) · [固定版本](https://www.npmjs.com/package/lucide-static/v/1.55.0) · [完整许可与版权声明](licenses/lucide-ISC-MIT.txt) |

## PDF.js 随附资源

网页的「开源项目与许可」保留以下资源的完整许可文本。仓库中的副本来自同一个 `pdfjs-dist` 发布包。

| 上游资源 | 用途和许可副本 |
| --- | --- |
| Adobe CMaps | 复合字体字符映射。[Adobe 声明](licenses/pdfjs/cmaps/LICENSE) |
| Foxit / PDFium 标准字体、Liberation Sans | 标准字体及回退字形。[PDFium 字体声明](licenses/pdfjs/standard_fonts/LICENSE_FOXIT) · [Liberation SIL Open Font License 1.1](licenses/pdfjs/standard_fonts/LICENSE_LIBERATION) |
| OpenJPEG 及 PDF.js 适配层 | JPEG 2000 解码。[OpenJPEG](licenses/pdfjs/wasm/LICENSE_OPENJPEG) · [PDF.js 适配层](licenses/pdfjs/wasm/LICENSE_PDFJS_OPENJPEG) |
| PDFium JBIG2 及 PDF.js 适配层 | JBIG2 图像解码。[PDFium 与随附组件](licenses/pdfjs/wasm/LICENSE_JBIG2) · [PDF.js 适配层](licenses/pdfjs/wasm/LICENSE_PDFJS_JBIG2) |
| qcms 及 PDF.js 适配层 | 色彩管理。[qcms](licenses/pdfjs/wasm/LICENSE_QCMS) · [PDF.js 适配层](licenses/pdfjs/wasm/LICENSE_PDFJS_QCMS) |
| Compact ICC Profiles | `CGATS001Compat-v2-micro.icc` 色彩配置文件，CC0 1.0。[上游项目](https://github.com/saucecontrol/Compact-ICC-Profiles) · [许可副本](licenses/pdfjs/iccs/LICENSE) |

## 方法比较

这些项目和文献用于对照 Figure 定位与 Panel 分割方法。网页实际运行的图版定位和像素归属实现在 `src/pdf.js` 与 `src/engine.js`。

- **PDFFigures 2.0** 使用论文排版信息与图注寻找整幅图表，作为 Figure 定位的比较对象。[作者仓库](https://github.com/allenai/pdffigures2)
- **Li 等的复合图分割研究** 讨论基于连通域的初次分割和后续质量评估，作为边界修正方法的比较对象。[论文全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC6329596/)
- **SimCFS** 使用合成复合图训练检测模型，作为学习式子图检测的比较对象。本网页随附的是本地几何与像素规则。[作者仓库](https://github.com/hrlblab/ImageSeperation) · [论文全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC10112832/)
