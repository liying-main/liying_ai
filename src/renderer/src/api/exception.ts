/**
 * 开源版：异常上报改为本地日志，不再上传到任何服务器。
 * 保留原有调用签名，业务代码无需改动。
 */
export const exceptionService = {
  async submitException(data: {
    cardNum?: string
    feature?: string
    traceId?: string
    eventType?: 'start' | 'end' | 'exception'
    exceptionInfo?: string
  }): Promise<void> {
    console.warn('[exception]', data?.feature || '', data?.eventType || '', data?.exceptionInfo || '')
  },
}

