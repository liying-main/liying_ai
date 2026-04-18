// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom'
import { jsxRuntimeExports } from '../../utils/jsxRuntime'
import { useVideoPageStore } from '../../store/VideoPageStore'
import { useUserInfoStore } from '../../store/UserInfoStore'
import { useToast } from '../../hooks/useToast'
import { useApplyAllEffects } from '../../hooks/useApplyAllEffects'
import { useVideoGenerateHistory } from '../../hooks/useVideoGenerateHistory'
import { usePhoneModal } from '../../hooks/usePhoneModal'
import { AiLegalModal } from '../../components/AiLegalModal'
import { PhoneModal } from '../../components/PhoneModal'

// Shared Components
import {
  DEFAULT_BGM_CARD_MUSIC_VOLUME,
  DEFAULT_BGM_CARD_VOICE_VOLUME,
  normalizeBgmCategory,
  orderedBgmCategoryList,
  getUploadCategoryCandidates,
  BgmUploadCategoryModal,
  BgmGroupedPreviewSelect,
  RangeValueTooltip,
  TEMPLATE_REPLACE_SUBTITLE_DEFAULTS,
  templateSubtitleEffectToPartial,
  splitSubtitleByLanguage,
  ensureWhisperSegmentsIfNeeded,
  TitleStyleModal,
} from './VideoSharedComponents'

// 完整版智能精剪组件（直接从VideoGenerateCard导入以避免循环依赖）
import { SmartCutModal } from './VideoGenerateCard'

// API Services
import { llmService } from '../../api/llm'
import { templateService } from '../../api/template'
import { exceptionService } from '../../api/exception'
import { useAd } from '../../components/AdContext'

// Language name mapping
const LANG_NAME_MAP: Record<string, string> = {
  'zh': '中文', 'en': '英语', 'ja': '日语', 'ko': '韩语',
  'es': '西班牙语', 'fr': '法语', 'de': '德语', 'pt': '葡萄牙语',
  'ru': '俄语', 'ar': '阿拉伯语',
}
const getLanguageName = (code: string) => LANG_NAME_MAP[code] || code

// Check if error is user cancelled
function isUserCancelledPluginError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "")
  return msg === "已取消" || msg.includes("已取消")
}

// Token refresh helper
const refreshTokenOnce = async () => {}

// Fetch whisper segments from cloud
async function fetchWhisperSegmentsFromCloud(audioPath: string, subtitle: string) {
  await refreshTokenOnce()
  return window.api.pluginProxyWhisperAlignRun({ audioPath, subtitle })
}

