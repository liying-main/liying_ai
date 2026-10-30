/**
 * 中转站底座配置（开源版）
 *
 * 默认服务与模型定义。服务地址可在客户端「API 配置」中修改；
 * 兼容服务需支持以下模型及对应接口。
 */
export const STATION_HOME = 'https://api.openapi.cn'
export const STATION_BASE_URL = 'https://api.openapi.cn/v1'

/** 文案 / 口播稿 */
export const STATION_CHAT_MODEL = 'deepseek-v4.1-flash'
/** 配音（零样本音色克隆，需 3-10 秒参考音频） */
export const STATION_TTS_MODEL = 'indextts2-v1'
/** 语音转写 / 字幕 */
export const STATION_ASR_MODEL = 'whisper-large-v3-turbo'
/** 形象数字人 */
export const STATION_AVATAR_MODEL = 'duix-avatar-v1'

