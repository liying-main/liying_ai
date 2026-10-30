# 更新日志

本文档记录客户端每个版本的改动，按语义化版本倒序排列。

## 3.2.7 (2026-09-22)

### 修复

- 修复 Windows 安装包漏带 `ffmpeg.exe` 和 `ffprobe.exe`，安装后提示“FFmpeg 未找到”的问题。
- 初始化、Windows 打包前和 `afterPack` 阶段均增加 FFmpeg 双文件校验，资源不完整时直接中止构建，避免生成不可用安装包。

## 3.2.3 (2026-08-01)

### 修复

- 修复 PC 端登录页 Slogan 未跟随渠道配置更新的问题，现与安卓端渠道文案保持一致。
- 修复「工作区 01 / 学灵感」中抖音博主主页“分享链接”无法识别的问题，支持自动解析 `v.douyin.com` 等分享短链并回填有效主页地址。
- 优化「方向分析」AI 返回空内容时的处理逻辑，增加重试和友好提示，降低偶发“AI 未返回有效结果”的报错概率。
- 优化文案工具命名：「AI法务」调整为「合规审查」，「翻译文案」调整为「语种翻译」。
- 优化内容构思入口命名：「借灵感 / 借东风」统一调整为「学灵感」。
- 优化内容构思入口命名：「从零起稿」调整为「从零策划」。

## 3.2.2 (2026-06-23)

### 修复

- 切换侧边栏页面后工作台生成进度丢失的问题。
- 默认渠道打包图标错误使用 `app.png` 而非 `icon.png` 的问题。
- 生产环境应用成片模板/一键润色时报 `familyName is not defined` 或 `undefined is not a function` 的问题（字幕渲染模块 bytecode 分包后字体映射导入失效）。
- 成片导出时字幕比标题字体大的问题（标题/字幕缩放逻辑不一致，模板字幕字号过大）。

## 3.2.1 (2026-06-21)

### 字幕体验

- 字幕文案修改后自动重新对齐 Whisper 时间轴，避免手动换行导致音画不同步。
- 字幕说明改为「?」按钮 + 浮层提示，不占输入区空间且不被卡片裁切。

## 3.2.0 (2026-06-20)

### 发布账号与任务中心

- 发布账号管理：多平台多账号、独立浏览器目录、登录自动同步、打开创作者后台、检测状态。
- 任务中心：投放方式/平台选择与发布准备一致，支持按任务选账号并持久化。
- 发布准备：账号下拉、首次发布自动创建默认账号、开始发布前同步登录状态。

### 体验优化

- 平台 chip 统一为等宽胶囊形状。
- 「打开」按钮直达各平台创作者后台管理页（非 C 端首页）。

## 3.0.7 (2026-05-14)

### 字幕精确同步

- **Whisper 逐词时间戳对齐**：后端 `_job_execute_align` 启用 `word_timestamps=True`，新增 `_align_subtitle_with_words` 函数，基于 Whisper 逐词时间戳精确映射每行字幕的起止时间，替代原有字符均匀插值（误差从 0.5-2s 降至 0.1s 级）。
- **始终使用本地 faster-whisper**：字幕对齐不再依赖 Gradio SRT 格式（无逐词数据），统一走本地 faster-whisper + word_timestamps，确保精确时间戳可用。
- **去除前端双重后处理**：`computeLineSegmentsFromWhisper`（`useApplyAllEffects.ts` 和 `VideoGenerateCard.tsx`）移除多余的 `_postProcessAlignedTs` 调用，后端已完成 LINGER 填充和重叠修复，前端不再二次篡改时间戳。

### 效果

- 字幕开始时间精确对齐到该行第一个词的发音起始。
- 字幕结束时间精确对齐到该行最后一个词的发音结束。
- 消除了"字幕提前走完、语音还在说"的问题。

### 视频生成稳定性

- **修复长音频 403"无效票据"**：heygem ticket TTL 从 30 秒延长至 60 秒，防止 whisper 逐词对齐耗时较长时 ticket 过期。
- **Ticket 后台保活**：视频生成过程中每 15 秒自动刷新 heygem ticket，无论音频多长、上传多慢都不会导致 ticket 过期 403。

### 涉及文件

- `gpu-workers/whisper-worker/app/main.py`：新增 `_align_subtitle_with_words`，`_job_execute_align` 启用逐词对齐。
- `gpu-workers/heygem-worker/app/main.py`：`TICKET_TTL_SEC` 默认值 30→60。
- `src/main/ipc-handlers/ipc-plugin-proxy.ts`：`runVideoJobWithProgress` 新增 ticket 后台保活 interval。
- `src/renderer/src/hooks/useApplyAllEffects.ts`：移除 `_postProcessAlignedTs` 双重调用。
- `src/renderer/src/pages/Video/VideoGenerateCard.tsx`：移除 `_postProcessAligned` 双重调用。

