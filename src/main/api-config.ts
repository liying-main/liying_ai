/**
 * 统一 API 配置 - Main 进程使用
 * Renderer 进程通过 VITE_API_BASE 环境变量配置
 */
export const API_BASE_URL =
  process.env.MAIN_VITE_API_BASE ||
  process.env.VITE_API_BASE ||
  process.env.API_BASE_URL ||
  'http://47.105.45.25:8001'
