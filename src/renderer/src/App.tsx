import { useEffect } from 'react'
import { VideoPage } from './pages/Video/VideoPage'
import { ToastProvider } from './components/Toast'
import { BRAND } from './config/channel'

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
