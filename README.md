# 滚墨印记

文字与图片的干墨、滚印效果工具。作者：**安鱼** · [ANYUSJ.COM](https://www.anyusj.com/)。

**[打开在线工具](https://www886321-commits.github.io/rolling-ink/)** · [源代码](https://github.com/www886321-commits/rolling-ink)

## 功能

- 文字、上传图片、页面手绘三种素材；上传内容在浏览器本机处理。
- 干墨印章：不规则边缘颗粒、缺墨与内部肌理自然衔接。
- 滚墨拓印：13 种真实扫描肌理，直接按原图约 5400 × 7600 像素取样，按需加载。
- 字体选择、本机字体导入、字距、拉伸、圆角与字形参数。
- 画笔、橡皮擦、撤销，以及矩形、圆形、椭圆、三角形、菱形、星形、爱心等图形。图形可叠加、相减、拖动、缩放与旋转。
- 常用画面比例、自定义尺寸、上传背景图片，三套极简界面主题。
- 透明 PNG（长边最高 4096 px）与真实路径 SVG；可单独导出元素，文件名自动区分。

每次打开默认使用「干墨印章」，边缘粗糙 26%。滚墨的默认参数保留已确认设置。关闭页面后，输入、素材和手绘会清空，请及时导出。

## 使用

打开在线工具，选择文字、图片或手绘，调整印刷方式和参数，再到「导出」下载 PNG／SVG。SVG 对浓淡作分层描摹；需要保留连续扫描墨色时优先导出 PNG。

手绘图形绘制后自动进入自由变换；拖动边角调整大小，拖动旋转柄调整角度。Shift 等比缩放／按 15° 旋转，V 进入选择，Delete 删除，Ctrl/⌘ Z 撤销。空格拖动平移，滚轮缩放。变换控制点保持屏幕尺寸。

上传背景后画布匹配图片尺寸。PNG 导出可取消「包含背景图片」，仅保存透明印记；SVG 始终只保存印记。

内置 12 款中文／日文字体与 13 款英文开放字体，选择后按需载入。其他 14 款英文目录项需点击「载入本机英文字体文件夹」选择自己的原字体文件，不会上传字体。界面会显示商用／非商用及相应依据，作品用途仍需遵守字体许可。大字体与高清肌理首次载入时间取决于网络。

## 浏览器兼容

以当前 Chrome、Microsoft Edge、Firefox 和 Safari/WebKit 为兼容目标。高清扫描分段读取，保留原像素并降低载入峰值。页面内置布局样式，脚本按内容版本加载，避免样式缺失或旧缓存混用造成画布不可见；不支持动态视口单位或 ResizeObserver 时使用后备尺寸处理。

已在 Windows 的独立 Edge、Chrome、Firefox 和 WebKit 测试实例验证桌面、3813 × 1863 宽屏、手机尺寸、两种效果、字体、图片、手绘、自由变换控制点及 PNG／SVG 导出。WebKit 测试不等同于在真实 macOS／iOS Safari 设备上验收。

自动发布前运行 Chromium、Firefox、WebKit 浏览器回归，并模拟外部 CSS 不可用、动态视口单位和 ResizeObserver 不可用的情况。

## 本地运行

需要 Node.js 22 或更新版本，运行工具无须安装第三方依赖。浏览器回归需要先运行 `npm ci` 和 `npx playwright install chromium firefox webkit`，再运行 `npm run test:browsers`。

```sh
npm start
# 浏览器打开 http://127.0.0.1:4179
npm test
npm run build:web
```

网站输出到 `site/`，可部署到任意静态网站，支持子目录。GitHub Actions 在 main 更新后自动验证并发布 Pages。

`npm run build` 生成离线 `滚墨印记.html` 和 `dist/`。双击 HTML 或 `启动工具.cmd` 打开；需保留同目录 `assets/rollers/` 与 `assets/typefaces/`。离线 HTML 为生成文件，不重复提交。

## 版权与许可

程序源码采用 **AGPL-3.0-only**，见 [LICENSE](LICENSE)。通过网络提供修改版本时，请按许可提供对应源码和声明。

界面字体、创作字体与图标保留各自许可证，见 [第三方说明](licenses/THIRD-PARTY-NOTICES.md)、[字体来源](assets/typefaces/SOURCE.md) 和 [英文授权说明](assets/typefaces/ENGLISH-SOURCE.md)。

滚筒扫描为项目使用的第三方素材，**不适用程序的 AGPL 许可**，来源见 [肌理说明](assets/rollers/SOURCE.md)。作者品牌、二维码、上传素材与字体均不因程序开源而改变其各自权利。
