function VideoAudioCard() {
  const showToast = useToast();
  const userInfo = useUserInfoStore((s) => s.userInfo);
  const autoFlowStep = useVideoPageStore((s) => s.autoFlowStep);
  const autoFlowRunning = useVideoPageStore((s) => s.autoFlowRunning);
  const flowMode = useVideoPageStore((s) => s.flowMode);
  const {
    generatedAudioPath,
    setGeneratedAudioPath,
    setSubtitleText,
    setUploadedVoices,
    builtinVoices,
    uploadedVoices,
    originalScript,
    rewrittenScript,
    translatedText,
    showTranslatedInTextarea,
    audioDuration,
    setAudioDuration,
    selectedVoiceId,
    setSelectedVoiceId,
    ttsEmotion,
    setTtsEmotion,
    ttsEmotionWeight,
    setTtsEmotionWeight,
    ttsEmotionCustomText,
    setTtsEmotionCustomText,
    ttsAudioSpeed,
    setTtsAudioSpeed,
    sourceLanguage,
  } = useVideoPageStore();
  const referenceAudio = selectedVoiceId;
  const [, setReferenceAudioPromptText] = reactExports.useState("");
  const normalizedTtsSpeed = Math.min(
    1.5,
    Math.max(0.8, Number(ttsAudioSpeed ?? 1)),
  );
  const [audioDelaySeconds, setAudioDelaySeconds] = reactExports.useState(0);
  const [isUploadingVoice, setIsUploadingVoice] = reactExports.useState(false);
  const [voiceUploadText, setVoiceUploadText] = reactExports.useState("上传");
  const [isTextToAudioing, setIsTextToAudioing] = reactExports.useState(false);
  const [textToAudioProgress, setTextToAudioProgress] =
    reactExports.useState(0);
  const [audioPreview, setAudioPreview] = reactExports.useState("");
  const [isAudioPlaying, setIsAudioPlaying] = reactExports.useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = reactExports.useState(0);
  const textToAudioIntervalRef = reactExports.useRef(null);
  const audioRef = reactExports.useRef(null);
  const normalizedEmotionWeight = Math.min(
    1,
    Math.max(0.1, Number(ttsEmotionWeight || 1)),
  );
  const [isTtsQueuing, setIsTtsQueuing] = reactExports.useState(false);
  const isTtsQueueingRef = reactExports.useRef(false);
  const ttsStartTimeRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    if (typeof window.api.onPluginProxyProgress !== "function") return;
    const off = window.api.onPluginProxyProgress((data) => {
      if (data.pluginName !== "plugin-proxy-tts2") return;
      if (data.type === "queue_waiting") {
        isTtsQueueingRef.current = true;
        setIsTtsQueuing(true);
      } else if (data.type === "queue_active" || data.type === "queue_done") {
        ttsStartTimeRef.current = Date.now();
        isTtsQueueingRef.current = false;
        setIsTtsQueuing(false);
        setTextToAudioProgress(0);
      }
    });
    return off;
  }, []);
  reactExports.useEffect(() => {
    const all = [...uploadedVoices, ...builtinVoices];
    if (all.length === 0) return;
    const current = referenceAudio
      ? all.find((v) => v.id === referenceAudio)
      : null;
    if (!current) {
      const first = all[0];
      setSelectedVoiceId(first.id);
      if (first.promptText) setReferenceAudioPromptText(first.promptText);
      return;
    }
    if (current.promptText) setReferenceAudioPromptText(current.promptText);
  }, [builtinVoices, uploadedVoices, referenceAudio, setSelectedVoiceId]);
  reactExports.useEffect(() => {
    return () => {
      if (textToAudioIntervalRef.current)
        clearInterval(textToAudioIntervalRef.current);
    };
  }, []);
  reactExports.useEffect(() => {
    if (!generatedAudioPath) {
      setAudioPreview("");
      return;
    }
    let cancelled = false;
    window.api
      .getLocalFileUrl(generatedAudioPath)
      .then((res) => {
        if (!cancelled && res.success && res.url) setAudioPreview(res.url);
      })
      .catch((err) => {
        if (!cancelled) setAudioPreview("");
        console.log("语音生成失败", err);
        showToast(`语音生成失败: ${err.message || "无法播放"}`, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [generatedAudioPath]);
  const handleReferenceAudioChange = (voiceId) => {
    setSelectedVoiceId(voiceId);
    const allVoices = [...uploadedVoices, ...builtinVoices];
    const selectedVoice = allVoices.find((v) => v.id === voiceId);
    setReferenceAudioPromptText(selectedVoice?.promptText ?? "");
  };
  const handleUploadAudio = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    const allowed = ["wav", "mp3", "m4a"];
    const mimes = [
      "audio/wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/x-m4a",
    ];
    if (!allowed.includes(ext || "") && !mimes.includes(file.type)) {
      showToast("只支持上传 WAV、MP3、M4A 格式的音频文件", "info");
      setVoiceUploadText("上传");
      event.target.value = "";
      return;
    }
    setVoiceUploadText("上传");
    setIsUploadingVoice(true);
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
            "temp/voices",
          );
          if (!saveResult.success || !saveResult.file_path) {
            showToast("保存音频文件失败", "error");
            setIsUploadingVoice(false);
            return;
          }
          const transcribeResult = await window.api.uploadVoiceAndTranscribe(
            saveResult.file_path,
            file.name,
          );
          if (transcribeResult.success && transcribeResult.file_path) {
            const cfg = await window.api.loadUploadedVoicesConfig();
            setUploadedVoices(cfg.voices ?? []);
            setSelectedVoiceId(
              transcribeResult.voice_id || `uploaded_${Date.now()}`,
            );
            setReferenceAudioPromptText(transcribeResult.prompt_text || "");
          } else {
            showToast(
              `上传失败: ${transcribeResult.error || "未知错误"}`,
              "error",
            );
          }
        } catch (err) {
          console.error("Upload audio error:", err);
          showToast(`上传失败: ${err.message || "未知错误"}`, "error");
        } finally {
          setIsUploadingVoice(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Read file error:", err);
      showToast(`上传失败: ${err.message || "未知错误"}`, "error");
      setIsUploadingVoice(false);
    }
    event.target.value = "";
  };
  const isCustomTtsEmotion = ttsEmotion === TTS_EMOTION_CUSTOM_VALUE;
  const handleTextToAudio = async () => {
    if (isTextToAudioing) return;
    const scriptContent =
      showTranslatedInTextarea && translatedText
        ? translatedText.trim()
        : rewrittenScript.trim() || originalScript.trim();
    if (!scriptContent) {
      showToast("请先输入文案内容或提取视频文案", "info");
      return;
    }
    if (!referenceAudio) {
      showToast("请先选择参考音频", "info");
      return;
    }
    const emotionPayload = resolveTtsEmotionForPlugin(
      ttsEmotion,
      ttsEmotionCustomText,
    );
    if (ttsEmotion === TTS_EMOTION_CUSTOM_VALUE && !emotionPayload) {
      showToast("请填写情绪描述（最多8个字）", "info");
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    setIsAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setIsTextToAudioing(true);
    setTextToAudioProgress(0);
    setAudioPreview("");
    ttsStartTimeRef.current = Date.now();
    const estimatedDuration = 6e4;
    textToAudioIntervalRef.current = setInterval(() => {
      if (isTtsQueueingRef.current) return;
      const progress = Math.min(
        Math.round(
          ((Date.now() - ttsStartTimeRef.current) / estimatedDuration) * 90,
        ),
        90,
      );
      setTextToAudioProgress(progress);
    }, 200);
    const traceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (userInfo?.phone) {
      exceptionService.submitException({
        cardNum: userInfo.phone,
        feature: "audio_generate",
        traceId,
        eventType: "start",
        exceptionInfo: "",
      });
    }
    try {
      const allVoices = [...uploadedVoices, ...builtinVoices];
      const selectedVoice = allVoices.find((v) => v.id === referenceAudio);
      if (!selectedVoice) throw new Error("未找到选择的音色");
      useVideoPageStore.getState().setWhisperSegments([]);
      useVideoPageStore.getState().setSubtitleText("");
      useVideoPageStore.getState().setMainTitle("");
      useVideoPageStore.getState().setSubTitle("");
      (() => {
        if (!scriptContent) return;
        const storeState = useVideoPageStore.getState();
        const langName = getLanguageName(storeState.sourceLanguage);
        templateService
          .getParsedTemplate("title", { langName, scriptContent })
          .then(({ systemPrompt, userPrompts }) => {
            const messages = [
              { role: "system", content: systemPrompt },
              ...userPrompts.map((p) => ({ role: "user", content: p })),
            ];
            return llmService.completion(
              storeState.llmModel || "DeepSeek",
              messages,
              { temperature: 0.8, max_tokens: 500 },
            );
          })
          .then((data) => {
            const content = (data?.data || data)?.choices?.[0]?.message
              ?.content;
            if (!content) return;
            const parsed = (() => {
              try {
                return JSON.parse(content.trim());
              } catch {
                return null;
              }
            })();
            const mTitle =
              parsed?.mainTitle ||
              content.match(/"mainTitle"\s*:\s*"([^"]+)"/)?.[1];
            const sTitle =
              parsed?.subTitle ||
              content.match(/"subTitle"\s*:\s*"([^"]+)"/)?.[1];
            if (mTitle) useVideoPageStore.getState().setMainTitle(mTitle);
            if (sTitle) useVideoPageStore.getState().setSubTitle(sTitle);
          })
          .catch(() => {});
      })();
      const audioUrl = await window.api.pluginProxyTts2Run({
        scriptContent,
        referenceAudioPath: selectedVoice.path,
        emotion: emotionPayload,
        emotionWeight: normalizedEmotionWeight,
      });
      console.log("开始下载音频:", audioUrl);
      const downloadResult = await window.api.downloadAudioFromUrl(audioUrl, {
        silenceSeconds: audioDelaySeconds,
        audioSpeed: normalizedTtsSpeed,
      });
      if (!downloadResult.success || !downloadResult.file_path)
        throw new Error(downloadResult.error || "下载音频失败");
      setGeneratedAudioPath(downloadResult.file_path);
      setSubtitleText(splitSubtitleByLanguage(scriptContent, sourceLanguage));
      setTextToAudioProgress(100);
      if (userInfo?.phone) {
        exceptionService.submitException({
          cardNum: userInfo.phone,
          feature: "audio_generate",
          traceId,
          eventType: "end",
          exceptionInfo: "",
        });
      }
    } catch (error) {
      if (isUserCancelledPluginError(error)) {
        showToast("已取消", "success");
        return;
      }
      console.error("Text to audio failed:", error);
      const err = error;
      if (err.message?.includes("fetch failed"))
        showToast("请联系客服人员，激活账号", "error");
      else showToast(`语音生成失败: ${err.message || "未知错误"}`, "error");
      if (userInfo?.phone) {
        exceptionService.submitException({
          cardNum: userInfo.phone,
          feature: "audio_generate",
          traceId,
          eventType: "exception",
          exceptionInfo: JSON.stringify(error),
        });
      }
    } finally {
      isTtsQueueingRef.current = false;
      setIsTtsQueuing(false);
      setIsTextToAudioing(false);
      if (textToAudioIntervalRef.current) {
        clearInterval(textToAudioIntervalRef.current);
        textToAudioIntervalRef.current = null;
      }
    }
  };
  const autoLoading =
    (autoFlowRunning && autoFlowStep === "audio") ||
    (flowMode === "manual" && isTextToAudioing);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
    className: `video-card ${autoLoading ? "video-card-auto-loading" : ""}`,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
        className: "video-card-header",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
            className: "video-card-number",
            children: "02",
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
            className: "video-card-title",
            children: "音频生成",
          }),
        ],
      }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
        className: "video-card-body",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-form-group",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                className: "video-label",
                children: "选择声音",
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                className: "video-select-upload-row",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                    className: "video-select-upload-row__select",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      AudioPreviewSelect,
                      {
                        value: referenceAudio,
                        onChange: handleReferenceAudioChange,
                        placeholder: "请选择音色",
                        showToast,
                        options: [...uploadedVoices, ...builtinVoices].map(
                          (v) => ({ id: v.id, name: v.name, path: v.path }),
                        ),
                      },
                    ),
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                    className: "video-select-upload-row__upload",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                      className: `video-file-input video-file-input-wrap ${isUploadingVoice ? "disabled" : ""}`,
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
                          className: "video-file-input-text",
                          children: voiceUploadText,
                        }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                          type: "file",
                          accept:
                            "audio/wav,audio/mpeg,audio/mp3,audio/mp4,.wav,.mp3,.m4a",
                          className: "video-file-input-real",
                          onChange: handleUploadAudio,
                          disabled: isUploadingVoice,
                        }),
                      ],
                    }),
                  }),
                ],
              }),
              isUploadingVoice &&
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
                  className: "video-hint",
                  children: "正在上传并处理音色...",
                }),
            ],
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: `video-form-row${isCustomTtsEmotion ? " video-form-row--tts-emotion-custom" : ""}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                    className: "video-label",
                    children: "情绪",
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("select", {
                    value: ttsEmotion,
                    onChange: (e) => setTtsEmotion(e.target.value),
                    className: `video-select${isCustomTtsEmotion ? " video-select--tts-emotion-narrow" : ""}`,
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: "",
                        children: "无情绪",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: "开心",
                        children: "开心",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: "愤怒",
                        children: "愤怒",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: "悲伤",
                        children: "悲伤",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: "恐惧",
                        children: "恐惧",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: "厌恶",
                        children: "厌恶",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: "忧郁",
                        children: "忧郁",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: "惊讶",
                        children: "惊讶",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: "平静",
                        children: "平静",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                        value: TTS_EMOTION_CUSTOM_VALUE,
                        children: "自定义",
                      }),
                    ],
                  }),
                ],
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                className: "video-form-group",
                children: isCustomTtsEmotion
                  ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      jsxRuntimeExports.Fragment,
                      {
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "情绪描述",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            className: "video-tts-emotion-custom-row",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                                type: "text",
                                className:
                                  "video-input video-input--tts-emotion-text",
                                placeholder: "最多8个字",
                                value: ttsEmotionCustomText,
                                onChange: (e) => {
                                  if (e.nativeEvent.isComposing) {
                                    setTtsEmotionCustomText(e.target.value);
                                    return;
                                  }
                                  setTtsEmotionCustomText(
                                    sliceTtsEmotionCustomTextMax(
                                      e.target.value,
                                      8,
                                    ),
                                  );
                                },
                                onCompositionEnd: (e) => {
                                  setTtsEmotionCustomText(
                                    sliceTtsEmotionCustomTextMax(
                                      e.currentTarget.value,
                                      8,
                                    ),
                                  );
                                },
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                                type: "number",
                                className:
                                  "video-input video-input--tts-emotion-weight",
                                min: 0.1,
                                max: 1,
                                step: 0.1,
                                placeholder: "权重",
                                value: normalizedEmotionWeight.toFixed(1),
                                onChange: (e) => {
                                  const next = Number(e.target.value);
                                  if (Number.isNaN(next)) return;
                                  setTtsEmotionWeight(
                                    Math.min(1, Math.max(0.1, next)),
                                  );
                                },
                              }),
                            ],
                          }),
                        ],
                      },
                    )
                  : /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      jsxRuntimeExports.Fragment,
                      {
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "情绪权重",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                            type: "number",
                            className: "video-input",
                            min: 0.1,
                            max: 1,
                            step: 0.1,
                            value: normalizedEmotionWeight.toFixed(1),
                            onChange: (e) => {
                              const next = Number(e.target.value);
                              if (Number.isNaN(next)) return;
                              setTtsEmotionWeight(
                                Math.min(1, Math.max(0.1, next)),
                              );
                            },
                          }),
                        ],
                      },
                    ),
              }),
            ],
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-form-row",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                    className: "video-label",
                    children: "调节语速",
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RangeValueTooltip, {
                    min: 0.8,
                    max: 1.5,
                    step: 0.1,
                    value: normalizedTtsSpeed,
                    className: "video-range",
                    onChange: (v) => setTtsAudioSpeed(v),
                    format: (v) => `${v.toFixed(1)}x`,
                  }),
                ],
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                    className: "video-label",
                    children: "延迟播音",
                  }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RangeValueTooltip, {
                    min: 0,
                    max: 5,
                    step: 0.5,
                    value: audioDelaySeconds,
                    className: "video-range",
                    onChange: (v) => setAudioDelaySeconds(v),
                    format: (v) => {
                      const show = Number.isInteger(v)
                        ? String(v)
                        : v.toFixed(1);
                      return `${show}秒`;
                    },
                  }),
                ],
              }),
            ],
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-form-group",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                onClick: handleTextToAudio,
                disabled: isTextToAudioing,
                className: "video-button video-button-primary",
                children: isTextToAudioing
                  ? isTtsQueuing
                    ? "排队中..."
                    : `转换中 ${textToAudioProgress}%`
                  : "生成音频",
              }),
              isTextToAudioing &&
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                  className: "video-progress",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                    className: "video-progress-bar",
                    style: {
                      width: `${isTtsQueuing ? 0 : textToAudioProgress}%`,
                    },
                  }),
                }),
            ],
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-form-group",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                className: "video-label",
                children: "音频预览",
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                className: "video-preview-box video-preview-box-audio",
                children: audioPreview
                  ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      jsxRuntimeExports.Fragment,
                      {
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                            "audio",
                            {
                              ref: audioRef,
                              className: "video-preview-media-hidden",
                              preload: "auto",
                              onPlay: () => setIsAudioPlaying(true),
                              onPause: () => setIsAudioPlaying(false),
                              onEnded: () => setIsAudioPlaying(false),
                              onTimeUpdate: () => {
                                if (audioRef.current)
                                  setAudioCurrentTime(
                                    audioRef.current.currentTime,
                                  );
                              },
                              onLoadedMetadata: () => {
                                if (audioRef.current)
                                  setAudioDuration(audioRef.current.duration);
                              },
                              onError: (e) => console.error("音频播放错误:", e),
                              children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "source",
                                { src: audioPreview },
                              ),
                            },
                            audioPreview,
                          ),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            className: "custom-audio-player",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                className: "audio-play-pause-btn",
                                onClick: () => {
                                  if (audioRef.current) {
                                    if (isAudioPlaying)
                                      audioRef.current.pause();
                                    else audioRef.current.play();
                                  }
                                },
                                children: isAudioPlaying
                                  ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                      "svg",
                                      {
                                        width: "20",
                                        height: "20",
                                        viewBox: "0 0 20 20",
                                        fill: "none",
                                        children: [
                                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                                            "rect",
                                            {
                                              x: "6",
                                              y: "4",
                                              width: "3",
                                              height: "12",
                                              fill: "currentColor",
                                            },
                                          ),
                                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                                            "rect",
                                            {
                                              x: "11",
                                              y: "4",
                                              width: "3",
                                              height: "12",
                                              fill: "currentColor",
                                            },
                                          ),
                                        ],
                                      },
                                    )
                                  : /* @__PURE__ */ jsxRuntimeExports.jsx(
                                      "svg",
                                      {
                                        width: "20",
                                        height: "20",
                                        viewBox: "0 0 20 20",
                                        fill: "none",
                                        children:
                                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                                            "path",
                                            {
                                              d: "M7 5L15 10L7 15V5Z",
                                              fill: "currentColor",
                                            },
                                          ),
                                      },
                                    ),
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                                className: "audio-time-info",
                                children: [
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "span",
                                    {
                                      className: "audio-time-current",
                                      children: formatTime$1(audioCurrentTime),
                                    },
                                  ),
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "span",
                                    {
                                      className: "audio-time-separator",
                                      children: "/",
                                    },
                                  ),
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "span",
                                    {
                                      className: "audio-time-duration",
                                      children: formatTime$1(audioDuration),
                                    },
                                  ),
                                ],
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                                className: "audio-progress-container",
                                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "div",
                                  {
                                    className: "audio-progress-bar",
                                    style: {
                                      width: `${audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0}%`,
                                    },
                                  },
                                ),
                              }),
                            ],
                          }),
                        ],
                      },
                    )
                  : /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                      className: "video-preview-placeholder",
                      children: "暂无音频",
                    }),
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                className: `audio-waveform ${isAudioPlaying ? "playing" : ""}`,
                children: Array.from({ length: 24 }, (_, i) =>
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "div",
                    { className: "waveform-bar" },
                    i,
                  ),
                ),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
function VideoFirstFrameSelect(props) {
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
  const rootRef = reactExports.useRef(null);
  const triggerRef = reactExports.useRef(null);
  const menuRef = reactExports.useRef(null);
  const [isOpen, setIsOpen] = reactExports.useState(false);
  const [menuDirection, setMenuDirection] = reactExports.useState("down");
  const [anchorRect, setAnchorRect] = reactExports.useState(null);
  const selected = reactExports.useMemo(
    () => options.find((o) => o.id === value) || null,
    [options, value],
  );
  const thumbUrlCacheByPathRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const thumbPromiseByPathRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const thumbLoadingPathsRef = reactExports.useRef(/* @__PURE__ */ new Set());
  const [thumbUrl, setThumbUrl] = reactExports.useState("");
  const [thumbLoading, setThumbLoading] = reactExports.useState(false);
  const [, setMenuThumbVersion] = reactExports.useState(0);
  reactExports.useEffect(() => {
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
  reactExports.useEffect(() => {
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
        const res = await window.api.extractFrameFromVideo(opt.path);
        if (!res.success || !res.image_path)
          throw new Error(res.error || "无法提取首帧");
        const urlRes = await window.api.getLocalFileUrl(res.image_path);
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
  reactExports.useEffect(() => {
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
  reactExports.useEffect(() => {
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
  const menuPositionStyle = reactExports.useMemo(() => {
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
    ref: rootRef,
    className: `video-first-frame-select ${disabled ? "disabled" : ""} ${className}`,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
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
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-first-frame-select-trigger-inner",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                className: "video-first-frame-thumb",
                children: thumbUrl
                  ? // 首帧缩略图
                    /* @__PURE__ */ jsxRuntimeExports.jsx("img", {
                      src: thumbUrl,
                      alt: selected?.name ? `首帧 ${selected.name}` : "首帧",
                      style: { maxWidth: thumbMaxWidth },
                    })
                  : thumbLoading
                    ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                        className: "video-first-frame-thumb-loading",
                      })
                    : null,
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                className: "video-first-frame-select-text",
                children: selected ? selected.name : placeholder,
              }),
            ],
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
            className: "video-first-frame-select-caret",
          }),
        ],
      }),
      isOpen
        ? reactDomExports.createPortal(
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
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
                    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
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
                          /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                            className:
                              "video-first-frame-thumb video-first-frame-select-item-thumb",
                            children: cached
                              ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", {
                                  src: cached,
                                  alt: opt.name,
                                })
                              : isLoading
                                ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                                    className:
                                      "video-first-frame-thumb-loading",
                                  })
                                : null,
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
                            className: "video-first-frame-select-item-name",
                            children: opt.name,
                          }),
                        ],
                      },
                      opt.id,
                    );
                  })
                : /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
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