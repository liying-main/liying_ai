import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  // User preference selections (persisted across sessions)
  selectedVoiceId: string
  selectedVideoMaterialId: string
  selectedBgmId: string
  selectedTitleStyleId: string
  ttsEmotion: string
  ttsEmotionWeight: number
  ttsAudioSpeed: number

  // Actions
  setSelectedVoiceId: (v: string) => void
  setSelectedVideoMaterialId: (v: string) => void
  setSelectedBgmId: (v: string) => void
  setSelectedTitleStyleId: (v: string) => void
  setTtsEmotion: (v: string) => void
  setTtsEmotionWeight: (v: number) => void
  setTtsAudioSpeed: (v: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      selectedVoiceId: '',
      selectedVideoMaterialId: '',
      selectedBgmId: '',
      selectedTitleStyleId: '',
      ttsEmotion: '',
      ttsEmotionWeight: 0.8,
      ttsAudioSpeed: 1,

      setSelectedVoiceId: (v) => set({ selectedVoiceId: v }),
      setSelectedVideoMaterialId: (v) => set({ selectedVideoMaterialId: v }),
      setSelectedBgmId: (v) => set({ selectedBgmId: v }),
      setSelectedTitleStyleId: (v) => set({ selectedTitleStyleId: v }),
      setTtsEmotion: (v) => set({ ttsEmotion: v }),
      setTtsEmotionWeight: (v) => set({ ttsEmotionWeight: v }),
      setTtsAudioSpeed: (v) => set({ ttsAudioSpeed: v }),
    }),
    {
      name: 'settings-store',
    }
  )
)
