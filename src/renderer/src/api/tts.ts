import { apiClient } from './client'

interface TtsParams {
  text: string
  voiceId: string
  emotion?: string
  emotionWeight?: number
  speed?: number
}

interface TtsResult {
  success: boolean
  audioUrl?: string
  audioPath?: string
  duration?: number
  error?: string
}

export const ttsService = {
  // Generate speech from text
  async generateSpeech(params: TtsParams): Promise<TtsResult> {
    try {
      const response = await apiClient.post('/api/tts/generate', {
        text: params.text,
        voice_id: params.voiceId,
        emotion: params.emotion || '',
        emotion_weight: params.emotionWeight ?? 0.8,
        speed: params.speed ?? 1.0
      })
      
      return {
        success: true,
        audioUrl: response.data?.audioUrl,
        audioPath: response.data?.audioPath,
        duration: response.data?.duration
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  },

  // Get available voices
  async getVoices(): Promise<{ success: boolean; voices: any[]; error?: string }> {
    try {
      const response = await apiClient.get('/api/tts/voices')
      return {
        success: true,
        voices: response.data?.voices || []
      }
    } catch (error: any) {
      return { success: false, voices: [], error: error.message }
    }
  },

  // Clone voice from audio sample
  async cloneVoice(audioPath: string, name: string): Promise<{ success: boolean; voiceId?: string; error?: string }> {
    try {
      const response = await apiClient.post('/api/tts/clone', {
        audio_path: audioPath,
        name
      })
      return {
        success: true,
        voiceId: response.data?.voiceId
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }
}
