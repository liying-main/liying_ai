/**
 * Compatibility entry point for older local setup commands.
 * Public source builds never download private tool or media bundles.
 */
console.log('[init-tools] 开源版仅检查本地工具，不下载音色、字体或其他资源。')
console.log('[init-tools] 请按 README 准备 FFmpeg / FFprobe 和完整 Chromium；日常编译可直接运行 pnpm build。')
await import('./verify-packaging-resources.mjs')
