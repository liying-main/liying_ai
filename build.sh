#!/usr/bin/env bash
# ============================================================
#  厉影AI macOS 打包脚本
#  支持: arm64 (Apple Silicon), x64 (Intel)
#  用法:
#    ./build.sh              - 交互式选择
#    ./build.sh arm64        - 只打 Apple Silicon
#    ./build.sh x64          - 只打 Intel
#    ./build.sh all          - 同时打 arm64 + x64
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

APP_VERSION=$(node -p "require('./package.json').version")
APP_NAME="liying-ai"

cat <<EOF

  ╔══════════════════════════════════════════╗
  ║      厉影AI macOS 打包工具               ║
  ║      版本: $APP_VERSION
  ╚══════════════════════════════════════════╝

EOF

# ---- 前置检查: 必须有 Mac 原生二进制才能打 ----
check_required() {
  local arch="$1"
  local missing=()
  [[ -f "ffmpeg/bin/ffmpeg-${arch}"  ]] || missing+=("ffmpeg/bin/ffmpeg-${arch}")
  [[ -f "ffmpeg/bin/ffprobe-${arch}" ]] || missing+=("ffmpeg/bin/ffprobe-${arch}")
  [[ -d "chrome/mac-${arch}/Google Chrome for Testing.app" ]] || missing+=("chrome/mac-${arch}/Google Chrome for Testing.app")
  [[ -f "build/icon.icns" ]] || missing+=("build/icon.icns")

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "  [警告] 以下文件缺失，可能影响 ${arch} 包功能:"
    printf '    - %s\n' "${missing[@]}"
    echo "  (抖音下载器 douyin/downloadDouyinVideo-${arch} 不存在则Mac版会自动隐藏抖音下载功能)"
    echo ""
    read -p "  仍然继续打包? [y/N] " yn
    [[ "$yn" =~ ^[Yy] ]] || exit 1
  fi

  chmod +x "ffmpeg/bin/ffmpeg-${arch}" 2>/dev/null || true
  chmod +x "ffmpeg/bin/ffprobe-${arch}" 2>/dev/null || true
  chmod +x "chrome/mac-${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" 2>/dev/null || true
  chmod +x "douyin/downloadDouyinVideo-${arch}" 2>/dev/null || true
  node scripts/check-mac-chrome-arch.mjs "${arch}"
}

# ---- 解析参数 ----
BUILD_ARM64=0
BUILD_X64=0

if [[ $# -eq 0 ]]; then
  echo "  请选择要打包的架构:"
  echo "    [1] arm64 - Apple Silicon (M1/M2/M3, 推荐)"
  echo "    [2] x64   - Intel Mac"
  echo "    [3] 全部  - arm64 + x64"
  echo "    [0] 退出"
  read -p "  请输入选项 [1-3, 0退出]: " CHOICE
  case "$CHOICE" in
    1) BUILD_ARM64=1 ;;
    2) BUILD_X64=1 ;;
    3) BUILD_ARM64=1; BUILD_X64=1 ;;
    0) echo "已取消"; exit 0 ;;
    *) echo "无效选项"; exit 1 ;;
  esac
else
  for arg in "$@"; do
    case "$arg" in
      arm64) BUILD_ARM64=1 ;;
      x64|intel) BUILD_X64=1 ;;
      all) BUILD_ARM64=1; BUILD_X64=1 ;;
      *) echo "未知参数: $arg"; exit 1 ;;
    esac
  done
fi

# ---- Step 1: 编译 ----
echo ""
echo "  [1/3] 编译项目 (electron-vite build)..."
npm run build
echo "  [OK] 编译完成"

# ---- Step 2: 清理冗余 ----
echo ""
echo "  [2/3] 清理冗余 renderer 资源..."
npm run clean:renderer-assets

# ---- Step 3: 打包 ----
echo ""
rm -rf dist

if [[ $BUILD_ARM64 -eq 1 ]]; then
  echo "  [3/?] 打包 macOS arm64 (Apple Silicon)..."
  check_required "arm64"
  npx electron-builder --mac --arm64
  echo "  [OK] arm64 完成"
fi

if [[ $BUILD_X64 -eq 1 ]]; then
  echo "  [3/?] 打包 macOS x64 (Intel)..."
  check_required "x64"
  npx electron-builder --mac --x64
  echo "  [OK] x64 完成"
fi

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║            打包结果                      ║"
echo "  ╚══════════════════════════════════════════╝"
ls -lh dist/*.dmg 2>/dev/null || echo "  没有产出 dmg 文件"
echo ""
echo "  输出目录: $(pwd)/dist/"