---

## 3.0.6 (2026-05-06)

### 一键发布增强

- **自动发布模式**：抖音、B站、快手、视频号、小红书五大平台均支持 `publishMode: 'auto'`，上传完成后自动点击发布按钮，无需手动操作。手动模式保持不变。
- **浏览器启动错误友好提示**：Chrome 启动失败时根据错误码给出具体引导（缺少 VC++ 运行库、内存异常等），不再显示 Playwright 原始堆栈。
- **上传等待辅助函数**：新增 `waitForUploadComplete` 通用函数，轮询检测上传进度，超时 3 分钟自动放弃。

### 字幕对齐优化

- **修复字幕乱序问题**：回退到逐段插值对齐算法，修复 segment-boundary snapping 导致的字幕顺序错乱。
- **Whisper 音频增强**：转写前自动对音频施加 highpass + lowpass + loudnorm 滤波，改善低码率音频的语音识别准确率。
- **移除 OpenCC 转换**：Whisper 已直接返回简体中文，移除冗余的繁简转换步骤。

### 视频生成画质提升

- **拼接重编码画质增强**：多段视频拼接回退到重编码时，CRF 从默认 23 降至 **15**（接近无损），preset 从 `fast` 改为 `slow`，新增 `profile:v high` 和 `pix_fmt yuv420p`，音频码率提升至 192k。
- **可配置画质参数**：新增 `HEYGEM_VIDEO_CRF` 和 `HEYGEM_VIDEO_PRESET` 环境变量，可按需调整画质与编码速度。

### 稳定性改进

- **分段心跳机制**：每个分段推理期间每 30 秒刷新父任务和分段状态，防止长推理被超时清理误杀。
- **僵尸任务超时缩短至 2 分钟**：心跳保持活跃任务存活，无心跳的僵尸任务 2 分钟内自动清理。
- **素材错误快速失败**：人脸未检测到等素材级错误直接报错并给出用户友好提示，不再触发无意义的服务重启。
- **GPU 僵尸进程清理**：重启 HeyGem 前先 kill 所有 GPU 驻留进程，防止显存 OOM。
- **排队逻辑修复**：排队等待判断改用 `state===active`，支持多人并发；退出软件时主动清理队列 session，避免占用 30 秒。
- **Whisper 代理健康检查修复**：健康检查失败时仍返回端点地址，不阻塞转写流程。

### 体验优化

- **客户端心跳保活**：登录后每 3 分钟向后端发送心跳，保持在线状态（Redis TTL=5min）。
- **视频预览弹窗化**：设置面板中视频素材预览从内嵌改为居中弹窗，带标题栏和关闭按钮，点击遮罩可关闭。
- **成片模板预览优化**：优先使用已生成视频的首帧静态图作为模板预览背景，替代之前的视频播放，减少资源占用。
- **App 加载屏品牌化**：居中品牌加载动画（旋转 spinner + 光晕 + 品牌名渐变 + 弹跳圆点）。

### 涉及文件

- `src/main/ipc-handlers/ipc-auto.ts`：自动发布模式、Chrome 启动错误处理、上传等待函数。
- `src/main/ipc-handlers/ipc-download.ts`：下载进度事件重构、重试机制。
- `src/preload/index.ts`：新增 IPC 桥接。
- `src/renderer/src/App.tsx`：客户端心跳、品牌化加载屏。
- `src/renderer/src/index.css`：加载屏动画样式。
- `src/renderer/src/components/SettingsPanel.tsx`：视频预览弹窗化。
- `src/renderer/src/pages/Video/VideoSubtitleCard.tsx`：首帧提取、成片生成流程优化。
- `src/renderer/src/pages/Video/VideoSharedComponents.tsx`：模板预览首帧优先。
- `src/renderer/src/styles/original.css`：视频预览弹窗样式。
- `gpu-workers/heygem-worker/app/main.py`：画质提升（CRF 15）、分段心跳、素材错误识别、超时调优。
- `gpu-workers/whisper-worker/app/main.py`：音频增强滤波、字幕对齐。

---

## 3.0.4 (2026-04-21)

### Bug 修复

