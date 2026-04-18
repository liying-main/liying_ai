import { apiClient } from './client'

interface ExceptionData {
  cardNum: string
  feature: string
  traceId: string
  eventType: 'start' | 'end' | 'exception'
  exceptionInfo: string
}

export const exceptionService = {
  async submitException(data: ExceptionData): Promise<void> {
    try {
      await apiClient.post('/app/card/exception/submit', data)
    } catch (error) {
      console.warn('Failed to submit exception:', error)
    }
  }
}
