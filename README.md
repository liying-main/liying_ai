# 厉影AI 数字人

把文案、参考音色、数字人视频和字幕放在同一个桌面工作台。支持手动逐步创作，也可以在素材与服务配置完成后运行自动流程。

软件客户端免费开源。云端生成由你选择的服务提供，额度、价格与免费活动以该服务的实际规则为准，不承诺无限免费调用。默认服务 [OpenAPI](https://api.openapi.cn) 由项目维护方提供，也支持填写兼容服务地址。

## 开始使用

1. 打开客户端即可浏览工作台和管理本地素材，不需要登录旧版账号系统。
2. 在「设置 → API 配置」填写服务地址和 API Key。默认地址为 `https://api.openapi.cn/v1`，也可以改成兼容服务。
3. 「测试连接」只请求当前地址的 `/models`，不生成内容、不自动保存草稿。测试通过仅说明模型列表可访问；生成能力、权限与额度仍需在所选服务确认。
4. 点击「保存配置」，再按工作台的文案、配音、数字人、字幕和合成步骤操作。

Windows 安装包见 [Releases](https://github.com/liying-main/liying_ai/releases)。请选择版本附件中的 `liying-ai-*-setup.exe`；GitHub 自动提供的 Source code ZIP 是源码，不是安装包。

### 抖音主页选题与视频导入

「学灵感选题分析」通过可见浏览器读取目标作者的公开作品文案，最多收集 30 条。输入作者主页或视频分享链接；遇到登录、验证码时，在弹出的浏览器窗口中自行完成，程序最多等待 120 秒。关闭窗口会取消这次操作。主页不可访问、没有公开作品或平台限制访问时，会显示具体原因。

3.2.8 的主页读取不再依赖 `downloadDouyinVideo.exe` 或旧版 Cookie 后台。视频导入在没有旧下载组件时也会使用同一个浏览器流程。Windows 发布包内置 Chromium；源码开发可使用本机 Chrome / Edge，或按下面的步骤准备固定版本 Chromium。浏览器登录状态仅保存在本应用用户数据目录的 `app-data2/browser/douyin` 中，不读取日常浏览器的个人资料。它与 OpenAPI 的 API Key 配置无关。

主页采集和视频下载受平台页面、网络及访问权限影响；浏览器能启动不代表所有链接都能成功。后续 AI 选题分析仍会调用你配置的模型服务。

客户端默认模型名称见 `src/shared/station.ts`。替换服务时，需要支持实际使用的模型和接口；仅支持通用聊天接口的服务未必支持语音或数字人生成。需要改模型名称时可修改这份共享配置后重新构建。

参考音色可导入你有权使用的 WAV、MP3 或 M4A 音频。公开发布不附带内置录音与字体，缺失的音色文件会从列表中过滤。导入操作只把音频保存到本机；启动云端生成后，所需音频才会提交给所选服务。背景音乐、字体和其他素材由使用者自行准备。

## 数据与设置

服务配置保存在 Electron 用户数据目录的 `station-config.json`，其中 API Key 当前以明文保存在本机。Windows 默认目录为 `%APPDATA%/liying-ai/`；导入素材和作品保存在其下的 `app-data2`。目录名保留以兼容已有数据。

调用云端功能时，请求会向所选服务发送 API Key 及完成任务所需的文本、音频或视频。使用本地素材导入或本地合成无需调用生成 API。提交 Issue、截图或日志前请移除 Key、个人路径和私人素材。

## 本地开发

在仓库根目录执行；本次环境使用 Node.js 24 和 pnpm 9。项目基于 Electron 38、React 19、TypeScript 与 electron-vite。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

仅编译主进程、预加载和前端：

```bash
pnpm build
```

默认开发与构建会生成本地默认品牌配置，不请求渠道后台、不需要 `.env` 或 API Key，也不会调用生成服务。生成任务的配置在客户端设置页填写。

## 打包资源

Windows 安装包需要完整 Chromium、FFmpeg 和 FFprobe。FFmpeg 工具放在 `ffmpeg/bin/ffmpeg.exe` 与 `ffmpeg/bin/ffprobe.exe`；若使用共享构建，必须同时带上配套 DLL。合成用到 `libx264`、字幕用到 `subtitles/libass`，请核对所选构建的功能、许可证和对应源码再分发要求。源码仓库不附带工具二进制，编译 `pnpm build` 不要求它们存在。

Windows x64 浏览器固定使用 Playwright v1.56.1 官方分发的 **Chromium 141.0.7390.37 / revision 1194**，独立于项目运行时的 Playwright 版本。执行以下命令会下载固定 ZIP、验证 SHA-256 和 Chromium 品牌、保留完整 DLL/资源/语言包，并从该浏览器导出第三方许可：

```bash
node scripts/prepare-browser.mjs
node scripts/prepare-browser.mjs --verify
```

脚本只生成尚不存在的 `chrome/`，已有目录时先检查或重命名；不会覆盖。它会短暂启动准备好的浏览器，仅读取本地 `chrome://credits` 页面，不使用个人资料或访问业务页面。`chrome/LICENSE`、`chrome/THIRD_PARTY_LICENSES.html` 和来源记录须随完整浏览器一起打包。

需要离线准备时，预先从 [官方固定 ZIP](https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/1194/chromium-win64.zip) 和 [该版本 Chromium LICENSE](https://raw.githubusercontent.com/chromium/chromium/141.0.7390.37/LICENSE) 下载文件，再执行：

```bash
node scripts/prepare-browser.mjs --archive "C:/downloads/chromium-win64.zip" --license "C:/downloads/Chromium-LICENSE"
```

ZIP 的 SHA-256 为 `bc65aed7bded748e267bd4d5d21f19459fa6e47464370a923fb6d87ebb22d7fb`，脚本会强制校验。请勿用新版 `playwright install chromium` 的缓存替代发布资源：同名下载项可能是 Chrome for Testing，不能据此视为 Chromium 的相同发行许可。更新浏览器版本时需同步来源、校验值和许可，并重新验证 Playwright 兼容性。源码开发仍可省略准备步骤，运行时保留查找本机 Chrome / Edge 或已有 Playwright 缓存的逻辑。

开发运行时也可使用本应用已安装目录或系统 `PATH` 中的 FFmpeg / FFprobe；不会查找其他应用的安装目录。公开安装包仍需按上述路径自备工具，避免依赖用户机器上的其他安装。

```bash
pnpm check:resources
pnpm build:win
```

打包前和 `afterPack` 都会检查媒体工具与浏览器，Windows 会额外检查 Chromium DLL、资源包和语言包，缺少时中止。`pnpm dist` 按当前系统打包。macOS 还需要对应架构的 `ffmpeg-{arm64|x64}`、`ffprobe-{arm64|x64}`、浏览器和应用图标；浏览器路径以 `build/required-resources.cjs` 为准，尚未提供经过来源、许可与兼容性验证的 macOS 发布资源。`scripts/init-tools.mjs` 仅保留为本地工具检查入口，不下载音色、字体或其他资源；公开发行使用以上命令。

缺少本地资源时，相关媒体合成功能不可用；素材库为空时请先导入自己的素材。未安装附加字体时使用系统字体回退，跨系统排版可能不同。历史平台发布、浏览器自动化等模块尚需独立配置和验证，不作为本次发布已验证能力。

## 贡献与许可

请先阅读 [贡献说明](CONTRIBUTING.md) 和 [安全反馈](SECURITY.md)。客户端源码使用 [MIT 许可证](LICENSE)。第三方依赖、工具和用户导入的素材适用各自许可证，发布时应保留其署名与许可说明。仓库不包含旧私有后台，默认构建也不依赖它。

## 相关开源项目

- [数字人桌面版 / 口播智能体](https://github.com/liying-main/liying_ai)
- [混剪桌面版](https://github.com/liying-main/liying-videomix)
