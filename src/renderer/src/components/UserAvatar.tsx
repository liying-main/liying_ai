// @ts-nocheck

import React, { useState, useEffect, useRef, useCallback } from 'react'

import ReactDOM from 'react-dom'

import { jsxRuntimeExports } from '../utils/jsxRuntime'

import { useUserInfoStore } from '../store/UserInfoStore'

import { useThemeStore, THEMES } from '../store/ThemeStore'

import { useVideoPageStore } from '../store/VideoPageStore'



interface UserAvatarProps {

  onLogout: () => void

  showSettings?: boolean

  setShowSettings?: (show: boolean) => void

}



interface MaterialItem {

  id: string

  name: string

  path: string

  category?: string

}



export function UserAvatar({ onLogout, showSettings: externalShowSettings, setShowSettings: externalSetShowSettings }: UserAvatarProps) {

  const { userInfo, loadUserInfo } = useUserInfoStore()

  const { theme, setTheme } = useThemeStore()

  const [open, setOpen] = useState(false)

  const [internalShowSettings, setInternalShowSettings] = useState(false)

  

  // Use external state if provided, otherwise use internal

  const showSettings = externalShowSettings !== undefined ? externalShowSettings : internalShowSettings

  const setShowSettings = externalSetShowSettings || setInternalShowSettings

  const [activeTab, setActiveTab] = useState("userInfo")

  const [dataSubTab, setDataSubTab] = useState("voices")

  const [isEditing, setIsEditing] = useState(false)

  const [editingNickName, setEditingNickName] = useState("")

  const wrapRef = useRef<HTMLDivElement>(null)

  const portalRoot = typeof document !== "undefined" ? document.body : null



  // Material lists

  const [uploadedVoices, setUploadedVoices] = useState<MaterialItem[]>([])

  const [uploadedVideos, setUploadedVideos] = useState<MaterialItem[]>([])

  const [uploadedBgms, setUploadedBgms] = useState<MaterialItem[]>([])

  const [loadingMaterials, setLoadingMaterials] = useState(false)



  // Cache info

  const [cacheInfo, setCacheInfo] = useState<{ formattedSize: string; fileCount: number } | null>(null)

  const [clearingCache, setClearingCache] = useState(false)



  // Playing audio

  const [playingId, setPlayingId] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)



  // Video preview

  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)

  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null)



  // Avatar upload

  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  const [uploadingAvatar, setUploadingAvatar] = useState(false)



  // Load materials

  const loadMaterials = useCallback(async () => {

    if (!(window as any).api) return

    setLoadingMaterials(true)

    try {

      const [voicesConfig, videosConfig, bgmsConfig] = await Promise.all([

        (window as any).api.loadUploadedVoicesConfig?.() || { voices: [] },

        (window as any).api.loadUploadedVideosConfig?.() || { videos: [] },

        (window as any).api.loadUploadedBgmsConfig?.() || { bgms: [] },

      ])

      setUploadedVoices(voicesConfig?.voices || [])

      setUploadedVideos(videosConfig?.videos || [])

      setUploadedBgms(bgmsConfig?.bgms || [])

    } catch (e) {

      console.error('Load materials failed:', e)

    } finally {

      setLoadingMaterials(false)

    }

  }, [])



  // Load cache info

  const loadCacheInfo = useCallback(async () => {

    if (!(window as any).api?.getCacheInfo) return

    try {

      const info = await (window as any).api.getCacheInfo()

      if (info.success) {

        setCacheInfo({ formattedSize: info.formattedSize, fileCount: info.fileCount })

      }

    } catch (e) {

      console.error('Load cache info failed:', e)

    }

  }, [])



  // Zustand store setters for syncing main page

  const {

    selectedVoiceId,

    selectedVideoMaterialId,

    selectedBgmId,

    setUploadedVideos: setStoreVideos,

    setUploadedVoices: setStoreVoices,

    setUploadedBgms: setStoreBgms,

    setSelectedVoiceId,

    setSelectedVideoMaterialId,

    setSelectedBgmId

  } = useVideoPageStore()



  // Delete material

  const deleteMaterial = async (type: 'voices' | 'videos' | 'bgms', item: MaterialItem) => {

    if (!(window as any).api) return

    try {

      // Delete file

      if (item.path) {

        await (window as any).api.deleteUserDataFile?.(item.path)

      }

      // Update config

      if (type === 'voices') {

        const newList = uploadedVoices.filter(v => v.id !== item.id)

        setUploadedVoices(newList)

        await (window as any).api.saveUploadedVoicesConfig?.({ voices: newList })

        setStoreVoices(newList)

        if (selectedVoiceId === item.id) {

          setSelectedVoiceId(newList[0]?.id || '')

        }

      } else if (type === 'videos') {

        const newList = uploadedVideos.filter(v => v.id !== item.id)

        setUploadedVideos(newList)

        await (window as any).api.saveUploadedVideosConfig?.({ videos: newList })

        setStoreVideos(newList)

        if (selectedVideoMaterialId === item.id) {

          setSelectedVideoMaterialId(newList[0]?.id || '')

        }

      } else if (type === 'bgms') {

        const newList = uploadedBgms.filter(v => v.id !== item.id)

        setUploadedBgms(newList)

        await (window as any).api.saveUploadedBgmsConfig?.({ bgms: newList })

        setStoreBgms(newList)

        if (selectedBgmId === item.id) {

          setSelectedBgmId(newList[0]?.id || '')

        }

      }

    } catch (e) {

      console.error('Delete material failed:', e)

    }

  }



  // Clear cache

  const handleClearCache = async () => {

    if (!(window as any).api?.clearCache) return

    setClearingCache(true)

    try {

      const result = await (window as any).api.clearCache()

      if (result.success) {

        alert(result.message || '缓存已清理')

        loadCacheInfo()

      } else {

        alert('清理失败: ' + (result.error || '未知错误'))

      }

    } catch (e) {

      console.error('Clear cache failed:', e)

      alert('清理失败')

    } finally {

      setClearingCache(false)

    }

  }



  // Play/stop audio preview

  const togglePlay = async (item: MaterialItem) => {

    if (playingId === item.id) {

      audioRef.current?.pause()

      setPlayingId(null)

      return

    }

    try {

      const urlResult = await (window as any).api?.getLocalFileUrl?.(item.path)

      if (urlResult?.success && urlResult.url) {

        if (audioRef.current) {

          audioRef.current.pause()

        }

        const audio = new Audio(urlResult.url)

        audioRef.current = audio

        audio.onended = () => setPlayingId(null)

        audio.play()

        setPlayingId(item.id)

      }

    } catch (e) {

      console.error('Play audio failed:', e)

    }

  }



  // Toggle video preview

  const toggleVideoPreview = async (item: MaterialItem) => {

    if (previewVideoId === item.id) {

      setPreviewVideoUrl(null)

      setPreviewVideoId(null)

      return

    }

    try {

      const urlResult = await (window as any).api?.getLocalFileUrl?.(item.path)

      if (urlResult?.success && urlResult.url) {

        setPreviewVideoUrl(urlResult.url)

        setPreviewVideoId(item.id)

      }

    } catch (e) {

      console.error('Load video preview failed:', e)

    }

  }



  // Handle avatar upload

  const handleAvatarClick = () => {

    avatarInputRef.current?.click()

  }



  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0]

    if (!file) return

    

    // Check file type

    if (!file.type.startsWith('image/')) {

      alert('请选择图片文件')

      return

    }

    

    // Check file size (max 2MB)

    if (file.size > 2 * 1024 * 1024) {

      alert('图片大小不能超过2MB')

      return

    }

    

    setUploadingAvatar(true)

    try {

      // Local only - no backend upload

      const reader = new FileReader()

      reader.onload = () => {

        const avatarUrl = reader.result as string

        useUserInfoStore.setState({ userInfo: { ...userInfo, avatarUrl } })

        alert('头像更新成功')

        setUploadingAvatar(false)

      }

      reader.onerror = () => {

        alert('头像读取失败')

        setUploadingAvatar(false)

      }

      reader.readAsDataURL(file)

      return

    } catch (err) {

      console.error('Avatar upload error:', err)

      alert('头像更新失败')

    } finally {

      setUploadingAvatar(false)

    }

    

    // Reset input

    if (avatarInputRef.current) {

      avatarInputRef.current.value = ''

    }

  }



  useEffect(() => {

    loadUserInfo().catch(console.error)

  }, [loadUserInfo])



  useEffect(() => {

    if (showSettings && activeTab === 'data') {

      loadMaterials()

      if (dataSubTab === 'cache') {

        loadCacheInfo()

      }

    }

  }, [showSettings, activeTab, dataSubTab, loadMaterials, loadCacheInfo])



  useEffect(() => {

    return () => {

      if (audioRef.current) {

        audioRef.current.pause()

      }

    }

  }, [])



  useEffect(() => {

    const fn = (e: MouseEvent) => {

      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)

    }

    document.addEventListener("mousedown", fn)

    return () => document.removeEventListener("mousedown", fn)

  }, [])



  const openSettings = () => {

    setOpen(false)

    setShowSettings(true)

    setActiveTab("userInfo")

  }



  const handleLogout = () => {

    setOpen(false)

    onLogout()

  }



  const closeSettings = () => setShowSettings(false)



  const startEdit = () => {

    setEditingNickName(userInfo?.nickName || "")

    setIsEditing(true)

  }



  const cancelEdit = () => {

    setIsEditing(false)

    setEditingNickName("")

  }



  const saveNickName = async () => {

    if (!editingNickName.trim()) {

      alert('昵称不能为空')

      return

    }

    // Local only - no backend

    useUserInfoStore.setState({ userInfo: { ...userInfo, nickName: editingNickName.trim() } })

    setIsEditing(false)

    alert('昵称更新成功')

  }



  // 使用途ThemeStore 导入。THEMES



  return jsxRuntimeExports.jsxs("div", {

    ref: wrapRef,

    className: "user-avatar-wrap",

    style: { position: "relative" },

    children: [

      // 头像按钮

      jsxRuntimeExports.jsx("button", {

        type: "button",

        className: "user-avatar-btn",

        onClick: () => setOpen((v) => !v),

        title: userInfo?.nickName || "用户",

        children: userInfo?.avatarUrl

          ? jsxRuntimeExports.jsx("img", {

              src: userInfo.avatarUrl,

              alt: "头像",

              className: "user-avatar-img",

              onError: (e: any) => {

                try {

                  console.error('[UserAvatar] header avatar img load failed:', userInfo?.avatarUrl)

                } catch {}

                try {

                  ;(window as any).api?.logToMain?.('[UserAvatar] header avatar img load failed:', userInfo?.avatarUrl)

                } catch {}

              }

            })

          : jsxRuntimeExports.jsx("svg", {

              width: "24", height: "24", viewBox: "0 0 24 24",

              fill: "currentColor",

              children: jsxRuntimeExports.jsx("path", {

                d: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"

              }),

            }),

      }),



      // 下拉菜单

      open && jsxRuntimeExports.jsx("div", {

        className: "user-avatar-menu",

        style: {

          position: "absolute",

          top: "100%",

          right: 0,

          marginTop: "8px",

          background: "var(--ly-card-bg, #1a2332)",

          borderRadius: "8px",

          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",

          padding: "8px 0",

          minWidth: "100px",

          zIndex: 1000,

        },

        children: [

          jsxRuntimeExports.jsx("button", {

            type: "button",

            onClick: handleLogout,

            style: {

              display: "block",

              width: "100%",

              padding: "8px 16px",

              border: "none",

              background: "transparent",

              color: "#ef4444",

              textAlign: "left",

              cursor: "pointer",

              fontSize: "14px",

            },

            children: "退出",

          }),

        ],

      }),

    ],

  })

}
