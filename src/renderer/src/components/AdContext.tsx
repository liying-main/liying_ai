// @ts-nocheck
import React, { createContext, useContext, useState } from 'react'
import { AdModal } from './AdModal'

const AdContext = createContext<{ openAd: () => void }>({ openAd: () => {} })

export function useAd() {
  return useContext(AdContext)
}

export function AdProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)

  return (
    <AdContext.Provider value={{ openAd: () => setVisible(true) }}>
      {children}
      <AdModal visible={visible} onClose={() => setVisible(false)} />
    </AdContext.Provider>
  )
}
