function VideoSubtitleCard() {
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
    videoTags,
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
    whisperSegments,
    setWhisperSegments,
  } = useVideoPageStore();
  const userInfo = useUserInfoStore((s) => s.userInfo);
  reactExports.useEffect(() => {
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
  const [bgmVolume, setBgmVolume] = reactExports.useState(
    DEFAULT_BGM_CARD_MUSIC_VOLUME,
  );
  const [voiceVolume, setVoiceVolume] = reactExports.useState(
    DEFAULT_BGM_CARD_VOICE_VOLUME,
  );
  const [isUploadingBgm, setIsUploadingBgm] = reactExports.useState(false);
  const [bgmUploadText, setBgmUploadText] = reactExports.useState("上传");
  const [uploadCategoryModalOpen, setUploadCategoryModalOpen] =
    reactExports.useState(false);
  const bgmFileInputRef = reactExports.useRef(null);
  const pendingUploadCategoryRef = reactExports.useRef("");
  const allBgms = reactExports.useMemo(
    () => [...uploadedBgms, ...builtinBgms],
    [uploadedBgms, builtinBgms],
  );
  const uploadCategoryCandidates = reactExports.useMemo(
    () => getUploadCategoryCandidates(allBgms),
    [allBgms],
  );
  const bgmGroups = reactExports.useMemo(() => {
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
  reactExports.useEffect(() => {
    if (bgmEffectConfig) {
      setSelectedBgmId(bgmEffectConfig.selectedBgmId || "");
      if (typeof bgmEffectConfig.volume === "number") {
        setBgmVolume(bgmEffectConfig.volume);
      } else {
        setBgmVolume(DEFAULT_BGM_CARD_MUSIC_VOLUME);
      }
      if (typeof bgmEffectConfig.voiceVolume === "number") {
        setVoiceVolume(bgmEffectConfig.voiceVolume);
      } else {
        setVoiceVolume(DEFAULT_BGM_CARD_VOICE_VOLUME);
      }
    } else {
      setBgmVolume(DEFAULT_BGM_CARD_MUSIC_VOLUME);
      setVoiceVolume(DEFAULT_BGM_CARD_VOICE_VOLUME);
    }
  }, [bgmEffectConfig, setSelectedBgmId]);
  const handleUploadBgmMaterial = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const uploadCategory = pendingUploadCategoryRef.current.trim() || "推荐";
    pendingUploadCategoryRef.current = "";
    setBgmUploadText("上传");
    const fileExtension = file.name.toLowerCase().split(".").pop();
    const allowedExtensions = ["wav", "mp3", "m4a"];
    const allowedMimeTypes = [
      "audio/wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/x-m4a",
    ];
    if (
      !allowedExtensions.includes(fileExtension || "") &&
      !allowedMimeTypes.includes(file.type)
    ) {
      showToast("只支持上传WAV、MP3、M4A 格式的音频文件", "info");
      setBgmUploadText("上传");
      event.target.value = "";
      return;
    }
    setIsUploadingBgm(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Data = e.target?.result;
          const base64Content = base64Data.split(",")[1];
          const tempFileName = `temp_${Date.now()}_${file.name}`;
          const saveResult = await window.api.saveFileFromBase64(
            base64Content,
            tempFileName,
            "temp/bgms",
          );
          if (!saveResult.success || !saveResult.file_path) {
            showToast("保存音频文件失败", "error");
            setIsUploadingBgm(false);
            return;
          }
          const uploadResult = await window.api.uploadBgmMaterial(
            saveResult.file_path,
            file.name,
            uploadCategory,
          );
          if (uploadResult.success && uploadResult.file_path) {
            const cfg = await window.api.loadUploadedBgmsConfig();
            const nextBgms = (cfg.bgms ?? []).map((b) =>
              b.id === uploadResult.bgm_id
                ? { ...b, category: uploadCategory }
                : b,
            );
            await window.api.saveUploadedBgmsConfig({ bgms: nextBgms });
            setUploadedBgms(nextBgms);
            setSelectedBgmId(uploadResult.bgm_id || "");
          } else {
            showToast(`上传失败: ${uploadResult.error || "未知错误"}`, "error");
          }
        } catch (error) {
          console.error("Upload bgm error:", error);
          const err = error;
          showToast(`上传失败: ${err.message || "未知错误"}`, "error");
        } finally {
          setIsUploadingBgm(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Read file error:", error);
      const err = error;
      showToast(`上传失败: ${err.message || "未知错误"}`, "error");
      setIsUploadingBgm(false);
    }
    event.target.value = "";
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
    const canSubtitle = hasSubtitleText && !!audioDuration && audioDuration > 0;
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
      setSubtitleEffectConfig(null);
    }
    const canBgm = !!selectedBgmId;
    setBgmEnabled(canBgm);
    if (canBgm) {
      setBgmEffectConfig({
        selectedBgmId,
        volume: bgmVolume,
        voiceVolume,
      });
    }
  };
  const handleClipAll = async () => {
    if (activeProcessingType) return;
    prepareClipConfigs();
    const st = useVideoPageStore.getState();
    if (
      st.subtitleEnabled &&
      st.generatedAudioPath &&
      (st.subtitleText ?? "").trim()
    ) {
      useVideoPageStore.getState().setActiveProcessingType("subtitle");
      useVideoPageStore.getState().setProcessingProgress(5);
      try {
        await ensureWhisperSegmentsIfNeeded();
      } finally {
        useVideoPageStore.getState().setActiveProcessingType(null);
        useVideoPageStore.getState().setProcessingProgress(0);
      }
    }
    await applyAllEffects("subtitle", {
      title: false,
      subtitle: false,
      bgm: false,
    });
    await videoHistory.updateLatestSnapshot();
  };
  const [showSmartCutModal, setShowSmartCutModal] =
    reactExports.useState(false);
  const [showTitleStyleModal, setShowTitleStyleModal] =
    reactExports.useState(false);
  const [selectedTitleStyle, setSelectedTitleStyle] =
    reactExports.useState(null);
  const titleSegmentRangeBeforeModalRef = reactExports.useRef(void 0);
  reactExports.useEffect(() => {
    if (!showTitleStyleModal) return;
    titleSegmentRangeBeforeModalRef.current =
      useVideoPageStore.getState().titleSegmentRange ?? null;
  }, [showTitleStyleModal]);
  reactExports.useEffect(() => {
    if (!showTitleStyleModal) return;
    if (selectedTitleStyle) return;
    if (!builtinTitleStyles?.length) return;
    if (!selectedTitleStyleId) {
      setSelectedTitleStyle({
        id: "",
        name: "无标题（移除标题）",
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
    if (!generatedVideoPath) {
      showToast("请先生成主视频，再使用智能精剪", "info");
      return;
    }
    setShowSmartCutModal(true);
  };
  const handleConfirmSelectTitleStyle = async () => {
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
    useVideoPageStore.getState().setProcessingProgress(5);
    const parallelTasks = [];
    if (needGenerateTitle) {
      parallelTasks.push(
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
              } catch {
                const mainTitleMatch = content.match(
                  /"mainTitle"\s*:\s*"([^"]+)"/,
                );
                const subTitleMatch = content.match(
                  /"subTitle"\s*:\s*"([^"]+)"/,
                );
                if (mainTitleMatch) setMainTitle(mainTitleMatch[1]);
                if (subTitleMatch) setSubTitle(subTitleMatch[1]);
              }
            }
          } catch (err) {
            console.error("首次确认模板时自动生成标题失败", err);
          }
        })(),
      );
    }
    if (needWhisper) {
      parallelTasks.push(
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
      );
    }
    if (parallelTasks.length) {
      try {
        await Promise.all(parallelTasks);
      } catch (err) {
        useVideoPageStore.getState().setActiveProcessingType(null);
        console.error("模板预处理失败", err);
        return;
      }
    }
    const mainTitleText = (
      useVideoPageStore.getState().mainTitle ||
      useVideoPageStore.getState().viralTitle ||
      ""
    ).trim();
    if (!mainTitleText) {
      useVideoPageStore.getState().setActiveProcessingType(null);
      useVideoPageStore.getState().setProcessingProgress(0);
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
      useVideoPageStore.getState().setProcessingProgress(52);
      await ensureWhisperSegmentsIfNeeded();
    }
    await applyAllEffects("subtitle", {
      title: false,
      subtitle: false,
      bgm: false,
    });
    setShowTitleStyleModal(false);
    await videoHistory.updateLatestSnapshot();
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
  const [smartcutPreviewUrl, setSmartcutPreviewUrl] = reactExports.useState("");
  const smartcutPreviewRef = reactExports.useRef(null);
  const phoneModal = usePhoneModal(true);
  const effectVideoPath = finalVideoPath || "";
  reactExports.useEffect(() => {
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
    if (!effectVideoPath) {
      showToast("无可下载的视频", "info");
      return;
    }
    const result = await window.api.saveLocalFileAs(effectVideoPath);
    if (result.canceled) return;
    if (result.success && result.filePath) showToast("视频已保存", "success");
    else showToast(result.error || "保存失败", "error");
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, {
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
        className: `video-card video-card-smartcut ${autoLoading ? "video-card-auto-loading" : ""}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-card-header",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
                className: "video-card-number",
                children: "04",
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
                className: "video-card-title",
                children: "视频剪辑",
              }),
            ],
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-card-body",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                className: "smartcut-preview-col",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                    className: "video-form-group",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                      style: { display: "flex", gap: "8px" },
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                          type: "button",
                          onClick: () => setShowTitleStyleModal(true),
                          className: "video-button video-button-primary",
                          style: { flex: 1 },
                          children: "成片模板",
                        }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                          type: "button",
                          onClick: handleOpenSmartCut,
                          className: "video-button video-button-warning",
                          style: { flex: 1 },
                          children: "智能精剪",
                        }),
                      ],
                    }),
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                    className: "video-label mt-2!",
                    children: "视频预览",
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                    className:
                      "video-preview-box video-preview-box-generated video-preview-box-with-play",
                    children: smartcutPreviewUrl
                      ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
                          jsxRuntimeExports.Fragment,
                          {
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(
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
                                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                                      "source",
                                      {
                                        src: smartcutPreviewUrl,
                                        type: "video/mp4",
                                      },
                                    ),
                                },
                                smartcutPreviewUrl,
                              ),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
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
                                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
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
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "path",
                                          {
                                            d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
                                          },
                                        ),
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "polyline",
                                          { points: "7 10 12 15 17 10" },
                                        ),
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
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
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                type: "button",
                                className: "video-play-button",
                                onClick: openSmartcutPreview,
                                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "svg",
                                  {
                                    width: "24",
                                    height: "24",
                                    viewBox: "0 0 20 20",
                                    fill: "none",
                                    children:
                                      /* @__PURE__ */ jsxRuntimeExports.jsx(
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
                      : /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                          className: "video-preview-placeholder",
                          children: "剪辑后的视频将显示在这里",
                        }),
                  }),
                ],
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                className: "smartcut-controls-col",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                        className: "video-label",
                        children: "封面标题",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                        type: "text",
                        value: mainTitle,
                        onChange: (e) => setMainTitle(e.target.value),
                        placeholder: "输入主标题",
                        className: "video-input",
                      }),
                    ],
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                        className: "video-label",
                        children: "副标题",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                        type: "text",
                        value: subTitle,
                        onChange: (e) => setSubTitle(e.target.value),
                        placeholder: "输入副标题",
                        className: "video-input",
                      }),
                    ],
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                        className: "video-label",
                        children: "字幕内容",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", {
                        value: subtitleText,
                        onChange: (e) => setSubtitleText(e.target.value),
                        placeholder: "字幕内容将显示在这里...",
                        rows: 8,
                        className: "video-textarea",
                      }),
                    ],
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                        className: "video-label",
                        children: "背景音乐",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-select-upload-row",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                            className: "video-select-upload-row__select",
                            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                              BgmGroupedPreviewSelect,
                              {
                                value: selectedBgmId,
                                onChange: setSelectedBgmId,
                                placeholder: allBgms.length
                                  ? "请选择音乐"
                                  : "暂无背景音乐",
                                showToast,
                                groups: bgmGroups,
                              },
                            ),
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            className: "video-select-upload-row__upload",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                type: "button",
                                className: `video-file-input video-file-input-wrap ${isUploadingBgm ? "disabled" : ""}`,
                                disabled: isUploadingBgm,
                                onClick: () => {
                                  if (isUploadingBgm) return;
                                  setUploadCategoryModalOpen(true);
                                },
                                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "span",
                                  {
                                    className: "video-file-input-text",
                                    children: bgmUploadText,
                                  },
                                ),
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                                ref: bgmFileInputRef,
                                type: "file",
                                accept:
                                  "audio/wav,audio/mpeg,audio/mp3,audio/mp4,.wav,.mp3,.m4a",
                                className: "video-file-input-real",
                                style: { display: "none" },
                                onChange: handleUploadBgmMaterial,
                                disabled: isUploadingBgm,
                              }),
                            ],
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
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
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
                          className: "video-hint",
                          children: "正在上传...",
                        }),
                    ],
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                    className: "video-form-row video-form-row--always-two",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "人声音量",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx(
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
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "音乐音量",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx(
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
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                    className: "video-form-group mt-[7px]!",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                        onClick: handleClipAll,
                        disabled: !!activeProcessingType,
                        className: "video-button video-button-primary",
                        children: activeProcessingType
                          ? `剪辑中${processingProgress}%`
                          : "快捷剪辑",
                      }),
                      !!activeProcessingType &&
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                          className: "video-progress",
                          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
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
            ],
          }),
        ],
      }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TitleStyleModal, {
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
      /* @__PURE__ */ jsxRuntimeExports.jsx(SmartCutModal, {
        show: showSmartCutModal,
        onClose: () => setShowSmartCutModal(false),
      }),
      phoneModal.showPhoneModal &&
        phoneModal.phoneModalVideoSrc &&
        /* @__PURE__ */ jsxRuntimeExports.jsx(PhoneModal, {
          ...phoneModal.phoneModalProps,
          viralTitle,
          videoTags,
          nickName: userInfo?.nickName,
          avatarUrl: userInfo?.avatarUrl,
        }),
    ],
  });
}