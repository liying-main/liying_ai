/**
 * 统一 API 配置 - Main 进程使用
 * Renderer 进程通过 VITE_API_BASE 环境变量配置
 *
 * 开源版：底座指向中转站，不再依赖私有后端。
 */
import { STATION_BASE_URL } from './station'

export const API_BASE_URL =
  process.env.MAIN_VITE_API_BASE ||
  process.env.VITE_API_BASE ||
  process.env.API_BASE_URL ||
  STATION_BASE_URL
