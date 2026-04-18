// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { jsxRuntimeExports } from '../../utils/jsxRuntime'
import { useVideoPageStore } from '../../store/VideoPageStore'

// 注意: SmartCutModal等智能精剪组件已移至VideoGenerateCard.tsx
// 需要使用SmartCutModal的组件应直接从VideoGenerateCard.tsx导入。
// import { SmartCutModal, SmartCutTimeline, SmartCutResourcePanel, CompositePreview, SmartCutMixUploadWizard } from './VideoGenerateCard'

// BGM相关常量和函数
export const BGM_CATEGORY_PRESETS = ['推荐', '热门', '流行', '摇滚', '电子', '古典', '爵士', '轻音乐', '营销', '新闻', '知识科普', '情感', '禅意', '通用']
export const DEFAULT_BGM_CARD_MUSIC_VOLUME = 0.3
export const DEFAULT_BGM_CARD_VOICE_VOLUME = 1.0

export function normalizeBgmCategory(b) {
  return b.category?.trim() ? b.category.trim() : '推荐'
}

export function orderedBgmCategoryList(categories) {
  const presetOrder = BGM_CATEGORY_PRESETS
  const catArray = Array.from(categories)
  const rest = catArray.filter((c) => !presetOrder.includes(c)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  return [...presetOrder.filter((c) => catArray.includes(c)), ...rest]
}

export function getUploadCategoryCandidates(allBgms) {
  const fromData = new Set(allBgms.map(normalizeBgmCategory))
  const presets = BGM_CATEGORY_PRESETS.filter((c) => c !== '内置')
  const merged = new Set([...presets, ...fromData])
  return orderedBgmCategoryList(merged)
}

function normalizeNewCategoryName(raw) {
  return raw.replace(/[\r\n\\/]/g, '').trim()
}

// BgmUploadCategoryModal组件
export function BgmUploadCategoryModal(props) {
  const {
    open,
    onClose,
    categories,
    onConfirmPickFile,
    title = '选择分类',
    showToast,
  } = props
  const [selected, setSelected] = useState('')
  const [extraCategories, setExtraCategories] = useState([])
  const [newNameDraft, setNewNameDraft] = useState('')
  const listRef = useRef(null)
  const allChoices = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const c of [...categories, ...extraCategories]) {
      if (seen.has(c)) continue
      seen.add(c)
      out.push(c)
    }
    return out
  }, [categories, extraCategories])
  useEffect(() => {
    if (!open) return
    setExtraCategories([])
    setNewNameDraft('')
    const first = categories[0] ?? ''
    setSelected(first)
  }, [open, categories])
  if (!open) return null
  const addNewAndSelect = () => {
    const name = normalizeNewCategoryName(newNameDraft)
    if (!name) {
      showToast?.('请输入分类名称', 'info')
      return
    }
    if (name.length > 24) return
    const exists = allChoices.some((c) => c === name)
    if (!exists) {
      setExtraCategories((prev) => prev.includes(name) ? prev : [...prev, name])
      requestAnimationFrame(() => {
        const listEl = listRef.current
        if (!listEl) return
        listEl.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' })
      })
    }
    setSelected(name)
    setNewNameDraft('')
  }
  const handleNext = () => {
    const cat = selected.trim()
    if (!cat) return
    onConfirmPickFile(cat)
  }
  return ReactDOM.createPortal(
    jsxRuntimeExports.jsx('div', {
      className: 'bgm-upload-cat-overlay',
      role: 'presentation',
      onClick: (e) => { if (e.target === e.currentTarget) onClose() },
      children: jsxRuntimeExports.jsxs('div', {
        className: 'bgm-upload-cat-dialog',
        role: 'dialog',
        children: [
          jsxRuntimeExports.jsx('button', {
            type: 'button',
            className: 'bgm-upload-cat-close',
            onClick: onClose,
            children: '×',
          }),
          jsxRuntimeExports.jsx('h2', { className: 'bgm-upload-cat-title', children: title }),
          jsxRuntimeExports.jsx('p', { className: 'bgm-upload-cat-hint', children: '请先选择或新建分类，再选择要上传的音频文件' }),
          jsxRuntimeExports.jsx('div', {
            ref: listRef,
            className: 'bgm-upload-cat-list',
            children: allChoices.length === 0
              ? jsxRuntimeExports.jsx('p', { children: '暂无预设分类，请在下方新建分类' })
              : allChoices.map((c) => jsxRuntimeExports.jsxs('label', {
                  className: `bgm-upload-cat-row ${selected === c ? 'selected' : ''}`,
                  children: [
                    jsxRuntimeExports.jsx('input', { type: 'radio', checked: selected === c, onChange: () => setSelected(c) }),
                    jsxRuntimeExports.jsx('span', { children: c }),
                  ],
                }, c)),
          }),
          jsxRuntimeExports.jsxs('div', {
            className: 'bgm-upload-cat-new',
            children: [
              jsxRuntimeExports.jsx('span', { children: '新建分类' }),
              jsxRuntimeExports.jsxs('div', {
                className: 'bgm-upload-cat-new-row',
                children: [
                  jsxRuntimeExports.jsx('input', {
                    type: 'text',
                    value: newNameDraft,
                    maxLength: 24,
                    placeholder: '输入新分类名称',
                    onChange: (e) => setNewNameDraft(e.target.value),
                    onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addNewAndSelect() } },
                  }),
                  jsxRuntimeExports.jsx('button', { type: 'button', onClick: addNewAndSelect, children: '添加' }),
                ],
              }),
            ],
          }),
          jsxRuntimeExports.jsxs('div', {
            className: 'bgm-upload-cat-actions',
            children: [
              jsxRuntimeExports.jsx('button', { type: 'button', onClick: onClose, children: '取消' }),
              jsxRuntimeExports.jsx('button', { type: 'button', onClick: handleNext, disabled: !selected.trim(), children: '下一步' }),
            ],
          }),
        ],
      }),
    }),
    document.body
  )
}

