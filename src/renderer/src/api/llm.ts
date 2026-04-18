import { apiClient, API_BASE, ensureValidToken } from './client'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface CompletionOptions {
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

interface CompletionResponse {
  data?: {
    choices: { message: { content: string } }[]
  }
  choices?: { message: { content: string } }[]
}

export const llmService = {
  async completion(
    model: string,
    messages: Message[],
    options: CompletionOptions = {}
  ): Promise<CompletionResponse> {
    try {
      const response = await apiClient.post('/app/llm/info/completion', {
        provider: model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000,
        stream: options.stream ?? false
      })
      
      // Handle both response formats
      if (response.data?.choices) {
        return response
      }
      
      // Wrap response if needed
      return {
        choices: response.choices || [{ message: { content: '' } }]
      }
    } catch (error: any) {
      console.error('LLM completion error:', error)
      throw error
    }
  },

  // Streaming completion for real-time output
  async streamCompletion(
    model: string,
    messages: Message[],
    onChunk: (chunk: string) => void,
    options: CompletionOptions = {}
  ): Promise<string> {
    let fullContent = ''
    
    try {
      const token = await ensureValidToken()
      const response = await fetch(`${API_BASE}/app/llm/info/completion/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: token } : {})
        },
        body: JSON.stringify({
          provider: model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 2000,
          stream: true
        })
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        fullContent += chunk
        onChunk(chunk)
      }
    } catch (error) {
      console.error('Stream completion error:', error)
    }
    
    return fullContent
  },

  /**
   * 多模态图片描述：前端传图片 base64，服务端负责调多模态模型
   */
  async describeImageFromBase64(base64: string) {
    return apiClient.post('/app/llm/info/describe-image', { base64 })
  },

  /**
   * 文本向量化：前端传文本，服务端返回 embedding
   */
  async getTextEmbedding(text: string) {
    return apiClient.post('/app/llm/info/embedding', { text })
  }
}
