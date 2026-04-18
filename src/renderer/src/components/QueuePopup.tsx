// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { jsxRuntimeExports } from '../utils/jsxRuntime'

const pluginLabel = (name: string) => {
  const labels: Record<string, string> = {
    'plugin-proxy-video': '形象生成',
    'plugin-proxy-audio': '音轨生成',
    'plugin-proxy-tts': '旁白合成',
  }
  return labels[name] || name
}

export function QueuePopup() {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [popupStyle, setPopupStyle] = useState({ top: 0, right: 0 })
  const [queueMap, setQueueMap] = useState<Map<string, { status: string; position: number; total: number }>>(new Map())
  const hasAutoOpenedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!(window as any).api?.onPluginProxyProgress) return
    
    const applyQueueEvent = (data: any) => {
      const name = data.pluginName || 'unknown'
      if (data.type === 'queue_waiting') {
        setQueueMap((prev) => {
          const next = new Map(prev)
          next.set(name, {
            status: 'waiting',
            position: data.position ?? 1,
            total: data.total ?? 1,
          })
          return next
        })
        if (!hasAutoOpenedRef.current.has(name)) {
          hasAutoOpenedRef.current.add(name)
          setShowPopup(true)
        }
      } else if (data.type === 'queue_active') {
        setQueueMap((prev) => {
          const next = new Map(prev)
          next.set(name, {
            status: 'active',
            position: 0,
            total: prev.get(name)?.total ?? 1,
          })
          return next
        })
      } else if (data.type === 'queue_done') {
        setQueueMap((prev) => {
          const next = new Map(prev)
          next.delete(name)
          return next
        })
        hasAutoOpenedRef.current.delete(name)
      }
    }

    const unsub = (window as any).api.onPluginProxyProgress((data: any) => {
      if (data.type === 'job_progress') return
      applyQueueEvent(data)
    })

    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (queueMap.size === 0) setShowPopup(false)
  }, [queueMap])

  const handleToggle = () => {
    if (!showPopup && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopupStyle({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
    setShowPopup((v) => !v)
  }

  const handleCancel = async (pluginName: string) => {
    // Clear local UI state immediately
    setQueueMap((prev) => {
      const next = new Map(prev)
      next.delete(pluginName)
      return next
    })
    hasAutoOpenedRef.current.delete(pluginName)
    // Tell main process to abandon all plugin queues
    try {
      if (typeof (window as any).api?.pluginProxyAbandonQueues === 'function') {
        await (window as any).api.pluginProxyAbandonQueues()
      }
    } catch (err) {
      console.error('取消队列失败:', err)
    }
  }

  // Clear all stale queue entries (safety net for stuck queues)
  const handleClearAll = () => {
    setQueueMap(new Map())
    hasAutoOpenedRef.current.clear()
    try {
      if (typeof (window as any).api?.pluginProxyAbandonQueues === 'function') {
        (window as any).api.pluginProxyAbandonQueues()
      }
    } catch {}
  }

  const waitingEntries = Array.from(queueMap.entries()).filter(([, s]) => s.status === 'waiting')
  const activeEntries = Array.from(queueMap.entries()).filter(([, s]) => s.status === 'active')
  const hasAny = queueMap.size > 0
  const totalWaiting = waitingEntries.length

  return jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, {
    children: [
      jsxRuntimeExports.jsxs("button", {
        ref: btnRef,
        type: "button",
        className: `queue-indicator-btn${hasAny ? " queue-indicator-btn--on" : ""}`,
        onClick: handleToggle,
        title: "处理进度",
        children: [
          jsxRuntimeExports.jsxs("svg", {
            width: "16", height: "16", viewBox: "0 0 24 24",
            fill: "none", stroke: "currentColor", strokeWidth: "2",
            strokeLinecap: "round", strokeLinejoin: "round",
            children: [
              jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "10" }),
              jsxRuntimeExports.jsx("polyline", { points: "12 6 12 12 16 14" }),
            ],
          }),
          totalWaiting > 0 && jsxRuntimeExports.jsx("span", {
            className: "queue-indicator-badge",
            children: totalWaiting,
          }),
          totalWaiting === 0 && activeEntries.length > 0 && jsxRuntimeExports.jsx("span", {
            className: "queue-indicator-dot",
          }),
        ],
      }),
      showPopup && ReactDOM.createPortal(
        jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, {
          children: [
            jsxRuntimeExports.jsx("div", {
              className: "queue-popup-backdrop",
              onClick: () => setShowPopup(false),
            }),
            jsxRuntimeExports.jsxs("div", {
              className: "queue-popup",
              style: { top: popupStyle.top, right: popupStyle.right },
              children: [
                jsxRuntimeExports.jsxs("div", {
                  className: "queue-popup-header",
                  children: [
                    jsxRuntimeExports.jsx("span", { children: "任务处理列表" }),
                    jsxRuntimeExports.jsxs("div", {
                      style: { display: 'flex', alignItems: 'center', gap: '8px' },
                      children: [
                        queueMap.size > 0 && jsxRuntimeExports.jsx("button", {
                          type: "button",
                          className: "queue-cancel-btn",
                          onClick: handleClearAll,
                          style: { fontSize: '11px', padding: '2px 6px' },
                          children: "清空记录",
                        }),
                        jsxRuntimeExports.jsx("button", {
                          type: "button",
                          className: "queue-popup-close",
                          onClick: () => setShowPopup(false),
                          children: "×",
                        }),
                      ],
                    }),
                  ],
                }),
                jsxRuntimeExports.jsxs("div", {
                  className: "queue-popup-body",
                  children: [
                    queueMap.size === 0 && jsxRuntimeExports.jsxs("div", {
                      className: "queue-popup-idle",
                      children: [
                        jsxRuntimeExports.jsxs("svg", {
                          width: "32", height: "32", viewBox: "0 0 24 24",
                          fill: "none", stroke: "currentColor", strokeWidth: "1.5",
                          children: [
                            jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "10" }),
                            jsxRuntimeExports.jsx("polyline", { points: "12 6 12 12 16 14" }),
                          ],
                        }),
                        jsxRuntimeExports.jsx("p", { children: "当前没有等待中的任务" }),
                      ],
                    }),
                    Array.from(queueMap.entries()).map(([name, state]) =>
                      jsxRuntimeExports.jsxs("div", {
                        className: "queue-plugin-row",
                        children: [
                          jsxRuntimeExports.jsxs("div", {
                            className: "queue-plugin-row-header",
                            children: [
                              jsxRuntimeExports.jsx("span", {
                                className: "queue-plugin-name",
                                children: pluginLabel(name),
                              }),
                              state.status === "waiting" && jsxRuntimeExports.jsx("button", {
                                type: "button",
                                className: "queue-cancel-btn",
                                onClick: () => handleCancel(name),
                                children: "取消",
                              }),
                              state.status === "active" && jsxRuntimeExports.jsx("span", {
                                className: "queue-plugin-active-tag",
                                children: "执行中",
                              }),
                            ],
                          }),
                          state.status === "waiting" && jsxRuntimeExports.jsx("div", {
                            className: "queue-popup-waiting",
                            children: jsxRuntimeExports.jsxs("div", {
                              className: "queue-popup-position",
                              children: [
                                jsxRuntimeExports.jsx("span", {
                                  className: "queue-popup-pos-num",
                                  children: state.position,
                                }),
                                jsxRuntimeExports.jsx("span", {
                                  className: "queue-popup-pos-label",
                                  children: "等待位置",
                                }),
                              ],
                            }),
                          }),
                        ],
                      }, name)
                    ),
                  ],
                }),
              ],
            }),
          ],
        }),
        document.body
      ),
    ],
  })
}