- **修复生成任务中途失败（"无效票据" / 403）**：`_purge_stuck_jobs` 自动清理时不再清空 ticket 和 segment 队列，只清理超时的僵尸任务。手动"清队列"按钮仍可完整清空。
- **修复长任务因 Token 过期报 401 失败**：主进程轮询 job 状态时，遇到 401 自动从渲染进程重新获取 token（触发 JWT refresh），TTS / 视频生成 / Whisper 三条轮询链路均已覆盖。
- **修复 Gradio SSE 超时卡死**：为 Gradio ONNX 推理的 SSE 轮询新增 wall-clock 总超时，超时自动断开连接并报错，不再无限等待。同时捕获 Gradio 错误事件的实际错误详情（如 OOM），方便排查。
- **修复 GPU 节点启用/禁用无效**：心跳不再强制覆盖 `status=1`，`NodeHealthScheduler` 不再修改 `status`，节点状态完全由管理员控制。路由选节点时增加 `lastHeartbeat` 新鲜度检查，不会分配任务给已启用但实际离线的节点。
- **修复 Worker 结果 URL 地址错误**：`HEYGEM_PUBLIC_BASE_URL` 环境变量名与 `.env` / `start-heygem.sh` 中的 `PUBLIC_BASE_URL` 不一致，导致结果视频 URL 始终使用硬编码默认值。现已对齐，优先读取 `PUBLIC_BASE_URL`。

### 调度优化

- **新增 `least_load` 路由策略**：后端按 `currentLoad` 升序排序节点，优先将任务分配给负载最低的 GPU 节点。heygem 默认启用此策略，替代原 `round_robin`。
- **单用户并发限制调整为 1**：`MAX_CONCURRENT_JOBS_PER_USER` 从 2 改为 1，避免单用户独占 GPU。

### 新功能

- **自定义情绪支持（TTS）**：Lipvoice 后端新增 80+ 近义词映射表，将用户自定义情绪文本（如"温柔"→平静、"紧张"→恐惧）自动匹配到预定义情绪。近义词匹配不到时调用 DeepSeek LLM 智能分类兜底，结果缓存避免重复调用。

### 运维

- **GPU 节点管理新增"清队列"按钮**：`ChannelGroupPanel` 中 heygem 类型节点可一键清理卡死任务和队列，调用 worker `/admin/purge` 接口。
- **Admin Token 配置**：`start-heygem.sh` 新增 `ADMIN_TOKEN` 环境变量，`admin-web/.env` 新增 `VITE_HEYGEM_ADMIN_TOKEN`，保障 admin 接口鉴权。
- **环境变量改为读本地 `.env` 文件**：`start-heygem.sh` 和 `start-tts.sh` 启动时优先从 `~/gpu-workers/.env` 加载配置，避免 `git pull` 覆盖本地设置。新增 `.env.example` 模板，`.env` 已加入 `.gitignore`。
- **JWT 有效期调整**：access token 从 2 小时延长至 8 小时，refresh token 从 7 天延长至 30 天，减少频繁过期。

### 涉及文件

- `gpu-workers/heygem-worker/app/main.py`：修复队列清理、Gradio SSE 超时/错误捕获、`PUBLIC_BASE_URL` 对齐。
- `gpu-workers/tts-worker/app/main.py`：自定义情绪近义词映射 + LLM 分类兜底。
- `gpu-workers/start-heygem.sh`、`gpu-workers/start-tts.sh`：加载 `.env`、环境变量优化。
- `gpu-workers/.env.example`、`gpu-workers/.gitignore`：新增配置模板。
- `backend/.../StrategyService.java`：心跳不再覆盖 status，路由增加 heartbeat 新鲜度检查，新增 `least_load` 模式。
- `backend/.../NodeHealthScheduler.java`：不再修改 status，只做日志报警。
- `backend/.../application.yml`：JWT 有效期调整。
- `backend/sql/init.sql`：heygem 默认策略改为 `least_load`。
- `liying-pc/src/main/ipc-handlers/ipc-plugin-proxy.ts`：支持 `least_load` 路由模式；TTS / Video / 通用轮询增加 401 token 自动刷新。
- `admin-web/src/ChannelGroupPanel.tsx`：新增"清队列"按钮。
- `admin-web/.env`：新增 `VITE_HEYGEM_ADMIN_TOKEN`。

---

## 3.0.3 (2026-04-19)

### 体验优化

- **形象视频下载进度可视化**：服务端生成完成后，从服务器下载到本地的阶段不再静默。
  - 主进程 `download-video-from-url` 读取 `Content-Length`，按 200ms 节流推送下载进度、已下载字节、总字节、实时速度。
  - 下载阶段按钮文案：`下载中 73% · 12.4/17.1MB · 2.1MB/s`。
  - 进度条在生成阶段走 0→90%（蓝色），下载阶段走 90→100%（绿色），整条进度永远单向、平滑推进。
- **下载失败自动重试 1 次**：网络抖动不再直接报错让用户从头生成，重试期间显示 `下载失败，重试中...`。

### 智能精剪 · 视频识别修复

- **修复视频识别（AI 图片描述）无法返回结果的问题**：
  - 后端 vision 模型配置修正：确保 `api.vision.model` 指向平台实际可用的多模态识图模型。
  - 后端 embedding 模型配置修正：`api.embedding.model` 改为 `text-embedding-3-small`。
  - `LlmService.describeImage()` 新增详细日志：记录请求 base64 长度、模型名、URL、响应状态码，方便后续排查。
