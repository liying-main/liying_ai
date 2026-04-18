import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useVideoPageStore } from '../../store/VideoPageStore'
import { useUserInfoStore } from '../../store/UserInfoStore'

// TODO: Add these hooks/services imports as needed
// import { useToast } from '../../hooks/useToast'
// import { usePhoneModal } from '../../hooks/usePhoneModal'
// import { llmService } from '../../services/llmService'
// import { templateService } from '../../services/templateService'
// import { exceptionService } from '../../services/exceptionService'

export function VideoBgmCard() {
  const showToast = useToast();
  const {
    viralTitle,
    setViralTitle,
    videoTags,
    setVideoTags,
    finalVideoPath,
    generatedVideoPath,
    originalVideoPath,
    publishPlatforms,
    setPublishPlatforms,
    publishMode,
    setPublishMode,
    originalScript,
    rewrittenScript,
    translatedText,
    showTranslatedInTextarea,
    sourceLanguage,
    llmModel,
  } = useVideoPageStore();
  const autoFlowStep = useVideoPageStore((s) => s.autoFlowStep);
  const autoFlowRunning = useVideoPageStore((s) => s.autoFlowRunning);
  const autoLoading = autoFlowRunning && autoFlowStep === "publish";
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const generateIntervalRef = useRef(null);
  useEffect(() => {
    return () => {
      if (generateIntervalRef.current)
        clearInterval(generateIntervalRef.current);
    };
  }, []);
  const handleGenerate = async () => {
    if (isGenerating) return;
    const scriptContent =
      showTranslatedInTextarea && translatedText
        ? translatedText.trim()
        : rewrittenScript.trim() || originalScript.trim();
    if (!scriptContent) {
      showToast("请先提取视频文案或输入文案内容", "info");
      return;
    }
    const langName = getLanguageName(sourceLanguage);
    setIsGenerating(true);
    setGenerateProgress(0);
    setViralTitle("");
    setVideoTags("");
    if (generateIntervalRef.current) clearInterval(generateIntervalRef.current);
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 5;
      if (progress < 90) setGenerateProgress(Math.round(progress));
    }, 500);
    generateIntervalRef.current = progressInterval;
    try {
      const { systemPrompt, userPrompts } =
        await templateService.getParsedTemplate("title", {
          langName,
          scriptContent,
        });
      const messages = [
        { role: "system", content: systemPrompt },
        ...userPrompts.map((prompt) => ({ role: "user", content: prompt })),
      ];
      const data = await llmService.completion(
        llmModel || "DeepSeek",
        messages,
        { temperature: 0.8, max_tokens: 500 },
      );
      clearInterval(progressInterval);
      setGenerateProgress(100);
      const responseData = data.data || data;
      if (responseData.choices?.[0]?.message?.content) {
        const content = responseData.choices[0].message.content;
        try {
          const result = JSON.parse(content.trim());
          if (result.viralTitle) setViralTitle(result.viralTitle);
          if (result.videoTags) setVideoTags(result.videoTags);
        } catch (error) {
          console.error(
            "Parse JSON failed, trying to extract from text:",
            error,
          );
          const viralTitleMatch = content.match(/"viralTitle"\s*:\s*"([^"]+)"/);
          const videoTagsMatch = content.match(/"videoTags"\s*:\s*"([^"]+)"/);
          if (viralTitleMatch) setViralTitle(viralTitleMatch[1]);
          if (videoTagsMatch) setVideoTags(videoTagsMatch[1]);
        }
      } else throw new Error("API未返回有效结果");
    } catch (error) {
      console.error("Generate title failed:", error);
      const err = error;
      clearInterval(progressInterval);
      showToast(`生成失败: ${err.message || "未知错误"}`, "error");
    } finally {
      setIsGenerating(false);
      if (generateIntervalRef.current) {
        clearInterval(generateIntervalRef.current);
        generateIntervalRef.current = null;
      }
    }
  };
  const handlePublish = async () => {
    const videoPath = finalVideoPath || generatedVideoPath || originalVideoPath;
    if (!videoPath) {
      showToast("请先选择或生成要发布的视频", "info");
      return;
    }
    if (!viralTitle.trim()) {
      showToast("请先生成爆款视频标题", "info");
      return;
    }
    if (!videoTags.trim()) {
      showToast("请先生成视频标签", "info");
      return;
    }
    if (!publishPlatforms.length) {
      showToast("请先选择至少一个发布平台", "info");
      return;
    }
    setIsPublishing(true);
    try {
      const payload = {
        videoPath,
        title: viralTitle.trim(),
        description: videoTags.trim(),
        publishMode,
      };
      const results = await Promise.allSettled(
        publishPlatforms.map(async (platform) => ({
          platform,
          result: await window.api.browserRunPublishFlow(platform, payload),
        })),
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          const { platform, result } = r.value;
          if (result?.success && result?.message)
            showToast(result.message, "success");
          else if (result?.message) showToast(result.message, "info");
          else if (result?.success)
            showToast(`已启动发布：${platform}`, "success");
          else showToast(`发布失败：${platform}`, "error");
        } else {
          showToast(
            `发布失败：${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
            "error",
          );
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      showToast("发布失败: " + errMsg, "error");
    } finally {
      setIsPublishing(false);
    }
  };
  return jsxRuntimeExports.jsxs("div", {
    className: `video-card video-card-smartcut ${autoLoading ? "video-card-auto-loading" : ""}`,
    children: [
      jsxRuntimeExports.jsxs("div", {
        className: "video-card-header",
        children: [
          jsxRuntimeExports.jsx("span", {
            className: "video-card-number",
            children: "05",
          }),
          jsxRuntimeExports.jsx("span", {
            className: "video-card-title",
            children: "视频发布",
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
                  jsxRuntimeExports.jsx("button", {
                    onClick: handleGenerate,
                    disabled: isGenerating,
                    className: "video-button video-button-primary",
                    children: isGenerating
                      ? `生成中 ${Math.round(generateProgress)}%`
                      : "生成标题",
                  }),
                  isGenerating &&
                    jsxRuntimeExports.jsx("div", {
                      className: "video-progress",
                      children: jsxRuntimeExports.jsx("div", {
                        className: "video-progress-bar",
                        style: { width: `${generateProgress}%` },
                      }),
                    }),
                ],
              }),
              jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  jsxRuntimeExports.jsx("label", {
                    className: "video-label",
                    children: "视频标题",
                  }),
                  jsxRuntimeExports.jsx("input", {
                    type: "text",
                    value: viralTitle,
                    onChange: (e) => setViralTitle(e.target.value),
                    placeholder: "输入爆款标题",
                    className: "video-input",
                  }),
                ],
              }),
              jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  jsxRuntimeExports.jsx("label", {
                    className: "video-label",
                    children: "视频标签",
                  }),
                  jsxRuntimeExports.jsx("input", {
                    type: "text",
                    value: videoTags,
                    onChange: (e) => setVideoTags(e.target.value),
                    placeholder: "输入标签，用逗号分隔",
                    className: "video-input",
                  }),
                ],
              }),
            ],
          }),
          jsxRuntimeExports.jsxs("div", {
            className: "smartcut-controls-col",
            children: [
              jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  jsxRuntimeExports.jsx("label", {
                    className: "video-label",
                    children: "发布方式",
                  }),
                  jsxRuntimeExports.jsx("div", {
                    className: "publish-mode-group",
                    children: [
                      {
                        id: "manual",
                        label: "手动发布",
                        icon: jsxRuntimeExports.jsx("svg", {
                          viewBox: "0 0 16 16",
                          fill: "currentColor",
                          width: "14",
                          height: "14",
                          children: jsxRuntimeExports.jsx(
                            "path",
                            {
                              d: "M10.5 2a.5.5 0 0 1 .5.5v1h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1v-1a.5.5 0 0 1 1 0v1h4v-1a.5.5 0 0 1 .5-.5zM4 6v6h8V6H4zm2 2h4v1H6V8z",
                            },
                          ),
                        }),
                      },
                      {
                        id: "auto",
                        label: "自动发布",
                        icon: jsxRuntimeExports.jsx("svg", {
                          viewBox: "0 0 16 16",
                          fill: "currentColor",
                          width: "14",
                          height: "14",
                          children: jsxRuntimeExports.jsx(
                            "path",
                            {
                              d: "M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM6.5 5.5l4 2.5-4 2.5V5.5z",
                            },
                          ),
                        }),
                      },
                      // { id: 'draft', label: '存入草稿', icon: (
                      //   <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h7.586a1.5 1.5 0 0 1 1.06.44l1.415 1.414A1.5 1.5 0 0 1 14 3.914V13.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-11zm1.5-.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V4.121a.5.5 0 0 0-.146-.353L11.44 2.354A.5.5 0 0 0 11.086 2H10v2.5a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5V2H3.5zM6 2v2h4V2H6z"/></svg>
                      // )},
                    ].map((m) =>
                      jsxRuntimeExports.jsxs(
                        "button",
                        {
                          type: "button",
                          className: `publish-mode-chip${publishMode === m.id ? " publish-mode-chip--active" : ""}`,
                          onClick: () => setPublishMode(m.id),
                          children: [
                            jsxRuntimeExports.jsx("span", {
                              className: "publish-platform-chip-icon",
                              children: m.icon,
                            }),
                            jsxRuntimeExports.jsx("span", {
                              children: m.label,
                            }),
                          ],
                        },
                        m.id,
                      ),
                    ),
                  }),
                ],
              }),
              jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  jsxRuntimeExports.jsx("label", {
                    className: "video-label",
                    children: "发布平台",
                  }),
                  jsxRuntimeExports.jsx("div", {
                    className: "publish-platform-grid",
                    children: [
                      { id: "douyin", label: "抖音" },
                      { id: "bilibili", label: "B站" },
                      { id: "kuaishou", label: "快手" },
                      { id: "wechat", label: "视频号" },
                      { id: "redbook", label: "小红书" },
                    ].map((p) => {
                      const checked = publishPlatforms.includes(p.id);
                      return jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          className: `publish-platform-chip${checked ? " publish-platform-chip--active" : ""} publish-platform-chip--${p.id}`,
                          onClick: () => {
                            const prev = publishPlatforms;
                            if (checked)
                              setPublishPlatforms(
                                prev.filter((x) => x !== p.id),
                              );
                            else
                              setPublishPlatforms(
                                prev.includes(p.id) ? prev : [...prev, p.id],
                              );
                          },
                          children: p.label,
                        },
                        p.id,
                      );
                    }),
                  }),
                ],
              }),
              jsxRuntimeExports.jsx("div", {
                className: "video-form-group",
                children: jsxRuntimeExports.jsx("button", {
                  className: "video-button video-button-publish",
                  onClick: handlePublish,
                  disabled: isPublishing,
                  children: isPublishing ? "启动中..." : "发布",
                }),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
async function ensureAudioDuration(audioPath) {
  const res = await window.api.getLocalFileUrl(audioPath);
  if (!res.success || !res.url) throw new Error(res.error || "无法播放音频");
  const audio = new Audio(res.url);
  await new Promise((resolve, reject) => {
    const onLoaded = () => resolve();
    const onError = () => reject(new Error("音频元数据加载失败"));
    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    audio.addEventListener("error", onError, { once: true });
  });
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  return duration > 0 ? duration : 0;
}
async function ensureMinDuration(startTimeMs, minDurationMs) {
  const elapsed = Date.now() - startTimeMs;
  const remain = minDurationMs - elapsed;
  if (remain > 0) {
    await new Promise((resolve) => setTimeout(resolve, remain));
  }
}
function pickScriptForAutoFlow(state) {
  const translated = (state.translatedText || "").trim();
  const rewritten = (state.rewrittenScript || "").trim();
  const original = (state.originalScript || "").trim();
  if (state.showTranslatedInTextarea && translated)
    return { text: translated, language: state.sourceLanguage };
  if (rewritten) return { text: rewritten, language: state.sourceLanguage };
  return { text: original, language: state.sourceLanguage };
}
function AutoFlowBinder() {
  const showToast = useToast();
  const applyAllEffects = useApplyAllEffects();
  const { saveNewSnapshot } = useVideoGenerateHistory();
  useEffect(() => {
    useVideoPageStore.getState().setRunAutoFlow(async () => {
      const store = useVideoPageStore.getState();
      if (store.autoFlowRunning) return;
      const setStep = (step) => {
        useVideoPageStore.getState().setAutoFlowStep(step);
      };
      try {
        useVideoPageStore.getState().setAutoFlowRunning(true);
        setStep("audio");
        {
          const s = useVideoPageStore.getState();
          const { text: scriptContent, language: scriptLanguage } =
            pickScriptForAutoFlow(s);
          if (!scriptContent) throw new Error("音频生成失败：没有可用文案");
          const allVoices = [
            ...(s.uploadedVoices || []),
            ...(s.builtinVoices || []),
          ];
          if (allVoices.length === 0)
            throw new Error("音频生成失败：未找到任何音色");
          const voice = s.selectedVoiceId
            ? (allVoices.find((v) => v.id === s.selectedVoiceId) ??
              allVoices[0])
            : allVoices[0];
          const emotionPayload = resolveTtsEmotionForPlugin(
            s.ttsEmotion,
            s.ttsEmotionCustomText ?? "",
          );
          if (s.ttsEmotion === TTS_EMOTION_CUSTOM_VALUE && !emotionPayload) {
            throw new Error("音频生成失败：请填写情绪描述（最多8个字）");
          }
          const emotionWeight = Math.min(
            1,
            Math.max(0.1, Number(s.ttsEmotionWeight || 1)),
          );
          const ttsSpeed = Math.min(
            1.5,
            Math.max(0.8, Number(s.ttsAudioSpeed ?? 1)),
          );
          const audioUrl = await window.api.pluginProxyTts2Run({
            referenceAudioPath: voice.path,
            scriptContent,
            emotion: emotionPayload,
            emotionWeight,
          });
          const downloadResult = await window.api.downloadAudioFromUrl(
            audioUrl,
            {
              silenceSeconds: 1,
              audioSpeed: ttsSpeed,
            },
          );
          if (!downloadResult.success || !downloadResult.file_path)
            throw new Error(downloadResult.error || "下载音频失败");
          useVideoPageStore.getState().setWhisperSegments([]);
          useVideoPageStore
            .getState()
            .setGeneratedAudioPath(downloadResult.file_path);
          useVideoPageStore
            .getState()
            .setSubtitleText(
              splitSubtitleByLanguage(scriptContent, scriptLanguage),
            );
          const duration = await ensureAudioDuration(downloadResult.file_path);
          useVideoPageStore.getState().setAudioDuration(duration);
          try {
            const s2 = useVideoPageStore.getState();
            if (scriptContent) {
              const langName = getLanguageName(s2.sourceLanguage);
              const { systemPrompt, userPrompts } =
                await templateService.getParsedTemplate("title", {
                  langName,
                  scriptContent,
                });
              const messages = [
                { role: "system", content: systemPrompt },
                ...userPrompts.map((p) => ({ role: "user", content: p })),
              ];
              const data = await llmService.completion(
                s2.llmModel || "DeepSeek",
                messages,
                { temperature: 0.8, max_tokens: 500 },
              );
              const content = (data?.data || data)?.choices?.[0]?.message
                ?.content;
              if (content) {
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
              }
            }
          } catch {}
        }
        setStep("video");
        {
          const s = useVideoPageStore.getState();
          if (!s.generatedAudioPath)
            throw new Error("视频生成失败：请先生成音频");
          const allVideos = [
            ...(s.uploadedVideos || []),
            ...(s.builtinVideos || []),
          ];
          if (allVideos.length === 0)
            throw new Error("视频生成失败：未找到任何视频素材");
          const selectedVideo = s.selectedVideoMaterialId
            ? (allVideos.find((v) => v.id === s.selectedVideoMaterialId) ??
              allVideos[0])
            : allVideos[0];
          try {
            const stateForWhisper = useVideoPageStore.getState();
            const subtitleSeed = (
              stateForWhisper.subtitleText ||
              pickScriptForAutoFlow(stateForWhisper).text ||
              ""
            ).trim();
            if (subtitleSeed) {
              const segments = await fetchWhisperSegmentsFromCloud(
                stateForWhisper.generatedAudioPath,
                subtitleSeed,
              );
              console.log("Whisper 云端字词时间戳识别结果:", segments);
              useVideoPageStore.getState().setWhisperSegments(segments ?? []);
            } else {
              useVideoPageStore.getState().setWhisperSegments([]);
            }
          } catch (err) {
            console.log("Whisper 云端字词时间戳识别失败，将使用均分时间:", err);
            useVideoPageStore.getState().setWhisperSegments([]);
          }
          const videoUrl = await window.api.pluginProxyVideoJobRun({
            audioPath: s.generatedAudioPath,
            videoPath: selectedVideo.path,
          });
          const urlParts = String(videoUrl || "").split("/");
          const urlFileName = urlParts[urlParts.length - 1]?.split("?")[0];
          const fileName = urlFileName?.endsWith(".mp4")
            ? urlFileName
            : `generated_video_${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;
          const downloadResult = await window.api.downloadVideoFromUrl(
            videoUrl,
            fileName,
          );
          if (!downloadResult.success || !downloadResult.file_path)
            throw new Error(downloadResult.error || "下载视频失败");
          useVideoPageStore
            .getState()
            .setGeneratedVideoPath(downloadResult.file_path);
          useVideoPageStore
            .getState()
            .setFinalVideoPath(downloadResult.file_path);
          useVideoPageStore
            .getState()
            .setOriginalVideoPath(downloadResult.file_path);
          useVideoPageStore.getState().resetInsertedEffectsState();
          const preview = await window.api.getLocalFileUrl(
            downloadResult.file_path,
          );
          if (preview.success)
            useVideoPageStore
              .getState()
              .setGeneratedVideoPreview(preview.url || "");
        }
        setStep("insertTitle");
        {
          const s = useVideoPageStore.getState();
          const styles = s.builtinTitleStyles || [];
          if (styles.length === 0)
            throw new Error("插入标题失败：未加载到标题样式");
          if (!s.selectedTitleStyleId) {
          } else {
            const pickedStyle =
              styles.find((x) => x.id === s.selectedTitleStyleId) ?? styles[0];
            const mainTitleText = (s.mainTitle || s.viralTitle || "").trim();
            if (!mainTitleText) throw new Error("插入标题失败：主标题为空");
            useVideoPageStore.getState().setTitleEffectConfig({
              style: pickedStyle,
              mainTitleText,
              subTitleText: s.subTitle || "",
            });
            await applyAllEffects("title", { subtitle: true, bgm: true });
            const out = useVideoPageStore.getState().finalVideoPath;
            if (out) useVideoPageStore.getState().setOriginalVideoPath(out);
          }
        }
        setStep("subtitle");
        {
          const subtitleStepStart = Date.now();
          const s = useVideoPageStore.getState();
          if (!s.subtitleText.trim()) {
            const { text: scriptContent, language: scriptLang } =
              pickScriptForAutoFlow(s);
            useVideoPageStore
              .getState()
              .setSubtitleText(
                splitSubtitleByLanguage(scriptContent, scriptLang),
              );
          }
          useVideoPageStore.getState().setSubtitleEnabled(true);
          useVideoPageStore.getState().setSubtitleEffectConfig({
            text: useVideoPageStore.getState().subtitleText,
            font: s.subtitleFont || "黑体",
            fontSize: s.subtitleFontSize || 36,
            fontWeight: s.subtitleFontWeight || 400,
            color: s.subtitleColor || "#DE0202",
            strokeColor: s.subtitleStrokeColor || "#000000",
            bottomMargin:
              typeof s.subtitleBottomMargin === "number"
                ? s.subtitleBottomMargin
                : 240,
          });
          await ensureWhisperSegmentsIfNeeded();
          await applyAllEffects("subtitle", { title: true, bgm: true });
          await ensureMinDuration(subtitleStepStart, 5e3);
          const out = useVideoPageStore.getState().finalVideoPath;
          if (out) useVideoPageStore.getState().setOriginalVideoPath(out);
        }
        setStep("bgm");
        {
          const bgmStepStart = Date.now();
          const s = useVideoPageStore.getState();
          const allBgms = [...(s.uploadedBgms || []), ...(s.builtinBgms || [])];
          if (allBgms.length === 0)
            throw new Error("插入BGM失败：未找到任何背景音乐");
          const picked = s.selectedBgmId
            ? (allBgms.find((b) => b.id === s.selectedBgmId) ?? allBgms[0])
            : allBgms[0];
          useVideoPageStore.getState().setBgmEnabled(true);
          useVideoPageStore.getState().setBgmEffectConfig({
            selectedBgmId: picked.id,
            volume: DEFAULT_BGM_CARD_MUSIC_VOLUME,
            voiceVolume: DEFAULT_BGM_CARD_VOICE_VOLUME,
          });
          await applyAllEffects("bgm", { title: true, subtitle: true });
          await ensureMinDuration(bgmStepStart, 5e3);
          const out = useVideoPageStore.getState().finalVideoPath;
          if (out) useVideoPageStore.getState().setOriginalVideoPath(out);
        }
        {
          const out = useVideoPageStore.getState().generatedVideoPath;
          if (out) useVideoPageStore.getState().setOriginalVideoPath(out);
          const s = useVideoPageStore.getState();
          const originalVideoPath = s.generatedVideoPath || s.finalVideoPath;
          const generatedVideoPath = s.finalVideoPath || s.generatedVideoPath;
          if (originalVideoPath && generatedVideoPath) {
            await saveNewSnapshot({ originalVideoPath, generatedVideoPath });
          }
        }
        setStep("publish");
        {
          try {
            const sp = useVideoPageStore.getState();
            if (!(sp.viralTitle || "").trim() || !(sp.videoTags || "").trim()) {
              const { text: scriptContent } = pickScriptForAutoFlow(sp);
              if (scriptContent) {
                const langName = getLanguageName(sp.sourceLanguage);
                const { systemPrompt, userPrompts } =
                  await templateService.getParsedTemplate("title", {
                    langName,
                    scriptContent,
                  });
                const messages = [
                  { role: "system", content: systemPrompt },
                  ...userPrompts.map((p) => ({ role: "user", content: p })),
                ];
                const data = await llmService.completion(
                  sp.llmModel || "DeepSeek",
                  messages,
                  { temperature: 0.8, max_tokens: 500 },
                );
                const content = (data?.data || data)?.choices?.[0]?.message
                  ?.content;
                if (content) {
                  const parsed = (() => {
                    try {
                      return JSON.parse(content.trim());
                    } catch {
                      return null;
                    }
                  })();
                  const vTitle =
                    parsed?.viralTitle ||
                    content.match(/"viralTitle"\s*:\s*"([^"]+)"/)?.[1];
                  const vTags =
                    parsed?.videoTags ||
                    content.match(/"videoTags"\s*:\s*"([^"]+)"/)?.[1];
                  if (vTitle)
                    useVideoPageStore.getState().setViralTitle(vTitle);
                  if (vTags) useVideoPageStore.getState().setVideoTags(vTags);
                }
              }
            }
          } catch {}
          const s = useVideoPageStore.getState();
          const videoPath =
            s.finalVideoPath || s.generatedVideoPath || s.originalVideoPath;
          if (!videoPath) throw new Error("发布失败：未找到可发布的视频");
          if (!s.viralTitle.trim()) throw new Error("发布失败：爆款标题为空");
          if (!s.videoTags.trim()) throw new Error("发布失败：视频标签为空");
          if (!s.publishPlatforms.length)
            throw new Error("发布失败：请先选择至少一个发布平台");
          const payload = {
            videoPath,
            title: s.viralTitle.trim(),
            description: s.videoTags.trim(),
          };
          const results = await Promise.allSettled(
            s.publishPlatforms.map(async (platform) => ({
              platform,
              result: await window.api.browserRunPublishFlow(platform, payload),
            })),
          );
          for (const r of results) {
            if (r.status === "fulfilled") {
              const { platform, result } = r.value;
              if (result?.success && result?.message)
                showToast(result.message, "success");
              else if (result?.message) showToast(result.message, "info");
              else if (result?.success)
                showToast(`已启动发布：${platform}`, "success");
              else showToast(`发布失败：${platform}`, "error");
            } else {
              showToast(
                `发布失败：${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
                "error",
              );
            }
          }
        }
        setStep("done");
        showToast("一键处理完成", "success");
      } catch (e) {
        if (isUserCancelledPluginError(e)) {
          showToast("已取消", "success");
          useVideoPageStore.getState().setAutoFlowStep("idle");
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          useVideoPageStore.getState().setAutoFlowStep("error");
          showToast(msg, "error");
        }
      } finally {
        useVideoPageStore.getState().setAutoFlowRunning(false);
      }
    });
    return () => {
      useVideoPageStore.getState().setRunAutoFlow(null);
    };
  }, [applyAllEffects, showToast, saveNewSnapshot]);
  return null;
}