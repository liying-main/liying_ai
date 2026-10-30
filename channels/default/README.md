# 默认渠道图标

放置以下文件：
- `icon.png` — 应用内界面 logo（建议 512×512）
- `windows.ico` 或 `icon.ico` — **Windows 安装包/exe 图标（优先使用，勿被 PNG 覆盖）**
- `app.png` — 可选 PNG 备用（仅当 `icon.png` 不存在时使用）

无 `.ico` 时脚本才会从 PNG 生成 `build/icon.ico`。

`.build-env` 可选：
- `BUILD_ICON_ICO=绝对路径` — 指定 Windows 图标
- `BUILD_ICON_PNG=绝对路径` — 指定界面 PNG

每个代理渠道在 `channels/<agentCode>/` 下放同名文件。
