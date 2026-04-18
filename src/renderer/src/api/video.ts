import { apiClient } from './client'

interface VideoParseResult {
  success: boolean
  videoUrl?: string
  coverUrl?: string
  script?: string
  duration?: number
  author?: string
  title?: string
  error?: string
}

interface VideoComposeParams {
  audioPath: string
  videoPath: string
  subtitleItems?: any[]
  bgmPath?: string
  bgmVolume?: number
}

interface VideoComposeResult {
  success: boolean
  videoPath?: string
  error?: string
}

export const videoService = {
  // Parse video from URL (Douyin, Kuaishou, etc.)
  async parseVideoUrl(videoUrl: string): Promise<VideoParseResult> {
    try {
      const response = await apiClient.post('/api/video/parse', { url: videoUrl })
      return {
        success: true,
        videoUrl: response.data?.videoUrl,
        coverUrl: response.data?.coverUrl,
        script: response.data?.script,
        duration: response.data?.duration,
        author: response.data?.author,
        title: response.data?.title
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  },

  // Get user posts from profile URL
  async getUserPosts(profileUrl: string): Promise<{ success: boolean; posts: any[]; error?: string }> {
    try {
      const response = await apiClient.post('/api/video/user-posts', { url: profileUrl })
      return {
        success: true,
        posts: response.data?.posts || []
      }
    } catch (error: any) {
      return { success: false, posts: [], error: error.message }
    }
  },

  // Compose video with audio, subtitles, and BGM
  async composeVideo(params: VideoComposeParams): Promise<VideoComposeResult> {
    try {
      const response = await apiClient.post('/api/video/compose', params)
      return {
        success: true,
        videoPath: response.data?.videoPath
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }
}