// BgmGroupedPreviewSelect组件 - 完整版本（与老版本一致）
export function BgmGroupedPreviewSelect(props) {
  const {
    value,
    onChange,
    groups,
    placeholder = '请选择音乐',
    disabled = false,
    className = '',
    previewVolume = 0.9,
    showToast,
  } = props
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const audioRef = useRef(null)
  const urlCacheByPathRef = useRef(new Map())
  const [isOpen, setIsOpen] = useState(false)
  const [menuView, setMenuView] = useState('categories') // 'categories' | 'tracks'
  const [activeCategory, setActiveCategory] = useState('')
  const [previewingId, setPreviewingId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [menuDirection, setMenuDirection] = useState('down')
  const [anchorRect, setAnchorRect] = useState(null)

  const flatAll = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const selected = useMemo(() => flatAll.find((o) => o.id === value) || null, [flatAll, value])
  const activeItems = useMemo(
    () => groups.find((g) => g.category === activeCategory)?.items ?? [],
    [groups, activeCategory]
  )

  const openMenu = () => {
    if (disabled) return
    setMenuView('categories')
    setActiveCategory('')
    setIsOpen(true)
  }
  const closeMenu = () => setIsOpen(false)

  const clearSelection = () => {
    const a = audioRef.current
    if (a) {
      a.pause()
      a.currentTime = 0
    }
    setPreviewingId(null)
    setIsPlaying(false)
    onChange('')
  }

  // Close menu on click outside
  useEffect(() => {
    const onPointerDown = (e) => {
      if (!isOpen) return
      const target = e.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isOpen])

  // Menu position calculation
  useEffect(() => {
    if (!isOpen) return
    const MENU_MAX_HEIGHT = 280
    const updatePosition = () => {
      const triggerEl = triggerRef.current
      if (!triggerEl) return
      const rect = triggerEl.getBoundingClientRect()
      setAnchorRect(rect)
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const shouldOpenUp = spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow
      setMenuDirection(shouldOpenUp ? 'up' : 'down')
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, groups.length])

  const menuPositionStyle = useMemo(() => {
    if (!anchorRect) return {}
    const left = anchorRect.left
    const width = anchorRect.width
    if (menuDirection === 'up') {
      return { left, width, bottom: window.innerHeight - anchorRect.top + 4 }
    }
    return { left, width, top: anchorRect.bottom + 4 }
  }, [anchorRect, menuDirection])

  // Preload audio URLs when menu opens
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    void (async () => {
      const cache = urlCacheByPathRef.current
      for (const opt of flatAll) {
        if (cancelled) return
        if (!opt.path || cache.has(opt.path)) continue
        // Web paths (start with / or http) can be used directly
        if (opt.path.startsWith('/') || opt.path.startsWith('http')) {
          cache.set(opt.path, opt.path)
          continue
        }
        try {
          const res = await (window as any).api.getLocalFileUrl(opt.path)
          if (res.success && res.url) cache.set(opt.path, res.url)
        } catch {}
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, flatAll])

  const ensurePreviewUrl = async (opt) => {
    const cache = urlCacheByPathRef.current
    const hit = cache.get(opt.path)
    if (hit) return hit
    // Web paths (start with / or http) can be used directly
    if (opt.path.startsWith('/') || opt.path.startsWith('http')) {
      cache.set(opt.path, opt.path)
      return opt.path
    }
    // Local file paths need conversion through Electron API
    const res = await (window as any).api.getLocalFileUrl(opt.path)
    if (!res.success || !res.url) throw new Error(res.error || '无法播放音频')
    cache.set(opt.path, res.url)
    return res.url
  }

  const play = async (opt) => {
    const a = audioRef.current
    if (!a) return
    try {
      const url = await ensurePreviewUrl(opt)
      if (previewingId === opt.id && !a.paused) return
      a.pause()
      a.currentTime = 0
      a.volume = previewVolume
      a.src = url
      a.play().catch((err) => {
        showToast?.(err?.message ? `播放失败: ${err.message}` : '播放失败', 'error')
      })
      setPreviewingId(opt.id)
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : '无法播放音频', 'error')
    }
  }

  const togglePlay = async (opt) => {
    const a = audioRef.current
    if (a && previewingId === opt.id && !a.paused) {
      a.pause()
      setIsPlaying(false)
      return
    }
    await play(opt)
  }

  const enterCategory = (cat) => {
    const g = groups.find((x) => x.category === cat)
    if (!g?.items.length) return
    setActiveCategory(cat)
    setMenuView('tracks')
  }

  return jsxRuntimeExports.jsxs('div', {
    ref: rootRef,
    className: `audio-preview-select ${disabled ? 'disabled' : ''} ${className}`,
    children: [
      // Trigger button
      jsxRuntimeExports.jsxs('div', {
        ref: triggerRef,
        className: `audio-preview-select-trigger ${isOpen ? 'open' : ''}`,
        role: 'button',
        tabIndex: 0,
        'aria-disabled': disabled,
        onClick: () => (isOpen ? closeMenu() : openMenu()),
        onKeyDown: (e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') isOpen ? closeMenu() : openMenu()
          if (e.key === 'Escape') closeMenu()
        },
        children: [
          // Play button for selected item
          jsxRuntimeExports.jsx('span', {
            className: 'audio-preview-select-play-inline',
            children: selected ? jsxRuntimeExports.jsx('button', {
              type: 'button',
              className: 'audio-preview-select-play-btn',
              onClick: (e) => { e.stopPropagation(); void togglePlay(selected) },
              'aria-label': '播放/暂停当前选择',
              disabled,
              children: previewingId === selected.id && isPlaying
                ? jsxRuntimeExports.jsxs('svg', {
                    width: '16', height: '16', viewBox: '0 0 16 16', fill: 'currentColor',
                    children: [
                      jsxRuntimeExports.jsx('rect', { x: '4', y: '3', width: '3', height: '10', rx: '1' }),
                      jsxRuntimeExports.jsx('rect', { x: '9', y: '3', width: '3', height: '10', rx: '1' }),
                    ],
                  })
                : jsxRuntimeExports.jsx('svg', {
                    width: '16', height: '16', viewBox: '0 0 16 16', fill: 'currentColor',
                    children: jsxRuntimeExports.jsx('path', { d: 'M6 4.2V11.8L12 8L6 4.2Z' }),
                  }),
            }) : null,
          }),
          // Selected text
          jsxRuntimeExports.jsx('span', {
            className: 'audio-preview-select-text',
            children: selected ? selected.name : placeholder,
          }),
          // Clear button
          selected && !disabled ? jsxRuntimeExports.jsx('button', {
            type: 'button',
            'aria-label': '清空选择',
            title: '清空',
            onClick: (e) => { e.stopPropagation(); clearSelection() },
            style: {
              padding: 4, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4, width: 26, height: 26, minWidth: 26, minHeight: 26,
              color: 'var(--qt-text-2)', transition: 'background-color 0.2s, color 0.2s',
            },
            onMouseEnter: (e) => { e.currentTarget.style.backgroundColor = 'var(--qt-primary-soft)'; e.currentTarget.style.color = 'var(--qt-primary-2)' },
            onMouseLeave: (e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--qt-text-2)' },
            children: jsxRuntimeExports.jsxs('svg', {
              width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none',
              stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round',
              children: [
                jsxRuntimeExports.jsx('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
                jsxRuntimeExports.jsx('line', { x1: '6', y1: '6', x2: '18', y2: '18' }),
              ],
            }),
          }) : null,
          // Caret
          jsxRuntimeExports.jsx('span', { className: 'audio-preview-select-caret' }),
        ],
      }),
      // Dropdown menu (portal)
      isOpen ? ReactDOM.createPortal(
        jsxRuntimeExports.jsx('div', {
          ref: menuRef,
          className: 'audio-preview-select-menu',
          style: menuPositionStyle,
          children: menuView === 'categories'
            // Category list view
            ? (groups.length
              ? groups.map((g) => jsxRuntimeExports.jsxs('div', {
                  className: 'audio-preview-select-item audio-preview-select-category-row',
                  role: 'option',
                  onClick: () => enterCategory(g.category),
                  children: [
                    jsxRuntimeExports.jsxs('span', {
                      className: 'audio-preview-select-item-name',
                      children: [
                        g.category,
                        jsxRuntimeExports.jsxs('span', {
                          className: 'audio-preview-select-category-count',
                          children: ['（', g.items.length, '）'],
                        }),
                      ],
                    }),
                    jsxRuntimeExports.jsx('span', {
                      className: 'audio-preview-select-category-chevron',
                      'aria-hidden': true,
                      children: '›',
                    }),
                  ],
                }, g.category))
              : jsxRuntimeExports.jsx('div', {
                  className: 'audio-preview-select-empty',
                  children: '暂无背景音乐',
                })
            )
            // Tracks list view
            : jsxRuntimeExports.jsxs(React.Fragment, {
                children: [
                  jsxRuntimeExports.jsxs('button', {
                    type: 'button',
                    className: 'audio-preview-select-back',
                    onClick: () => { setMenuView('categories'); setActiveCategory('') },
                    children: [
                      jsxRuntimeExports.jsx('span', {
                        className: 'audio-preview-select-back-arrow',
                        'aria-hidden': true,
                        children: '←',
                      }),
                      '返回分类',
                    ],
                  }),
                  jsxRuntimeExports.jsx('div', {
                    className: 'audio-preview-select-tracks-header',
                    children: activeCategory,
                  }),
                  activeItems.length
                    ? activeItems.map((opt) => {
                        const isSelected = opt.id === value
                        const isOptPlaying = previewingId === opt.id && isPlaying
                        return jsxRuntimeExports.jsxs('div', {
                          className: `audio-preview-select-item ${isSelected ? 'selected' : ''}`,
                          role: 'option',
                          'aria-selected': isSelected,
                          onClick: () => {
                            if (disabled) return
                            onChange(opt.id)
                            closeMenu()
                          },
                          children: [
                            jsxRuntimeExports.jsx('button', {
                              type: 'button',
                              className: 'audio-preview-select-play-btn item-play',
                              onClick: (e) => { e.stopPropagation(); void togglePlay(opt) },
                              'aria-label': `播放 ${opt.name}`,
                              disabled,
                              children: isOptPlaying
                                ? jsxRuntimeExports.jsxs('svg', {
                                    width: '16', height: '16', viewBox: '0 0 16 16', fill: 'currentColor',
                                    children: [
                                      jsxRuntimeExports.jsx('rect', { x: '4', y: '3', width: '3', height: '10', rx: '1' }),
                                      jsxRuntimeExports.jsx('rect', { x: '9', y: '3', width: '3', height: '10', rx: '1' }),
                                    ],
                                  })
                                : jsxRuntimeExports.jsx('svg', {
                                    width: '16', height: '16', viewBox: '0 0 16 16', fill: 'currentColor',
                                    children: jsxRuntimeExports.jsx('path', { d: 'M6 4.2V11.8L12 8L6 4.2Z' }),
                                  }),
                            }),
                            jsxRuntimeExports.jsx('span', {
                              className: 'audio-preview-select-item-name',
                              children: opt.name,
                            }),
                          ],
                        }, opt.id)
                      })
                    : jsxRuntimeExports.jsx('div', {
                        className: 'audio-preview-select-empty',
                        children: '该分类下暂无曲目',
                      }),
                ],
              }),
        }),
        document.body
      ) : null,
      // Hidden audio element for preview
      jsxRuntimeExports.jsx('audio', {
        ref: audioRef,
        className: 'audio-preview-select-audio',
        preload: 'metadata',
        onPlay: () => setIsPlaying(true),
        onPause: () => setIsPlaying(false),
        onEnded: () => setIsPlaying(false),
        onError: () => { setIsPlaying(false); showToast?.('音频播放失败', 'error') },
      }),
    ],
  })
}

// AudioPreviewSelect组件
export function AudioPreviewSelect(props) {
  const {
    value,
    onChange,
    options,
    placeholder = "请选择",
    disabled = false,
    className = "",
    previewOnSelect = false,
    previewVolume = 0.9,
    showToast,
  } = props;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const audioRef = useRef(null);
  const urlCacheByPathRef = useRef(new Map());
  const [isOpen, setIsOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [menuDirection, setMenuDirection] = useState("down");
  const [anchorRect, setAnchorRect] = useState(null);
  const selected = useMemo(() => (options || []).find((o) => o.id === value) || null, [options, value]);
  
  useEffect(() => {
    const onPointerDown = (e) => {
      if (!isOpen) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      const rootEl = rootRef.current;
      if (rootEl && rootEl.contains(target)) return;
      const menuEl = menuRef.current;
      if (menuEl && menuEl.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const MENU_MAX_HEIGHT = 280;
    const updatePosition = () => {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      setAnchorRect(rect);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenUp = spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow;
      setMenuDirection(shouldOpenUp ? "up" : "down");
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, (options || []).length]);

  const menuPositionStyle = useMemo(() => {
    if (!anchorRect) return {};
    const left = anchorRect.left;
    const width = anchorRect.width;
    if (menuDirection === "up") {
      return { left, width, bottom: window.innerHeight - anchorRect.top + 4 };
    }
    return { left, width, top: anchorRect.bottom + 4 };
  }, [anchorRect, menuDirection]);

  const ensurePreviewUrl = async (opt) => {
    const cache = urlCacheByPathRef.current;
    const cached = cache.get(opt.path);
    if (cached) return cached;
    // Web environment: path starts with / or http, use directly
    if (opt.path.startsWith('/') || opt.path.startsWith('http')) {
      cache.set(opt.path, opt.path);
      return opt.path;
    }
    const res = await (window as any).api.getLocalFileUrl(opt.path);
    if (!res.success || !res.url) throw new Error(res.error || "无法播放音频");
    cache.set(opt.path, res.url);
    return res.url;
  };

  const play = async (opt) => {
    const a = audioRef.current;
    if (!a) return;
    try {
      const url = await ensurePreviewUrl(opt);
      if (previewingId === opt.id && !a.paused) return;
      a.pause();
      a.currentTime = 0;
      a.volume = previewVolume;
      a.src = url;
      a.play().catch((err) => showToast?.(err?.message ? `播放失败: ${err.message}` : "播放失败", "error"));
      setPreviewingId(opt.id);
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "无法播放音频", "error");
    }
  };

  const togglePlay = async (opt) => {
    const a = audioRef.current;
    if (a && previewingId === opt.id && !a.paused) {
      a.pause();
      setIsPlaying(false);
      return;
    }
    await play(opt);
  };

  return jsxRuntimeExports.jsxs("div", {
    ref: rootRef,
    className: `audio-preview-select ${disabled ? "disabled" : ""} ${className}`,
    children: [
      jsxRuntimeExports.jsxs("div", {
        ref: triggerRef,
        className: `audio-preview-select-trigger ${isOpen ? "open" : ""}`,
        role: "button",
        tabIndex: 0,
        onClick: () => { if (!disabled) setIsOpen((v) => !v); },
        children: [
          jsxRuntimeExports.jsx("span", {
            className: "audio-preview-select-play-inline",
            children: selected ? jsxRuntimeExports.jsx("button", {
              type: "button",
              className: "audio-preview-select-play-btn",
              onClick: (e) => { e.stopPropagation(); void togglePlay(selected); },
              "aria-label": "播放/暂停",
              disabled,
              children: previewingId === selected.id && isPlaying
                ? jsxRuntimeExports.jsxs("svg", {
                    width: "16", height: "16", viewBox: "0 0 16 16", fill: "currentColor",
                    children: [
                      jsxRuntimeExports.jsx("rect", { x: "4", y: "3", width: "3", height: "10", rx: "1" }),
                      jsxRuntimeExports.jsx("rect", { x: "9", y: "3", width: "3", height: "10", rx: "1" }),
                    ],
                  })
                : jsxRuntimeExports.jsx("svg", {
                    width: "16", height: "16", viewBox: "0 0 16 16", fill: "currentColor",
                    children: jsxRuntimeExports.jsx("path", { d: "M6 4.2V11.8L12 8L6 4.2Z" }),
                  }),
            }) : null,
          }),
          jsxRuntimeExports.jsx("span", { className: "audio-preview-select-text", children: selected ? selected.name : placeholder }),
          jsxRuntimeExports.jsx("span", { className: "audio-preview-select-caret" }),
        ],
      }),
      isOpen ? ReactDOM.createPortal(
        jsxRuntimeExports.jsx("div", {
          ref: menuRef,
          className: "audio-preview-select-menu",
          style: menuPositionStyle,
          children: (options || []).length ? (options || []).map((opt) => jsxRuntimeExports.jsxs("div", {
            className: `audio-preview-select-item ${opt.id === value ? "selected" : ""}`,
            onClick: () => { if (!disabled) { onChange(opt.id); setIsOpen(false); if (previewOnSelect) play(opt); } },
            children: [
              jsxRuntimeExports.jsx("button", {
                type: "button",
                className: "audio-preview-select-play-btn",
                onClick: (e) => { e.stopPropagation(); void togglePlay(opt); },
                "aria-label": "播放",
                children: previewingId === opt.id && isPlaying
                  ? jsxRuntimeExports.jsxs("svg", {
                      width: "16", height: "16", viewBox: "0 0 16 16", fill: "currentColor",
                      children: [
                        jsxRuntimeExports.jsx("rect", { x: "4", y: "3", width: "3", height: "10", rx: "1" }),
                        jsxRuntimeExports.jsx("rect", { x: "9", y: "3", width: "3", height: "10", rx: "1" }),
                      ],
                    })
                  : jsxRuntimeExports.jsx("svg", {
                      width: "16", height: "16", viewBox: "0 0 16 16", fill: "currentColor",
                      children: jsxRuntimeExports.jsx("path", { d: "M6 4.2V11.8L12 8L6 4.2Z" }),
                    }),
              }),
              jsxRuntimeExports.jsx("span", { className: "audio-preview-select-item-name", children: opt.name }),
            ],
          }, opt.id)) : jsxRuntimeExports.jsx("div", { className: "audio-preview-select-empty", children: placeholder }),
        }),
        document.body
      ) : null,
      jsxRuntimeExports.jsx("audio", {
        ref: audioRef,
        className: "audio-preview-select-audio",
        preload: "metadata",
        onPlay: () => setIsPlaying(true),
        onPause: () => setIsPlaying(false),
        onEnded: () => setIsPlaying(false),
        onError: () => { setIsPlaying(false); showToast?.("音频播放失败", "error"); },
      }),
    ],
  });
}

// RangeValueTooltip组件
export function RangeValueTooltip({ min, max, step, value, disabled = false, className = "", onChange, format }) {
  const inputRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, direction: "up" });
  const displayText = useMemo(() => format ? format(value) : String(value), [format, value]);
  const ratio = useMemo(() => {
    const denom = max - min;
    if (!Number.isFinite(denom) || denom === 0) return 0;
    return (value - min) / denom;
  }, [min, max, value]);

  const computePos = () => {
    const inputEl = inputRef.current;
    if (!inputEl) return;
    const rect = inputEl.getBoundingClientRect();
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const x = rect.left + rect.width * clampedRatio;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const direction = spaceAbove >= 28 || spaceAbove >= spaceBelow ? "up" : "down";
    const top = direction === "up" ? rect.top - 8 : rect.bottom + 8;
    setPos({ left: x, top, direction });
  };

  useEffect(() => {
    if (!visible) return;
    computePos();
    window.addEventListener("scroll", computePos, true);
    window.addEventListener("resize", computePos);
    return () => {
      window.removeEventListener("scroll", computePos, true);
      window.removeEventListener("resize", computePos);
    };
  }, [visible, ratio]);

  return jsxRuntimeExports.jsxs(React.Fragment, {
    children: [
      jsxRuntimeExports.jsx("input", {
        ref: inputRef,
        type: "range",
        min, max, step, value, disabled, className,
        onChange: (e) => onChange(Number(e.target.value)),
        onMouseEnter: () => { if (!disabled) setVisible(true); },
        onMouseLeave: () => setVisible(false),
      }),
      visible ? ReactDOM.createPortal(
        jsxRuntimeExports.jsx("div", {
          className: `range-value-tooltip ${pos.direction === "down" ? "down" : "up"}`,
          style: { left: pos.left, top: pos.top },
          children: displayText,
        }),
        document.body
      ) : null,
    ],
  });
}

export function VideoFirstFrameSelect(props) {
  const {
    value,
    onChange,
    options,
    placeholder = "请选择素材",
    disabled = false,
    className = "",
    showToast,
    thumbMaxWidth = 120,
  } = props;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuDirection, setMenuDirection] = useState("down");
  const [anchorRect, setAnchorRect] = useState(null);
  const selected = useMemo(
    () => options.find((o) => o.id === value) || null,
    [options, value],
  );
  const thumbUrlCacheByPathRef = useRef(new Map());
  const thumbPromiseByPathRef = useRef(new Map());
  const thumbLoadingPathsRef = useRef(new Set());
  const [thumbUrl, setThumbUrl] = useState("");
  const [thumbLoading, setThumbLoading] = useState(false);
  const [, setMenuThumbVersion] = useState(0);
  useEffect(() => {
    const onPointerDown = (e) => {
      if (!isOpen) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      const rootEl = rootRef.current;
      if (rootEl && rootEl.contains(target)) return;
      const menuEl = menuRef.current;
      if (menuEl && menuEl.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const MENU_MAX_HEIGHT = 280;
    const updatePosition = () => {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      setAnchorRect(rect);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenUp =
        spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow;
      setMenuDirection(shouldOpenUp ? "up" : "down");
    };
    updatePosition();
    const onResize = () => updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen, options.length]);
  const ensureThumbUrl = async (opt) => {
    if (!opt.path) throw new Error("视频路径为空");
    const cached = thumbUrlCacheByPathRef.current.get(opt.path);
    if (cached) return cached;
    const existing = thumbPromiseByPathRef.current.get(opt.path);
    if (existing) return existing;
    const p = (async () => {
      thumbLoadingPathsRef.current.add(opt.path);
      setMenuThumbVersion((v) => v + 1);
      try {
        // In web environment (path starts with / or http), use canvas to extract frame
        const videoUrl = opt.coverUrl || opt.path;
        const isWebPath = videoUrl.startsWith('/') || videoUrl.startsWith('http');
        if (isWebPath || !(window as any).api?.extractFrameFromVideo) {
          const dataUrl = await extractVideoFrame(videoUrl);
          thumbUrlCacheByPathRef.current.set(opt.path, dataUrl);
          return dataUrl;
        }
        const res = await (window as any).api.extractFrameFromVideo(opt.path);
        if (!res.success || !res.image_path)
          throw new Error(res.error || "无法提取首帧");
        const urlRes = await (window as any).api.getLocalFileUrl(res.image_path);
        if (!urlRes.success || !urlRes.url)
          throw new Error(urlRes.error || "无法加载首帧缩略图");
        const url = urlRes.url;
        thumbUrlCacheByPathRef.current.set(opt.path, url);
        return url;
      } finally {
        thumbLoadingPathsRef.current.delete(opt.path);
        setMenuThumbVersion((v) => v + 1);
      }
    })();
    thumbPromiseByPathRef.current.set(opt.path, p);
    return p;
  };
  
  // Extract first frame from video using canvas
  const extractVideoFrame = (videoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      
      const captureFrame = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 160;
          canvas.height = video.videoHeight || 90;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            video.remove();
            resolve(dataUrl);
          } else {
            reject(new Error('无法获取canvas context'));
          }
        } catch (e) {
          reject(e);
        }
      };
      
      video.onloadedmetadata = () => {
        video.currentTime = 0.1;
      };
      
      video.onseeked = captureFrame;
      
      video.onerror = (e) => {
        console.error('Video load error:', videoUrl, e);
        reject(new Error('视频加载失败'));
      };
      
      // Timeout fallback
      setTimeout(() => {
        if (video.readyState >= 2) {
          captureFrame();
        }
      }, 2000);
      
      video.src = videoUrl;
      video.load();
    });
  };
  useEffect(() => {
    if (!selected?.path) {
      setThumbUrl("");
      setThumbLoading(false);
      return;
    }
    let cancelled = false;
    setThumbLoading(true);
    ensureThumbUrl(selected)
      .then((url) => {
        if (cancelled) return;
        setThumbUrl(url);
        setThumbLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setThumbLoading(false);
        setThumbUrl("");
        const msg = err instanceof Error ? err.message : "无法播放视频首帧";
        showToast?.(msg, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);
  useEffect(() => {
    if (!isOpen) return;
    if (!options.length) return;
    let cancelled = false;
    void (async () => {
      for (const opt of options) {
        if (cancelled) return;
        if (!opt.path) continue;
        if (thumbUrlCacheByPathRef.current.has(opt.path)) continue;
        try {
          await ensureThumbUrl(opt);
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, options]);
  const menuPositionStyle = useMemo(() => {
    if (!anchorRect) return {};
    const left = anchorRect.left;
    const width = anchorRect.width;
    if (menuDirection === "up") {
      return {
        left,
        width,
        bottom: window.innerHeight - anchorRect.top + 4,
      };
    }
    return {
      left,
      width,
      top: anchorRect.bottom + 4,
    };
  }, [anchorRect, menuDirection]);
  return jsxRuntimeExports.jsxs("div", {
    ref: rootRef,
    className: `video-first-frame-select ${disabled ? "disabled" : ""} ${className}`,
    children: [
      jsxRuntimeExports.jsxs("div", {
        ref: triggerRef,
        className: `video-first-frame-select-trigger ${isOpen ? "open" : ""}`,
        role: "button",
        tabIndex: 0,
        "aria-disabled": disabled,
        onClick: () => {
          if (disabled) return;
          setIsOpen((v) => !v);
        },
        onKeyDown: (e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") setIsOpen((v) => !v);
          if (e.key === "Escape") setIsOpen(false);
        },
        children: [
          jsxRuntimeExports.jsxs("div", {
            className: "video-first-frame-select-trigger-inner",
            children: [
              jsxRuntimeExports.jsx("div", {
                className: "video-first-frame-thumb",
                children: thumbUrl
                  ? jsxRuntimeExports.jsx("img", {
                      key: selected?.path,
                      src: thumbUrl,
                      style: { maxWidth: thumbMaxWidth, objectFit: 'cover', width: '100%', height: '100%' },
                    })
                  : thumbLoading
                  ? jsxRuntimeExports.jsx("div", {
                      className: "video-first-frame-loading",
                      children: "...",
                    })
                  : null,
              }),
              jsxRuntimeExports.jsx("div", {
                className: "video-first-frame-select-text",
                children: selected ? selected.name : placeholder,
              }),
            ],
          }),
          jsxRuntimeExports.jsx("span", {
            className: "video-first-frame-select-caret",
          }),
        ],
      }),
      isOpen
        ? ReactDOM.createPortal(
            jsxRuntimeExports.jsx("div", {
              ref: menuRef,
              className: "video-first-frame-select-menu",
              style: menuPositionStyle,
              children: options.length
                ? options.map((opt) => {
                    const isSelected = opt.id === value;
                    const cached = opt.path
                      ? thumbUrlCacheByPathRef.current.get(opt.path)
                      : "";
                    const isLoading = opt.path
                      ? thumbLoadingPathsRef.current.has(opt.path)
                      : false;
                    return jsxRuntimeExports.jsxs(
                      "div",
                      {
                        className: `video-first-frame-select-item ${isSelected ? "selected" : ""}`,
                        role: "option",
                        "aria-selected": isSelected,
                        onClick: () => {
                          if (disabled) return;
                          onChange(opt.id);
                          setIsOpen(false);
                        },
                        children: [
                          jsxRuntimeExports.jsx("div", {
                            className:
                              "video-first-frame-thumb video-first-frame-select-item-thumb",
                            children: cached
                              ? jsxRuntimeExports.jsx("img", {
                                  key: opt.path,
                                  src: cached,
                                  style: { objectFit: 'cover', width: '100%', height: '100%' },
                                })
                              : isLoading
                              ? jsxRuntimeExports.jsx("div", {
                                  className: "video-first-frame-loading",
                                  children: "...",
                                })
                              : null,
                          }),
                          jsxRuntimeExports.jsx("span", {
                            className: "video-first-frame-select-item-name",
                            children: opt.name,
                          }),
                        ],
                      },
                      opt.id,
                    );
                  })
                : jsxRuntimeExports.jsx("div", {
                    className: "video-first-frame-select-empty",
                    children: placeholder,
                  }),
            }),
            document.body,
          )
        : null,
    ],
  });
}

// 字幕相关常量和函数
export const TEMPLATE_REPLACE_SUBTITLE_DEFAULTS = {
  font: "黑体",
  fontSize: 24,
  fontWeight: 400,
  color: "#FFFFFF",
  strokeEnabled: true,
  strokeWidth: 2,
  strokeColor: "#000000",
  shadowEnabled: false,
  shadowColor: "#000000",
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  shadowBlur: 0,
  bgEnabled: false,
  bgColor: "#000000",
  bgOpacity: 50,
  bgBorderRadius: 0,
  bgPaddingH: 6,
  bgPaddingV: 2,
  alignment: 2,
  posX: null,
  posY: null,
  bottomMargin: 240,
  entranceEffect: "fade",
}

export function templateSubtitleEffectToPartial(se) {
  return {
    font: se.font,
    fontSize: se.fontSize,
    fontWeight: se.fontWeight,
    color: se.color,
    strokeEnabled: se.strokeEnabled,
    strokeWidth: se.strokeWidth,
    strokeColor: se.strokeColor,
    shadowEnabled: se.shadowEnabled,
    shadowColor: se.shadowColor,
    shadowOffsetX: se.shadowOffsetX,
    shadowOffsetY: se.shadowOffsetY,
    shadowBlur: se.shadowBlur,
    bgEnabled: se.bgEnabled,
    bgColor: se.bgColor,
    bgOpacity: se.bgOpacity,
    bgBorderRadius: se.bgBorderRadius,
    bgPaddingH: se.bgPaddingH,
    bgPaddingV: se.bgPaddingV,
    bottomMargin: se.bottomMargin,
    entranceEffect: se.entranceEffect,
  }
}

// 按语言分割字幕文本
export function splitSubtitleByLanguage(text: string, lang: string): string {
  if (!text) return ''
  if (['zh', 'ja', 'ko'].includes(lang)) {
    return text
      .replace(/[。！？；，：、]/g, '\n')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .join('\n')
  }
  return text
    .replace(/[.!?,;:]+\s*/g, '\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .join('\n')
}

// 确保Whisper字幕时间戳已加载
export async function ensureWhisperSegmentsIfNeeded() {
  const state = useVideoPageStore.getState()
  const { generatedAudioPath, subtitleText, whisperSegments, setWhisperSegments } = state
  
  if (!generatedAudioPath || !subtitleText?.trim()) return
  if (whisperSegments?.length > 0) return
  
  try {
    const segments = await window.api.pluginProxyWhisperAlignRun({
      audioPath: generatedAudioPath,
      subtitle: subtitleText.trim()
    })
    if (segments?.length > 0) {
      setWhisperSegments(segments)
    }
  } catch (err) {
    console.error('Whisper字幕时间戳获取失败', err)
  }
}

// 空白标题样式（用于移除标题）
const blankTitleStyle = {
  id: "",
  name: "无标题（移除标题）",
  hasSubTitle: false,
}

// 判断标题时间范围是否受限
function isTitleSegmentRangeLimited(r) {
  return r != null && r.start === 0 && r.end > 0
}

// 默认标题配置
const defaultMainTitleConfig = {
  font: "黑体",
  fontSize: 48,
  fontWeight: 400,
  color: "#FFFFFF",
  strokeColor: "#000000",
  top: 100,
  borderRadius: 10,
  backgroundColor: "transparent",
}
const defaultSubTitleConfig = {
  font: "黑体",
  fontSize: 36,
  fontWeight: 400,
  color: "#FFFFFF",
  strokeColor: "#000000",
  top: 50,
  borderRadius: 10,
  backgroundColor: "transparent",
}

// 标题换行处理 (ported from competitor v5.7.5 Tt: split into 2 balanced halves)
function splitTextByBreakLength(text, breakLength) {
  if (!text || breakLength <= 0 || text.length < breakLength) {
    return [text]
  }
  const lines = []
  const half = Math.floor(text.length / 2)
  const remainder = text.length % 2
  let offset = 0
  for (let i = 0; i < 2; i++) {
    const len = half + (i < remainder ? 1 : 0)
    lines.push(text.slice(offset, offset + len))
    offset += len
  }
  return lines
}

function getTitleLines(text, breakLength) {
  const oneLine = text.replace(/\n/g, " ").trim()
  if (breakLength != null && oneLine.length >= breakLength) {
    return splitTextByBreakLength(oneLine, breakLength)
  }
  const byNewline = text.split(/\n/).map((s) => s.trim()).filter(Boolean)
  if (byNewline.length > 2) return byNewline.slice(0, 2)
  if (byNewline.length > 0) return byNewline
  return [oneLine || text]
}

// Canvas 标题渲染 (ported from competitor v5.7.5 canvas rendering)
function renderTitleOnPreviewCanvas(canvas, style, mainTitleText, subTitleText) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const cw = rect.width * dpr
  const ch = rect.height * dpr
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw
    canvas.height = ch
  }
  ctx.clearRect(0, 0, cw, ch)
  const scaleX = cw / 720
  const scaleY = ch / 1280
  const scale = Math.min(scaleX, scaleY)

  function calcBlockHeight(text, config) {
    const fontSize = (config.fontSize ?? 48) * scale
    const fontWeight = config.fontWeight ?? 400
    const font = config.font || "黑体"
    ctx.font = `${fontWeight} ${fontSize}px "${font}"`
    const breakLen = config.breakLength
    const lines = breakLen != null && text.length >= breakLen
      ? splitTextByBreakLength(text, breakLen)
      : [text]
    const lineH = fontSize * 1.2
    const paddingV = (config.bgPaddingV ?? (config.fontSize ?? 48) * 0.5) * scale
    return lines.length * lineH + paddingV * 2
  }

  function drawBlock(text, config, yOffset) {
    if (!text) return { totalHeight: 0 }
    const fontSize = (config.fontSize ?? 48) * scale
    const fontWeight = config.fontWeight ?? 400
    const font = config.font || "黑体"
    const fontStr = `${fontWeight} ${fontSize}px "${font}"`
    const lineH = fontSize * 1.2
    const breakLen = config.breakLength
    const lines = breakLen != null && text.length >= breakLen
      ? splitTextByBreakLength(text, breakLen)
      : [text]
    ctx.font = fontStr
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    let maxW = 0
    for (const line of lines) {
      const w = ctx.measureText(line).width
      if (w > maxW) maxW = w
    }
    const textTotalH = lines.length * lineH
    const paddingH = (config.bgPaddingH ?? (config.fontSize ?? 48) * 0.5) * scale
    const paddingV = (config.bgPaddingV ?? (config.fontSize ?? 48) * 0.5) * scale
    const boxW = maxW + paddingH * 2
    const boxH = textTotalH + paddingV * 2
    const alignH = config.alignH || "center"
    let centerX
    if (alignH === "left") {
      centerX = cw * 0.05 + boxW / 2
    } else if (alignH === "right") {
      centerX = cw * 0.95 - boxW / 2
    } else {
      centerX = cw / 2
    }
    const centerY = yOffset + boxH / 2
    const bgColor = config.backgroundColor || "transparent"
    if (bgColor && bgColor !== "transparent") {
      ctx.save()
      ctx.fillStyle = bgColor
      const bx = centerX - boxW / 2
      const by = centerY - boxH / 2
      const borderRadius = (config.borderRadius ?? 0) * scale
      if (borderRadius > 0) {
        const r = Math.min(borderRadius, boxW / 2, boxH / 2)
        ctx.beginPath()
        ctx.moveTo(bx + r, by)
        ctx.lineTo(bx + boxW - r, by)
        ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r)
        ctx.lineTo(bx + boxW, by + boxH - r)
        ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH)
        ctx.lineTo(bx + r, by + boxH)
        ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r)
        ctx.lineTo(bx, by + r)
        ctx.quadraticCurveTo(bx, by, bx + r, by)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillRect(bx, by, boxW, boxH)
      }
      ctx.restore()
    }
    const strokeEnabled = config.strokeEnabled !== false && (config.strokeWidth ?? 0) > 0
    const strokeWidth = (config.strokeWidth ?? 2) * scale
    const startY = centerY - textTotalH / 2 + lineH / 2
    for (let i = 0; i < lines.length; i++) {
      const ly = startY + i * lineH
      if (config.shadowEnabled) {
        ctx.shadowColor = config.shadowColor || "#000000"
        ctx.shadowOffsetX = (config.shadowOffsetX ?? 2) * scale
        ctx.shadowOffsetY = (config.shadowOffsetY ?? 2) * scale
        ctx.shadowBlur = (config.shadowBlur ?? 0) * scale
      }
      if (strokeEnabled) {
        ctx.shadowColor = "transparent"
        ctx.save()
        ctx.lineJoin = "round"
        ctx.lineCap = "round"
        ctx.lineWidth = strokeWidth * 2
        ctx.strokeStyle = config.strokeColor || "#000000"
        ctx.strokeText(lines[i], centerX, ly)
        ctx.restore()
        if (config.shadowEnabled) {
          ctx.shadowColor = config.shadowColor || "#000000"
          ctx.shadowOffsetX = (config.shadowOffsetX ?? 2) * scale
          ctx.shadowOffsetY = (config.shadowOffsetY ?? 2) * scale
          ctx.shadowBlur = (config.shadowBlur ?? 0) * scale
        }
      }
      ctx.fillStyle = config.color || "#FFFFFF"
      ctx.fillText(lines[i], centerX, ly)
    }
    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    return { totalHeight: boxH / scale }
  }

  const mainConfig = style.mainTitle || defaultMainTitleConfig
  const mainText = mainTitleText || ""
  if (!mainText) return
  const alignV = mainConfig.alignV || "top"
  const top = mainConfig.top ?? 100
  let mainY
  if (alignV === "top") {
    mainY = top * scale
  } else if (alignV === "bottom") {
    mainY = ch - top * scale - calcBlockHeight(mainText, mainConfig)
  } else {
    mainY = (ch - calcBlockHeight(mainText, mainConfig)) / 2
  }
  ctx.save()
  const result = drawBlock(mainText, mainConfig, mainY)
  if (style.hasSubTitle && style.subTitle && subTitleText) {
    const subConfig = style.subTitle
    const subGap = subConfig.top ?? 0
    const subY = mainY + result.totalHeight * scale + subGap * scale
    drawBlock(subTitleText, subConfig, subY)
  }
  ctx.restore()
}

// Canvas 字幕渲染相关
const REF_W = 720
const REF_H = 1280

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "").padEnd(6, "0")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function fillRoundedRect(ctx, x, y, w, h, r) {
  if (r <= 0) {
    ctx.fillRect(x, y, w, h)
    return
  }
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

function strokeTextMultiDir(ctx, text, x, y, strokeWidth, strokeColor) {
  if (strokeWidth <= 0) return
  ctx.save()
  ctx.fillStyle = strokeColor
  const offsets = strokeWidth
  for (let ox = -offsets; ox <= offsets; ox += offsets) {
    for (let oy = -offsets; oy <= offsets; oy += offsets) {
      if (ox === 0 && oy === 0) continue
      ctx.fillText(text, x + ox, y + oy)
    }
  }
  ctx.restore()
}

function renderSubtitleFrame(ctx, state) {
  const { text, style, canvasWidth, canvasHeight, entranceProgress = 1 } = state
  if (!text) return
  const scaleX = canvasWidth / REF_W
  const scaleY = canvasHeight / REF_H
  const scale = Math.min(scaleX, scaleY)
  const fontSize = style.fontSize * scale
  const fontStr = `${style.fontWeight} ${fontSize}px "${style.font}"`
  const lineHeight = fontSize * 1.3
  const lines = text.split("\n").filter((l) => l.length > 0)
  if (lines.length === 0) return
  ctx.font = fontStr
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  let maxW = 0
  for (const line of lines) {
    const w = ctx.measureText(line).width
    if (w > maxW) maxW = w
  }
  const textTotalHeight = lines.length * lineHeight
  const padH = (style.bgEnabled ? (style.bgPaddingH ?? 6) : 0) * scale
  const padV = (style.bgEnabled ? (style.bgPaddingV ?? 2) : 0) * scale
  const boxWidth = maxW + padH * 2
  const boxHeight = textTotalHeight + padV * 2
  const centerX = canvasWidth / 2
  const margin = (state.bottomMargin ?? 60) * scaleY
  const centerY = canvasHeight - margin - boxHeight / 2
  
  ctx.save()
  ctx.globalAlpha = easeOutCubic(entranceProgress)
  
  if (style.bgEnabled) {
    const bgOpacity = (style.bgOpacity ?? 50) / 100
    const bgColor = style.bgColor || "#000000"
    const bgRadius = (style.bgBorderRadius ?? 0) * scale
    ctx.fillStyle = hexToRgba(bgColor, bgOpacity)
    fillRoundedRect(ctx, centerX - boxWidth / 2, centerY - boxHeight / 2, boxWidth, boxHeight, bgRadius)
  }
  
  const shadowEnabled = style.shadowEnabled || false
  if (shadowEnabled) {
    ctx.shadowColor = style.shadowColor || "#000000"
    ctx.shadowOffsetX = (style.shadowOffsetX ?? 1) * scale
    ctx.shadowOffsetY = (style.shadowOffsetY ?? 1) * scale
    ctx.shadowBlur = (style.shadowBlur ?? 3) * scale
  }

  const strokeEnabled = style.strokeEnabled !== false && (style.strokeWidth ?? 2) > 0
  const startY = centerY - textTotalHeight / 2 + lineHeight / 2
  for (let li = 0; li < lines.length; li++) {
    const lineY = startY + li * lineHeight
    if (strokeEnabled) {
      strokeTextMultiDir(ctx, lines[li], centerX, lineY, (style.strokeWidth ?? 2) * scale, style.strokeColor || "#000000")
    }
    ctx.fillStyle = style.color || "#FFFFFF"
    ctx.fillText(lines[li], centerX, lineY)
  }
  ctx.restore()
}

function renderStaticSubtitle(canvas, subtitleEffect, text) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const cw = rect.width * dpr
  const ch = rect.height * dpr
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw
    canvas.height = ch
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  renderSubtitleFrame(ctx, {
    text,
    style: {
      font: subtitleEffect.font || "黑体",
      fontSize: subtitleEffect.fontSize || 36,
      fontWeight: subtitleEffect.fontWeight || 700,
      color: subtitleEffect.color || "#FFFFFF",
      strokeEnabled: subtitleEffect.strokeEnabled,
      strokeWidth: subtitleEffect.strokeWidth,
      strokeColor: subtitleEffect.strokeColor,
      shadowEnabled: subtitleEffect.shadowEnabled,
      shadowColor: subtitleEffect.shadowColor,
      shadowOffsetX: subtitleEffect.shadowOffsetX,
      shadowOffsetY: subtitleEffect.shadowOffsetY,
      shadowBlur: subtitleEffect.shadowBlur,
      bgEnabled: subtitleEffect.bgEnabled,
      bgColor: subtitleEffect.bgColor,
      bgOpacity: subtitleEffect.bgOpacity,
      bgPaddingH: subtitleEffect.bgPaddingH,
      bgPaddingV: subtitleEffect.bgPaddingV,
    },
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    bottomMargin: subtitleEffect.bottomMargin ?? 60,
    entranceProgress: 1,
  })
}

// 成片模板预览卡片（完整版：支持视频标题叠加+字幕"
function ThemeTemplatePreviewCard({ style, isSelected, onClick, videoUrl, imageUrl, mainTitleText, subTitleText, onDelete }) {
  const videoRef = React.useRef(null)
  const canvasRef = React.useRef(null)
  const titleCanvasRef = React.useRef(null)
  const isBlank = style.id === ""
  const isCustom = style.isCustom || false
  const mainTitleConfig = style.mainTitle || defaultMainTitleConfig
  const subTitleConfig = style.subTitle || defaultSubTitleConfig
  const subtitleEffect = style.subtitleEffect
  const displayMainTitle = style.previewTitle || mainTitleText
  const displaySubTitle = style.previewSubtitle || subTitleText
  const captions = style.previewCaptions && style.previewCaptions.length > 0 ? style.previewCaptions : ["示例字幕文字"]

  // 初始渲染静态字幕+ Canvas 标题
  React.useEffect(() => {
    if (isBlank) return
    const raf = requestAnimationFrame(() => {
      if (canvasRef.current && subtitleEffect) {
        renderStaticSubtitle(canvasRef.current, subtitleEffect, captions[0])
      }
      if (titleCanvasRef.current && displayMainTitle) {
        renderTitleOnPreviewCanvas(titleCanvasRef.current, style, displayMainTitle, displaySubTitle)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [isBlank, subtitleEffect, captions, style, displayMainTitle, displaySubTitle])

  const handleMouseEnter = React.useCallback(() => {
    const video = videoRef.current
    if (video && videoUrl) {
      video.currentTime = 0
      video.play().catch(() => {})
    }
  }, [videoUrl])

  const handleMouseLeave = React.useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    // 恢复静态字幕
    if (canvasRef.current && subtitleEffect) {
      renderStaticSubtitle(canvasRef.current, subtitleEffect, captions[0])
    }
  }, [subtitleEffect, captions])

  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handleTimeUpdate = () => {
      if (video.currentTime >= 10) {
        video.currentTime = 0
      }
    }
    video.addEventListener("timeupdate", handleTimeUpdate)
    return () => video.removeEventListener("timeupdate", handleTimeUpdate)
  }, [])

  return jsxRuntimeExports.jsxs('div', {
    onClick,
    onMouseEnter: isBlank ? undefined : handleMouseEnter,
    onMouseLeave: isBlank ? undefined : handleMouseLeave,
    style: {
      border: isSelected ? '2px solid var(--qt-primary)' : '1px solid var(--qt-border)',
      borderRadius: '8px',
      padding: '0',
      cursor: 'pointer',
      transition: 'all 0.2s',
      backgroundColor: 'var(--qt-surface-solid)',
      overflow: 'hidden',
      position: 'relative',
      boxShadow: isSelected ? '0 8px 20px rgba(0,0,0,0.25)' : '0 2px 10px rgba(0,0,0,0.12)',
      transform: isSelected ? 'scale(1.02)' : 'scale(1)',
    },
    onMouseOver: (e) => {
      if (!isSelected) {
        e.currentTarget.style.borderColor = 'var(--qt-primary)'
        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'
        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.18)'
      }
    },
    onMouseOut: (e) => {
      if (!isSelected) {
        e.currentTarget.style.borderColor = 'var(--qt-border)'
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.12)'
      }
    },
    children: [
      jsxRuntimeExports.jsx('div', {
        style: {
          position: 'relative',
          width: '100%',
          paddingTop: '177.78%',
          backgroundColor: 'var(--qt-bg-soft)',
          overflow: 'hidden',
        },
        children: isBlank
          ? jsxRuntimeExports.jsxs('div', {
              style: {
                position: 'absolute',
                inset: 0,
                backgroundImage: 'radial-gradient(240px 180px at 20% 18%, var(--qt-primary-soft), transparent 60%),radial-gradient(220px 160px at 85% 85%, rgba(148, 163, 184, 0.14), transparent 62%),linear-gradient(135deg, rgba(148, 163, 184, 0.10), rgba(148, 163, 184, 0.04))',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                color: 'var(--qt-text)',
                padding: 14,
                boxSizing: 'border-box',
              },
              children: [
                jsxRuntimeExports.jsx('div', {
                  style: {
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'rgba(148, 163, 184, 0.12)',
                    border: '1px solid var(--qt-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 10px 22px rgba(0,0,0,0.18)',
                  },
                  children: jsxRuntimeExports.jsx('svg', {
                    width: '22',
                    height: '22',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: '1.8',
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                    children: [
                      jsxRuntimeExports.jsx('rect', { x: '4', y: '4', width: '16', height: '16', rx: '3', key: 'rect' }),
                      jsxRuntimeExports.jsx('line', { x1: '7', y1: '7', x2: '17', y2: '17', key: 'line' }),
                    ],
                  }),
                }),
                jsxRuntimeExports.jsx('div', {
                  style: { fontSize: 14, fontWeight: 650, letterSpacing: 0.2 },
                  children: '无模板',
                }),
                jsxRuntimeExports.jsx('div', {
                  style: {
                    fontSize: 12,
                    color: 'var(--qt-text-2)',
                    textAlign: 'center',
                    lineHeight: 1.5,
                  },
                  children: '选择并确认后将移除模板',
                }),
              ],
            })
          : jsxRuntimeExports.jsxs(React.Fragment, {
              children: [
                videoUrl
                  ? jsxRuntimeExports.jsx('video', {
                      ref: videoRef,
                      src: videoUrl,
                      muted: true,
                      playsInline: true,
                      preload: 'metadata',
                      style: {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      },
                    })
                  : imageUrl
                    ? jsxRuntimeExports.jsx('img', {
                        src: imageUrl,
                        alt: style.name,
                        style: {
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        },
                        onError: (e) => {
                          if (e.currentTarget) e.currentTarget.style.display = 'none'
                        },
                      })
                    : jsxRuntimeExports.jsx('div', {
                        style: {
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          backgroundColor: '#1a1a1a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#999',
                          fontSize: '12px',
                        },
                        children: '无预览',
                      }),
                // Canvas 标题叠加层
                displayMainTitle && jsxRuntimeExports.jsx('canvas', {
                  ref: titleCanvasRef,
                  style: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                  },
                }),
                // Canvas 字幕"
                subtitleEffect && jsxRuntimeExports.jsx('canvas', {
                  ref: canvasRef,
                  style: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                  },
                }),
              ],
            }),
      }),
      isSelected && jsxRuntimeExports.jsx('div', {
        style: {
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: 'var(--qt-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        },
        children: jsxRuntimeExports.jsx('svg', {
          width: '14',
          height: '14',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'white',
          strokeWidth: '3',
          children: jsxRuntimeExports.jsx('polyline', { points: '20 6 9 17 4 12' }),
        }),
      }),
      isCustom && onDelete && jsxRuntimeExports.jsx('div', {
        onClick: (e) => { e.stopPropagation(); onDelete(style.id) },
        style: {
          position: 'absolute',
          top: '8px',
          left: '8px',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          backgroundColor: 'rgba(239, 68, 68, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        },
        children: jsxRuntimeExports.jsx('svg', {
          width: '12',
          height: '12',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'white',
          strokeWidth: '3',
          strokeLinecap: 'round',
          children: [
            jsxRuntimeExports.jsx('line', { x1: '18', y1: '6', x2: '6', y2: '18', key: 'l1' }),
            jsxRuntimeExports.jsx('line', { x1: '6', y1: '6', x2: '18', y2: '18', key: 'l2' }),
          ],
        }),
      }),
    ],
  })
}

// TitleStyleModal 成片模板选择弹窗
export function TitleStyleModal({
  show,
  builtinTitleStyles,
  customTitleThemes,
  titleStyleImageUrls,
  titleStyleVideoUrls,
  activeProcessingType,
  processingProgress,
  selectedTitleStyle,
  setSelectedTitleStyle,
  titleSegmentRange,
  setTitleSegmentRange,
  mainTitle,
  subTitle,
  onConfirm,
  onCancel,
  onSaveCustomTheme,
  onDeleteCustomTheme,
}) {
  const [customDuration, setCustomDuration] = useState(() => titleSegmentRange?.end ?? 5)
  const isLimited = isTitleSegmentRangeLimited(titleSegmentRange)
  
  if (!show) return null
  
  const mainTitleText = mainTitle || "画面主标题及内容"
  const subTitleText = subTitle || "画面副标题及内容"
  const customThemes = Array.isArray(customTitleThemes) ? customTitleThemes : []
  const allTitleStyles = [blankTitleStyle, ...(builtinTitleStyles || []), ...customThemes]
  
  return jsxRuntimeExports.jsx('div', {
    className: 'video-modal-overlay',
    onClick: (e) => { if (e.target === e.currentTarget) onCancel() },
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    children: jsxRuntimeExports.jsxs('div', {
      className: 'video-modal-content',
      style: {
        backgroundColor: 'var(--qt-surface-solid)',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '900px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid var(--qt-border)',
        boxShadow: 'var(--qt-shadow-lg)',
      },
      onClick: (e) => e.stopPropagation(),
      children: [
          // 头部
          jsxRuntimeExports.jsxs('div', {
            style: {
              flexShrink: 0,
              margin: '24px 24px 0 24px',
              paddingBottom: '10px',
              borderBottom: '1px solid var(--qt-border)',
              position: 'relative',
              paddingRight: '36px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            },
            children: [
              jsxRuntimeExports.jsx('h2', {
                style: { margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--qt-text)', whiteSpace: 'nowrap' },
                children: '选择成片模板',
              }),
              jsxRuntimeExports.jsxs('label', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--qt-text-2)',
                  whiteSpace: 'nowrap',
                },
                children: [
                  jsxRuntimeExports.jsx('span', { children: '标题仅展示' }),
                  jsxRuntimeExports.jsx('input', {
                    type: 'number',
                    min: 1,
                    max: 999,
                    value: customDuration,
                    disabled: !isLimited,
                    onChange: (e) => {
                      const v = Math.max(1, Math.min(999, Math.round(Number(e.target.value)) || 1))
                      setCustomDuration(v)
                      setTitleSegmentRange({ start: 0, end: v })
                    },
                    style: {
                      width: '44px',
                      textAlign: 'center',
                      fontSize: '13px',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      border: '1px solid var(--qt-border)',
                      background: 'var(--qt-surface)',
                      color: isLimited ? 'var(--qt-text)' : 'var(--qt-text-3)',
                    },
                  }),
                  jsxRuntimeExports.jsx('span', { children: '秒' }),
                  jsxRuntimeExports.jsx('div', {
                    onClick: () => {
                      if (isLimited) {
                        setTitleSegmentRange(null)
                      } else {
                        setTitleSegmentRange({ start: 0, end: customDuration })
                      }
                    },
                    style: {
                      width: '36px',
                      height: '20px',
                      borderRadius: '10px',
                      backgroundColor: isLimited ? 'var(--qt-primary)' : 'rgba(148, 163, 184, 0.3)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      flexShrink: 0,
                    },
                    children: jsxRuntimeExports.jsx('div', {
                      style: {
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                        position: 'absolute',
                        top: '2px',
                        left: isLimited ? '18px' : '2px',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      },
                    }),
                  }),
                ],
              }),
              jsxRuntimeExports.jsx('button', {
                onClick: onCancel,
                style: {
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--qt-text-2)',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                  transition: 'background-color 0.2s',
                },
                onMouseEnter: (e) => { e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.16)' },
                onMouseLeave: (e) => { e.currentTarget.style.backgroundColor = 'transparent' },
                children: jsxRuntimeExports.jsx('svg', {
                  width: '16',
                  height: '16',
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: '2',
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  children: [
                    jsxRuntimeExports.jsx('line', { x1: '18', y1: '6', x2: '6', y2: '18', key: 'l1' }),
                    jsxRuntimeExports.jsx('line', { x1: '6', y1: '6', x2: '18', y2: '18', key: 'l2' }),
                  ],
                }),
              }),
            ],
          }),
          // 模板列表
          jsxRuntimeExports.jsx('div', {
            style: {
              flex: 1,
              overflow: 'auto',
              minHeight: 0,
              padding: '16px 24px',
            },
            children: jsxRuntimeExports.jsx('div', {
              style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '16px',
              },
              children: allTitleStyles.map((style) =>
                jsxRuntimeExports.jsx(ThemeTemplatePreviewCard, {
                  style,
                  isSelected: selectedTitleStyle?.id === style.id,
                  onClick: () => setSelectedTitleStyle(style),
                  videoUrl: titleStyleVideoUrls?.[style.id],
                  imageUrl: titleStyleImageUrls?.[style.id],
                  mainTitleText,
                  subTitleText,
                  onDelete: style.isCustom ? onDeleteCustomTheme : undefined,
                }, style.id || '__blank_title__')
              ),
            }),
          }),
          // 底部按钮
          jsxRuntimeExports.jsxs('div', {
            style: {
              flexShrink: 0,
              padding: '20px 24px 24px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              alignItems: 'center',
            },
            children: [
              onSaveCustomTheme && selectedTitleStyle && selectedTitleStyle.id && !selectedTitleStyle.isCustom &&
                jsxRuntimeExports.jsx('button', {
                  onClick: () => onSaveCustomTheme(selectedTitleStyle),
                  className: 'video-button video-button-outline',
                  style: { marginRight: 'auto' },
                  children: '保存为自定义主题',
                }),
              jsxRuntimeExports.jsx('button', {
                onClick: onCancel,
                className: 'video-button video-button-outline',
                children: '取消',
              }),
              jsxRuntimeExports.jsx('button', {
                onClick: onConfirm,
                disabled: !selectedTitleStyle || !!activeProcessingType,
                className: 'video-button video-button-primary',
                style: {
                  opacity: !selectedTitleStyle ? 0.5 : 1,
                  cursor: !selectedTitleStyle ? 'not-allowed' : 'pointer',
                },
                children: activeProcessingType === 'title' || activeProcessingType === 'subtitle'
                  ? `应用中 ${processingProgress}%`
                  : '应用模板',
              }),
            ],
          }),
          (activeProcessingType === 'title' || activeProcessingType === 'subtitle') &&
            jsxRuntimeExports.jsx('div', {
              className: 'video-progress',
              style: { margin: '0 24px 24px' },
              children: jsxRuntimeExports.jsx('div', {
                className: 'video-progress-bar',
                style: { width: `${processingProgress}%` },
              }),
            }),
      ],
    }),
  })
}

// 注意: SmartCutModal等智能精剪组件现在直接从VideoGenerateCard.tsx导出
// 使用方应直接从VideoGenerateCard.tsx导入: import { SmartCutModal } from './VideoGenerateCard'
