import { useEffect } from 'react'
import { VideoPage } from './pages/Video/VideoPage'
import { ToastProvider } from './components/Toast'
import { BRAND } from './config/channel'

/**
 * 厉影AI 数字人 · 开源版
 *
 * 与原版的区别：
 *  - 去掉卡密登录，启动即进入主界面；
 *  - 去掉云端资源初始化（改为读本地 resources 目录）；
 *  - 去掉强制更新检查与在线心跳。
 */
function App() {
  useEffect(() => {
    document.title = BRAND.productName
  }, [])

  return (
    <ToastProvider>
      <VideoPage />
    </ToastProvider>
  )
}

export default App

