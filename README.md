# 厉影AI 数字人

把文案、参考音色、数字人视频和字幕放在同一个桌面工作台。支持手动逐步创作，也可以在素材与服务配置完成后运行自动流程。

软件客户端免费开源。云端生成由你选择的服务提供，额度、价格与免费活动以该服务的实际规则为准，不承诺无限免费调用。默认服务 [OpenAPI](https://api.openapi.cn) 由项目维护方提供，也支持填写兼容服务地址。

## 开始使用

1. 打开客户端即可浏览工作台和管理本地素材，不需要登录旧版账号系统。
2. 在「设置 → API 配置」填写服务地址和 API Key。默认地址为 `https://api.openapi.cn/v1`，也可以改成兼容服务。
3. 「测试连接」只请求当前地址的 `/models`，不生成内容、不自动保存草稿。测试通过仅说明模型列表可访问；生成能力、权限与额度仍需在所选服务确认。
4. 点击「保存配置」，再按工作台的文案、配音、数字人、字幕和合成步骤操作。

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

## 打包与可选资源

Windows 本地合成和安装包需要自行提供可再分发的 FFmpeg、FFprobe，放在 `ffmpeg/bin/ffmpeg.exe` 与 `ffmpeg/bin/ffprobe.exe`。源码仓库不附带这些二进制文件。编译 `pnpm build` 不要求它们存在；安装包构建会提前检查文件是否齐全。请根据所选二进制版本保留相应许可证和再分发要求。

开发运行时也可使用本应用已安装目录或系统 `PATH` 中的 FFmpeg / FFprobe；不会查找其他应用的安装目录。公开安装包仍需按上述路径自备工具，避免依赖用户机器上的其他安装。

```bash
pnpm check:resources
pnpm build:win
```

`pnpm dist` 按当前系统打包。macOS 还需要对应架构的 `ffmpeg-{arm64|x64}`、`ffprobe-{arm64|x64}` 和应用图标，未在本次 Windows 环境验证。`scripts/init-tools.mjs` 仅保留为本地工具检查入口，不下载音色、字体或其他资源；公开发行使用以上命令。

缺少本地资源时，相关媒体合成功能不可用；素材库为空时请先导入自己的素材。未安装附加字体时使用系统字体回退，跨系统排版可能不同。历史平台发布、浏览器自动化等模块尚需独立配置和验证，不作为本次发布已验证能力。

## 贡献与许可

请先阅读 [贡献说明](CONTRIBUTING.md) 和 [安全反馈](SECURITY.md)。客户端源码使用 [MIT 许可证](LICENSE)。第三方依赖、工具和用户导入的素材适用各自许可证，发布时应保留其署名与许可说明。仓库不包含旧私有后台，默认构建也不依赖它。

## 相关开源项目

- [数字人桌面版 / 口播智能体](https://github.com/liying-main/liying_ai)
- [数字人轻量版](https://github.com/liying-main/digitalhuman-open)
- [混剪桌面版](https://github.com/liying-main/liying-videomix)
- [混剪轻量版](https://github.com/liying-main/videomix-open)
