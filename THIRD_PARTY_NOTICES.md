# 第三方运行组件

应用自有源码按根目录 `LICENSE` 中的 MIT 许可证发布。下列组件保留自己的许可证；应用的 MIT 许可不替代它们。

## FFmpeg / FFprobe

Windows 3.2.8 安装包使用未经修改的 BtbN 静态 GPL 构建，通过独立进程调用，不链接进 Electron 程序。

- 上游分发：BtbN/FFmpeg-Builds，tag `autobuild-2026-10-29-19-17`。
- 原始资产：`ffmpeg-n9.0.2-37-gae19868753-win64-gpl-9.0.zip`。
- 原始 ZIP SHA-256：`6c3bc37134657f822fe5e530de6d438d6cd041dc32cb4ca1ef00f316f3a45911`。
- FFmpeg 源码提交：`ae19868753c5bcc2044e331d7a64187e58dde619`。
- 构建配方提交：`5031c6f1082414e53688d39e521849905071070d`。
- 上游构建 run：`40871264069`。

GPL v3 许可正文随包保存在 `resources/app.asar.unpacked/ffmpeg/LICENSE.txt`，构建与二进制校验信息见该目录的 `README.md` 和 `SHA256SUMS`。

[3.2.8 发布附件](https://github.com/liying-main/liying_ai/releases/tag/v3.2.8) 同时提供固定版本的 FFmpeg 源码、构建配方、上游依赖下载缓存及校验清单。依赖缓存拆成三个文件以适应 GitHub 的单文件限制。下载全部 `.part01`、`.part02`、`.part03`，在同一目录用 Python 顺序合并：

```python
from pathlib import Path
import shutil

name = 'BtbN-download-cache-run-40871264069.zip'
with Path(name).open('wb') as output:
    for index in (1, 2, 3):
        with Path(f'{name}.part{index:02}').open('rb') as part:
            shutil.copyfileobj(part, output)
```

合并结果 SHA-256 应为 `d445c150c844be2e95e55367495b077d753df3e52add668d23392b2ec7d5901f`。构建配方内的 Dockerfile、scripts 和 patches 给出各依赖的构建方法。FFmpeg 的编译配置也可通过随包 `ffmpeg.exe -buildconf` 查看。

发布附件另含下载缓存之外的固定 rav1e / Rust 依赖源码与许可补充包 `rav1e-rust-sources-run-40871264069.zip`，SHA-256 为 `1eed0eca27e386ff226dc5a979daa7b2eaf25f4f526dd1d1e6ea173acd33c50a`；对应 `rav1e-source-supplement-manifest.json` 记录版本与校验信息，包内保留 LLVM exception 等相关许可文件。

## 浏览器

Windows 随包浏览器是未冠 Google Chrome 品牌的 **Chromium 141.0.7390.37 / revision 1194**，来自 [Playwright v1.56.1 的官方分发记录](https://github.com/microsoft/playwright/blob/v1.56.1/packages/playwright-core/browsers.json)，独立于应用的 Playwright 运行时版本。完整保留 DLL、资源与语言文件。

- [官方 Windows x64 ZIP](https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/1194/chromium-win64.zip)，原始大小 156153766 字节。
- ZIP SHA-256：`bc65aed7bded748e267bd4d5d21f19459fa6e47464370a923fb6d87ebb22d7fb`。
- [该版本 Chromium LICENSE](https://github.com/chromium/chromium/blob/141.0.7390.37/LICENSE) 允许附条件的源码与二进制再分发；版权、条件和免责条款完整保存在 `resources/app.asar.unpacked/chrome/LICENSE`。
- 同一浏览器的 `chrome://credits` 已导出为该目录下的 `THIRD_PARTY_LICENSES.html`，包含其他组件各自的许可；Chromium 的许可不替代这些组件许可。

源码中的 `scripts/prepare-browser.mjs` 固定来源和校验值，验证 Chromium 品牌与版本并生成许可文件。该发行包不使用 Playwright 1.58.2 默认下载的 Chrome for Testing；本项目及 Playwright 的开源许可不替代 Google Chrome 品牌二进制的条款。

## Electron 与 npm 依赖

Electron 的许可和 Chromium 第三方许可随其运行时发布。npm 依赖版本由 `pnpm-lock.yaml` 锁定，包内的 LICENSE / COPYING / NOTICE 文件随依赖保留。应用使用的 Playwright、React、Express、原生 Canvas 等依赖各自适用其包内许可证。

## 不随包提供的内容

未附带旧 `downloadDouyinVideo.exe`、内置人物录音、商业字体或用户素材。用户自行导入的素材不属于本项目的 MIT 授权范围。
