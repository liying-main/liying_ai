import { registerWindowHandlers } from './ipc-window'
import { registerFileHandlers, registerVideoHistoryHandlers } from './ipc-file'
import { registerAssetsHandlers } from './ipc-assets'
import { registerVideoProcessingHandlers } from './ipc-video-processing'
import { registerAutoHandlers } from './ipc-auto'
import { registerPluginHandlers } from './ipc-plugins'
import { registerDownloadHandlers } from './ipc-download'
import { registerDeviceHandlers } from './ipc-device'
import { registerDebugHandlers } from './ipc-debug'

export function registerAllIpcHandlers(): void {
  registerWindowHandlers()
  registerFileHandlers()
  registerVideoHistoryHandlers()
  registerAssetsHandlers()
  registerVideoProcessingHandlers()
  registerAutoHandlers()
  registerPluginHandlers()
  registerDownloadHandlers()
  registerDeviceHandlers()
  registerDebugHandlers()
}
