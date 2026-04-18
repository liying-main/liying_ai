// @ts-nocheck
import React from 'react'
import wechatImg from '../assets/wechat.jpg'

interface AdModalProps {
  visible: boolean
  onClose: () => void
}

export function AdModal({ visible, onClose }: AdModalProps) {
  if (!visible) return null

  return (
    <div
      className="phone-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={wechatImg}
          alt="微信二维码"
          style={{
            width: '100%',
            maxWidth: '400px',
            maxHeight: '80vh',
            objectFit: 'contain',
            borderRadius: '12px',
          }}
        />
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '-12px',
            right: '-12px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
