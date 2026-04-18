import { useState, useRef, useEffect } from 'react'

export function usePhoneModal(isGeneratedVideo = false) {
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [phoneModalVideoSrc, setPhoneModalVideoSrc] = useState('')
  const phoneVideoRef = useRef<HTMLVideoElement>(null)
  const [isPhoneVideoPaused, setIsPhoneVideoPaused] = useState(true)
  const [phoneVideoCurrentTime, setPhoneVideoCurrentTime] = useState(0)
  const [phoneVideoDuration, setPhoneVideoDuration] = useState(0)
  const [isPhoneVideoLandscape, setIsPhoneVideoLandscape] = useState(false)

  useEffect(() => {
    if (phoneModalVideoSrc && phoneVideoRef.current) {
      phoneVideoRef.current.currentTime = 0
      setPhoneVideoCurrentTime(0)
      setPhoneVideoDuration(0)
      setIsPhoneVideoLandscape(false)
    }
  }, [phoneModalVideoSrc])

  const openPhoneModal = (videoSrc: string) => {
    setPhoneModalVideoSrc(videoSrc)
    setIsPhoneVideoPaused(true)
    setPhoneVideoCurrentTime(0)
    setPhoneVideoDuration(0)
    setShowPhoneModal(true)
  }

  const closePhoneModal = () => {
    setShowPhoneModal(false)
    setPhoneModalVideoSrc('')
    if (phoneVideoRef.current) phoneVideoRef.current.pause()
  }

  const phoneModalProps = {
    videoSrc: phoneModalVideoSrc,
    isGeneratedVideo,
    phoneVideoRef,
    isPhoneVideoPaused,
    setIsPhoneVideoPaused,
    phoneVideoCurrentTime,
    phoneVideoDuration,
    setPhoneVideoCurrentTime,
    setPhoneVideoDuration,
    isPhoneVideoLandscape,
    setIsPhoneVideoLandscape,
    onClose: closePhoneModal,
  }

  return {
    openPhoneModal,
    closePhoneModal,
    showPhoneModal,
    phoneModalVideoSrc,
    phoneModalProps,
  }
}

export default usePhoneModal