- **新增 `.env` 本地开发配置**：`VITE_API_BASE=http://localhost:8001`，前端开发时默认连接本地后端。

### 智能精剪 · 画中画 / 混剪 / 主视频缩放

- **实现 `compose-video-with-pip-segments` IPC handler（画中画合成）**：使用 FFmpeg `overlay` 滤镜将画中画片段叠加到主视频上，支持位置、尺寸配置，短素材自动 `-stream_loop` 循环 + `trim` 裁剪。
- **实现 `compose-video-with-mix-segments` IPC handler（混剪合成）**：按时间段将混剪素材全屏覆盖到主视频上，支持多段拼接，短素材自动循环。
- **实现 `scale-main-video` IPC handler（主视频缩放定位）**：在指定背景色画布上缩放并定位主视频，使用 `pad` + `overlay` 滤镜实现。
- **添加 `scaleMainVideo` 到 preload**：补齐渲染进程到主进程的 IPC 桥接。

### 智能精剪 · Bug 修复

- **修复画中画（PIP）只显示约 1 秒的问题**：去掉 `-itsoffset`，改用 `-stream_loop -1` + `trim` + `setpts` + `format=yuv420p`，确保短素材正确循环填满整个片段时长。
- **修复 BGM 重叠问题**：`useApplyAllEffects.ts` 中 `baseVideoPath` 错误地使用了 `smartCutVideoPath`（已含 BGM 的最终视频），导致更换 BGM 时新旧 BGM 通过 `amix` 叠加。修正为使用 `smartCutBaseVideoPath`（PIP/Mix 后、BGM 前的干净基底），与 `VideoGenerateCard.tsx` 内联版本保持一致。

### UI 优化

- **App 加载屏升级**：替换左上角纯文字"加载中..."为居中品牌化加载动画，包含：
  - 青色主题旋转 spinner + 光晕脉冲
  - 品牌名"厉影 AI"渐变文字
  - 逐个弹跳的加载圆点动画
  - 整体淡入上滑入场效果

### 涉及文件

- `src/main/ipc-handlers/ipc-download.ts`：下载器重写，新增 `video-download-progress` 事件 + 重试逻辑。
- `src/preload/index.ts`：暴露 `onVideoDownloadProgress(cb)` + 新增 `scaleMainVideo` IPC 桥接。
- `src/main/ipc-handlers/ipc-video-processing.ts`：实现 PIP / Mix / Scale 三个 IPC handler，修复 PIP 循环逻辑。
- `src/renderer/src/hooks/useApplyAllEffects.ts`：修复 BGM 重叠，`smartCutVideoPath` → `smartCutBaseVideoPath`。
- `src/renderer/src/pages/Video/VideoGenerateCard.tsx`：监听下载进度、按钮文案、进度条 90→100 映射与绿色样式。
- `src/renderer/src/App.tsx`：加载屏 JSX 重构。
- `src/renderer/src/index.css`：新增 `app-loading-*` 样式与动画。
- `backend/src/main/resources/application.yml`：vision / embedding API 模型配置修正。
- `backend/src/main/java/com/liying/service/LlmService.java`：describeImage 增加调试日志。
- `.env`：新增前端本地开发环境变量。

---

## 3.0.2

### 后端调度 & 稳定性

- 接入 `heygem-worker` 分段轮询调度：长音频拆分为多段，公平轮询调度，单用户不再独占 GPU。
- 静音感知切分：使用 ffmpeg `silencedetect` 在静音处切分并 fade-in/out，避免切割点有"咔嗒"声。
- 修复共享 `avatar.mp4` 被提前删除导致后续分段失败的问题。
- `/queue/leave` 幂等化，已消费的 ticket 返回 200。

### 前端体验

- 视频生成按钮支持分段进度与 ETA 显示：`生成 2/5 段 45% · 剩约 1分20秒`。
- 优先使用后端真实进度，回落到本地定时器估算，解决"卡在 5%、突然跳 100%"的问题。

### 运维

- 管理后台新增 **HeyGem 队列监控** 面板：多节点切换、任务/分段/用户视图、自动刷新。
- `start-heygem.ps1` / `start-heygem.sh` 自动安装 ffmpeg/ffprobe（Windows 下载二进制，Linux 走 apt/yum/conda）。
- worker 启动脚本支持 Redis 自动启动与环境变量导出。

### 并发保护

- 新增 `MAX_CONCURRENT_JOBS_PER_USER` 环境变量（默认 2），`/queue/join` 与 `/video/run` 超限返回 429，防止单用户刷屏占满队列。

---

## 3.0.1

- 基线版本（详见 git 历史）。