export function VideoSubtitleCard() {
  const { openAd } = useAd();
  const showToast = useToast();
  const applyAllEffects = useApplyAllEffects();
  const videoHistory = useVideoGenerateHistory();
  const autoFlowStep = useVideoPageStore((s) => s.autoFlowStep);
  const autoFlowRunning = useVideoPageStore((s) => s.autoFlowRunning);
  const flowMode = useVideoPageStore((s) => s.flowMode);
  const {
    subtitleText,
    setSubtitleText,
    activeProcessingType,
    processingProgress,
    audioDuration,
    setSubtitleEnabled,
    setSubtitleEffectConfig,
    subtitleEffectConfig,
    subtitleFont,
    setSubtitleFont,
    subtitleFontWeight,
    setSubtitleFontWeight,
    subtitleFontSize,
    setSubtitleFontSize,
    subtitleColor,
    setSubtitleColor,
    subtitleStrokeColor,
    setSubtitleStrokeColor,
    subtitleBottomMargin,
    setSubtitleBottomMargin,
    subtitleEntranceEffect,
    setSubtitleEntranceEffect,
    // 标题相关
    mainTitle,
    setMainTitle,
    subTitle,
    setSubTitle,
    originalScript,
    rewrittenScript,
    translatedText,
    showTranslatedInTextarea,
    sourceLanguage,
    llmModel,
    // BGM 相关
    setBgmEnabled,
    setUploadedBgms,
    setBgmEffectConfig,
    builtinBgms,
    uploadedBgms,
    bgmEffectConfig,
    selectedBgmId,
    setSelectedBgmId,
    // 标题样式 / 智能精剪相关
    viralTitle,
    setViralTitle,
    videoTags,
    setVideoTags,
    generatedVideoPath,
    smartCutVideoPath,
    bgmedVideoPath,
    subtitledVideoPath,
    titledVideoPath,
    finalVideoPath,
    setTitleEffectConfig,
    setTitledVideoPath,
    builtinTitleStyles,
    titleStyleImageUrls,
    titleStyleVideoUrls,
    selectedTitleStyleId,
    setSelectedTitleStyleId,
    titleSegmentRange,
    setTitleSegmentRange,
    // whisper 字幕时间戳    generatedAudioPath,
    generatedAudioPath,
    whisperSegments,
    setWhisperSegments,
  } = useVideoPageStore();
  const userInfo = useUserInfoStore((s) => s.userInfo);
  
  useEffect(() => {
    const cfg = subtitleEffectConfig;
    if (!cfg) return;
    if (typeof cfg.text === "string") setSubtitleText(cfg.text);
    if (typeof cfg.font === "string") setSubtitleFont(cfg.font);
    if (typeof cfg.fontWeight === "number")
      setSubtitleFontWeight(cfg.fontWeight);
    if (typeof cfg.fontSize === "number") setSubtitleFontSize(cfg.fontSize);
    if (typeof cfg.color === "string") setSubtitleColor(cfg.color);
    if (typeof cfg.strokeColor === "string")
      setSubtitleStrokeColor(cfg.strokeColor);
    if (typeof cfg.bottomMargin === "number")
      setSubtitleBottomMargin(cfg.bottomMargin);
    if (cfg.entranceEffect) setSubtitleEntranceEffect(cfg.entranceEffect);
  }, [
    setSubtitleBottomMargin,
    setSubtitleColor,
    setSubtitleEntranceEffect,
    setSubtitleFont,
    setSubtitleFontSize,
    setSubtitleFontWeight,
    setSubtitleStrokeColor,
    setSubtitleText,
    subtitleEffectConfig,
  ]);
  const [bgmVolume, setBgmVolume] = useState(
    DEFAULT_BGM_CARD_MUSIC_VOLUME,
  );
  const [voiceVolume, setVoiceVolume] = useState(
    DEFAULT_BGM_CARD_VOICE_VOLUME,
  );
  const [isUploadingBgm, setIsUploadingBgm] = useState(false);
  const [bgmUploadText, setBgmUploadText] = useState("上传");
  const [uploadCategoryModalOpen, setUploadCategoryModalOpen] =
    useState(false);
  const bgmFileInputRef = useRef(null);
  const pendingUploadCategoryRef = useRef("");
  const allBgms = useMemo(
    () => [...uploadedBgms, ...builtinBgms],
    [uploadedBgms, builtinBgms],
  );
  const uploadCategoryCandidates = useMemo(
    () => getUploadCategoryCandidates(allBgms),
    [allBgms],
  );
  const bgmGroups = useMemo(() => {
    const set = new Set(allBgms.map(normalizeBgmCategory));
    const cats = orderedBgmCategoryList(set);
    return cats
      .map((category) => ({
        category,
        items: allBgms
          .filter((b) => normalizeBgmCategory(b) === category)
          .map((b) => ({ id: b.id, name: b.name, path: b.path })),
      }))
      .filter((g) => g.items.length > 0);
  }, [allBgms]);
  const bgmEffectConfigRef = useRef(bgmEffectConfig);
  useEffect(() => {
    // Only sync from store when config is externally changed (e.g., page load or reset)
    // Skip if the config matches what we just saved to avoid resetting slider positions
    const prevConfig = bgmEffectConfigRef.current;
    bgmEffectConfigRef.current = bgmEffectConfig;
    if (bgmEffectConfig) {
      setSelectedBgmId(bgmEffectConfig.selectedBgmId || "");
      // Only update volume states if they differ from current local values
      // This prevents resetting sliders when we save the config
      if (
        typeof bgmEffectConfig.volume === "number" &&
        prevConfig?.volume !== bgmEffectConfig.volume
      ) {
        setBgmVolume(bgmEffectConfig.volume);
      }
      if (
        typeof bgmEffectConfig.voiceVolume === "number" &&
        prevConfig?.voiceVolume !== bgmEffectConfig.voiceVolume
      ) {
        setVoiceVolume(bgmEffectConfig.voiceVolume);
      }
    } else if (prevConfig !== null) {
      // Only reset to defaults when config is cleared
      setBgmVolume(DEFAULT_BGM_CARD_MUSIC_VOLUME);
      setVoiceVolume(DEFAULT_BGM_CARD_VOICE_VOLUME);
    }
  }, [bgmEffectConfig, setSelectedBgmId]);
  const handleUploadBgmMaterial = async (event) => {
    openAd();
  };
  const prepareClipConfigs = (
    subtitleOverride,
    replaceNonSmartCutEffects = false,
  ) => {
    const latestStore = useVideoPageStore.getState();
    const latestSubtitleText = (latestStore.subtitleText ?? "").trim();
    const latestMainTitle = (latestStore.mainTitle ?? "").trim();
    const latestSubTitle = (latestStore.subTitle ?? "").trim();
    const hasSubtitleText = !!latestSubtitleText;
    const latestAudioDuration = latestStore.audioDuration ?? audioDuration ?? 0;
    const hasWhisperSegs = !!(latestStore.whisperSegments?.length) && latestStore.whisperSegments.some((s: any) => s.end > 0);
    const hasAudioPath = !!latestStore.generatedAudioPath;
    // Allow subtitle if we have text AND any timing source (duration, whisper segs, or audio path to fetch segs from)
    const canSubtitle = hasSubtitleText && (latestAudioDuration > 0 || hasWhisperSegs || hasAudioPath);
    setSubtitleEnabled(canSubtitle);
    let templateSubtitlePartial;
    const titleCfgBefore = latestStore.titleEffectConfig;
    if (!latestMainTitle) {
      setTitleEffectConfig(null);
    } else if (titleCfgBefore) {
      setTitleEffectConfig({
        ...titleCfgBefore,
        mainTitleText: latestMainTitle,
        subTitleText: latestSubTitle,
      });
    } else if (selectedTitleStyleId) {
      const picked = builtinTitleStyles.find(
        (x) => x.id === selectedTitleStyleId,
      );
      if (picked?.id) {
        setTitleEffectConfig({
          style: picked,
          mainTitleText: latestMainTitle,
          subTitleText: latestSubTitle,
        });
        const se = picked.subtitleEffect;
        if (se) {
          if (se.font) setSubtitleFont(se.font);
          if (se.fontSize) setSubtitleFontSize(se.fontSize);
          if (se.fontWeight) setSubtitleFontWeight(se.fontWeight);
          if (se.color) setSubtitleColor(se.color);
          if (se.strokeColor) setSubtitleStrokeColor(se.strokeColor);
          if (typeof se.bottomMargin === "number")
            setSubtitleBottomMargin(se.bottomMargin);
          if (se.entranceEffect) setSubtitleEntranceEffect(se.entranceEffect);
          templateSubtitlePartial = templateSubtitleEffectToPartial(se);
        }
      }
    }
    if (canSubtitle) {
      const baseStyle = replaceNonSmartCutEffects
        ? TEMPLATE_REPLACE_SUBTITLE_DEFAULTS
        : {
            font: subtitleFont,
            fontSize: subtitleFontSize,
            fontWeight: subtitleFontWeight,
            color: subtitleColor,
            strokeEnabled: subtitleEffectConfig?.strokeEnabled,
            strokeWidth: subtitleEffectConfig?.strokeWidth,
            strokeColor: subtitleStrokeColor,
            shadowEnabled: subtitleEffectConfig?.shadowEnabled,
            shadowColor: subtitleEffectConfig?.shadowColor,
            shadowOffsetX: subtitleEffectConfig?.shadowOffsetX,
            shadowOffsetY: subtitleEffectConfig?.shadowOffsetY,
            shadowBlur: subtitleEffectConfig?.shadowBlur,
            bgEnabled: subtitleEffectConfig?.bgEnabled,
            bgColor: subtitleEffectConfig?.bgColor,
            bgOpacity: subtitleEffectConfig?.bgOpacity,
            bgBorderRadius: subtitleEffectConfig?.bgBorderRadius,
            bgPaddingH: subtitleEffectConfig?.bgPaddingH,
            bgPaddingV: subtitleEffectConfig?.bgPaddingV,
            alignment: subtitleEffectConfig?.alignment,
            posX: subtitleEffectConfig?.posX ?? null,
            posY: subtitleEffectConfig?.posY ?? null,
            bottomMargin: subtitleBottomMargin,
            entranceEffect: subtitleEntranceEffect,
          };
      const nextSubtitleCfg = {
        text: latestSubtitleText,
        font:
          subtitleOverride?.font ??
          templateSubtitlePartial?.font ??
          baseStyle.font,
        fontSize:
          subtitleOverride?.fontSize ??
          templateSubtitlePartial?.fontSize ??
          baseStyle.fontSize,
        fontWeight:
          subtitleOverride?.fontWeight ??
          templateSubtitlePartial?.fontWeight ??
          baseStyle.fontWeight,
        color:
          subtitleOverride?.color ??
          templateSubtitlePartial?.color ??
          baseStyle.color,
        strokeEnabled:
          subtitleOverride?.strokeEnabled ??
          templateSubtitlePartial?.strokeEnabled ??
          baseStyle.strokeEnabled,
        strokeWidth:
          subtitleOverride?.strokeWidth ??
          templateSubtitlePartial?.strokeWidth ??
          baseStyle.strokeWidth,
        strokeColor:
          subtitleOverride?.strokeColor ??
          templateSubtitlePartial?.strokeColor ??
          baseStyle.strokeColor,
        shadowEnabled:
          subtitleOverride?.shadowEnabled ??
          templateSubtitlePartial?.shadowEnabled ??
          baseStyle.shadowEnabled,
        shadowColor:
          subtitleOverride?.shadowColor ??
          templateSubtitlePartial?.shadowColor ??
          baseStyle.shadowColor,
        shadowOffsetX:
          subtitleOverride?.shadowOffsetX ??
          templateSubtitlePartial?.shadowOffsetX ??
          baseStyle.shadowOffsetX,
        shadowOffsetY:
          subtitleOverride?.shadowOffsetY ??
          templateSubtitlePartial?.shadowOffsetY ??
          baseStyle.shadowOffsetY,
        shadowBlur:
          subtitleOverride?.shadowBlur ??
          templateSubtitlePartial?.shadowBlur ??
          baseStyle.shadowBlur,
        bgEnabled:
          subtitleOverride?.bgEnabled ??
          templateSubtitlePartial?.bgEnabled ??
          baseStyle.bgEnabled,
        bgColor:
          subtitleOverride?.bgColor ??
          templateSubtitlePartial?.bgColor ??
          baseStyle.bgColor,
        bgOpacity:
          subtitleOverride?.bgOpacity ??
          templateSubtitlePartial?.bgOpacity ??
          baseStyle.bgOpacity,
        bgBorderRadius:
          subtitleOverride?.bgBorderRadius ??
          templateSubtitlePartial?.bgBorderRadius ??
          baseStyle.bgBorderRadius,
        bgPaddingH:
          subtitleOverride?.bgPaddingH ??
          templateSubtitlePartial?.bgPaddingH ??
          baseStyle.bgPaddingH,
        bgPaddingV:
          subtitleOverride?.bgPaddingV ??
          templateSubtitlePartial?.bgPaddingV ??
          baseStyle.bgPaddingV,
        alignment:
          subtitleOverride?.alignment ??
          templateSubtitlePartial?.alignment ??
          baseStyle.alignment,
        posX:
          subtitleOverride?.posX ??
          templateSubtitlePartial?.posX ??
          baseStyle.posX,
        posY:
          subtitleOverride?.posY ??
          templateSubtitlePartial?.posY ??
          baseStyle.posY,
        bottomMargin:
          subtitleOverride?.bottomMargin ??
          templateSubtitlePartial?.bottomMargin ??
          baseStyle.bottomMargin,
        entranceEffect:
          subtitleOverride?.entranceEffect ??
          templateSubtitlePartial?.entranceEffect ??
          baseStyle.entranceEffect,
      };
      setSubtitleEffectConfig({
        ...nextSubtitleCfg,
      });
    } else {
      console.log('[prepareClipConfigs] canSubtitle is false, setting subtitleEffectConfig to null');
      setSubtitleEffectConfig(null);
    }
    // Use current local state values for volume (they reflect the latest slider positions)
    // Only fall back to store config if local state hasn't been initialized
    const latestBgmId = latestStore.selectedBgmId || selectedBgmId;
    const canBgm = !!latestBgmId;
    setBgmEnabled(canBgm);
    if (canBgm) {
      setBgmEffectConfig({
        selectedBgmId: latestBgmId,
        volume: bgmVolume,
        voiceVolume: voiceVolume,
      });
    }
  };
  const handleClipAll = async () => {
    openAd();
  };
  const [showSmartCutModal, setShowSmartCutModal] =
    useState(false);
  const [showTitleStyleModal, setShowTitleStyleModal] =
    useState(false);
  const [selectedTitleStyle, setSelectedTitleStyle] =
    useState(null);
  const titleSegmentRangeBeforeModalRef = useRef(void 0);
  useEffect(() => {
    if (!showTitleStyleModal) return;
    titleSegmentRangeBeforeModalRef.current =
      useVideoPageStore.getState().titleSegmentRange ?? null;
  }, [showTitleStyleModal]);
  useEffect(() => {
    if (!showTitleStyleModal) return;
    if (selectedTitleStyle) return;
    if (!builtinTitleStyles?.length) return;
    if (!selectedTitleStyleId) {
      setSelectedTitleStyle({
        id: "",
        name: "无标题（移除标题",
        hasSubTitle: false,
      });
      return;
    }
    const picked =
      builtinTitleStyles.find((x) => x.id === selectedTitleStyleId) ??
      builtinTitleStyles[0];
    setSelectedTitleStyle(picked ?? null);
  }, [
    builtinTitleStyles,
    selectedTitleStyle,
    selectedTitleStyleId,
    showTitleStyleModal,
  ]);
  const handleOpenSmartCut = () => {
    openAd();
  };
  const handleConfirmSelectTitleStyle = async () => {
    openAd();
  };
  const _handleConfirmSelectTitleStyle_disabled = async () => {
    if (activeProcessingType || !selectedTitleStyle) return;
    setSelectedTitleStyleId(selectedTitleStyle.id);
    const hasMainVideo = !!(
      finalVideoPath ||
      smartCutVideoPath ||
      bgmedVideoPath ||
      subtitledVideoPath ||
      titledVideoPath ||
      generatedVideoPath
    );
    if (!hasMainVideo) {
      setShowTitleStyleModal(false);
      showToast(
        selectedTitleStyle.id
          ? "已选择成片模板，将在自动生成视频时应用"
          : "已取消模板，将在自动生成视频时不插入标题",
        "success",
      );
      return;
    }
    if (!selectedTitleStyle.id) {
      setTitleSegmentRange(null);
      setTitleEffectConfig(null);
      setSubtitleEnabled(false);
      setTitledVideoPath("");
      await applyAllEffects("subtitle", {
        title: true,
        subtitle: true,
        bgm: false,
      });
      setShowTitleStyleModal(false);
      await videoHistory.updateLatestSnapshot();
      return;
    }
    const scriptContent =
      showTranslatedInTextarea && translatedText
        ? translatedText.trim()
        : rewrittenScript.trim() || originalScript.trim();
    let subtitleSeed = subtitleText.trim();
    if (!subtitleSeed && scriptContent) {
      subtitleSeed = splitSubtitleByLanguage(
        scriptContent,
        sourceLanguage,
      ).trim();
      if (subtitleSeed) setSubtitleText(subtitleSeed);
    }
    const needGenerateTitle = !(mainTitle || subTitle || "").trim();
    const needWhisper =
      !!generatedAudioPath && !!subtitleSeed && !whisperSegments?.length;
    useVideoPageStore.getState().setActiveProcessingType("subtitle");
    
    // Helper function to create a timeout promise
    const withTimeout = (promise, ms, errorMsg) => {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    };
    
    try {
      const parallelTasks = [];
      if (needGenerateTitle) {
        parallelTasks.push(
          withTimeout(
            (async () => {
              try {
                const scriptContent2 =
                  showTranslatedInTextarea && translatedText
                    ? translatedText.trim()
                    : rewrittenScript.trim() || originalScript.trim();
                if (!scriptContent2) return;
                const langName = getLanguageName(sourceLanguage);
                const { systemPrompt, userPrompts } =
                  await templateService.getParsedTemplate("title", {
                    langName,
                    scriptContent: scriptContent2,
                  });
                const messages = [
                  { role: "system", content: systemPrompt },
                  ...userPrompts.map((prompt) => ({
                    role: "user",
                    content: prompt,
                  })),
                ];
                const data = await llmService.completion(
                  llmModel || "DeepSeek",
                  messages,
                  { temperature: 0.8, max_tokens: 500 },
                );
                const responseData = data.data || data;
                if (responseData.choices?.[0]?.message?.content) {
                  const content = responseData.choices[0].message.content;
                  try {
                    const result = JSON.parse(content.trim());
                    if (result.mainTitle) setMainTitle(result.mainTitle);
                    if (result.subTitle) setSubTitle(result.subTitle);
                    if (result.viralTitle) setViralTitle(result.viralTitle);
                    if (result.videoTags) setVideoTags(result.videoTags);
                  } catch {
                    const mainTitleMatch = content.match(
                      /"mainTitle"\s*:\s*"([^"]+)"/,
                    );
                    const subTitleMatch = content.match(
                      /"subTitle"\s*:\s*"([^"]+)"/,
                    );
                    const viralTitleMatch = content.match(
                      /"viralTitle"\s*:\s*"([^"]+)"/,
                    );
                    const videoTagsMatch = content.match(
                      /"videoTags"\s*:\s*"([^"]+)"/,
                    );
                    if (mainTitleMatch) setMainTitle(mainTitleMatch[1]);
                    if (subTitleMatch) setSubTitle(subTitleMatch[1]);
                    if (viralTitleMatch) setViralTitle(viralTitleMatch[1]);
                    if (videoTagsMatch) setVideoTags(videoTagsMatch[1]);
                  }
                }
              } catch (err) {
                console.error("首次确认模板时自动生成标题失败", err);
              }
            })(),
            30000,
            "生成标题超时"
          ),
        );
      }
      if (needWhisper) {
        parallelTasks.push(
          withTimeout(
            (async () => {
              try {
                const segments = await fetchWhisperSegmentsFromCloud(
                  generatedAudioPath,
                  subtitleSeed,
                );
                console.log("云端识别字幕时间戳", segments);
                if (segments.length) setWhisperSegments(segments);
                else setWhisperSegments([]);
              } catch (err) {
                console.log("首次确认模板时 Whisper 字幕时间戳获取失败", err);
                setWhisperSegments([]);
              }
            })(),
            60000,
            "字幕时间戳获取超时",
          ),
        );
      }
      if (parallelTasks.length) {
        try {
          await Promise.all(parallelTasks);
        } catch (err) {
          console.error("模板预处理失败", err);
          // Continue anyway, don't return - just log the error
        }
      }
      const mainTitleText = (
        useVideoPageStore.getState().mainTitle ||
        useVideoPageStore.getState().viralTitle ||
        ""
      ).trim();
      if (!mainTitleText) {
        showToast("请先生成/填写主标题内容", "info");
        return;
      }
      setTitleEffectConfig({
        style: selectedTitleStyle,
        mainTitleText,
        subTitleText: useVideoPageStore.getState().subTitle,
      });
      const se = selectedTitleStyle.subtitleEffect;
      if (se) {
        if (se.font) setSubtitleFont(se.font);
        if (se.fontSize) setSubtitleFontSize(se.fontSize);
        if (se.fontWeight) setSubtitleFontWeight(se.fontWeight);
        if (se.color) setSubtitleColor(se.color);
        if (se.strokeColor) setSubtitleStrokeColor(se.strokeColor);
        if (typeof se.bottomMargin === "number")
          setSubtitleBottomMargin(se.bottomMargin);
        if (se.entranceEffect) setSubtitleEntranceEffect(se.entranceEffect);
      }
      prepareClipConfigs(
        se
          ? {
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
          : void 0,
        true,
      );
      const stAfterPrepare = useVideoPageStore.getState();
      if (
        stAfterPrepare.subtitleEnabled &&
        stAfterPrepare.generatedAudioPath &&
        (stAfterPrepare.subtitleText ?? "").trim()
      ) {
        await ensureWhisperSegmentsIfNeeded();
      }
      await applyAllEffects("subtitle", {
        title: false,
        subtitle: false,
        bgm: false,
      });
      setShowTitleStyleModal(false);
      await videoHistory.updateLatestSnapshot();
    } catch (err) {
      console.error("应用成片模板失败:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast(`应用成片模板失败: ${errMsg}`, "error");
    } finally {
      // Always reset processing state
      useVideoPageStore.getState().setActiveProcessingType(null);
      useVideoPageStore.getState().setProcessingProgress(0);
    }
  };
  const handleCancelSelectTitleStyle = () => {
    const prev = titleSegmentRangeBeforeModalRef.current;
    if (prev !== void 0) setTitleSegmentRange(prev);
    setShowTitleStyleModal(false);
    setSelectedTitleStyle(null);
  };
  const autoLoading =
    (autoFlowRunning &&
      (autoFlowStep === "insertTitle" ||
        autoFlowStep === "subtitle" ||
        autoFlowStep === "bgm")) ||
    (flowMode === "manual" &&
      (activeProcessingType === "subtitle" || activeProcessingType === "bgm"));
  const [smartcutPreviewUrl, setSmartcutPreviewUrl] = useState("");
  const smartcutPreviewRef = useRef(null);
  const phoneModal = usePhoneModal(true);
  const effectVideoPath = finalVideoPath || "";
  useEffect(() => {
    if (!effectVideoPath) {
      setSmartcutPreviewUrl("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await window.api.getLocalFileUrl(effectVideoPath);
        if (!cancelled && res.success && res.url)
          setSmartcutPreviewUrl(res.url);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [effectVideoPath]);
  const openSmartcutPreview = () =>
    phoneModal.openPhoneModal(smartcutPreviewUrl);
  const handleDownloadSmartcutPreviewVideo = async () => {
    openAd();
  };
  return jsxRuntimeExports.jsxs(React.Fragment, {
    children: [
      jsxRuntimeExports.jsxs("div", {
        className: `video-card video-card-smartcut ${autoLoading ? "video-card-auto-loading" : ""}`,
        children: [
          jsxRuntimeExports.jsxs("div", {
            className: "video-card-header",
            children: [
              jsxRuntimeExports.jsx("span", {
                className: "video-card-number",
                children: "04",
              }),
              jsxRuntimeExports.jsx("span", {
                className: "video-card-title",
                children: "成片润色",
              }),
            ],
          }),
          jsxRuntimeExports.jsxs("div", {
            className: "video-card-body",
            children: [
              jsxRuntimeExports.jsxs("div", {
                className: "smartcut-controls-col",
                children: [
                  jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group",
                    children: [
                      jsxRuntimeExports.jsx("label", {
                        className: "video-label",
                        children: "封面主标题",
                      }),
                      jsxRuntimeExports.jsx("input", {
                        type: "text",
                        value: mainTitle,
                        onChange: (e) => setMainTitle(e.target.value),
                        placeholder: "输入封面主标题",
                        className: "video-input",
                      }),
                    ],
                  }),
                  jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group",
                    children: [
                      jsxRuntimeExports.jsx("label", {
                        className: "video-label",
                        children: "封面副标题",
                      }),
                      jsxRuntimeExports.jsx("input", {
                        type: "text",
                        value: subTitle,
                        onChange: (e) => setSubTitle(e.target.value),
                        placeholder: "输入封面副标题",
                        className: "video-input",
                      }),
                    ],
                  }),
                  jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group",
                    children: [
                      jsxRuntimeExports.jsx("label", {
                        className: "video-label",
                        children: "字幕文案",
                      }),
                      jsxRuntimeExports.jsx("textarea", {
                        value: subtitleText,
                        onChange: (e) => setSubtitleText(e.target.value),
                        placeholder: "字幕文案会显示在这里...",
                        rows: 8,
                        className: "video-textarea",
                      }),
                    ],
                  }),
                  jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group",
                    children: [
                      jsxRuntimeExports.jsx("label", {
                        className: "video-label",
                        children: "背景音乐",
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-select-upload-row",
                        children: [
                          jsxRuntimeExports.jsx("div", {
                            className: "video-select-upload-row__select",
                            children: jsxRuntimeExports.jsx(
                              BgmGroupedPreviewSelect,
                              {
                                value: selectedBgmId,
                                onChange: setSelectedBgmId,
                                placeholder: allBgms.length
                                  ? "请选择配乐"
                                  : "暂无可用配乐",
                                showToast,
                                groups: bgmGroups,
                              },
                            ),
                          }),
                          jsxRuntimeExports.jsx("div", {
                            className: "video-select-upload-row__upload",
                            children: jsxRuntimeExports.jsx("div", {
                              className: "video-file-input video-file-input-wrap",
                              onClick: () => openAd(),
                              style: { cursor: "pointer" },
                              children: jsxRuntimeExports.jsx("span", {
                                className: "video-file-input-text",
                                children: "上传",
                              }),
                            }),
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsx(
                        BgmUploadCategoryModal,
                        {
                          open: uploadCategoryModalOpen,
                          onClose: () => setUploadCategoryModalOpen(false),
                          categories: uploadCategoryCandidates,
                          showToast,
                          onConfirmPickFile: (category) => {
                            pendingUploadCategoryRef.current = category;
                            setUploadCategoryModalOpen(false);
                            requestAnimationFrame(() =>
                              bgmFileInputRef.current?.click(),
                            );
                          },
                        },
                      ),
                      isUploadingBgm &&
                        jsxRuntimeExports.jsx("span", {
                          className: "video-hint",
                          children: "正在上传配乐...",
                        }),
                    ],
                  }),
                  jsxRuntimeExports.jsxs("div", {
                    className: "video-form-row video-form-row--always-two",
                    children: [
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "旁白音量",
                          }),
                          jsxRuntimeExports.jsx(
                            RangeValueTooltip,
                            {
                              min: 0,
                              max: 3,
                              step: 0.1,
                              value: voiceVolume,
                              className: "video-range",
                              onChange: (v) => setVoiceVolume(v),
                              format: (v) => `${Math.round(v * 100)}%`,
                            },
                          ),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "配乐音量",
                          }),
                          jsxRuntimeExports.jsx(
                            RangeValueTooltip,
                            {
                              min: 0,
                              max: 1,
                              step: 0.1,
                              value: bgmVolume,
                              className: "video-range",
                              onChange: (v) => setBgmVolume(v),
                              format: (v) => `${Math.round(v * 100)}%`,
                            },
                          ),
                        ],
                      }),
                    ],
                  }),
                  jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group mt-[7px]!",
                    children: [
                      jsxRuntimeExports.jsxs("button", {
                        onClick: handleClipAll,
                        disabled: !!activeProcessingType,
                        className: "video-button video-button-primary",
                        children: [
                          jsxRuntimeExports.jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [jsxRuntimeExports.jsx("circle", { cx: "6", cy: "6", r: "3" }), jsxRuntimeExports.jsx("circle", { cx: "6", cy: "18", r: "3" }), jsxRuntimeExports.jsx("line", { x1: "20", y1: "4", x2: "8.12", y2: "15.88" }), jsxRuntimeExports.jsx("line", { x1: "14.47", y1: "14.48", x2: "20", y2: "20" }), jsxRuntimeExports.jsx("line", { x1: "8.12", y1: "8.12", x2: "12", y2: "12" })] }),
                          activeProcessingType
                            ? `处理中${processingProgress}%`
                            : "一键润色",
                        ],
                      }),
                      !!activeProcessingType &&
                        jsxRuntimeExports.jsx("div", {
                          className: "video-progress",
                          children: jsxRuntimeExports.jsx(
                            "div",
                            {
                              className: "video-progress-bar",
                              style: { width: `${processingProgress}%` },
                            },
                          ),
                        }),
                    ],
                  }),
                ],
              }),
              jsxRuntimeExports.jsxs("div", {
                className: "smartcut-preview-col",
                children: [
                  jsxRuntimeExports.jsx("div", {
                    className: "video-form-group",
                    children: jsxRuntimeExports.jsxs("div", {
                      style: { display: "flex", gap: "8px" },
                      children: [
                        jsxRuntimeExports.jsxs("button", {
                          type: "button",
                          onClick: () => openAd(),
                          className: "video-button video-button-primary",
                          style: { flex: 1 },
                          children: [
                            jsxRuntimeExports.jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [jsxRuntimeExports.jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", ry: "2" }), jsxRuntimeExports.jsx("line", { x1: "3", y1: "9", x2: "21", y2: "9" }), jsxRuntimeExports.jsx("line", { x1: "9", y1: "21", x2: "9", y2: "9" })] }),
                            "成片模板",
                          ],
                        }),
                        jsxRuntimeExports.jsxs("button", {
                          type: "button",
                          onClick: handleOpenSmartCut,
                          className: "video-button video-button-warning",
                          style: { flex: 1 },
                          children: [
                            jsxRuntimeExports.jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [jsxRuntimeExports.jsx("path", { d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" })] }),
                            "智能精剪",
                          ],
                        }),
                      ],
                    }),
                  }),
                  jsxRuntimeExports.jsx("label", {
                    className: "video-label mt-2!",
                    children: "成片预览",
                  }),
                  jsxRuntimeExports.jsx("div", {
                    className:
                      "video-preview-box video-preview-box-generated video-preview-box-with-play",
                    children: smartcutPreviewUrl
                      ? jsxRuntimeExports.jsxs(
                          React.Fragment,
                          {
                            children: [
                              jsxRuntimeExports.jsx(
                                "video",
                                {
                                  ref: smartcutPreviewRef,
                                  className: "video-preview-media",
                                  preload: "metadata",
                                  onClick: (e) => {
                                    e.preventDefault();
                                    openSmartcutPreview();
                                  },
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "source",
                                      {
                                        src: smartcutPreviewUrl,
                                        type: "video/mp4",
                                      },
                                    ),
                                },
                                smartcutPreviewUrl,
                              ),
                              jsxRuntimeExports.jsx("button", {
                                type: "button",
                                onClick: (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleDownloadSmartcutPreviewVideo();
                                },
                                title: "下载视频",
                                "aria-label": "下载视频",
                                style: {
                                  position: "absolute",
                                  right: "8px",
                                  bottom: "8px",
                                  padding: "2px",
                                  border: "none",
                                  background: "rgba(2, 6, 23, 0.55)",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: "4px",
                                  width: "20px",
                                  height: "20px",
                                  color: "#e2e8f0",
                                  transition:
                                    "background-color 0.2s, color 0.2s",
                                  zIndex: 12,
                                },
                                onMouseEnter: (e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "var(--ly-primary-soft)";
                                  e.currentTarget.style.color =
                                    "var(--ly-primary-2)";
                                },
                                onMouseLeave: (e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "rgba(2, 6, 23, 0.55)";
                                  e.currentTarget.style.color = "#e2e8f0";
                                },
                                children:
                                  jsxRuntimeExports.jsxs(
                                    "svg",
                                    {
                                      width: "14",
                                      height: "14",
                                      viewBox: "0 0 24 24",
                                      fill: "none",
                                      stroke: "currentColor",
                                      strokeWidth: "2",
                                      strokeLinecap: "round",
                                      strokeLinejoin: "round",
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "path",
                                          {
                                            d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "polyline",
                                          { points: "7 10 12 15 17 10" },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "line",
                                          {
                                            x1: "12",
                                            y1: "3",
                                            x2: "12",
                                            y2: "15",
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              }),
                              jsxRuntimeExports.jsx("button", {
                                type: "button",
                                className: "video-play-button",
                                onClick: openSmartcutPreview,
                                children: jsxRuntimeExports.jsx(
                                  "svg",
                                  {
                                    width: "24",
                                    height: "24",
                                    viewBox: "0 0 20 20",
                                    fill: "none",
                                    children:
                                      jsxRuntimeExports.jsx(
                                        "path",
                                        {
                                          d: "M6 4L16 10L6 16V4Z",
                                          fill: "currentColor",
                                        },
                                      ),
                                  },
                                ),
                              }),
                            ],
                          },
                        )
                      : jsxRuntimeExports.jsx("div", {
                          className: "video-preview-placeholder",
                          children: "剪辑后的视频将显示在这里",
                        }),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      jsxRuntimeExports.jsx(TitleStyleModal, {
        show: showTitleStyleModal,
        builtinTitleStyles,
        titleStyleImageUrls,
        titleStyleVideoUrls,
        activeProcessingType,
        processingProgress,
        selectedTitleStyle,
        setSelectedTitleStyle,
        titleSegmentRange: titleSegmentRange ?? null,
        setTitleSegmentRange,
        mainTitle,
        subTitle,
        onConfirm: handleConfirmSelectTitleStyle,
        onCancel: handleCancelSelectTitleStyle,
      }),
      jsxRuntimeExports.jsx(SmartCutModal, {
        show: showSmartCutModal,
        onClose: () => setShowSmartCutModal(false),
      }),
      phoneModal.showPhoneModal &&
        phoneModal.phoneModalVideoSrc &&
        jsxRuntimeExports.jsx(PhoneModal, {
          ...phoneModal.phoneModalProps,
          viralTitle,
          videoTags,
          nickName: userInfo?.nickName,
          avatarUrl: userInfo?.avatarUrl,
        }),
    ],
  });
}