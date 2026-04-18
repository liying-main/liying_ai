import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom'
import { jsxRuntimeExports } from '../../utils/jsxRuntime'
import { useVideoPageStore } from '../../store/VideoPageStore'
import { useUserInfoStore } from '../../store/UserInfoStore'
import { useToast } from '../../hooks/useToast'
import { usePhoneModal } from '../../hooks/usePhoneModal'
import { AiLegalModal } from '../../components/AiLegalModal'
import { PhoneModal } from '../../components/PhoneModal'

// @ts-nocheck
/* eslint-disable */

export function VideoGenerateCard() {
  const showToast = useToast();
  const phoneModal = usePhoneModal(false);
  const autoFlowStep = useVideoPageStore((s) => s.autoFlowStep);
  const autoFlowRunning = useVideoPageStore((s) => s.autoFlowRunning);
  const flowMode = useVideoPageStore((s) => s.flowMode);
  const userInfo = useUserInfoStore((s) => s.userInfo);
  const {
    generatedAudioPath,
    generatedVideoPath,
    generatedVideoPreview,
    setGeneratedVideoPreview,
    setGeneratedVideoPath,
    setOriginalVideoPath,
    resetInsertedEffectsState,
    previewVideoRef,
    finalVideoPath,
    bgmedVideoPath,
    subtitledVideoPath,
    titledVideoPath,
    originalVideoPath,
    smartCutVideoPath,
    builtinVideos,
    uploadedVideos,
    setUploadedVideos,
    selectedVideoMaterialId,
    setSelectedVideoMaterialId,
  } = useVideoPageStore();
  const videoHistory = useVideoGenerateHistory();
  const videoMaterial = selectedVideoMaterialId;
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadText, setVideoUploadText] = useState("上传");
  const [isGeneratingVideo, setIsGeneratingVideo] =
    useState(false);
  const [generateVideoProgress, setGenerateVideoProgress] =
    useState(0);
  const generateVideoIntervalRef = useRef(null);
  const [isVideoQueuing, setIsVideoQueuing] = useState(false);
  const isVideoQueueingRef = useRef(false);
  const videoStartTimeRef = useRef(0);
  useEffect(() => {
    if (typeof window.api.onPluginProxyProgress !== "function") return;
    const off = window.api.onPluginProxyProgress((data) => {
      if (data.pluginName !== "plugin-proxy-video") return;
      if (data.type === "queue_waiting") {
        isVideoQueueingRef.current = true;
        setIsVideoQueuing(true);
      } else if (data.type === "queue_active" || data.type === "queue_done") {
        videoStartTimeRef.current = Date.now();
        isVideoQueueingRef.current = false;
        setIsVideoQueuing(false);
        setGenerateVideoProgress(0);
      }
    });
    return off;
  }, []);
  useEffect(() => {
    const all = [...uploadedVideos, ...builtinVideos];
    if (all.length === 0) return;
    const current = videoMaterial
      ? all.find((v) => v.id === videoMaterial)
      : null;
    if (!current) setSelectedVideoMaterialId(all[0].id);
  }, [
    builtinVideos,
    uploadedVideos,
    videoMaterial,
    setSelectedVideoMaterialId,
  ]);
  useEffect(() => {
    return () => {
      if (generateVideoIntervalRef.current)
        clearInterval(generateVideoIntervalRef.current);
    };
  }, []);
  const generatePreviewPath = generatedVideoPath || "";
  useEffect(() => {
    if (!generatePreviewPath) {
      setGeneratedVideoPreview("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await window.api.getLocalFileUrl(generatePreviewPath);
        if (!cancelled && res.success && res.url) {
          setGeneratedVideoPreview(res.url);
        } else if (!cancelled) {
          setGeneratedVideoPreview("");
        }
      } catch {
        if (!cancelled) setGeneratedVideoPreview("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generatePreviewPath, setGeneratedVideoPreview]);
  const handleLoadHistoryItem = async (item) => {
    await videoHistory.loadHistoryItem(item);
  };
  const handleDownloadPreviewVideo = async () => {
    const path =
      finalVideoPath ||
      smartCutVideoPath ||
      bgmedVideoPath ||
      subtitledVideoPath ||
      titledVideoPath ||
      generatedVideoPath ||
      originalVideoPath;
    if (!path) {
      showToast("无可下载的视频", "info");
      return;
    }
    const result = await window.api.saveLocalFileAs(path);
    if (result.canceled) return;
    if (result.success && result.filePath) showToast("视频已保存", "success");
    else showToast(result.error || "保存失败", "error");
  };
  const handleUploadVideoMaterial = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setVideoUploadText("上传");
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "mp4" && file.type !== "video/mp4") {
      showToast("只支持上传MP4格式的视频文案", "info");
      setVideoUploadText("上传");
      event.target.value = "";
      return;
    }
    setIsUploadingVideo(true);
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
            "temp/videos",
          );
          if (!saveResult.success || !saveResult.file_path) {
            showToast("保存视频文件失败", "error");
            setIsUploadingVideo(false);
            return;
          }
          const uploadResult = await window.api.uploadVideoMaterial(
            saveResult.file_path,
            file.name,
          );
          if (uploadResult.success && uploadResult.file_path) {
            const cfg = await window.api.loadUploadedVideosConfig();
            setUploadedVideos(cfg.videos ?? []);
            setSelectedVideoMaterialId(uploadResult.video_id || "");
          } else {
            showToast(`上传失败: ${uploadResult.error || "未知错误"}`, "error");
          }
        } catch (err) {
          console.error("Upload video error:", err);
          showToast(`上传失败: ${err.message || "未知错误"}`, "error");
        } finally {
          setIsUploadingVideo(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Read file error:", err);
      showToast(`上传失败: ${err.message || "未知错误"}`, "error");
      setIsUploadingVideo(false);
    }
    event.target.value = "";
  };
  const handleGenerateVideo = async () => {
    if (isGeneratingVideo) return;
    if (!generatedAudioPath) {
      showToast("请先生成音频（文案转音频", "info");
      return;
    }
    if (!videoMaterial) {
      showToast("请先选择视频素材", "info");
      return;
    }
    useVideoPageStore.getState().setWhisperSegments([]);
    setIsGeneratingVideo(true);
    setGenerateVideoProgress(0);
    setGeneratedVideoPreview("");
    videoStartTimeRef.current = Date.now();
    const estimatedDuration = 12e4;
    generateVideoIntervalRef.current = setInterval(() => {
      if (isVideoQueueingRef.current) return;
      const progress = Math.min(
        Math.round(
          ((Date.now() - videoStartTimeRef.current) / estimatedDuration) * 90,
        ),
        90,
      );
      setGenerateVideoProgress(progress);
    }, 200);
    const traceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (userInfo?.phone) {
      exceptionService.submitException({
        cardNum: userInfo.phone,
        feature: "video_generate",
        traceId,
        eventType: "start",
        exceptionInfo: "",
      });
    }
    try {
      const allVideos = [...uploadedVideos, ...builtinVideos];
      const selectedVideo = allVideos.find((v) => v.id === videoMaterial);
      if (!selectedVideo) throw new Error("未找到选择的视频素材");
      (() => {
        const storeState = useVideoPageStore.getState();
        const audioPath = storeState.generatedAudioPath;
        const subtitleText = storeState.subtitleText;
        if (audioPath && subtitleText && !storeState.whisperSegments?.length) {
          fetchWhisperSegmentsFromCloud(audioPath, subtitleText)
            .then((segs) => {
              if (segs.length)
                useVideoPageStore.getState().setWhisperSegments(segs);
            })
            .catch(() => {});
        }
      })();
      const videoUrl = await window.api.pluginProxyVideoJobRun({
        audioPath: generatedAudioPath,
        videoPath: selectedVideo.path,
      });
      const urlParts = videoUrl.split("/");
      const urlFileName = urlParts[urlParts.length - 1].split("?")[0];
      const fileName = urlFileName?.endsWith(".mp4")
        ? urlFileName
        : `generated_video_${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;
      console.log("开始下载视频", videoUrl);
      const downloadResult = await window.api.downloadVideoFromUrl(
        videoUrl,
        fileName,
      );
      if (downloadResult.success && downloadResult.file_path) {
        setGeneratedVideoPath(downloadResult.file_path);
        setOriginalVideoPath(downloadResult.file_path);
        resetInsertedEffectsState();
        await videoHistory.saveNewSnapshot({
          originalVideoPath: downloadResult.file_path,
          generatedVideoPath: downloadResult.file_path,
        });
      } else throw new Error(downloadResult.error || "下载视频失败");
      setGenerateVideoProgress(100);
      if (userInfo?.phone) {
        exceptionService.submitException({
          cardNum: userInfo.phone,
          feature: "video_generate",
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
      console.error("生成视频失败:", error);
      const err = error;
      if (err.message?.includes("fetch failed"))
        showToast("请联系客服人员，激活账号", "error");
      else showToast(`生成视频失败: ${err.message || "未知错误"}`, "error");
      if (userInfo?.phone) {
        exceptionService.submitException({
          cardNum: userInfo.phone,
          feature: "video_generate",
          traceId,
          eventType: "exception",
          exceptionInfo: JSON.stringify(error),
        });
      }
    } finally {
      isVideoQueueingRef.current = false;
      setIsVideoQueuing(false);
      setIsGeneratingVideo(false);
      if (generateVideoIntervalRef.current) {
        clearInterval(generateVideoIntervalRef.current);
        generateVideoIntervalRef.current = null;
      }
    }
  };
  const openPreview = () => phoneModal.openPhoneModal(generatedVideoPreview);
  const autoLoading =
    (autoFlowRunning &&
      (autoFlowStep === "video" || autoFlowStep === "insertTitle")) ||
    (flowMode === "manual" && isGeneratingVideo);
  return jsxRuntimeExports.jsxs(React.Fragment, {
    children: [
      jsxRuntimeExports.jsxs("div", {
        className: `video-card ${autoLoading ? "video-card-auto-loading" : ""}`,
        children: [
          jsxRuntimeExports.jsxs("div", {
            className: "video-card-header",
            children: [
              jsxRuntimeExports.jsx("span", {
                className: "video-card-number",
                children: "03",
              }),
              jsxRuntimeExports.jsx("span", {
                className: "video-card-title",
                children: "视频生成",
              }),
            ],
          }),
          jsxRuntimeExports.jsxs("div", {
            className: "video-card-body",
            children: [
              jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  jsxRuntimeExports.jsx("label", {
                    className: "video-label",
                    children: "视频素材",
                  }),
                  jsxRuntimeExports.jsxs("div", {
                    className: "video-select-upload-row",
                    children: [
                      jsxRuntimeExports.jsx("div", {
                        className: "video-select-upload-row__select",
                        children: jsxRuntimeExports.jsx(
                          VideoFirstFrameSelect,
                          {
                            value: videoMaterial,
                            onChange: setSelectedVideoMaterialId,
                            placeholder: "请选择素材",
                            showToast,
                            options: [...uploadedVideos, ...builtinVideos].map(
                              (v) => ({ id: v.id, name: v.name, path: v.path }),
                            ),
                          },
                        ),
                      }),
                      jsxRuntimeExports.jsx("div", {
                        className: "video-select-upload-row__upload",
                        children: jsxRuntimeExports.jsxs(
                          "div",
                          {
                            className: `video-file-input video-file-input-wrap ${isUploadingVideo ? "disabled" : ""}`,
                            children: [
                              jsxRuntimeExports.jsx("span", {
                                className: "video-file-input-text",
                                children: videoUploadText,
                              }),
                              jsxRuntimeExports.jsx("input", {
                                type: "file",
                                accept: "video/mp4,.mp4",
                                className: "video-file-input-real",
                                onChange: handleUploadVideoMaterial,
                                disabled: isUploadingVideo,
                              }),
                            ],
                          },
                        ),
                      }),
                    ],
                  }),
                  isUploadingVideo &&
                    jsxRuntimeExports.jsx("span", {
                      className: "video-hint",
                      children: "正在上传...",
                    }),
                ],
              }),
              jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  jsxRuntimeExports.jsx("button", {
                    onClick: handleGenerateVideo,
                    disabled: isGeneratingVideo,
                    className: "video-button video-button-primary",
                    children: isGeneratingVideo
                      ? isVideoQueuing
                        ? "排队中.."
                        : `生成中${generateVideoProgress}%`
                      : "生成视频",
                  }),
                  isGeneratingVideo &&
                    jsxRuntimeExports.jsx("div", {
                      className: "video-progress",
                      children: jsxRuntimeExports.jsx("div", {
                        className: "video-progress-bar",
                        style: {
                          width: `${isVideoQueuing ? 0 : generateVideoProgress}%`,
                        },
                      }),
                    }),
                ],
              }),
              jsxRuntimeExports.jsxs("div", {
                className: "video-form-group",
                children: [
                  jsxRuntimeExports.jsxs("div", {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                    children: [
                      jsxRuntimeExports.jsx("label", {
                        className: "video-label",
                        style: { flex: 1, marginBottom: 0 },
                        children: "视频预览",
                      }),
                      jsxRuntimeExports.jsx("button", {
                        type: "button",
                        onClick: () => videoHistory.setShowHistoryModal(true),
                        title: "查看历史视频",
                        "aria-label": "查看历史视频",
                        style: {
                          padding: "1.5px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "4px",
                          width: "17.59px",
                          height: "17.59px",
                          color: "var(--ly-text-2)",
                          transition: "background-color 0.2s, color 0.2s",
                        },
                        onMouseEnter: (e) => {
                          e.currentTarget.style.backgroundColor =
                            "var(--ly-primary-soft)";
                          e.currentTarget.style.color = "var(--ly-primary-2)";
                        },
                        onMouseLeave: (e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "var(--ly-text-2)";
                        },
                        children: jsxRuntimeExports.jsxs(
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
                              jsxRuntimeExports.jsx("circle", {
                                cx: "12",
                                cy: "12",
                                r: "10",
                              }),
                              jsxRuntimeExports.jsx(
                                "polyline",
                                { points: "12 6 12 12 16 14" },
                              ),
                            ],
                          },
                        ),
                      }),
                    ],
                  }),
                  jsxRuntimeExports.jsx("div", {
                    className:
                      "video-preview-box video-preview-box-generated video-preview-box-with-play",
                    children: generatedVideoPreview
                      ? jsxRuntimeExports.jsxs(
                          React.Fragment,
                          {
                            children: [
                              jsxRuntimeExports.jsx(
                                "video",
                                {
                                  ref: previewVideoRef,
                                  className: "video-preview-media",
                                  preload: "metadata",
                                  onClick: (e) => {
                                    e.preventDefault();
                                    openPreview();
                                  },
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "source",
                                      {
                                        src: generatedVideoPreview,
                                        type: "video/mp4",
                                      },
                                    ),
                                },
                                generatedVideoPreview,
                              ),
                              jsxRuntimeExports.jsx("button", {
                                type: "button",
                                onClick: (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleDownloadPreviewVideo();
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
                                onClick: openPreview,
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
                          children: "生成后的视频将显示在这里",
                        }),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      phoneModal.showPhoneModal &&
        phoneModal.phoneModalVideoSrc &&
        jsxRuntimeExports.jsx(PhoneModal, {
          ...phoneModal.phoneModalProps,
        }),
      videoHistory.showHistoryModal &&
        jsxRuntimeExports.jsx("div", {
          className: "video-history-overlay",
          onClick: () => videoHistory.setShowHistoryModal(false),
          children: jsxRuntimeExports.jsxs("div", {
            className: "video-history-modal",
            onClick: (e) => e.stopPropagation(),
            children: [
              jsxRuntimeExports.jsxs("div", {
                className: "video-history-header",
                children: [
                  jsxRuntimeExports.jsx("span", {
                    className: "video-history-title",
                    children: "历史视频",
                  }),
                  jsxRuntimeExports.jsx("button", {
                    type: "button",
                    className: "video-history-close",
                    onClick: () => videoHistory.setShowHistoryModal(false),
                    "aria-label": "关闭",
                    children: "×",
                  }),
                ],
              }),
              jsxRuntimeExports.jsx("div", {
                className: "video-history-list",
                children:
                  videoHistory.historyList.length === 0
                    ? jsxRuntimeExports.jsx("div", {
                        className: "video-history-empty",
                        children: "暂无历史记录，生成视频后将出现在这里",
                      })
                    : videoHistory.historyList.map((item) =>
                        jsxRuntimeExports.jsxs(
                          "button",
                          {
                            type: "button",
                            className: "video-history-item",
                            onClick: () => handleLoadHistoryItem(item),
                            children: [
                              jsxRuntimeExports.jsx("span", {
                                className: "video-history-item-label",
                                children: item.label || "未命名",
                              }),
                              jsxRuntimeExports.jsx("span", {
                                className: "video-history-item-date",
                                children: item.createdAt
                                  ? new Date(item.createdAt).toLocaleString(
                                      "zh-CN",
                                    )
                                  : "",
                              }),
                            ],
                          },
                          item.id ?? item.createdAt ?? item.label,
                        ),
                      ),
              }),
            ],
          }),
        }),
    ],
  });
}
const DEFAULT_BGM_CARD_VOICE_VOLUME = 2;
const DEFAULT_BGM_CARD_MUSIC_VOLUME = 0.6;
function computeLineSegmentsFromWhisper(
  whisperSegments,
  fullText,
  audioDuration,
) {
  const text = fullText.trim();
  if (!text || !audioDuration || audioDuration <= 0) return [];
  const sentences = text
    .split(/\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return [];
  const durationPerSentence = audioDuration / sentences.length;
  const wordsWithOffset = [];
  let charIdx = 0;
  for (const seg of whisperSegments) {
    if (seg.words?.length) {
      for (const w of seg.words) {
        const len = (w.word ?? "").length;
        wordsWithOffset.push({
          word: w.word,
          start: w.start,
          end: w.end,
          charStart: charIdx,
          charEnd: charIdx + len,
        });
        charIdx += len;
      }
    } else {
      const segText = (seg.text ?? "").trim();
      const len = segText.length;
      if (len > 0) {
        wordsWithOffset.push({
          word: segText,
          start: seg.start,
          end: seg.end,
          charStart: charIdx,
          charEnd: charIdx + len,
        });
        charIdx += len;
      }
    }
  }
  const whisperFullText = wordsWithOffset.map((w) => w.word).join("");
  const getTimeRangeForCharRange = (charStart, charEnd) => {
    const overlapping = wordsWithOffset.filter(
      (w) => w.charEnd > charStart && w.charStart < charEnd,
    );
    if (overlapping.length === 0) return null;
    return {
      start: Math.min(...overlapping.map((w) => w.start)),
      end: Math.max(...overlapping.map((w) => w.end)),
    };
  };
  const normToRaw = (normIdx, normText) => {
    let n = 0;
    for (const w of wordsWithOffset) {
      const wNorm = w.word.replace(/\s/g, "").length;
      if (n + wNorm > normIdx) return w.charStart + (normIdx - n);
      n += wNorm;
    }
    return normText.length;
  };
  const sentNormLengths = sentences.map((s) => s.replace(/\s/g, "").length);
  const totalSentNorm = sentNormLengths.reduce((a, b) => a + b, 0) || 1;
  const whisperNormText = whisperFullText.replace(/\s/g, "");
  const whisperNormLen = whisperNormText.length;
  const startTimes = [];
  const endTimes = [];
  for (let i = 0; i < sentences.length; i++) {
    let startTime;
    let endTime;
    if (
      whisperSegments.length > 0 &&
      wordsWithOffset.length > 0 &&
      whisperFullText.length > 0 &&
      whisperNormLen > 0
    ) {
      const prevNorm = sentNormLengths.slice(0, i).reduce((a, b) => a + b, 0);
      const sentNormLen = sentNormLengths[i];
      const ratioStart = prevNorm / totalSentNorm;
      const ratioEnd = (prevNorm + sentNormLen) / totalSentNorm;
      const normStart = Math.min(
        Math.floor(ratioStart * whisperNormLen),
        whisperNormLen - 1,
      );
      const normEnd = Math.min(
        Math.ceil(ratioEnd * whisperNormLen),
        whisperNormLen,
      );
      const charStart = normToRaw(normStart, whisperNormText);
      const charEnd = normToRaw(normEnd, whisperNormText);
      const range = getTimeRangeForCharRange(charStart, charEnd);
      if (range) {
        startTime = range.start;
        endTime = range.end;
      } else {
        const fallback = getTimeRangeForCharRange(charStart, charStart + 1);
        startTime = fallback?.start ?? i * durationPerSentence;
        endTime = fallback
          ? Math.min(fallback.end + 0.5, audioDuration)
          : Math.min((i + 1) * durationPerSentence, audioDuration);
      }
    } else if (whisperSegments.length > 0) {
      const base = whisperSegments[whisperSegments.length - 1].end;
      const extra = i - whisperSegments.length;
      const totalExtra = Math.max(1, sentences.length - whisperSegments.length);
      const extraDuration = Math.max(0, audioDuration - base) / totalExtra;
      startTime =
        i < whisperSegments.length
          ? whisperSegments[i].start
          : base + extra * extraDuration;
      endTime =
        i < whisperSegments.length
          ? whisperSegments[i].end
          : base + (extra + 1) * extraDuration;
    } else {
      startTime = i * durationPerSentence;
      endTime = Math.min((i + 1) * durationPerSentence, audioDuration);
    }
    startTimes.push(startTime);
    endTimes.push(endTime);
  }
  for (let i = 0; i < sentences.length - 1; i++) {
    if (endTimes[i] >= startTimes[i + 1]) {
      const mid = (endTimes[i] + startTimes[i + 1]) / 2;
      endTimes[i] = mid - 0.01;
      startTimes[i + 1] = mid + 0.01;
    }
  }
  return sentences.map((text2, i) => ({
    text: text2,
    start: startTimes[i],
    end: endTimes[i],
  }));
}
function useApplyAllEffects() {
  const showToast = useToast();
  return useCallback(
    async (triggeredBy, skip) => {
      const store = useVideoPageStore.getState();
      const {
        originalVideoPath,
        generatedVideoPath,
        smartCutBaseVideoPath,
        uploadedBgms,
        builtinBgms,
        subtitleEnabled,
        bgmEnabled,
        whisperSegments,
        generatedAudioPath,
        audioDuration,
        previewVideoRef,
        titleEffectConfig,
        subtitleEffectConfig,
        bgmEffectConfig,
        titleSegmentRange,
        setWhisperSegments,
      } = store;
      const baseVideoPath =
        smartCutBaseVideoPath || originalVideoPath || generatedVideoPath;
      if (!baseVideoPath) {
        showToast("请先生成视频或选择视频文件", "info");
        return;
      }
      const hasTitle =
        !skip?.title &&
        !!titleEffectConfig?.style &&
        !!titleEffectConfig?.mainTitleText;
      const skipSubtitle = skip ? skip.subtitle : !subtitleEnabled;
      const hasSubtitle =
        !skipSubtitle &&
        !!subtitleEffectConfig?.text?.trim() &&
        !!audioDuration &&
        audioDuration > 0;
      const skipBgm = skip ? skip.bgm : !bgmEnabled;
      const hasBgm = !skipBgm && !!bgmEffectConfig?.selectedBgmId;
      if (!hasSubtitle && !hasTitle && !hasBgm) {
        const base =
          smartCutBaseVideoPath || originalVideoPath || generatedVideoPath;
        if (base) {
          try {
            const result = await window.api.getLocalFileUrl(base);
            if (!result.success) throw new Error(result.error || "无法播放");
            store.setFinalVideoPath(base);
            if (previewVideoRef.current) previewVideoRef.current.load();
          } catch (_) {}
        }
        return;
      }
      store.setActiveProcessingType(triggeredBy);
      store.setProcessingProgress(0);
      try {
        let currentVideoPath = baseVideoPath;
        if (hasTitle && titleEffectConfig) {
          const currentTitleStyle = titleEffectConfig.style;
          const mainTitleText = titleEffectConfig.mainTitleText;
          const subTitleText = currentTitleStyle.hasSubTitle
            ? (titleEffectConfig.subTitleText ?? "")
            : void 0;
          store.setProcessingProgress(10);
          const mainTitleConfig = currentTitleStyle.mainTitle || {
            font: "黑体",
            fontSize: 48,
            fontWeight: 400,
            color: "#FFFFFF",
            strokeColor: "#000000",
            top: 100,
            borderRadius: 10,
            backgroundColor: "transparent",
          };
          const mainTitleResult = await generateTitleImage(
            mainTitleText,
            mainTitleConfig,
          );
          const mainTitleImageData = mainTitleResult.dataUrl;
          const mainTitleImageHeight = mainTitleResult.height;
          let subTitleImageData = void 0;
          if (currentTitleStyle.hasSubTitle && subTitleText) {
            const subTitleConfig = currentTitleStyle.subTitle || {
              font: "黑体",
              fontSize: 36,
              fontWeight: 400,
              color: "#FFFFFF",
              strokeColor: "#000000",
              top: 50,
              borderRadius: 10,
              backgroundColor: "transparent",
            };
            const subResult = await generateTitleImage(
              subTitleText,
              subTitleConfig,
            );
            subTitleImageData = subResult.dataUrl;
          }
          store.setProcessingProgress(30);
          const rangeOk =
            titleSegmentRange != null &&
            typeof titleSegmentRange.start === "number" &&
            typeof titleSegmentRange.end === "number" &&
            titleSegmentRange.start < titleSegmentRange.end;
          const titleResult = await window.api.addTitleToVideo(
            baseVideoPath,
            mainTitleImageData,
            subTitleImageData,
            {
              hasSubTitle: currentTitleStyle.hasSubTitle || false,
              mainTitle: currentTitleStyle.mainTitle,
              subTitle: currentTitleStyle.subTitle,
              mainTitleImageHeight,
              ...(rangeOk
                ? {
                    startTime: titleSegmentRange.start,
                    endTime: titleSegmentRange.end,
                  }
                : {}),
            },
          );
          if (!titleResult.success || !titleResult.file_path) {
            throw new Error(titleResult.error || "添加标题失败");
          }
          currentVideoPath = titleResult.file_path;
          store.setTitledVideoPath(titleResult.file_path);
          store.setProcessingProgress(40);
        }
        if (hasSubtitle) {
          const subCfg = subtitleEffectConfig;
          if (!subCfg) throw new Error("字幕配置缺失");
          store.setProcessingProgress(50);
          const subtitleInputPath = currentVideoPath;
          let effectiveWhisperSegments = whisperSegments;
          if (
            !effectiveWhisperSegments?.length &&
            generatedAudioPath &&
            subCfg.text?.trim()
          ) {
            try {
              store.setProcessingProgress(52);
              const segments = await fetchWhisperSegmentsFromCloud(
                generatedAudioPath,
                subCfg.text.trim(),
              );
              effectiveWhisperSegments = segments;
              setWhisperSegments(segments.length ? segments : []);
            } catch (err) {
              console.log("剪辑流程补齐 Whisper 字幕时间戳失败", err);
            }
          }
          const lineSegments = computeLineSegmentsFromWhisper(
            effectiveWhisperSegments,
            subCfg.text,
            audioDuration,
          );
          if (lineSegments.length > 0) {
            store.setProcessingProgress(55);
            store.setAlreadySubtitled(true);
            const subtitleResult = await window.api.addSubtitleToVideoCanvas(
              subtitleInputPath,
              {
                lineSegments: lineSegments.map((s) => {
                  const breakLen = subCfg.breakLength ?? 0;
                  let t = s.text;
                  if (breakLen > 0 && t.length >= breakLen) {
                    t = splitTextByBreakLength(t, breakLen).join("\n");
                  }
                  return { text: t, start: s.start, end: s.end };
                }),
                style: {
                  font: subCfg.font,
                  fontSize: subCfg.fontSize,
                  fontWeight: subCfg.fontWeight,
                  color: subCfg.color,
                  strokeEnabled: subCfg.strokeEnabled,
                  strokeWidth: subCfg.strokeWidth,
                  strokeColor: subCfg.strokeColor,
                  shadowEnabled: subCfg.shadowEnabled,
                  shadowColor: subCfg.shadowColor,
                  shadowOffsetX: subCfg.shadowOffsetX,
                  shadowOffsetY: subCfg.shadowOffsetY,
                  shadowBlur: subCfg.shadowBlur,
                  bgEnabled: subCfg.bgEnabled,
                  bgColor: subCfg.bgColor,
                  bgOpacity: subCfg.bgOpacity,
                  bgBorderRadius: subCfg.bgBorderRadius,
                  bgPaddingH: subCfg.bgPaddingH,
                  bgPaddingV: subCfg.bgPaddingV,
                },
                alignment: subCfg.alignment,
                posX: subCfg.posX ?? null,
                posY: subCfg.posY ?? null,
                bottomMargin: subCfg.bottomMargin,
                entranceEffect: subCfg.entranceEffect ?? "none",
              },
            );
            if (!subtitleResult.success || !subtitleResult.file_path)
              throw new Error(subtitleResult.error || "添加字幕失败");
            currentVideoPath = subtitleResult.file_path;
            store.setSubtitledVideoPath(subtitleResult.file_path);
            store.setProcessingProgress(80);
          }
        }
        if (hasBgm) {
          store.setAlreadyBgmAdded(true);
          const bCfg = bgmEffectConfig;
          if (!bCfg) throw new Error("BGM配置缺失");
          store.setProcessingProgress(85);
          const bgmInputPath = currentVideoPath;
          const allBgms = [...uploadedBgms, ...builtinBgms];
          const selectedBgmItem = allBgms.find(
            (b) => b.id === bCfg.selectedBgmId,
          );
          if (selectedBgmItem) {
            const voiceVol =
              typeof bCfg.voiceVolume === "number" &&
              Number.isFinite(bCfg.voiceVolume)
                ? bCfg.voiceVolume
                : DEFAULT_BGM_CARD_VOICE_VOLUME;
            const bgmResult = await window.api.addBgmToVideo(
              bgmInputPath,
              selectedBgmItem.path,
              bCfg.volume,
              {
                voiceVolume: voiceVol,
              },
            );
            if (!bgmResult.success || !bgmResult.file_path)
              throw new Error(bgmResult.error || "添加BGM失败");
            currentVideoPath = bgmResult.file_path;
            store.setBgmedVideoPath(bgmResult.file_path);
          }
          store.setProcessingProgress(90);
        }
        store.setProcessingProgress(95);
        const result = await window.api.getLocalFileUrl(currentVideoPath);
        if (!result.success) throw new Error(result.error || "无法播放");
        store.setFinalVideoPath(currentVideoPath);
        store.setProcessingProgress(100);
        if (previewVideoRef.current) previewVideoRef.current.load();
        showToast("效果已应用成功！", "success");
      } catch (error) {
        const err = error;
        console.error("应用效果失败:", err);
        showToast(`应用效果失败: ${err.message || "未知错误"}`, "error");
      } finally {
        store.setActiveProcessingType(null);
        store.setProcessingProgress(0);
      }
    },
    [showToast],
  );
}
function BgmGroupedPreviewSelect(props) {
  const {
    value,
    onChange,
    groups,
    placeholder = "请选择音乐",
    disabled = false,
    className = "",
    previewVolume = 0.9,
    showToast,
  } = props;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const audioRef = useRef(null);
  const urlCacheByPathRef = useRef(new Map());
  const [isOpen, setIsOpen] = useState(false);
  const [menuView, setMenuView] = useState("categories");
  const [activeCategory, setActiveCategory] = useState("");
  const [previewingId, setPreviewingId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [menuDirection, setMenuDirection] = useState("down");
  const [anchorRect, setAnchorRect] = useState(null);
  const flatAll = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups],
  );
  const selected = useMemo(
    () => flatAll.find((o) => o.id === value) || null,
    [flatAll, value],
  );
  const activeItems = useMemo(
    () => groups.find((g) => g.category === activeCategory)?.items ?? [],
    [groups, activeCategory],
  );
  const openMenu = () => {
    if (disabled) return;
    setMenuView("categories");
    setActiveCategory("");
    setIsOpen(true);
  };
  const closeMenu = () => setIsOpen(false);
  const clearSelection = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPreviewingId(null);
    setIsPlaying(false);
    onChange("");
  };
  useEffect(() => {
    const onPointerDown = (e) => {
      if (!isOpen) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
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
  }, [isOpen, groups.length]);
  const menuPositionStyle = useMemo(() => {
    if (!anchorRect) return {};
    const left = anchorRect.left;
    const width = anchorRect.width;
    if (menuDirection === "up") {
      return { left, width, bottom: window.innerHeight - anchorRect.top + 4 };
    }
    return { left, width, top: anchorRect.bottom + 4 };
  }, [anchorRect, menuDirection]);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      const cache = urlCacheByPathRef.current;
      for (const opt of flatAll) {
        if (cancelled) return;
        if (!opt.path || cache.has(opt.path)) continue;
        try {
          const res = await window.api.getLocalFileUrl(opt.path);
          if (res.success && res.url) cache.set(opt.path, res.url);
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, flatAll]);
  const ensurePreviewUrl = async (opt) => {
    const cache = urlCacheByPathRef.current;
    const hit = cache.get(opt.path);
    if (hit) return hit;
    const res = await window.api.getLocalFileUrl(opt.path);
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
      a.play().catch((err) => {
        showToast?.(
          err?.message ? `播放失败: ${err.message}` : "播放失败",
          "error",
        );
      });
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
  const enterCategory = (cat) => {
    const g = groups.find((x) => x.category === cat);
    if (!g?.items.length) return;
    setActiveCategory(cat);
    setMenuView("tracks");
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
        "aria-disabled": disabled,
        onClick: () => (isOpen ? closeMenu() : openMenu()),
        onKeyDown: (e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ")
            isOpen ? closeMenu() : openMenu();
          if (e.key === "Escape") closeMenu();
        },
        children: [
          jsxRuntimeExports.jsx("span", {
            className: "audio-preview-select-play-inline",
            children: selected
              ? jsxRuntimeExports.jsx("button", {
                  type: "button",
                  className: "audio-preview-select-play-btn",
                  onClick: (e) => {
                    e.stopPropagation();
                    void togglePlay(selected);
                  },
                  "aria-label": "播放/暂停当前选择",
                  disabled,
                  children:
                    previewingId === selected.id && isPlaying
                      ? jsxRuntimeExports.jsxs("svg", {
                          width: "16",
                          height: "16",
                          viewBox: "0 0 16 16",
                          fill: "currentColor",
                          children: [
                            jsxRuntimeExports.jsx("rect", {
                              x: "4",
                              y: "3",
                              width: "3",
                              height: "10",
                              rx: "1",
                            }),
                            jsxRuntimeExports.jsx("rect", {
                              x: "9",
                              y: "3",
                              width: "3",
                              height: "10",
                              rx: "1",
                            }),
                          ],
                        })
                      : jsxRuntimeExports.jsx("svg", {
                          width: "16",
                          height: "16",
                          viewBox: "0 0 16 16",
                          fill: "currentColor",
                          children: jsxRuntimeExports.jsx(
                            "path",
                            { d: "M6 4.2V11.8L12 8L6 4.2Z" },
                          ),
                        }),
                })
              : null,
          }),
          jsxRuntimeExports.jsx("span", {
            className: "audio-preview-select-text",
            children: selected ? selected.name : placeholder,
          }),
          selected && !disabled
            ? jsxRuntimeExports.jsx("button", {
                type: "button",
                "aria-label": "清空选择",
                title: "清空",
                onClick: (e) => {
                  e.stopPropagation();
                  clearSelection();
                },
                style: {
                  padding: 4,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                  transition: "background-color 0.2s, color 0.2s",
                  width: 26,
                  height: 26,
                  minWidth: 26,
                  minHeight: 26,
                  color: "var(--ly-text-2)",
                },
                onMouseEnter: (e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--ly-primary-soft)";
                  e.currentTarget.style.color = "var(--ly-primary-2)";
                },
                onMouseLeave: (e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--ly-text-2)";
                },
                children: jsxRuntimeExports.jsxs("svg", {
                  width: "13",
                  height: "13",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: "2",
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  "aria-hidden": true,
                  children: [
                    jsxRuntimeExports.jsx("line", {
                      x1: "18",
                      y1: "6",
                      x2: "6",
                      y2: "18",
                    }),
                    jsxRuntimeExports.jsx("line", {
                      x1: "6",
                      y1: "6",
                      x2: "18",
                      y2: "18",
                    }),
                  ],
                }),
              })
            : null,
          jsxRuntimeExports.jsx("span", {
            className: "audio-preview-select-caret",
          }),
        ],
      }),
      isOpen
        ? ReactDOM.createPortal(
            jsxRuntimeExports.jsx("div", {
              ref: menuRef,
              className: "audio-preview-select-menu",
              style: menuPositionStyle,
              children:
                menuView === "categories"
                  ? groups.length
                    ? groups.map((g) =>
                        jsxRuntimeExports.jsxs(
                          "div",
                          {
                            className:
                              "audio-preview-select-item audio-preview-select-category-row",
                            role: "option",
                            onClick: () => enterCategory(g.category),
                            children: [
                              jsxRuntimeExports.jsxs("span", {
                                className: "audio-preview-select-item-name",
                                children: [
                                  g.category,
                                  jsxRuntimeExports.jsxs(
                                    "span",
                                    {
                                      className:
                                        "audio-preview-select-category-count",
                                      children: ["�?, g.items.length, "�?],
                                    },
                                  ),
                                ],
                              }),
                              jsxRuntimeExports.jsx("span", {
                                className:
                                  "audio-preview-select-category-chevron",
                                "aria-hidden": true,
                                children: "�?,
                              }),
                            ],
                          },
                          g.category,
                        ),
                      )
                    : jsxRuntimeExports.jsx("div", {
                        className: "audio-preview-select-empty",
                        children: "暂无背景音乐",
                      })
                  : jsxRuntimeExports.jsxs(
                      React.Fragment,
                      {
                        children: [
                          jsxRuntimeExports.jsxs("button", {
                            type: "button",
                            className: "audio-preview-select-back",
                            onClick: () => {
                              setMenuView("categories");
                              setActiveCategory("");
                            },
                            children: [
                              jsxRuntimeExports.jsx("span", {
                                className: "audio-preview-select-back-arrow",
                                "aria-hidden": true,
                                children: "�?,
                              }),
                              "返回分类",
                            ],
                          }),
                          jsxRuntimeExports.jsx("div", {
                            className: "audio-preview-select-tracks-header",
                            children: activeCategory,
                          }),
                          activeItems.length
                            ? activeItems.map((opt) => {
                                const isSelected = opt.id === value;
                                const isOptPlaying =
                                  previewingId === opt.id && isPlaying;
                                return jsxRuntimeExports.jsxs(
                                  "div",
                                  {
                                    className: `audio-preview-select-item ${isSelected ? "selected" : ""}`,
                                    role: "option",
                                    "aria-selected": isSelected,
                                    onClick: () => {
                                      if (disabled) return;
                                      onChange(opt.id);
                                      closeMenu();
                                    },
                                    children: [
                                      jsxRuntimeExports.jsx(
                                        "button",
                                        {
                                          type: "button",
                                          className:
                                            "audio-preview-select-play-btn item-play",
                                          onClick: (e) => {
                                            e.stopPropagation();
                                            void togglePlay(opt);
                                          },
                                          "aria-label": `播放 ${opt.name}`,
                                          disabled,
                                          children: isOptPlaying
                                            ? jsxRuntimeExports.jsxs(
                                                "svg",
                                                {
                                                  width: "16",
                                                  height: "16",
                                                  viewBox: "0 0 16 16",
                                                  fill: "currentColor",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "rect",
                                                      {
                                                        x: "4",
                                                        y: "3",
                                                        width: "3",
                                                        height: "10",
                                                        rx: "1",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "rect",
                                                      {
                                                        x: "9",
                                                        y: "3",
                                                        width: "3",
                                                        height: "10",
                                                        rx: "1",
                                                      },
                                                    ),
                                                  ],
                                                },
                                              )
                                            : jsxRuntimeExports.jsx(
                                                "svg",
                                                {
                                                  width: "16",
                                                  height: "16",
                                                  viewBox: "0 0 16 16",
                                                  fill: "currentColor",
                                                  children:
                                                    jsxRuntimeExports.jsx(
                                                      "path",
                                                      {
                                                        d: "M6 4.2V11.8L12 8L6 4.2Z",
                                                      },
                                                    ),
                                                },
                                              ),
                                        },
                                      ),
                                      jsxRuntimeExports.jsx(
                                        "span",
                                        {
                                          className:
                                            "audio-preview-select-item-name",
                                          children: opt.name,
                                        },
                                      ),
                                    ],
                                  },
                                  opt.id,
                                );
                              })
                            : jsxRuntimeExports.jsx("div", {
                                className: "audio-preview-select-empty",
                                children: "该分类下暂无曲目",
                              }),
                        ],
                      },
                    ),
            }),
            document.body,
          )
        : null,
      jsxRuntimeExports.jsx("audio", {
        ref: audioRef,
        className: "audio-preview-select-audio",
        preload: "metadata",
        onPlay: () => setIsPlaying(true),
        onPause: () => setIsPlaying(false),
        onEnded: () => setIsPlaying(false),
        onError: () => {
          setIsPlaying(false);
          showToast?.("音频播放失败", "error");
        },
      }),
    ],
  });
}
function normalizeNewCategoryName(raw) {
  return raw.replace(/[\r\n\\/]/g, "").trim();
}
function BgmUploadCategoryModal(props) {
  const {
    open,
    onClose,
    categories,
    onConfirmPickFile,
    title = "选择分类",
    showToast,
  } = props;
  const [selected, setSelected] = useState("");
  const [extraCategories, setExtraCategories] = useState([]);
  const [newNameDraft, setNewNameDraft] = useState("");
  const listRef = useRef(null);
  const allChoices = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of [...categories, ...extraCategories]) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  }, [categories, extraCategories]);
  useEffect(() => {
    if (!open) return;
    setExtraCategories([]);
    setNewNameDraft("");
    const first = categories[0] ?? "";
    setSelected(first);
  }, [open, categories]);
  if (!open) return null;
  const addNewAndSelect = () => {
    const name = normalizeNewCategoryName(newNameDraft);
    if (!name) {
      showToast?.("请输入分类名称", "info");
      return;
    }
    if (name.length > 24) return;
    const exists = allChoices.some((c) => c === name);
    if (!exists) {
      setExtraCategories((prev) =>
        prev.includes(name) ? prev : [...prev, name],
      );
      requestAnimationFrame(() => {
        const listEl = listRef.current;
        if (!listEl) return;
        listEl.scrollTo({ top: listEl.scrollHeight, behavior: "smooth" });
      });
    }
    setSelected(name);
    setNewNameDraft("");
  };
  const handleNext = () => {
    const cat = selected.trim();
    if (!cat) return;
    onConfirmPickFile(cat);
  };
  return ReactDOM.createPortal(
    jsxRuntimeExports.jsx("div", {
      className: "bgm-upload-cat-overlay",
      role: "presentation",
      onClick: (e) => {
        if (e.target === e.currentTarget) onClose();
      },
      children: jsxRuntimeExports.jsxs("div", {
        className: "bgm-upload-cat-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "bgm-upload-cat-title",
        onClick: (e) => e.stopPropagation(),
        children: [
          jsxRuntimeExports.jsx("button", {
            type: "button",
            className: "bgm-upload-cat-close",
            onClick: onClose,
            "aria-label": "关闭",
            children: jsxRuntimeExports.jsxs("svg", {
              width: "16",
              height: "16",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [
                jsxRuntimeExports.jsx("line", {
                  x1: "18",
                  y1: "6",
                  x2: "6",
                  y2: "18",
                }),
                jsxRuntimeExports.jsx("line", {
                  x1: "6",
                  y1: "6",
                  x2: "18",
                  y2: "18",
                }),
              ],
            }),
          }),
          jsxRuntimeExports.jsx("h2", {
            id: "bgm-upload-cat-title",
            className: "bgm-upload-cat-title",
            children: title,
          }),
          jsxRuntimeExports.jsx("p", {
            className: "bgm-upload-cat-hint",
            children:
              "请先选择或新建分类，再选择要上传的音频文件（WAV / MP3 / M4A）�?,
          }),
          jsxRuntimeExports.jsx("div", {
            ref: listRef,
            className: "bgm-upload-cat-list",
            role: "radiogroup",
            "aria-label": "分类",
            children:
              allChoices.length === 0
                ? jsxRuntimeExports.jsx("p", {
                    className: "bgm-upload-cat-hint",
                    style: { margin: 0 },
                    children: "暂无预设分类，请在下方新建分类",
                  })
                : allChoices.map((c) =>
                    jsxRuntimeExports.jsxs(
                      "label",
                      {
                        className: `bgm-upload-cat-row ${selected === c ? "selected" : ""}`,
                        children: [
                          jsxRuntimeExports.jsx("input", {
                            type: "radio",
                            name: "bgm-upload-category",
                            checked: selected === c,
                            onChange: () => setSelected(c),
                          }),
                          jsxRuntimeExports.jsx("span", {
                            children: c,
                          }),
                        ],
                      },
                      c,
                    ),
                  ),
          }),
          jsxRuntimeExports.jsxs("div", {
            className: "bgm-upload-cat-new",
            children: [
              jsxRuntimeExports.jsx("span", {
                className: "bgm-upload-cat-new-label",
                children: "新建分类",
              }),
              jsxRuntimeExports.jsxs("div", {
                className: "bgm-upload-cat-new-row",
                children: [
                  jsxRuntimeExports.jsx("input", {
                    type: "text",
                    value: newNameDraft,
                    maxLength: 24,
                    placeholder: "输入新分类名称",
                    onChange: (e) => setNewNameDraft(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addNewAndSelect();
                      }
                    },
                  }),
                  jsxRuntimeExports.jsx("button", {
                    type: "button",
                    className: "video-button video-button-outline",
                    onClick: addNewAndSelect,
                    children: "添加",
                  }),
                ],
              }),
            ],
          }),
          jsxRuntimeExports.jsxs("div", {
            className: "bgm-upload-cat-actions",
            children: [
              jsxRuntimeExports.jsx("button", {
                type: "button",
                className: "video-button video-button-outline",
                onClick: onClose,
                children: "取消",
              }),
              jsxRuntimeExports.jsx("button", {
                type: "button",
                className: "video-button video-button-primary",
                onClick: handleNext,
                disabled: !selected.trim(),
                children: "下一步",
              }),
            ],
          }),
        ],
      }),
    }),
    document.body,
  );
}
const BGM_CATEGORY_PRESETS = [
  "营销",
  "新闻",
  "知识科普",
  "情感",
  "禅意",
  "通用",
  "内置",
];
function normalizeBgmCategory(b) {
  return b.category?.trim() ? b.category.trim() : "推荐";
}
function orderedBgmCategoryList(categories) {
  const presetOrder = BGM_CATEGORY_PRESETS;
  const rest = [...categories]
    .filter((c) => !presetOrder.includes(c))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  return [...presetOrder.filter((c) => categories.has(c)), ...rest];
}
function getUploadCategoryCandidates(allBgms) {
  const fromData = new Set(allBgms.map(normalizeBgmCategory));
  const presets = BGM_CATEGORY_PRESETS.filter((c) => c !== "内置");
  const merged = new Set([...presets, ...fromData]);
  return orderedBgmCategoryList(merged);
}
const REF_W = 720;
const REF_H = 1280;
function getEntranceDuration(effect) {
  switch (effect) {
    case "fade":
      return 0.3;
    case "slide_up":
      return 0.4;
    case "typewriter":
      return 0.6;
    case "pop":
      return 0.2;
    default:
      return 0;
  }
}
const EXIT_DURATION = 0.2;
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "").padEnd(6, "0");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function fillRoundedRect(ctx, x, y, w, h, r) {
  if (r <= 0) {
    ctx.fillRect(x, y, w, h);
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}
function strokeTextMultiDir(ctx, text, x, y, strokeWidth, strokeColor) {
  if (strokeWidth <= 0) return;
  ctx.save();
  ctx.fillStyle = strokeColor;
  const offsets = strokeWidth;
  for (let ox = -offsets; ox <= offsets; ox += offsets) {
    for (let oy = -offsets; oy <= offsets; oy += offsets) {
      if (ox === 0 && oy === 0) continue;
      ctx.fillText(text, x + ox, y + oy);
    }
  }
  ctx.restore();
}
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function renderSubtitleFrame(ctx, state) {
  const {
    text,
    style,
    canvasWidth,
    canvasHeight,
    entranceEffect,
    entranceProgress,
    exitProgress,
  } = state;
  if (!text) return;
  const scaleX = canvasWidth / REF_W;
  const scaleY = canvasHeight / REF_H;
  const scale = Math.min(scaleX, scaleY);
  const fontSize = style.fontSize * scale;
  const fontStr = `${style.fontWeight} ${fontSize}px "${style.font}"`;
  const lineHeight = fontSize * 1.3;
  const chars = [...text];
  let visibleText;
  if (entranceEffect === "typewriter" && entranceProgress < 1) {
    const visibleCount = Math.ceil(
      easeOutCubic(entranceProgress) * chars.length,
    );
    visibleText = chars.slice(0, visibleCount).join("");
  } else {
    visibleText = text;
  }
  if (!visibleText) return;
  const lines = visibleText.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return;
  ctx.font = fontStr;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let maxW = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }
  const textTotalHeight = lines.length * lineHeight;
  const padH = (style.bgEnabled ? (style.bgPaddingH ?? 6) : 0) * scale;
  const padV = (style.bgEnabled ? (style.bgPaddingV ?? 2) : 0) * scale;
  const boxWidth = maxW + padH * 2;
  const boxHeight = textTotalHeight + padV * 2;
  let centerX;
  let centerY;
  if (state.posX != null && state.posY != null) {
    centerX = state.posX * scaleX;
    centerY = state.posY * scaleY;
  } else {
    const alignment = state.alignment ?? 2;
    const col = alignment % 3;
    if (col === 1) centerX = canvasWidth * 0.05 + boxWidth / 2;
    else if (col === 0) centerX = canvasWidth * 0.95 - boxWidth / 2;
    else centerX = canvasWidth / 2;
    const row = alignment <= 3 ? "bottom" : alignment <= 6 ? "middle" : "top";
    const margin = state.bottomMargin * scaleY;
    if (row === "bottom") centerY = canvasHeight - margin - boxHeight / 2;
    else if (row === "top") centerY = margin + boxHeight / 2;
    else centerY = canvasHeight / 2;
  }
  ctx.save();
  let alpha = 1;
  if (exitProgress > 0) {
    alpha *= 1 - easeOutCubic(exitProgress);
  }
  switch (entranceEffect) {
    case "fade":
      alpha *= easeOutCubic(entranceProgress);
      break;
    case "slide_up": {
      const slideDistance = 80 * scaleY;
      const offset = (1 - easeOutCubic(entranceProgress)) * slideDistance;
      centerY += offset;
      alpha *= easeOutCubic(entranceProgress);
      break;
    }
    case "pop": {
      const s = easeOutBack(Math.min(1, entranceProgress));
      ctx.translate(centerX, centerY);
      ctx.scale(s, s);
      ctx.translate(-centerX, -centerY);
      alpha *= Math.min(1, entranceProgress * 3);
      break;
    }
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  if (style.bgEnabled) {
    const bgOpacity = (style.bgOpacity ?? 50) / 100;
    const bgColor = style.bgColor || "#000000";
    const bgRadius = (style.bgBorderRadius ?? 0) * scale;
    ctx.fillStyle = hexToRgba(bgColor, bgOpacity * ctx.globalAlpha);
    const savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = 1;
    fillRoundedRect(
      ctx,
      centerX - boxWidth / 2,
      centerY - boxHeight / 2,
      boxWidth,
      boxHeight,
      bgRadius,
    );
    ctx.globalAlpha = savedAlpha;
  }
  const strokeEnabled =
    style.strokeEnabled !== false && (style.strokeWidth ?? 2) > 0;
  const startY = centerY - textTotalHeight / 2 + lineHeight / 2;
  for (let li = 0; li < lines.length; li++) {
    const lineY = startY + li * lineHeight;
    if (style.shadowEnabled) {
      ctx.shadowColor = style.shadowColor || "#000000";
      ctx.shadowOffsetX = (style.shadowOffsetX ?? 2) * scale;
      ctx.shadowOffsetY = (style.shadowOffsetY ?? 2) * scale;
      ctx.shadowBlur = (style.shadowBlur ?? 0) * scale;
    }
    if (strokeEnabled) {
      ctx.shadowColor = "transparent";
      strokeTextMultiDir(
        ctx,
        lines[li],
        centerX,
        lineY,
        (style.strokeWidth ?? 2) * scale,
        style.strokeColor || "#000000",
      );
      if (style.shadowEnabled) {
        ctx.shadowColor = style.shadowColor || "#000000";
        ctx.shadowOffsetX = (style.shadowOffsetX ?? 2) * scale;
        ctx.shadowOffsetY = (style.shadowOffsetY ?? 2) * scale;
        ctx.shadowBlur = (style.shadowBlur ?? 0) * scale;
      }
    }
    ctx.fillStyle = style.color || "#FFFFFF";
    ctx.fillText(lines[li], centerX, lineY);
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();
}
const defaultMainTitleConfig = {
  font: "黑体",
  fontSize: 48,
  fontWeight: 400,
  color: "#FFFFFF",
  strokeColor: "#000000",
  top: 100,
  borderRadius: 10,
  backgroundColor: "transparent",
};
const defaultSubTitleConfig = {
  font: "黑体",
  fontSize: 36,
  fontWeight: 400,
  color: "#FFFFFF",
  strokeColor: "#000000",
  top: 50,
  borderRadius: 10,
  backgroundColor: "transparent",
};
function getTitleLines(text, breakLength) {
  const oneLine = text.replace(/\n/g, " ").trim();
  if (breakLength != null && oneLine.length >= breakLength) {
    return splitTextByBreakLength(oneLine, breakLength);
  }
  const byNewline = text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byNewline.length > 2) return byNewline.slice(0, 2);
  if (byNewline.length > 0) return byNewline;
  return [oneLine || text];
}
function renderStaticSubtitle(canvas, subtitleEffect, text) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cw = rect.width * dpr;
  const ch = rect.height * dpr;
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      bgEnabled: subtitleEffect.bgEnabled,
      bgColor: subtitleEffect.bgColor,
      bgOpacity: subtitleEffect.bgOpacity,
    },
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    posX: null,
    posY: null,
    alignment: 2,
    bottomMargin: subtitleEffect.bottomMargin ?? 60,
    entranceEffect: "none",
    entranceProgress: 1,
    exitProgress: 0,
  });
}
function ThemeTemplatePreviewCard({
  style,
  isSelected,
  onClick,
  videoUrl,
  imageUrl,
  mainTitleText,
  subTitleText,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const isHoveredRef = useRef(false);
  const staticRenderedRef = useRef(false);
  const mainTitleConfig = style.mainTitle || defaultMainTitleConfig;
  const subTitleConfig = style.subTitle || defaultSubTitleConfig;
  const subtitleEffect = style.subtitleEffect;
  const isBlank = style.id === "";
  const displayMainTitle = style.previewTitle || mainTitleText;
  const displaySubTitle = style.previewSubtitle || subTitleText;
  const captions =
    style.previewCaptions && style.previewCaptions.length > 0
      ? style.previewCaptions
      : ["示例字幕文字"];
  const CAPTION_DURATION = 3;
  useEffect(() => {
    if (isBlank || !subtitleEffect || !canvasRef.current) return;
    const raf = requestAnimationFrame(() => {
      if (!isHoveredRef.current && canvasRef.current) {
        renderStaticSubtitle(canvasRef.current, subtitleEffect, captions[0]);
        staticRenderedRef.current = true;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isBlank, subtitleEffect]);
  const startAnimation = useCallback(() => {
    if (!canvasRef.current || !subtitleEffect) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const entranceEffect = subtitleEffect.entranceEffect || "none";
    const entranceDuration = getEntranceDuration(entranceEffect);
    const animate = () => {
      if (!isHoveredRef.current) return;
      const video = videoRef.current;
      const currentTime = video ? video.currentTime : 0;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cw = rect.width * dpr;
      const ch = rect.height * dpr;
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const captionIndex =
        Math.floor(currentTime / CAPTION_DURATION) % captions.length;
      const elapsed =
        currentTime -
        Math.floor(currentTime / CAPTION_DURATION) * CAPTION_DURATION;
      let entranceProgress = 1;
      if (entranceDuration > 0 && elapsed < entranceDuration) {
        entranceProgress = Math.min(1, elapsed / entranceDuration);
      }
      renderSubtitleFrame(ctx, {
        text: captions[captionIndex],
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
          bgEnabled: subtitleEffect.bgEnabled,
          bgColor: subtitleEffect.bgColor,
          bgOpacity: subtitleEffect.bgOpacity,
        },
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        posX: null,
        posY: null,
        alignment: 2,
        bottomMargin: subtitleEffect.bottomMargin ?? 60,
        entranceEffect,
        entranceProgress,
        exitProgress: 0,
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
  }, [subtitleEffect, captions]);
  const handleMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
    const video = videoRef.current;
    if (video && videoUrl) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
    startAnimation();
  }, [videoUrl, startAnimation]);
  const handleMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    if (canvasRef.current && subtitleEffect) {
      renderStaticSubtitle(canvasRef.current, subtitleEffect, captions[0]);
    }
  }, [subtitleEffect, captions]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => {
      if (video.currentTime >= 10) {
        video.currentTime = 0;
      }
    };
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, []);
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
  return jsxRuntimeExports.jsxs("div", {
    onClick,
    onMouseEnter: isBlank ? void 0 : handleMouseEnter,
    onMouseLeave: isBlank ? void 0 : handleMouseLeave,
    style: {
      border: isSelected
        ? "2px solid var(--ly-primary)"
        : "1px solid var(--ly-border)",
      borderRadius: "8px",
      padding: "0",
      cursor: "pointer",
      transition: "all 0.2s",
      backgroundColor: "var(--ly-surface-solid)",
      overflow: "hidden",
      position: "relative",
      boxShadow: isSelected
        ? "0 8px 20px rgba(0,0,0,0.25)"
        : "0 2px 10px rgba(0,0,0,0.12)",
      transform: isSelected ? "scale(1.02)" : "scale(1)",
    },
    onMouseOver: (e) => {
      if (!isSelected) {
        e.currentTarget.style.borderColor = "var(--ly-primary)";
        e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.18)";
      }
    },
    onMouseOut: (e) => {
      if (!isSelected) {
        e.currentTarget.style.borderColor = "var(--ly-border)";
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.12)";
      }
    },
    children: [
      jsxRuntimeExports.jsx("div", {
        style: {
          position: "relative",
          width: "100%",
          paddingTop: "177.78%",
          backgroundColor: "var(--ly-bg-soft)",
          overflow: "hidden",
        },
        children: isBlank
          ? jsxRuntimeExports.jsxs("div", {
              style: {
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "radial-gradient(240px 180px at 20% 18%, var(--ly-primary-soft), transparent 60%),radial-gradient(220px 160px at 85% 85%, rgba(148, 163, 184, 0.14), transparent 62%),linear-gradient(135deg, rgba(148, 163, 184, 0.10), rgba(148, 163, 184, 0.04))",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                color: "var(--ly-text)",
                padding: 14,
                boxSizing: "border-box",
              },
              children: [
                jsxRuntimeExports.jsx("div", {
                  style: {
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "rgba(148, 163, 184, 0.12)",
                    border: "1px solid var(--ly-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
                  },
                  children: jsxRuntimeExports.jsxs("svg", {
                    width: "22",
                    height: "22",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "1.8",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    children: [
                      jsxRuntimeExports.jsx("rect", {
                        x: "4",
                        y: "4",
                        width: "16",
                        height: "16",
                        rx: "3",
                      }),
                      jsxRuntimeExports.jsx("line", {
                        x1: "7",
                        y1: "7",
                        x2: "17",
                        y2: "17",
                      }),
                    ],
                  }),
                }),
                jsxRuntimeExports.jsx("div", {
                  style: { fontSize: 14, fontWeight: 650, letterSpacing: 0.2 },
                  children: "无模板",
                }),
                jsxRuntimeExports.jsx("div", {
                  style: {
                    fontSize: 12,
                    color: "var(--ly-text-2)",
                    textAlign: "center",
                    lineHeight: 1.5,
                  },
                  children: "选择并确认后将移除模板",
                }),
              ],
            })
          : jsxRuntimeExports.jsxs(React.Fragment, {
              children: [
                videoUrl
                  ? jsxRuntimeExports.jsx("video", {
                      ref: videoRef,
                      src: videoUrl,
                      muted: true,
                      playsInline: true,
                      preload: "metadata",
                      style: {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      },
                    })
                  : imageUrl
                    ? jsxRuntimeExports.jsx("img", {
                        src: imageUrl,
                        alt: style.name,
                        style: {
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        },
                        onError: (e) => {
                          if (e.currentTarget)
                            e.currentTarget.style.display = "none";
                        },
                      })
                    : jsxRuntimeExports.jsx("div", {
                        style: {
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          backgroundColor: "#1a1a1a",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#999",
                          fontSize: "12px",
                        },
                        children: "无预览",
                      }),
                subtitleEffect &&
                  jsxRuntimeExports.jsx("canvas", {
                    ref: canvasRef,
                    style: {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    },
                  }),
                jsxRuntimeExports.jsxs("div", {
                  style: {
                    position: "absolute",
                    top: `${(mainTitleConfig.top || 100) * 0.26}px`,
                    left: "50%",
                    transform: "translateX(-50%)",
                    maxWidth: "calc(100% - 16px)",
                    textAlign: "center",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  },
                  children: [
                    jsxRuntimeExports.jsx("div", {
                      style: {
                        padding: mainTitleConfig.borderRadius ? "2px 6px" : "0",
                        borderRadius: mainTitleConfig.borderRadius
                          ? `${mainTitleConfig.borderRadius * 0.26}px`
                          : "0",
                        backgroundColor:
                          mainTitleConfig.backgroundColor &&
                          mainTitleConfig.backgroundColor !== "transparent"
                            ? mainTitleConfig.backgroundColor
                            : "transparent",
                      },
                      children: getTitleLines(
                        displayMainTitle,
                        mainTitleConfig.breakLength,
                      ).map((line, i) =>
                        jsxRuntimeExports.jsx(
                          "div",
                          {
                            style: {
                              fontSize: `${(mainTitleConfig.fontSize || 48) * 0.26}px`,
                              fontFamily: mainTitleConfig.font || "黑体",
                              color: mainTitleConfig.color || "#FFFFFF",
                              textShadow: `1px 1px 1px ${mainTitleConfig.strokeColor || "#000000"}`,
                              fontWeight: mainTitleConfig.fontWeight ?? 400,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              lineHeight: 1.2,
                            },
                            children: line,
                          },
                          i,
                        ),
                      ),
                    }),
                    style.hasSubTitle &&
                      subTitleConfig &&
                      jsxRuntimeExports.jsx("div", {
                        style: {
                          marginTop: `${(subTitleConfig.top ?? 0) * 0.42}px`,
                          padding: subTitleConfig.borderRadius
                            ? "2px 6px"
                            : "0",
                          borderRadius: subTitleConfig.borderRadius
                            ? `${subTitleConfig.borderRadius * 0.26}px`
                            : "0",
                          backgroundColor:
                            subTitleConfig.backgroundColor &&
                            subTitleConfig.backgroundColor !== "transparent"
                              ? subTitleConfig.backgroundColor
                              : "transparent",
                        },
                        children: getTitleLines(
                          displaySubTitle,
                          subTitleConfig.breakLength,
                        ).map((line, i) =>
                          jsxRuntimeExports.jsx(
                            "div",
                            {
                              style: {
                                fontSize: `${(subTitleConfig.fontSize || 36) * 0.26}px`,
                                fontFamily: subTitleConfig.font || "黑体",
                                color: subTitleConfig.color || "#FFFFFF",
                                textShadow: `1px 1px 1px ${subTitleConfig.strokeColor || "#000000"}`,
                                fontWeight: subTitleConfig.fontWeight ?? 400,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                lineHeight: 1.2,
                              },
                              children: line,
                            },
                            i,
                          ),
                        ),
                      }),
                  ],
                }),
              ],
            }),
      }),
      isSelected &&
        jsxRuntimeExports.jsx("div", {
          style: {
            position: "absolute",
            top: "8px",
            right: "8px",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            backgroundColor: "var(--ly-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          },
          children: jsxRuntimeExports.jsx("svg", {
            width: "14",
            height: "14",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "white",
            strokeWidth: "3",
            children: jsxRuntimeExports.jsx("polyline", {
              points: "20 6 9 17 4 12",
            }),
          }),
        }),
    ],
  });
}
const blankTitleStyle = {
  id: "",
  name: "无模板（移除模板）",
  hasSubTitle: false,
};
function isTitleSegmentRangeLimited(r) {
  return r != null && r.start === 0 && r.end > 0;
}
function TitleStyleModal({
  show,
  builtinTitleStyles,
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
}) {
  const [customDuration, setCustomDuration] = useState(
    () => titleSegmentRange?.end ?? 5,
  );
  const isLimited = isTitleSegmentRangeLimited(titleSegmentRange);
  if (!show) return null;
  const mainTitleText = mainTitle || "画面主标题及内容";
  const subTitleText = subTitle || "画面副标题及内容";
  const allTitleStyles = [blankTitleStyle, ...(builtinTitleStyles || [])];
  return jsxRuntimeExports.jsx("div", {
    className: "video-modal-overlay",
    onClick: (e) => {
      if (e.target === e.currentTarget) onCancel();
    },
    style: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1e3,
    },
    children: jsxRuntimeExports.jsxs("div", {
      className: "video-modal-content",
      style: {
        backgroundColor: "var(--ly-surface-solid)",
        borderRadius: "8px",
        width: "90%",
        maxWidth: "900px",
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        border: "1px solid var(--ly-border)",
        boxShadow: "var(--ly-shadow-lg)",
      },
      onClick: (e) => e.stopPropagation(),
      children: [
        jsxRuntimeExports.jsxs("div", {
          className: "title-style-modal-header",
          style: {
            flexShrink: 0,
            margin: "24px 24px 0 24px",
            paddingBottom: "10px",
            borderBottom: "1px solid var(--ly-border)",
            position: "relative",
            paddingRight: "36px",
          },
          children: [
            jsxRuntimeExports.jsx("h2", {
              style: {
                margin: 0,
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--ly-text)",
              },
              children: "选择成片模板",
            }),
            jsxRuntimeExports.jsxs("label", {
              className: "video-title-style-check-label",
              children: [
                jsxRuntimeExports.jsx("span", {
                  className: "video-title-style-check-text",
                  children: "标题仅展示",
                }),
                jsxRuntimeExports.jsx("input", {
                  type: "number",
                  min: 1,
                  max: 999,
                  value: customDuration,
                  disabled: !isLimited,
                  onChange: (e) => {
                    const v = Math.max(
                      1,
                      Math.min(999, Math.round(Number(e.target.value)) || 1),
                    );
                    setCustomDuration(v);
                    setTitleSegmentRange({ start: 0, end: v });
                  },
                  style: {
                    width: "44px",
                    textAlign: "center",
                    fontSize: "13px",
                    padding: "1px 4px",
                    borderRadius: "4px",
                    border: "1px solid var(--ly-border)",
                    background: "var(--ly-surface)",
                    color: isLimited ? "var(--ly-text)" : "var(--ly-text-3)",
                    outline: "none",
                    marginLeft: "4px",
                  },
                }),
                jsxRuntimeExports.jsx("span", {
                  className: "video-title-style-check-text",
                  style: { marginLeft: "2px" },
                  children: "�?,
                }),
                jsxRuntimeExports.jsxs("span", {
                  className: "video-title-style-switch",
                  children: [
                    jsxRuntimeExports.jsx("input", {
                      type: "checkbox",
                      className: "video-title-style-check-input",
                      checked: isLimited,
                      onChange: (e) => {
                        if (e.target.checked) {
                          setTitleSegmentRange({
                            start: 0,
                            end: customDuration,
                          });
                        } else {
                          setTitleSegmentRange(null);
                        }
                      },
                    }),
                    jsxRuntimeExports.jsx("span", {
                      className: "video-title-style-switch-track",
                      "aria-hidden": true,
                      children: jsxRuntimeExports.jsx("span", {
                        className: "video-title-style-switch-thumb",
                      }),
                    }),
                  ],
                }),
              ],
            }),
            jsxRuntimeExports.jsx("button", {
              onClick: onCancel,
              style: {
                position: "absolute",
                top: "-8px",
                right: "-8px",
                border: "none",
                background: "transparent",
                fontSize: "24px",
                cursor: "pointer",
                color: "var(--ly-text-2)",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "6px",
                transition: "background-color 0.2s",
              },
              onMouseEnter: (e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(148, 163, 184, 0.16)";
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              },
              children: jsxRuntimeExports.jsxs("svg", {
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                children: [
                  jsxRuntimeExports.jsx("line", {
                    x1: "18",
                    y1: "6",
                    x2: "6",
                    y2: "18",
                  }),
                  jsxRuntimeExports.jsx("line", {
                    x1: "6",
                    y1: "6",
                    x2: "18",
                    y2: "18",
                  }),
                ],
              }),
            }),
          ],
        }),
        jsxRuntimeExports.jsx("div", {
          className: "video-modal-scroll",
          style: {
            flex: 1,
            overflow: "auto",
            minHeight: 0,
            padding: "16px 16px 16px 24px",
          },
          children: jsxRuntimeExports.jsxs("div", {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "16px",
            },
            children: [
              allTitleStyles.map((style) =>
                jsxRuntimeExports.jsx(
                  ThemeTemplatePreviewCard,
                  {
                    style,
                    isSelected: selectedTitleStyle?.id === style.id,
                    onClick: () => setSelectedTitleStyle(style),
                    videoUrl: titleStyleVideoUrls[style.id],
                    imageUrl: titleStyleImageUrls[style.id],
                    mainTitleText,
                    subTitleText,
                  },
                  style.id || "__blank_title__",
                ),
              ),
              builtinTitleStyles.length === 0 &&
                jsxRuntimeExports.jsxs("div", {
                  style: {
                    gridColumn: "1 / -1",
                    textAlign: "center",
                    padding: "60px 40px",
                    color: "var(--ly-text-2)",
                  },
                  children: [
                    jsxRuntimeExports.jsx("div", {
                      style: { fontSize: "16px", marginBottom: "8px" },
                      children: "暂无成片模板",
                    }),
                    jsxRuntimeExports.jsx("div", {
                      style: {
                        fontSize: "14px",
                        color: "var(--ly-text-muted)",
                      },
                      children: "请在配置文件中添加成片模板",
                    }),
                  ],
                }),
            ],
          }),
        }),
        jsxRuntimeExports.jsxs("div", {
          className: "video-form-group",
          style: { flexShrink: 0, padding: "20px 24px 24px" },
          children: [
            jsxRuntimeExports.jsxs("div", {
              style: {
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              },
              children: [
                jsxRuntimeExports.jsx("button", {
                  onClick: onCancel,
                  className: "video-button video-button-outline",
                  children: "取消",
                }),
                jsxRuntimeExports.jsx("button", {
                  onClick: onConfirm,
                  disabled: !selectedTitleStyle || !!activeProcessingType,
                  className: "video-button video-button-primary",
                  style: {
                    opacity: !selectedTitleStyle ? 0.5 : 1,
                    cursor: !selectedTitleStyle ? "not-allowed" : "pointer",
                  },
                  children:
                    activeProcessingType === "title" ||
                    activeProcessingType === "subtitle"
                      ? `应用？${processingProgress}%`
                      : "应用模板",
                }),
              ],
            }),
            (activeProcessingType === "title" ||
              activeProcessingType === "subtitle") &&
              jsxRuntimeExports.jsx("div", {
                className: "video-progress",
                style: { marginTop: "12px" },
                children: jsxRuntimeExports.jsx("div", {
                  className: "video-progress-bar",
                  style: { width: `${processingProgress}%` },
                }),
              }),
          ],
        }),
      ],
    }),
  });
}
const MIN_SEGMENT = 0.5;
const ZOOM_FACTOR = 2;
const BASE_PX_PER_SECOND = 40;
const MIN_PX_PER_SECOND = 5;
const MAX_PX_PER_SECOND = 300;
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
const MIX_TRACK_COLOR = "#8b5cf6";
const PIP_TRACK_COLOR = "#0ea5e9";
function SmartCutTimeline({
  duration,
  segments,
  onChangeSegment,
  currentTime = 0,
  onSeek,
  isPlaying = false,
  onTogglePlay,
  hasSubtitle = false,
  subtitleSegments = [],
  onChangeSubtitleSegment,
  mixSegments = [],
  mixResourceDurations,
  onChangeMixSegment,
  pipSegments = [],
  pipResourceDurations,
  onChangePipSegment,
  onDropPipResource,
  onDropMixResource,
}) {
  const safeDuration = duration > 0 ? duration : 60;
  const safeSubtitleSegments =
    hasSubtitle && Array.isArray(subtitleSegments) ? subtitleSegments : [];
  const safeMixSegments = Array.isArray(mixSegments) ? mixSegments : [];
  const safePipSegments = Array.isArray(pipSegments) ? pipSegments : [];
  const [mixDraggingOver, setMixDraggingOver] = useState(false);
  const [mixDropPreviewTime, setMixDropPreviewTime] =
    useState(null);
  const [mixDropPreviewDur, setMixDropPreviewDur] = useState(5);
  const mixTrackRef = useRef(null);
  const hasMixTrack = safeMixSegments.length > 0 || mixDraggingOver;
  const [pipDraggingOver, setPipDraggingOver] = useState(false);
  const [pipDropPreviewTime, setPipDropPreviewTime] =
    useState(null);
  const [pipDropPreviewDur, setPipDropPreviewDur] = useState(5);
  const pipTrackRef = useRef(null);
  const hasPipTrack = safePipSegments.length > 0 || pipDraggingOver;
  const [pxPerSecond, setPxPerSecond] =
    useState(BASE_PX_PER_SECOND);
  useEffect(() => {
    setPxPerSecond(BASE_PX_PER_SECOND);
  }, [safeDuration]);
  const rightScrollRef = useRef(null);
  const rulerRef = useRef(null);
  const [rulerRect, setRulerRect] = useState({
    left: 0,
    width: 1,
  });
  const updateRulerRect = useCallback(() => {
    const el = rulerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setRulerRect({ left: rect.left, width: rect.width || 1 });
  }, []);
  useEffect(() => {
    updateRulerRect();
    const el = rulerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateRulerRect());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateRulerRect]);
  useEffect(() => {
    updateRulerRect();
  }, [pxPerSecond, updateRulerRect]);
  const timeToX = useCallback(
    (t) => {
      const clamped = Math.max(0, Math.min(safeDuration, t));
      return clamped * pxPerSecond;
    },
    [safeDuration, pxPerSecond],
  );
  const xToTime = useCallback(
    (clientX) => {
      const { left, width } = rulerRect;
      if (width <= 0) return 0;
      const x = clientX - left;
      const ratio = x / width;
      const t = ratio * safeDuration;
      return Math.max(0, Math.min(safeDuration, t));
    },
    [rulerRect, safeDuration],
  );
  const zoomIn = useCallback(() => {
    setPxPerSecond((prev) => Math.min(MAX_PX_PER_SECOND, prev * ZOOM_FACTOR));
  }, []);
  const zoomOut = useCallback(() => {
    setPxPerSecond((prev) => Math.max(MIN_PX_PER_SECOND, prev / ZOOM_FACTOR));
  }, []);
  const zoomReset = useCallback(() => {
    setPxPerSecond(BASE_PX_PER_SECOND);
  }, []);
  const handleRulerClick = useCallback(
    (e) => {
      if (!onSeek) return;
      const t = xToTime(e.clientX);
      onSeek(t);
    },
    [xToTime, onSeek],
  );
  const [playheadDragging, setPlayheadDragging] = useState(false);
  const handlePlayheadMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setPlayheadDragging(true);
  }, []);
  useEffect(() => {
    if (!playheadDragging || !onSeek) return;
    const onMove = (e) => {
      const t = xToTime(e.clientX);
      onSeek(t);
    };
    const onUp = () => setPlayheadDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [playheadDragging, onSeek, xToTime]);
  const [dragState, setDragState] = useState(null);
  const handleBarMouseDown = useCallback((e, seg, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({ id: seg.id, mode, start: seg.start, end: seg.end });
  }, []);
  useEffect(() => {
    if (!dragState) return;
    const onMove = (e) => {
      const t = xToTime(e.clientX);
      if (dragState.mode === "trimLeft") {
        const newStart = Math.max(0, Math.min(t, dragState.end - MIN_SEGMENT));
        onChangeSegment(dragState.id, { start: newStart, end: dragState.end });
      } else if (dragState.mode === "trimRight") {
        const newEnd = Math.max(
          dragState.start + MIN_SEGMENT,
          Math.min(safeDuration, t),
        );
        onChangeSegment(dragState.id, { start: dragState.start, end: newEnd });
      } else {
        const len = dragState.end - dragState.start;
        let newStart = t - len / 2;
        let newEnd = t + len / 2;
        if (newStart < 0) {
          newStart = 0;
          newEnd = len;
        } else if (newEnd > safeDuration) {
          newEnd = safeDuration;
          newStart = safeDuration - len;
        }
        onChangeSegment(dragState.id, { start: newStart, end: newEnd });
      }
    };
    const onUp = () => setDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, onChangeSegment, safeDuration, xToTime]);
  const [subtitleDragState, setSubtitleDragState] = useState(null);
  const handleSubtitleBarMouseDown = useCallback(
    (e, index, seg, mode) => {
      if (!onChangeSubtitleSegment) return;
      e.preventDefault();
      e.stopPropagation();
      setSubtitleDragState({ index, mode, start: seg.start, end: seg.end });
    },
    [onChangeSubtitleSegment],
  );
  useEffect(() => {
    if (!subtitleDragState || !onChangeSubtitleSegment) return;
    const onMove = (e) => {
      const t = xToTime(e.clientX);
      if (subtitleDragState.mode === "trimLeft") {
        const newStart = Math.max(
          0,
          Math.min(t, subtitleDragState.end - MIN_SEGMENT),
        );
        onChangeSubtitleSegment(subtitleDragState.index, {
          start: newStart,
          end: subtitleDragState.end,
        });
      } else if (subtitleDragState.mode === "trimRight") {
        const newEnd = Math.max(
          subtitleDragState.start + MIN_SEGMENT,
          Math.min(safeDuration, t),
        );
        onChangeSubtitleSegment(subtitleDragState.index, {
          start: subtitleDragState.start,
          end: newEnd,
        });
      } else {
        const len = subtitleDragState.end - subtitleDragState.start;
        let newStart = t - len / 2;
        let newEnd = t + len / 2;
        if (newStart < 0) {
          newStart = 0;
          newEnd = len;
        } else if (newEnd > safeDuration) {
          newEnd = safeDuration;
          newStart = safeDuration - len;
        }
        onChangeSubtitleSegment(subtitleDragState.index, {
          start: newStart,
          end: newEnd,
        });
      }
    };
    const onUp = () => setSubtitleDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [subtitleDragState, onChangeSubtitleSegment, safeDuration, xToTime]);
  const [mixDragState, setMixDragState] = useState(null);
  const handleMixBarMouseDown = useCallback(
    (e, mix, mode) => {
      if (!onChangeMixSegment) return;
      e.preventDefault();
      e.stopPropagation();
      setMixDragState({
        id: mix.id,
        mode,
        start: mix.start,
        end: mix.end,
        mixResourceId: mix.mixResourceId,
      });
    },
    [onChangeMixSegment],
  );
  useEffect(() => {
    if (!mixDragState || !onChangeMixSegment) return;
    const maxLen =
      mixDragState.mixResourceId &&
      mixResourceDurations?.[mixDragState.mixResourceId] != null &&
      mixResourceDurations[mixDragState.mixResourceId] > 0
        ? mixResourceDurations[mixDragState.mixResourceId]
        : safeDuration;
    const onMove = (e) => {
      const t = xToTime(e.clientX);
      if (mixDragState.mode === "trimLeft") {
        const newStart = Math.max(
          0,
          mixDragState.end - maxLen,
          Math.min(t, mixDragState.end - MIN_SEGMENT),
        );
        onChangeMixSegment(mixDragState.id, {
          start: newStart,
          end: mixDragState.end,
        });
      } else if (mixDragState.mode === "trimRight") {
        const newEnd = Math.min(
          safeDuration,
          mixDragState.start + maxLen,
          Math.max(mixDragState.start + MIN_SEGMENT, t),
        );
        onChangeMixSegment(mixDragState.id, {
          start: mixDragState.start,
          end: newEnd,
        });
      } else {
        const len = Math.min(mixDragState.end - mixDragState.start, maxLen);
        let newStart = t - len / 2;
        if (newStart < 0) newStart = 0;
        else if (newStart + len > safeDuration) newStart = safeDuration - len;
        const newEnd = newStart + len;
        onChangeMixSegment(mixDragState.id, { start: newStart, end: newEnd });
      }
    };
    const onUp = () => setMixDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [
    mixDragState,
    onChangeMixSegment,
    mixResourceDurations,
    safeDuration,
    xToTime,
  ]);
  const [pipDragState, setPipDragState] = useState(null);
  const handlePipBarMouseDown = useCallback(
    (e, pip, mode) => {
      if (!onChangePipSegment) return;
      e.preventDefault();
      e.stopPropagation();
      setPipDragState({
        id: pip.id,
        mode,
        start: pip.start,
        end: pip.end,
        pipResourceId: pip.pipResourceId,
      });
    },
    [onChangePipSegment],
  );
  useEffect(() => {
    if (!pipDragState || !onChangePipSegment) return;
    const maxLen =
      pipDragState.pipResourceId &&
      pipResourceDurations?.[pipDragState.pipResourceId] != null &&
      pipResourceDurations[pipDragState.pipResourceId] > 0
        ? pipResourceDurations[pipDragState.pipResourceId]
        : safeDuration;
    const onMove = (e) => {
      const t = xToTime(e.clientX);
      if (pipDragState.mode === "trimLeft") {
        const newStart = Math.max(
          0,
          pipDragState.end - maxLen,
          Math.min(t, pipDragState.end - MIN_SEGMENT),
        );
        onChangePipSegment(pipDragState.id, {
          start: newStart,
          end: pipDragState.end,
        });
      } else if (pipDragState.mode === "trimRight") {
        const newEnd = Math.min(
          safeDuration,
          pipDragState.start + maxLen,
          Math.max(pipDragState.start + MIN_SEGMENT, t),
        );
        onChangePipSegment(pipDragState.id, {
          start: pipDragState.start,
          end: newEnd,
        });
      } else {
        const len = Math.min(pipDragState.end - pipDragState.start, maxLen);
        let newStart = t - len / 2;
        if (newStart < 0) newStart = 0;
        else if (newStart + len > safeDuration) newStart = safeDuration - len;
        const newEnd = newStart + len;
        onChangePipSegment(pipDragState.id, { start: newStart, end: newEnd });
      }
    };
    const onUp = () => setPipDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [
    pipDragState,
    onChangePipSegment,
    pipResourceDurations,
    safeDuration,
    xToTime,
  ]);
  const minorTicks = [];
  const majorTicks = [];
  const majorLabelTicks = [];
  if (safeDuration > 0) {
    const labelSpacingPx = 50;
    const approxLabelSeconds = labelSpacingPx / pxPerSecond;
    const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    let majorStep = candidates[candidates.length - 1];
    for (const c of candidates) {
      majorStep = c;
      if (c >= approxLabelSeconds) break;
    }
    const minorStep = majorStep / 5;
    for (let t = 0; t <= safeDuration + minorStep * 0.5; t += minorStep) {
      minorTicks.push(t);
    }
    for (const t of minorTicks) {
      if (Math.abs(t / majorStep - Math.round(t / majorStep)) < 1e-6) {
        majorTicks.push(t);
      }
    }
    const labelMap = new Map();
    for (const t of majorTicks) {
      const sec = Math.round(t);
      const diff = Math.abs(t - sec);
      const prev = labelMap.get(sec);
      if (prev == null || Math.abs(prev - sec) > diff) {
        labelMap.set(sec, t);
      }
    }
    majorLabelTicks.push(
      ...Array.from(labelMap.values()).sort((a, b) => a - b),
    );
  }
  const trackWidthPx = pxPerSecond * safeDuration;
  const clampedCurrentTime = Math.max(0, Math.min(safeDuration, currentTime));
  const playheadX = timeToX(clampedCurrentTime);
  const nonSubtitleSegments = segments.filter((seg) => seg.type !== "subtitle");
  return jsxRuntimeExports.jsx("div", {
    className: "smartcut-timeline",
    children: jsxRuntimeExports.jsxs("div", {
      className: "smartcut-timeline-inner",
      children: [
        jsxRuntimeExports.jsxs("div", {
          className: "smartcut-timeline-toolbar",
          children: [
            jsxRuntimeExports.jsxs("div", {
              className: "smartcut-timeline-zoom",
              children: [
                jsxRuntimeExports.jsx("button", {
                  type: "button",
                  className: "smartcut-timeline-zoom-btn",
                  onClick: zoomOut,
                  title: "缩小（看更多时间戳,
                  children: jsxRuntimeExports.jsx("svg", {
                    width: "14",
                    height: "14",
                    viewBox: "0 0 14 14",
                    "aria-hidden": "true",
                    focusable: "false",
                    children: jsxRuntimeExports.jsx("rect", {
                      x: "2",
                      y: "6.25",
                      width: "10",
                      height: "1.5",
                      rx: "0.75",
                      fill: "currentColor",
                    }),
                  }),
                }),
                jsxRuntimeExports.jsx("button", {
                  type: "button",
                  className: "smartcut-timeline-zoom-btn",
                  onClick: zoomIn,
                  title: "放大（看更细）",
                  children: jsxRuntimeExports.jsxs("svg", {
                    width: "14",
                    height: "14",
                    viewBox: "0 0 14 14",
                    "aria-hidden": "true",
                    focusable: "false",
                    children: [
                      jsxRuntimeExports.jsx("rect", {
                        x: "2",
                        y: "6.25",
                        width: "10",
                        height: "1.5",
                        rx: "0.75",
                        fill: "currentColor",
                      }),
                      jsxRuntimeExports.jsx("rect", {
                        x: "6.25",
                        y: "2",
                        width: "1.5",
                        height: "10",
                        rx: "0.75",
                        fill: "currentColor",
                      }),
                    ],
                  }),
                }),
                Math.abs(pxPerSecond - BASE_PX_PER_SECOND) > 0.5 &&
                  jsxRuntimeExports.jsx("button", {
                    type: "button",
                    className: "smartcut-timeline-zoom-btn",
                    onClick: zoomReset,
                    title: "重置缩放",
                    children: jsxRuntimeExports.jsxs("svg", {
                      width: "14",
                      height: "14",
                      viewBox: "0 0 14 14",
                      "aria-hidden": "true",
                      focusable: "false",
                      children: [
                        jsxRuntimeExports.jsx("circle", {
                          cx: "7",
                          cy: "7",
                          r: "4.25",
                          fill: "none",
                          stroke: "currentColor",
                          strokeWidth: "1.5",
                        }),
                        jsxRuntimeExports.jsx("path", {
                          d: "M7 3.5V2.25M10.5 7H11.75M7 10.5V11.75M3.5 7H2.25",
                          fill: "none",
                          stroke: "currentColor",
                          strokeWidth: "1.25",
                          strokeLinecap: "round",
                        }),
                      ],
                    }),
                  }),
              ],
            }),
            jsxRuntimeExports.jsx("div", {
              className: "smartcut-timeline-toolbar-center",
              children:
                onTogglePlay &&
                jsxRuntimeExports.jsx("button", {
                  type: "button",
                  className: "smartcut-timeline-play-btn",
                  onClick: onTogglePlay,
                  title: isPlaying ? "暂停预览" : "播放预览",
                  children: isPlaying
                    ? jsxRuntimeExports.jsxs("svg", {
                        width: "18",
                        height: "18",
                        viewBox: "0 0 18 18",
                        "aria-hidden": "true",
                        focusable: "false",
                        children: [
                          jsxRuntimeExports.jsx("rect", {
                            x: "4",
                            y: "3",
                            width: "3.5",
                            height: "12",
                            rx: "1",
                            fill: "currentColor",
                          }),
                          jsxRuntimeExports.jsx("rect", {
                            x: "10.5",
                            y: "3",
                            width: "3.5",
                            height: "12",
                            rx: "1",
                            fill: "currentColor",
                          }),
                        ],
                      })
                    : jsxRuntimeExports.jsx("svg", {
                        width: "18",
                        height: "18",
                        viewBox: "0 0 18 18",
                        "aria-hidden": "true",
                        focusable: "false",
                        children: jsxRuntimeExports.jsx(
                          "path",
                          { d: "M5 3.5v11L14 9L5 3.5Z", fill: "currentColor" },
                        ),
                      }),
                }),
            }),
            jsxRuntimeExports.jsx("div", {
              className: "smartcut-timeline-toolbar-right",
              children: jsxRuntimeExports.jsxs("span", {
                className: "smartcut-timeline-toolbar-meta",
                children: ["总时长 ", formatTime(safeDuration)],
              }),
            }),
          ],
        }),
        jsxRuntimeExports.jsx("div", {
          className: "smartcut-timeline-grid-wrap",
          children: jsxRuntimeExports.jsxs("div", {
            className: "smartcut-timeline-main",
            children: [
              jsxRuntimeExports.jsxs("div", {
                className: "smartcut-timeline-left",
                children: [
                  jsxRuntimeExports.jsx("div", {
                    style: { height: 20 },
                  }),
                  nonSubtitleSegments.map((seg) =>
                    jsxRuntimeExports.jsxs(
                      "div",
                      {
                        className: "smartcut-track-label",
                        children: [
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-track-dot",
                            style: { backgroundColor: seg.color },
                          }),
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-track-name",
                            children: seg.label,
                          }),
                        ],
                      },
                      seg.id,
                    ),
                  ),
                  hasSubtitle &&
                    jsxRuntimeExports.jsxs("div", {
                      className: "smartcut-track-label",
                      children: [
                        jsxRuntimeExports.jsx("span", {
                          className: "smartcut-track-dot",
                          style: { backgroundColor: "#10b981" },
                        }),
                        jsxRuntimeExports.jsx("span", {
                          className: "smartcut-track-name",
                          children: "字幕",
                        }),
                      ],
                    }),
                  hasMixTrack &&
                    jsxRuntimeExports.jsxs("div", {
                      className: "smartcut-track-label",
                      children: [
                        jsxRuntimeExports.jsx("span", {
                          className: "smartcut-track-dot",
                          style: { backgroundColor: MIX_TRACK_COLOR },
                        }),
                        jsxRuntimeExports.jsx("span", {
                          className: "smartcut-track-name",
                          children: "混剪",
                        }),
                      ],
                    }),
                  hasPipTrack &&
                    jsxRuntimeExports.jsxs("div", {
                      className: "smartcut-track-label",
                      children: [
                        jsxRuntimeExports.jsx("span", {
                          className: "smartcut-track-dot",
                          style: { backgroundColor: PIP_TRACK_COLOR },
                        }),
                        jsxRuntimeExports.jsx("span", {
                          className: "smartcut-track-name",
                          children: "画中�?,
                        }),
                      ],
                    }),
                  jsxRuntimeExports.jsxs("div", {
                    className: "smartcut-track-label",
                    children: [
                      jsxRuntimeExports.jsx("span", {
                        className:
                          "smartcut-track-dot smartcut-track-dot-video",
                      }),
                      jsxRuntimeExports.jsx("span", {
                        className: "smartcut-track-name",
                        children: "视频",
                      }),
                    ],
                  }),
                ],
              }),
              jsxRuntimeExports.jsx("div", {
                className: "smartcut-timeline-right",
                ref: rightScrollRef,
                onScroll: updateRulerRect,
                onDragOver: (e) => {
                  const isPip = e.dataTransfer.types.includes(
                    "application/x-pip-resource-id",
                  );
                  const isMix = e.dataTransfer.types.includes(
                    "application/x-mix-resource-id",
                  );
                  if (isPip || isMix) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }
                  if (isPip) {
                    if (!pipDraggingOver) {
                      setPipDraggingOver(true);
                      const durType = Array.from(e.dataTransfer.types).find(
                        (t) => t.startsWith("application/x-pip-dur-"),
                      );
                      if (durType) {
                        const parsed = parseFloat(
                          durType.replace("application/x-pip-dur-", ""),
                        );
                        if (parsed > 0 && Number.isFinite(parsed))
                          setPipDropPreviewDur(parsed);
                        else
                          setPipDropPreviewDur(
                            SMARTCUT_MIX_INITIAL_SEGMENT_SEC,
                          );
                      } else {
                        setPipDropPreviewDur(SMARTCUT_MIX_INITIAL_SEGMENT_SEC);
                      }
                    }
                    const pipTrack = pipTrackRef.current;
                    if (pipTrack) {
                      const rect = pipTrack.getBoundingClientRect();
                      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                        const mouseTime = xToTime(e.clientX);
                        const halfDur =
                          Math.min(pipDropPreviewDur, safeDuration) / 2;
                        const centered = Math.max(
                          halfDur,
                          Math.min(safeDuration - halfDur, mouseTime),
                        );
                        setPipDropPreviewTime(centered - halfDur);
                      } else {
                        setPipDropPreviewTime(null);
                      }
                    }
                  }
                  if (isMix) {
                    if (!mixDraggingOver) {
                      setMixDraggingOver(true);
                      const durType = Array.from(e.dataTransfer.types).find(
                        (t) => t.startsWith("application/x-mix-dur-"),
                      );
                      if (durType) {
                        const parsed = parseFloat(
                          durType.replace("application/x-mix-dur-", ""),
                        );
                        if (parsed > 0 && Number.isFinite(parsed))
                          setMixDropPreviewDur(parsed);
                        else setMixDropPreviewDur(safeDuration);
                      }
                    }
                    const mixTrack = mixTrackRef.current;
                    if (mixTrack) {
                      const rect = mixTrack.getBoundingClientRect();
                      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                        const mouseTime = xToTime(e.clientX);
                        const halfDur =
                          Math.min(mixDropPreviewDur, safeDuration) / 2;
                        const centered = Math.max(
                          halfDur,
                          Math.min(safeDuration - halfDur, mouseTime),
                        );
                        setMixDropPreviewTime(centered - halfDur);
                      } else {
                        setMixDropPreviewTime(null);
                      }
                    }
                  }
                },
                onDragLeave: (e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setPipDraggingOver(false);
                    setPipDropPreviewTime(null);
                    setMixDraggingOver(false);
                    setMixDropPreviewTime(null);
                  }
                },
                onDrop: (e) => {
                  const pipResourceId = e.dataTransfer.getData(
                    "application/x-pip-resource-id",
                  );
                  const mixResourceId = e.dataTransfer.getData(
                    "application/x-mix-resource-id",
                  );
                  if (pipResourceId && onDropPipResource) {
                    e.preventDefault();
                    const pipTrack = pipTrackRef.current;
                    let dropTime = null;
                    if (pipTrack) {
                      const rect = pipTrack.getBoundingClientRect();
                      if (e.clientY >= rect.top && e.clientY <= rect.bottom)
                        dropTime = xToTime(e.clientX);
                    }
                    setPipDraggingOver(false);
                    setPipDropPreviewTime(null);
                    onDropPipResource(pipResourceId, dropTime);
                  }
                  if (mixResourceId && onDropMixResource) {
                    e.preventDefault();
                    const mixTrack = mixTrackRef.current;
                    let dropTime = null;
                    if (mixTrack) {
                      const rect = mixTrack.getBoundingClientRect();
                      if (e.clientY >= rect.top && e.clientY <= rect.bottom)
                        dropTime = xToTime(e.clientX);
                    }
                    setMixDraggingOver(false);
                    setMixDropPreviewTime(null);
                    onDropMixResource(mixResourceId, dropTime);
                  }
                },
                children: jsxRuntimeExports.jsxs("div", {
                  className: "smartcut-timeline-right-inner",
                  style: { width: Math.max(trackWidthPx, 0) },
                  onMouseDown: handleRulerClick,
                  children: [
                    jsxRuntimeExports.jsxs("div", {
                      className: "smartcut-timeline-ruler",
                      ref: rulerRef,
                      children: [
                        minorTicks.map((t) =>
                          jsxRuntimeExports.jsx(
                            "span",
                            {
                              className: `smartcut-timeline-tick ${majorTicks.includes(t) ? "smartcut-timeline-tick-major" : "smartcut-timeline-tick-minor"}`,
                              style: { left: `${(t / safeDuration) * 100}%` },
                            },
                            `m-${t}`,
                          ),
                        ),
                        majorLabelTicks.map((t) =>
                          jsxRuntimeExports.jsx(
                            "span",
                            {
                              className: "smartcut-timeline-tick-label",
                              style: { left: `${(t / safeDuration) * 100}%` },
                              children: formatTime(t),
                            },
                            `l-${t}`,
                          ),
                        ),
                      ],
                    }),
                    jsxRuntimeExports.jsxs("div", {
                      style: { position: "relative" },
                      children: [
                        nonSubtitleSegments.map((seg) => {
                          const startX = timeToX(seg.start);
                          const endX = timeToX(seg.end);
                          const left = (startX / trackWidthPx) * 100;
                          const width = Math.max(
                            0,
                            ((endX - startX) / trackWidthPx) * 100,
                          );
                          return jsxRuntimeExports.jsx(
                            "div",
                            {
                              className: "smartcut-track-bar-row",
                              children: jsxRuntimeExports.jsx(
                                "div",
                                {
                                  className: "smartcut-track-bar-cell",
                                  children:
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "smartcut-track-bar-wrapper",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "div",
                                            {
                                              className:
                                                "smartcut-track-bar-bg",
                                            },
                                          ),
                                          jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className: "smartcut-track-bar",
                                              style: {
                                                left: `${left}%`,
                                                width: `${Math.max(width, width > 0 ? 1 : 0)}%`,
                                                background: seg.color,
                                              },
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-track-handle smartcut-track-handle-left",
                                                    onMouseDown: (e) =>
                                                      handleBarMouseDown(
                                                        e,
                                                        seg,
                                                        "trimLeft",
                                                      ),
                                                    title: "拖动裁切起点",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-track-bar-body",
                                                    onMouseDown: (e) =>
                                                      handleBarMouseDown(
                                                        e,
                                                        seg,
                                                        "move",
                                                      ),
                                                    title: "拖动移动片段",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-track-handle smartcut-track-handle-right",
                                                    onMouseDown: (e) =>
                                                      handleBarMouseDown(
                                                        e,
                                                        seg,
                                                        "trimRight",
                                                      ),
                                                    title: "拖动裁切终点",
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                },
                              ),
                            },
                            seg.id,
                          );
                        }),
                        hasSubtitle &&
                          jsxRuntimeExports.jsx("div", {
                            className: "smartcut-track-bar-row",
                            children: jsxRuntimeExports.jsx(
                              "div",
                              {
                                className: "smartcut-track-bar-cell",
                                children:
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className: "smartcut-track-bar-wrapper",
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "smartcut-track-bar-bg",
                                          },
                                        ),
                                        safeSubtitleSegments.map(
                                          (sub, index) => {
                                            const startX = timeToX(sub.start);
                                            const endX = timeToX(sub.end);
                                            const left =
                                              trackWidthPx > 0
                                                ? (startX / trackWidthPx) * 100
                                                : 0;
                                            const width =
                                              trackWidthPx > 0
                                                ? ((endX - startX) /
                                                    trackWidthPx) *
                                                  100
                                                : 0;
                                            const safeWidth = Math.max(
                                              width,
                                              width > 0 ? 1 : 0,
                                            );
                                            const segDur = sub.end - sub.start;
                                            const isDragging =
                                              subtitleDragState?.index ===
                                              index;
                                            const durZIndex =
                                              segDur > 0
                                                ? Math.max(
                                                    1,
                                                    Math.round(1e3 / segDur),
                                                  )
                                                : 100;
                                            const zIndex = isDragging
                                              ? 9999
                                              : durZIndex;
                                            return jsxRuntimeExports.jsxs(
                                              "div",
                                              {
                                                className:
                                                  "smartcut-track-bar smartcut-track-bar-subtitle",
                                                style: {
                                                  left: `${left}%`,
                                                  width: `${safeWidth}%`,
                                                  background: "#10b981",
                                                  zIndex,
                                                },
                                                title: sub.text,
                                                children: [
                                                  jsxRuntimeExports.jsx(
                                                    "span",
                                                    {
                                                      className:
                                                        "smartcut-track-handle smartcut-track-handle-left",
                                                      onMouseDown: (e) =>
                                                        handleSubtitleBarMouseDown(
                                                          e,
                                                          index,
                                                          sub,
                                                          "trimLeft",
                                                        ),
                                                      title: "拖动字幕起点",
                                                    },
                                                  ),
                                                  jsxRuntimeExports.jsx(
                                                    "span",
                                                    {
                                                      className:
                                                        "smartcut-track-bar-body",
                                                      onMouseDown: (e) =>
                                                        handleSubtitleBarMouseDown(
                                                          e,
                                                          index,
                                                          sub,
                                                          "move",
                                                        ),
                                                      title:
                                                        sub.text ||
                                                        "拖动字幕片段",
                                                    },
                                                  ),
                                                  jsxRuntimeExports.jsx(
                                                    "span",
                                                    {
                                                      className:
                                                        "smartcut-track-handle smartcut-track-handle-right",
                                                      onMouseDown: (e) =>
                                                        handleSubtitleBarMouseDown(
                                                          e,
                                                          index,
                                                          sub,
                                                          "trimRight",
                                                        ),
                                                      title: "拖动字幕终点",
                                                    },
                                                  ),
                                                ],
                                              },
                                              `${sub.start}-${sub.end}-${index}`,
                                            );
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              },
                            ),
                          }),
                        hasMixTrack &&
                          jsxRuntimeExports.jsx("div", {
                            className: "smartcut-track-bar-row",
                            ref: mixTrackRef,
                            children: jsxRuntimeExports.jsx(
                              "div",
                              {
                                className: "smartcut-track-bar-cell",
                                children:
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className: "smartcut-track-bar-wrapper",
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "smartcut-track-bar-bg",
                                          },
                                        ),
                                        safeMixSegments.map((mix) => {
                                          const startX = timeToX(mix.start);
                                          const endX = timeToX(mix.end);
                                          const left =
                                            trackWidthPx > 0
                                              ? (startX / trackWidthPx) * 100
                                              : 0;
                                          const width =
                                            trackWidthPx > 0
                                              ? ((endX - startX) /
                                                  trackWidthPx) *
                                                100
                                              : 0;
                                          const safeWidth = Math.max(
                                            width,
                                            width > 0 ? 1 : 0,
                                          );
                                          const segDur = mix.end - mix.start;
                                          const isDragging =
                                            mixDragState?.id === mix.id;
                                          const durZIndex =
                                            segDur > 0
                                              ? Math.max(
                                                  1,
                                                  Math.round(1e3 / segDur),
                                                )
                                              : 100;
                                          const zIndex = isDragging
                                            ? 9999
                                            : durZIndex;
                                          return jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className:
                                                "smartcut-track-bar smartcut-track-bar-mix",
                                              style: {
                                                left: `${left}%`,
                                                width: `${safeWidth}%`,
                                                background: MIX_TRACK_COLOR,
                                                zIndex,
                                              },
                                              title: `混剪 ${mix.start.toFixed(1)}s - ${mix.end.toFixed(1)}s`,
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-track-handle smartcut-track-handle-left",
                                                    onMouseDown: (e) =>
                                                      handleMixBarMouseDown(
                                                        e,
                                                        mix,
                                                        "trimLeft",
                                                      ),
                                                    title: "拖动裁切起点",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-track-bar-body",
                                                    onMouseDown: (e) =>
                                                      handleMixBarMouseDown(
                                                        e,
                                                        mix,
                                                        "move",
                                                      ),
                                                    title: "拖动移动片段",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-track-handle smartcut-track-handle-right",
                                                    onMouseDown: (e) =>
                                                      handleMixBarMouseDown(
                                                        e,
                                                        mix,
                                                        "trimRight",
                                                      ),
                                                    title: "拖动裁切终点",
                                                  },
                                                ),
                                              ],
                                            },
                                            mix.id,
                                          );
                                        }),
                                        mixDropPreviewTime != null &&
                                          trackWidthPx > 0 &&
                                          (() => {
                                            const segLen = Math.min(
                                              mixDropPreviewDur,
                                              safeDuration,
                                            );
                                            const previewLeft =
                                              (timeToX(mixDropPreviewTime) /
                                                trackWidthPx) *
                                              100;
                                            const previewWidth =
                                              (segLen / safeDuration) * 100;
                                            return jsxRuntimeExports.jsx(
                                              "div",
                                              {
                                                className:
                                                  "smartcut-track-bar smartcut-track-bar-mix",
                                                style: {
                                                  left: `${previewLeft}%`,
                                                  width: `${Math.max(previewWidth, 0.5)}%`,
                                                  background: MIX_TRACK_COLOR,
                                                  opacity: 0.6,
                                                  pointerEvents: "none",
                                                },
                                              },
                                            );
                                          })(),
                                      ],
                                    },
                                  ),
                              },
                            ),
                          }),
                        hasPipTrack &&
                          jsxRuntimeExports.jsx("div", {
                            className: "smartcut-track-bar-row",
                            ref: pipTrackRef,
                            children: jsxRuntimeExports.jsx(
                              "div",
                              {
                                className: "smartcut-track-bar-cell",
                                children:
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className: "smartcut-track-bar-wrapper",
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "smartcut-track-bar-bg",
                                          },
                                        ),
                                        safePipSegments.map((pip) => {
                                          const startX = timeToX(pip.start);
                                          const endX = timeToX(pip.end);
                                          const left =
                                            trackWidthPx > 0
                                              ? (startX / trackWidthPx) * 100
                                              : 0;
                                          const width =
                                            trackWidthPx > 0
                                              ? ((endX - startX) /
                                                  trackWidthPx) *
                                                100
                                              : 0;
                                          const safeWidth = Math.max(
                                            width,
                                            width > 0 ? 1 : 0,
                                          );
                                          const segDur = pip.end - pip.start;
                                          const isDragging =
                                            pipDragState?.id === pip.id;
                                          const durZIndex =
                                            segDur > 0
                                              ? Math.max(
                                                  1,
                                                  Math.round(1e3 / segDur),
                                                )
                                              : 100;
                                          const zIndex = isDragging
                                            ? 9999
                                            : durZIndex;
                                          return jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className:
                                                "smartcut-track-bar smartcut-track-bar-mix",
                                              style: {
                                                left: `${left}%`,
                                                width: `${safeWidth}%`,
                                                background: PIP_TRACK_COLOR,
                                                zIndex,
                                              },
                                              title: `画中画 ${pip.start.toFixed(1)}s - ${pip.end.toFixed(1)}s`,
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-track-handle smartcut-track-handle-left",
                                                    onMouseDown: (e) =>
                                                      handlePipBarMouseDown(
                                                        e,
                                                        pip,
                                                        "trimLeft",
                                                      ),
                                                    title: "拖动裁切起点",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-track-bar-body",
                                                    onMouseDown: (e) =>
                                                      handlePipBarMouseDown(
                                                        e,
                                                        pip,
                                                        "move",
                                                      ),
                                                    title: "拖动移动片段",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-track-handle smartcut-track-handle-right",
                                                    onMouseDown: (e) =>
                                                      handlePipBarMouseDown(
                                                        e,
                                                        pip,
                                                        "trimRight",
                                                      ),
                                                    title: "拖动裁切终点",
                                                  },
                                                ),
                                              ],
                                            },
                                            pip.id,
                                          );
                                        }),
                                        pipDropPreviewTime != null &&
                                          trackWidthPx > 0 &&
                                          (() => {
                                            const segLen = Math.min(
                                              pipDropPreviewDur,
                                              safeDuration,
                                            );
                                            const previewLeft =
                                              (timeToX(pipDropPreviewTime) /
                                                trackWidthPx) *
                                              100;
                                            const previewWidth =
                                              (segLen / safeDuration) * 100;
                                            return jsxRuntimeExports.jsx(
                                              "div",
                                              {
                                                className:
                                                  "smartcut-track-bar smartcut-track-bar-mix",
                                                style: {
                                                  left: `${previewLeft}%`,
                                                  width: `${Math.max(previewWidth, 0.5)}%`,
                                                  background: PIP_TRACK_COLOR,
                                                  opacity: 0.6,
                                                  pointerEvents: "none",
                                                },
                                              },
                                            );
                                          })(),
                                      ],
                                    },
                                  ),
                              },
                            ),
                          }),
                        jsxRuntimeExports.jsx("div", {
                          className: "smartcut-track-bar-row",
                          children: jsxRuntimeExports.jsx(
                            "div",
                            {
                              className: "smartcut-track-bar-cell",
                              children: jsxRuntimeExports.jsxs(
                                "div",
                                {
                                  className: "smartcut-track-bar-wrapper",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "div",
                                      { className: "smartcut-track-bar-bg" },
                                    ),
                                    jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        className:
                                          "smartcut-track-bar smartcut-track-bar-video",
                                        style: { left: "0%", width: "100%" },
                                        title: "当前视频轨道（仅展示�?,
                                      },
                                    ),
                                  ],
                                },
                              ),
                            },
                          ),
                        }),
                      ],
                    }),
                    onSeek &&
                      jsxRuntimeExports.jsx("div", {
                        className: "smartcut-timeline-playhead",
                        style: { left: `${playheadX}px` },
                        onMouseDown: handlePlayheadMouseDown,
                        title: formatTime(clampedCurrentTime),
                      }),
                  ],
                }),
              }),
            ],
          }),
        }),
      ],
    }),
  });
}
const thumbUrlCacheByPath = new Map();
const thumbPromiseByPath = new Map();
function isImagePath(p) {
  return /\.(jpg|jpeg|png)$/i.test(p);
}
function ensureLocalVideoThumbUrl(videoPath) {
  const path = videoPath.trim();
  if (!path) return Promise.reject(new Error("empty path"));
  const hit = thumbUrlCacheByPath.get(path);
  if (hit) return Promise.resolve(hit);
  const pending = thumbPromiseByPath.get(path);
  if (pending) return pending;
  const p = (async () => {
    let imagePath;
    if (isImagePath(path)) {
      imagePath = path;
    } else {
      const res = await window.api.extractFrameFromVideo(path);
      if (!res.success || !res.image_path)
        throw new Error(res.error || "无法提取首帧");
      imagePath = res.image_path;
    }
    const urlRes = await window.api.getLocalFileUrl(imagePath);
    if (!urlRes.success || !urlRes.url)
      throw new Error(urlRes.error || "无法加载首帧缩略图");
    const url = urlRes.url;
    thumbUrlCacheByPath.set(path, url);
    return url;
  })();
  thumbPromiseByPath.set(path, p);
  return p;
}
function LocalVideoFirstFrameThumb({ videoPath }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const p = videoPath?.trim();
    if (!p) {
      setUrl(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setUrl(null);
    ensureLocalVideoThumbUrl(p)
      .then((u) => {
        if (!cancelled) {
          setUrl(u);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [videoPath]);
  if (url) {
    return jsxRuntimeExports.jsx("img", {
      className: "smartcut-mix-icon-thumb-img",
      src: url,
      alt: "",
      draggable: false,
    });
  }
  if (loading) {
    return jsxRuntimeExports.jsx("div", {
      className: "smartcut-mix-icon-thumb-loading",
      "aria-hidden": true,
    });
  }
  return jsxRuntimeExports.jsxs("svg", {
    width: "28",
    height: "28",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    "aria-hidden": "true",
    children: [
      jsxRuntimeExports.jsx("rect", {
        x: "2",
        y: "4",
        width: "20",
        height: "16",
        rx: "2",
      }),
      jsxRuntimeExports.jsx("path", { d: "M10 9l5 3-5 3V9z" }),
    ],
  });
}
const AlignVTopIcon = () =>
  jsxRuntimeExports.jsxs("svg", {
    viewBox: "0 0 14 14",
    width: "13",
    height: "13",
    fill: "currentColor",
    children: [
      jsxRuntimeExports.jsx("rect", {
        x: "1",
        y: "1",
        width: "12",
        height: "1.5",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "2.5",
        y: "3.5",
        width: "3.5",
        height: "8",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "8",
        y: "3.5",
        width: "3.5",
        height: "6",
        rx: "0.5",
      }),
    ],
  });
const AlignVMiddleIcon = () =>
  jsxRuntimeExports.jsxs("svg", {
    viewBox: "0 0 14 14",
    width: "13",
    height: "13",
    fill: "currentColor",
    children: [
      jsxRuntimeExports.jsx("rect", {
        x: "1",
        y: "6.25",
        width: "12",
        height: "1.5",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "2.5",
        y: "2",
        width: "3.5",
        height: "10",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "8",
        y: "3",
        width: "3.5",
        height: "8",
        rx: "0.5",
      }),
    ],
  });
const AlignVBottomIcon = () =>
  jsxRuntimeExports.jsxs("svg", {
    viewBox: "0 0 14 14",
    width: "13",
    height: "13",
    fill: "currentColor",
    children: [
      jsxRuntimeExports.jsx("rect", {
        x: "1",
        y: "11.5",
        width: "12",
        height: "1.5",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "2.5",
        y: "2.5",
        width: "3.5",
        height: "8",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "8",
        y: "4.5",
        width: "3.5",
        height: "6",
        rx: "0.5",
      }),
    ],
  });
const AlignHLeftIcon = () =>
  jsxRuntimeExports.jsxs("svg", {
    viewBox: "0 0 14 14",
    width: "13",
    height: "13",
    fill: "currentColor",
    children: [
      jsxRuntimeExports.jsx("rect", {
        x: "1",
        y: "1",
        width: "1.5",
        height: "12",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "3.5",
        y: "2.5",
        width: "8",
        height: "2.5",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "3.5",
        y: "6.5",
        width: "5.5",
        height: "2.5",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "3.5",
        y: "10",
        width: "7",
        height: "2",
        rx: "0.5",
      }),
    ],
  });
const AlignHCenterIcon = () =>
  jsxRuntimeExports.jsxs("svg", {
    viewBox: "0 0 14 14",
    width: "13",
    height: "13",
    fill: "currentColor",
    children: [
      jsxRuntimeExports.jsx("rect", {
        x: "6.25",
        y: "1",
        width: "1.5",
        height: "12",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "2",
        y: "2.5",
        width: "10",
        height: "2.5",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "3.5",
        y: "6.5",
        width: "7",
        height: "2.5",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "2.5",
        y: "10",
        width: "9",
        height: "2",
        rx: "0.5",
      }),
    ],
  });
const AlignHRightIcon = () =>
  jsxRuntimeExports.jsxs("svg", {
    viewBox: "0 0 14 14",
    width: "13",
    height: "13",
    fill: "currentColor",
    children: [
      jsxRuntimeExports.jsx("rect", {
        x: "11.5",
        y: "1",
        width: "1.5",
        height: "12",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "2.5",
        y: "2.5",
        width: "8",
        height: "2.5",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "5",
        y: "6.5",
        width: "5.5",
        height: "2.5",
        rx: "0.5",
      }),
      jsxRuntimeExports.jsx("rect", {
        x: "3.5",
        y: "10",
        width: "7",
        height: "2",
        rx: "0.5",
      }),
    ],
  });
const VALIGN_OPTS = [
  ["top", AlignVTopIcon],
  ["middle", AlignVMiddleIcon],
  ["bottom", AlignVBottomIcon],
];
const HALIGN_OPTS = [
  ["left", AlignHLeftIcon],
  ["center", AlignHCenterIcon],
  ["right", AlignHRightIcon],
];
const MIX_SEGMENT_MIN_DURATION = 0.5;
const DEFAULT_TITLE_CONFIG = {
  style: {
    id: "smartcut-default",
    name: "默认",
    hasSubTitle: false,
    mainTitle: {
      font: "黑体",
      fontSize: 48,
      fontWeight: 400,
      color: "#FFFFFF",
      strokeColor: "#000000",
      top: 100,
      borderRadius: 10,
      backgroundColor: "#00000000",
      breakLength: 0,
    },
    subTitle: {
      font: "黑体",
      fontSize: 36,
      fontWeight: 400,
      color: "#FFFFFF",
      strokeColor: "#000000",
      top: 50,
      borderRadius: 10,
      backgroundColor: "#00000000",
      breakLength: 0,
    },
  },
  mainTitleText: "",
  subTitleText: "",
};
const DEFAULT_SUBTITLE_CONFIG = {
  text: "",
  font: "黑体",
  fontSize: 36,
  fontWeight: 400,
  color: "#DE0202",
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
};
function toHexAlpha(percent) {
  const n = Math.max(0, Math.min(100, percent));
  return Math.round((n * 255) / 100)
    .toString(16)
    .padStart(2, "0");
}
function parseBgColorAlpha(bg) {
  if (!bg || bg === "transparent") return { rgb: "#000000", alpha: 0 };
  const s = bg.startsWith("#") ? bg : `#${bg}`;
  if (s.length === 9) {
    const rgb = s.slice(0, 7);
    const alpha = Math.round((parseInt(s.slice(7, 9), 16) / 255) * 100);
    return { rgb, alpha };
  }
  if (s.length === 7) return { rgb: s, alpha: 100 };
  return { rgb: "#000000", alpha: 0 };
}
function SmartCutResourcePanel({
  onSelectResource,
  activeType,
  mixResources,
  onStartMixWizard,
  onRemoveMixResource,
  onSelectMixResource,
  selectedMixResourceId,
  mixSegments,
  onMixSegmentsChange,
  onAddMixSegment,
  mixTimelineDuration = 60,
  localBuiltinBgms,
  localUploadedBgms,
  localBgmEffectConfig,
  appliedBgmEffectConfig,
  onLocalBgmChange,
  onLocalBgmUpload,
  localTitleEffectConfig,
  onLocalTitleChange,
  localSubtitleEnabled,
  onLocalSubtitleEnabledChange,
  subtitleEffectConfig,
  onSubtitleEffectConfigChange,
  subtitleSegments,
  onSubtitleSegmentsChange,
  videoAlreadyHasSubtitle: _videoAlreadyHasSubtitle = false,
  initialMainTitle = "",
  initialSubTitle = "",
  mixSubTab: _mixSubTabProp,
  onMixSubTabChange: _onMixSubTabChange,
  pipResources = [],
  onPipResourcesChange,
  selectedPipResourceId = null,
  onSelectPipResource,
  pipSegments = [],
  onPipSegmentsChange,
  onAddPipSegment,
  pipTimelineDuration: _pipTimelineDuration = 60,
  availableFonts = ["黑体"],
  onAddTitleClick,
  isTitleGenerating = false,
  onAddSubtitleClick,
  isWhisperGenerating = false,
  onRegenerateSubtitleSegments,
}) {
  const pipFileInputRef = React.useRef(null);
  const [activeMixCategory, setActiveMixCategory] =
    useState("全部");
  const [focusedSubtitleOriginalIndex, setFocusedSubtitleOriginalIndex] =
    useState(null);
  const [showAutoAddCategoryDialog, setShowAutoAddCategoryDialog] =
    useState(false);
  const [autoAddCategory, setAutoAddCategory] = useState("");
  const [autoAddSimThreshold, setAutoAddSimThreshold] =
    useState(0.45);
  const mixCategories = useMemo(() => {
    const set = new Set();
    mixResources.forEach((item) => {
      if (item.category && item.category.trim()) set.add(item.category.trim());
    });
    const arr = Array.from(set);
    return arr;
  }, [mixResources]);
  const mixResourcesWithVector = useMemo(
    () =>
      mixResources.filter(
        (r) => Array.isArray(r.vector) && r.vector.length > 0,
      ),
    [mixResources],
  );
  const [autoAddingMix, setAutoAddingMix] = useState(false);
  function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom <= 0 ? 0 : dot / denom;
  }
  const showToast = useToast();
  const builtinTitleStyles = useVideoPageStore((s) => s.builtinTitleStyles);
  function parseSelectedIndicesFromLLM(response, maxIndex) {
    const numbers = response
      .replace(/\s/g, "")
      .split(/[,，、;\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= maxIndex);
    return [...new Set(numbers)];
  }
  const handleApplyTitleStylePreset = (style) => {
    onLocalTitleChange({
      style,
      mainTitleText: localTitleEffectConfig?.mainTitleText ?? "",
      subTitleText: localTitleEffectConfig?.subTitleText ?? "",
    });
  };
  const handleApplySubtitlePreset = (style) => {
    const se = style.subtitleEffect;
    if (!se) return;
    const styleId = "id" in style ? (style.id ?? "__default__") : "__default__";
    setLocalSubtitleStyleId(styleId);
    if (se.font) setLocalSubtitleFont(se.font);
    if (se.fontSize) setLocalSubtitleFontSize(se.fontSize);
    if (se.fontWeight) setLocalSubtitleFontWeight(se.fontWeight);
    if (se.color) setLocalSubtitleColor(se.color);
    if (typeof se.strokeEnabled === "boolean")
      setLocalSubtitleStrokeEnabled(se.strokeEnabled);
    if (typeof se.strokeWidth === "number")
      setLocalSubtitleStrokeWidth(se.strokeWidth);
    if (se.strokeColor) setLocalSubtitleStrokeColor(se.strokeColor);
    if (typeof se.bottomMargin === "number")
      setLocalSubtitleBottomMargin(se.bottomMargin);
    if (se.entranceEffect) setLocalSubtitleEntranceEffect(se.entranceEffect);
    if (typeof se.bgEnabled === "boolean")
      setLocalSubtitleBgEnabled(se.bgEnabled);
    if (se.bgColor) setLocalSubtitleBgColor(se.bgColor);
    if (typeof se.bgOpacity === "number")
      setLocalSubtitleBgOpacity(se.bgOpacity);
    if (typeof se.bgBorderRadius === "number")
      setLocalSubtitleBgBorderRadius(se.bgBorderRadius);
    if (typeof se.bgPaddingH === "number")
      setLocalSubtitleBgPaddingH(se.bgPaddingH);
    if (typeof se.bgPaddingV === "number")
      setLocalSubtitleBgPaddingV(se.bgPaddingV);
    if (typeof se.shadowEnabled === "boolean")
      setLocalSubtitleShadowEnabled(se.shadowEnabled);
    if (se.shadowColor) setLocalSubtitleShadowColor(se.shadowColor);
    if (typeof se.shadowOffsetX === "number")
      setLocalSubtitleShadowOffsetX(se.shadowOffsetX);
    if (typeof se.shadowOffsetY === "number")
      setLocalSubtitleShadowOffsetY(se.shadowOffsetY);
    if (typeof se.shadowBlur === "number")
      setLocalSubtitleShadowBlur(se.shadowBlur);
    updateSubtitleStyle({
      font: se.font,
      fontSize: se.fontSize,
      fontWeight: se.fontWeight,
      color: se.color,
      strokeEnabled: se.strokeEnabled,
      strokeWidth: se.strokeWidth,
      strokeColor: se.strokeColor,
      bottomMargin: se.bottomMargin,
      entranceEffect: se.entranceEffect,
      bgEnabled: se.bgEnabled,
      bgColor: se.bgColor,
      bgOpacity: se.bgOpacity,
      bgBorderRadius: se.bgBorderRadius,
      bgPaddingH: se.bgPaddingH,
      bgPaddingV: se.bgPaddingV,
      shadowEnabled: se.shadowEnabled,
      shadowColor: se.shadowColor,
      shadowOffsetX: se.shadowOffsetX,
      shadowOffsetY: se.shadowOffsetY,
      shadowBlur: se.shadowBlur,
    });
  };
  const handleAutoAddMixSegments = useCallback(async () => {
    if (!subtitleSegments?.length) {
      showToast("请先添加字幕，智能添加需要字幕内容作为依据", "info");
      return;
    }
    if (mixResourcesWithVector.length === 0) {
      showToast("暂无可用的向量化混剪素材，请先上传混剪素材", "info");
      return;
    }
    const cat = autoAddCategory.trim();
    if (!cat) {
      showToast("请先选择一个混剪分析", "info");
      return;
    }
    const resourcesInCategory = mixResourcesWithVector.filter(
      (r) => (r.category || "").trim() === cat,
    );
    console.log("mixResourcesWithVector", mixResourcesWithVector);
    console.log("resourcesInCategory", resourcesInCategory);
    if (resourcesInCategory.length === 0) {
      showToast("该分类下暂无可用混剪素材，请先在此分类下添加素材", "info");
      return;
    }
    setShowAutoAddCategoryDialog(false);
    setAutoAddingMix(true);
    try {
      const llmModel = useVideoPageStore.getState().llmModel || "DeepSeek";
      const segmentsList = subtitleSegments
        .map(
          (s, i) =>
            `${i}. [${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${(s.text || "").trim()}`,
        )
        .join("\n");
      const systemPrompt = `你是商品介绍视频的剪辑助手。用户会给出一段视频的字幕列表（序号、文案、时间范围）。请根据商品介绍视频的节奏和文案逻辑，从中挑选「适合插入混剪画面」的句段（例如：产品卖点、关键功能介绍、产品展示相关、需要配合画面强调的句子等），数量不宜过多，不准超过字幕句段数量的一半，只选真正适合的几句。只返回被选中的句段序号，用英文逗号分隔，例如：0,2,5。不要解释，不要输出其他内容。`;
      const userPrompt = `字幕列表：\n${segmentsList}

请输出适合插入混剪画面的句段序号（英文逗号分隔），数量不宜过多，不准超过字幕句段数量的一半（例如我给你的字幕列表是2，你返回的句段数量不能超时），只选真正适合的几句：`;
      const data = await llmService.completion(
        llmModel,
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.3, max_tokens: 200 },
      );
      const responseData = data?.data ?? data;
      const content =
        responseData?.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) {
        showToast("大模型未返回有效结果", "info");
        return;
      }
      let selectedIndices = parseSelectedIndicesFromLLM(
        content,
        subtitleSegments.length - 1,
      );
      if (selectedIndices.length === 0) {
        showToast(
          "大模型未挑选出适合的句段，请检查文案或手动添加混剪辑,
          "info",
        );
        return;
      }
      const totalCount = subtitleSegments.length;
      const maxAllowed = Math.max(1, Math.floor(totalCount * 0.5));
      const minAllowed = Math.max(1, Math.floor(totalCount * 0.3));
      if (selectedIndices.length > maxAllowed) {
        selectedIndices = [...selectedIndices].sort(() => Math.random() - 0.5);
        const targetCount =
          Math.floor(Math.random() * (maxAllowed - minAllowed + 1)) +
          minAllowed;
        selectedIndices = selectedIndices.slice(0, targetCount);
      }
      const timelineDur = Math.max(mixTimelineDuration ?? 60, 1);
      const added = [];
      for (const idx of selectedIndices) {
        const seg = subtitleSegments[idx];
        if (!seg || seg.start >= seg.end) continue;
        const text = (seg.text || "").trim();
        if (!text) continue;
        const res = await llmService.getTextEmbedding(text);
        if (
          !res.data ||
          !Array.isArray(res.data.embedding) ||
          res.data.embedding.length === 0
        )
          continue;
        let bestId = "";
        let bestSim = -1;
        for (const r of resourcesInCategory) {
          const vec = r.vector;
          if (!vec) continue;
          const sim = cosineSimilarity(res.data.embedding, vec);
          console.log(`${text} �?${r.name} 的相似度：${sim}`);
          if (sim > bestSim) {
            bestSim = sim;
            bestId = r.id;
          }
        }
        if (bestId && bestSim > autoAddSimThreshold) {
          const mixRes = resourcesInCategory.find((r) => r.id === bestId);
          if (!mixRes) continue;
          const mixPath = mixRes.path ?? "";
          if (!mixPath) continue;
          const mixIsImage =
            mixRes.duration === Infinity || isImageFile(mixPath);
          const fileDur =
            !mixIsImage &&
            mixRes.duration != null &&
            mixRes.duration > 0 &&
            Number.isFinite(mixRes.duration)
              ? mixRes.duration
              : 0;
          const maxLenByAsset = mixIsImage
            ? SMARTCUT_MIX_INITIAL_SEGMENT_SEC
            : fileDur > 0
              ? fileDur
              : SMARTCUT_MIX_INITIAL_SEGMENT_SEC;
          let subStart = Math.max(0, seg.start);
          let subEnd = Math.max(subStart, seg.end);
          subStart = Math.min(subStart, timelineDur - MIX_SEGMENT_MIN_DURATION);
          subEnd = Math.min(subEnd, timelineDur);
          if (subEnd <= subStart) continue;
          const subLen = subEnd - subStart;
          const segLen = Math.min(subLen, maxLenByAsset);
          const start = subStart;
          const end = Math.min(start + segLen, timelineDur);
          if (end - start < MIX_SEGMENT_MIN_DURATION) continue;
          added.push({
            id: `mix_auto_${Date.now()}_${idx}_${Math.random().toString(36).slice(2)}`,
            start,
            end,
            mixResourceId: bestId,
          });
        }
      }
      if (added.length > 0) {
        onMixSegmentsChange([...mixSegments, ...added]);
        showToast(`已智能挑选添加 ${added.length} 段混剪素材`, "success");
      } else {
        showToast(
          "向量检索未匹配到合适素材，请检查混剪素材是否已做向量化",
          "info",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "自动添加失败";
      showToast(msg, "error");
    } finally {
      setAutoAddingMix(false);
    }
  }, [
    subtitleSegments,
    mixResourcesWithVector,
    mixSegments,
    onMixSegmentsChange,
    showToast,
    autoAddCategory,
    autoAddSimThreshold,
    setShowAutoAddCategoryDialog,
    mixTimelineDuration,
  ]);
  const [localMainFont, setLocalMainFont] = useState("黑体");
  const [localMainFontSize, setLocalMainFontSize] = useState("");
  const [localMainTop, setLocalMainTop] = useState("");
  const [localMainColor, setLocalMainColor] = useState("#ffffff");
  const [localMainStrokeEnabled, setLocalMainStrokeEnabled] =
    useState(true);
  const [localMainStrokeWidth, setLocalMainStrokeWidth] =
    useState(2);
  const [localMainStrokeColor, setLocalMainStrokeColor] =
    useState("#000000");
  const [localMainFontWeight, setLocalMainFontWeight] =
    useState(400);
  const [localMainBgEnabled, setLocalMainBgEnabled] =
    useState(false);
  const [localMainBgColor, setLocalMainBgColor] =
    useState("#000000");
  const [localMainBgAlpha, setLocalMainBgAlpha] = useState(100);
  const [localMainBorderRadius, setLocalMainBorderRadius] =
    useState(10);
  const [localMainBreakLength, setLocalMainBreakLength] =
    useState("");
  const [localMainShadowEnabled, setLocalMainShadowEnabled] =
    useState(false);
  const [localMainShadowColor, setLocalMainShadowColor] =
    useState("#000000");
  const [localMainShadowOffsetX, setLocalMainShadowOffsetX] =
    useState(2);
  const [localMainShadowOffsetY, setLocalMainShadowOffsetY] =
    useState(2);
  const [localMainShadowBlur, setLocalMainShadowBlur] =
    useState(0);
  const [localSubFont, setLocalSubFont] = useState("黑体");
  const [localSubFontSize, setLocalSubFontSize] = useState("");
  const [localSubTop, setLocalSubTop] = useState("");
  const [localSubColor, setLocalSubColor] = useState("#ffffff");
  const [localSubStrokeEnabled, setLocalSubStrokeEnabled] =
    useState(true);
  const [localSubStrokeWidth, setLocalSubStrokeWidth] =
    useState(2);
  const [localSubStrokeColor, setLocalSubStrokeColor] =
    useState("#000000");
  const [localSubFontWeight, setLocalSubFontWeight] =
    useState(400);
  const [localSubBgEnabled, setLocalSubBgEnabled] =
    useState(false);
  const [localSubBgColor, setLocalSubBgColor] =
    useState("#000000");
  const [localSubBgAlpha, setLocalSubBgAlpha] = useState(100);
  const [localSubBorderRadius, setLocalSubBorderRadius] =
    useState(10);
  const [localSubBreakLength, setLocalSubBreakLength] =
    useState("");
  const [localSubShadowEnabled, setLocalSubShadowEnabled] =
    useState(false);
  const [localSubShadowColor, setLocalSubShadowColor] =
    useState("#000000");
  const [localSubShadowOffsetX, setLocalSubShadowOffsetX] =
    useState(2);
  const [localSubShadowOffsetY, setLocalSubShadowOffsetY] =
    useState(2);
  const [localSubShadowBlur, setLocalSubShadowBlur] = useState(0);
  const [localMainAlignV, setLocalMainAlignV] = useState("top");
  const [localMainAlignH, setLocalMainAlignH] = useState("center");
  const [localSubAlignV, setLocalSubAlignV] = useState("top");
  const [localSubAlignH, setLocalSubAlignH] = useState("center");
  useEffect(() => {
    if (!localTitleEffectConfig) {
      setLocalMainFontSize("");
      setLocalMainTop("");
      setLocalSubFontSize("");
      setLocalSubTop("");
      return;
    }
    const style = localTitleEffectConfig.style;
    const main = style.mainTitle || {
      font: "黑体",
      fontSize: 48,
      fontWeight: 400,
      color: "#FFFFFF",
      strokeColor: "#000000",
      top: 100,
      borderRadius: 10,
      backgroundColor: "transparent",
      breakLength: 0,
    };
    const sub = style.subTitle || {
      font: "黑体",
      fontSize: 36,
      fontWeight: 400,
      color: "#FFFFFF",
      strokeColor: "#000000",
      top: 50,
      borderRadius: 10,
      backgroundColor: "transparent",
      breakLength: 0,
    };
    setLocalMainFont(main.font || "黑体");
    setLocalMainFontSize(main.fontSize || 48);
    setLocalMainTop(typeof main.top === "number" ? main.top : 100);
    setLocalMainColor(main.color || "#FFFFFF");
    setLocalMainStrokeEnabled(main.strokeEnabled !== false);
    setLocalMainStrokeWidth(main.strokeWidth ?? 2);
    setLocalMainStrokeColor(main.strokeColor || "#000000");
    setLocalMainFontWeight(main.fontWeight ?? 400);
    const mainBgParsed = parseBgColorAlpha(main.backgroundColor);
    setLocalMainBgColor(mainBgParsed.rgb);
    setLocalMainBgAlpha(mainBgParsed.alpha);
    setLocalMainBgEnabled(mainBgParsed.alpha > 0);
    setLocalMainBorderRadius(main.borderRadius ?? 10);
    setLocalMainBreakLength(main.breakLength ?? 0);
    setLocalMainShadowEnabled(main.shadowEnabled ?? false);
    setLocalMainShadowColor(main.shadowColor || "#000000");
    setLocalMainShadowOffsetX(main.shadowOffsetX ?? 2);
    setLocalMainShadowOffsetY(main.shadowOffsetY ?? 2);
    setLocalMainShadowBlur(main.shadowBlur ?? 0);
    setLocalSubFont(sub.font || "黑体");
    setLocalSubFontSize(sub.fontSize || 36);
    setLocalSubTop(typeof sub.top === "number" ? sub.top : 50);
    setLocalSubColor(sub.color || "#FFFFFF");
    setLocalSubStrokeEnabled(sub.strokeEnabled !== false);
    setLocalSubStrokeWidth(sub.strokeWidth ?? 2);
    setLocalSubStrokeColor(sub.strokeColor || "#000000");
    setLocalSubFontWeight(sub.fontWeight ?? 400);
    const subBgParsed = parseBgColorAlpha(sub.backgroundColor);
    setLocalSubBgColor(subBgParsed.rgb);
    setLocalSubBgAlpha(subBgParsed.alpha);
    setLocalSubBgEnabled(subBgParsed.alpha > 0);
    setLocalSubBorderRadius(sub.borderRadius ?? 10);
    setLocalSubBreakLength(sub.breakLength ?? 0);
    setLocalSubShadowEnabled(sub.shadowEnabled ?? false);
    setLocalSubShadowColor(sub.shadowColor || "#000000");
    setLocalSubShadowOffsetX(sub.shadowOffsetX ?? 2);
    setLocalSubShadowOffsetY(sub.shadowOffsetY ?? 2);
    setLocalSubShadowBlur(sub.shadowBlur ?? 0);
    setLocalMainAlignV(main.alignV || "top");
    setLocalMainAlignH(main.alignH || "center");
    setLocalSubAlignV(sub.alignV || "top");
    setLocalSubAlignH(sub.alignH || "center");
  }, [localTitleEffectConfig]);
  const [localSubtitles, setLocalSubtitles] =
    useState(subtitleSegments);
  const [subtitleTab, setSubtitleTab] = useState("style");
  const [localSubtitleStyleId, setLocalSubtitleStyleId] =
    useState("__default__");
  const [localSubtitleFont, setLocalSubtitleFont] =
    useState("黑体");
  const [localSubtitleFontSize, setLocalSubtitleFontSize] =
    useState(36);
  const [localSubtitleFontWeight, setLocalSubtitleFontWeight] =
    useState(400);
  const [localSubtitleColor, setLocalSubtitleColor] =
    useState("#DE0202");
  const [localSubtitleStrokeEnabled, setLocalSubtitleStrokeEnabled] =
    useState(true);
  const [localSubtitleStrokeWidth, setLocalSubtitleStrokeWidth] =
    useState(2);
  const [localSubtitleStrokeColor, setLocalSubtitleStrokeColor] =
    useState("#000000");
  const [localSubtitleShadowEnabled, setLocalSubtitleShadowEnabled] =
    useState(false);
  const [localSubtitleShadowColor, setLocalSubtitleShadowColor] =
    useState("#000000");
  const [localSubtitleShadowOffsetX, setLocalSubtitleShadowOffsetX] =
    useState(2);
  const [localSubtitleShadowOffsetY, setLocalSubtitleShadowOffsetY] =
    useState(2);
  const [localSubtitleShadowBlur, setLocalSubtitleShadowBlur] =
    useState(0);
  const [localSubtitleBgEnabled, setLocalSubtitleBgEnabled] =
    useState(false);
  const [localSubtitleBgColor, setLocalSubtitleBgColor] =
    useState("#000000");
  const [localSubtitleBgOpacity, setLocalSubtitleBgOpacity] =
    useState(50);
  const [localSubtitleBgBorderRadius, setLocalSubtitleBgBorderRadius] =
    useState(0);
  const [localSubtitleBgPaddingH, setLocalSubtitleBgPaddingH] =
    useState(6);
  const [localSubtitleBgPaddingV, setLocalSubtitleBgPaddingV] =
    useState(2);
  const [localSubtitleAlignment, setLocalSubtitleAlignment] =
    useState(2);
  const [localSubtitleBottomMargin, setLocalSubtitleBottomMargin] =
    useState(240);
  const [localSubtitleEntranceEffect, setLocalSubtitleEntranceEffect] =
    useState("fade");
  const [localSubtitleBreakLength, setLocalSubtitleBreakLength] =
    useState(0);
  useEffect(() => {
    setLocalSubtitles(subtitleSegments);
  }, [subtitleSegments]);
  useEffect(() => {
    if (!subtitleEffectConfig) return;
    setLocalSubtitleFont(subtitleEffectConfig.font || "黑体");
    setLocalSubtitleFontSize(subtitleEffectConfig.fontSize || 36);
    setLocalSubtitleFontWeight(subtitleEffectConfig.fontWeight || 400);
    setLocalSubtitleColor(subtitleEffectConfig.color || "#DE0202");
    setLocalSubtitleStrokeEnabled(subtitleEffectConfig.strokeEnabled ?? true);
    setLocalSubtitleStrokeWidth(subtitleEffectConfig.strokeWidth ?? 2);
    setLocalSubtitleStrokeColor(subtitleEffectConfig.strokeColor || "#000000");
    setLocalSubtitleShadowEnabled(subtitleEffectConfig.shadowEnabled ?? false);
    setLocalSubtitleShadowColor(subtitleEffectConfig.shadowColor || "#000000");
    setLocalSubtitleShadowOffsetX(subtitleEffectConfig.shadowOffsetX ?? 2);
    setLocalSubtitleShadowOffsetY(subtitleEffectConfig.shadowOffsetY ?? 2);
    setLocalSubtitleShadowBlur(subtitleEffectConfig.shadowBlur ?? 0);
    setLocalSubtitleBgEnabled(subtitleEffectConfig.bgEnabled ?? false);
    setLocalSubtitleBgColor(subtitleEffectConfig.bgColor || "#000000");
    setLocalSubtitleBgOpacity(subtitleEffectConfig.bgOpacity ?? 50);
    setLocalSubtitleBgBorderRadius(subtitleEffectConfig.bgBorderRadius ?? 0);
    setLocalSubtitleBgPaddingH(subtitleEffectConfig.bgPaddingH ?? 6);
    setLocalSubtitleBgPaddingV(subtitleEffectConfig.bgPaddingV ?? 2);
    setLocalSubtitleAlignment(subtitleEffectConfig.alignment ?? 2);
    setLocalSubtitleBottomMargin(
      typeof subtitleEffectConfig.bottomMargin === "number"
        ? subtitleEffectConfig.bottomMargin
        : 240,
    );
    setLocalSubtitleEntranceEffect(
      subtitleEffectConfig.entranceEffect ?? "fade",
    );
    setLocalSubtitleBreakLength(subtitleEffectConfig.breakLength ?? 0);
  }, [subtitleEffectConfig]);
  const handleSubtitleTimeChange = (index, field, value) => {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;
    if (index < 0 || index >= subtitleSegments.length) return;
    const list = [...subtitleSegments];
    const seg = { ...list[index] };
    if (field === "start") {
      seg.start = Math.max(0, nextValue);
      if (seg.end < seg.start) seg.end = seg.start;
    } else {
      seg.end = Math.max(nextValue, seg.start);
    }
    list[index] = seg;
    setLocalSubtitles(list);
    onSubtitleSegmentsChange(list);
  };
  const handleSubtitleTextChange = (index, value) => {
    if (index < 0 || index >= subtitleSegments.length) return;
    const list = [...subtitleSegments];
    const seg = { ...list[index], text: value };
    list[index] = seg;
    setLocalSubtitles(list);
    onSubtitleSegmentsChange(list);
  };
  const handleAddSubtitleRow = () => {
    const base = subtitleSegments;
    const safeDur = Math.max(0, mixTimelineDuration ?? 60);
    let start;
    if (
      focusedSubtitleOriginalIndex !== null &&
      base[focusedSubtitleOriginalIndex]
    ) {
      const focusedSeg = base[focusedSubtitleOriginalIndex];
      const sorted = [...base].sort((a, b) => a.start - b.start);
      const focusedDisplayIdx = sorted.indexOf(focusedSeg);
      const nextSeg = sorted[focusedDisplayIdx + 1];
      start = Math.min(focusedSeg.end, nextSeg ? nextSeg.start - 0.1 : safeDur);
    } else {
      const lastEnd =
        base.length > 0
          ? Math.min(Math.max(...base.map((s) => s.end)), safeDur)
          : 0;
      start = Math.min(lastEnd, safeDur);
    }
    if (start >= safeDur) start = Math.max(0, safeDur - 1);
    let end = Math.min(start + 2, safeDur);
    if (end <= start) end = Math.min(start + 0.5, safeDur);
    const next = [...base, { start, end, text: "" }];
    setLocalSubtitles(next);
    onSubtitleSegmentsChange(next);
  };
  const handleRemoveSubtitleRow = (index) => {
    if (index < 0 || index >= subtitleSegments.length) return;
    const next = subtitleSegments.filter((_, i) => i !== index);
    setLocalSubtitles(next);
    onSubtitleSegmentsChange(next);
  };
  const updateMainTitle = (partial) => {
    if (!localTitleEffectConfig) return;
    const style = localTitleEffectConfig.style;
    const main = style.mainTitle || {
      font: "黑体",
      fontSize: 48,
      fontWeight: 400,
      color: "#FFFFFF",
      strokeColor: "#000000",
      top: 100,
      borderRadius: 10,
      backgroundColor: "transparent",
      breakLength: 0,
    };
    onLocalTitleChange({
      ...localTitleEffectConfig,
      style: { ...style, mainTitle: { ...main, ...partial } },
    });
  };
  const updateMainTitleText = (text) => {
    if (!localTitleEffectConfig) return;
    onLocalTitleChange({ ...localTitleEffectConfig, mainTitleText: text });
  };
  const updateSubTitleText = (text) => {
    if (!localTitleEffectConfig) return;
    onLocalTitleChange({ ...localTitleEffectConfig, subTitleText: text });
  };
  const updateSubTitle = (partial) => {
    if (!localTitleEffectConfig) return;
    const style = localTitleEffectConfig.style;
    const sub = style.subTitle || {
      font: "黑体",
      fontSize: 36,
      fontWeight: 400,
      color: "#FFFFFF",
      strokeColor: "#000000",
      top: 50,
      borderRadius: 10,
      backgroundColor: "transparent",
      breakLength: 0,
    };
    onLocalTitleChange({
      ...localTitleEffectConfig,
      style: { ...style, subTitle: { ...sub, ...partial } },
    });
  };
  const updateSubtitleStyle = (partial) => {
    if (!subtitleEffectConfig) return;
    onSubtitleEffectConfigChange({ ...subtitleEffectConfig, ...partial });
  };
  const [activeBgmFolder, setActiveBgmFolder] = useState("");
  const [selectedBgmId, setSelectedBgmId] = useState("");
  const [localBgmVolume, setLocalBgmVolume] = useState(
    Math.round(DEFAULT_BGM_CARD_MUSIC_VOLUME * 100),
  );
  const [localVoiceVolume, setLocalVoiceVolume] = useState(
    Math.round(DEFAULT_BGM_CARD_VOICE_VOLUME * 100),
  );
  const bgmUploadInputRef = useRef(null);
  const pendingBgmUploadCategoryRef = useRef("");
  const [bgmUploadCategoryModalOpen, setBgmUploadCategoryModalOpen] =
    useState(false);
  const builtinBgmsForPicker = useVideoPageStore((s) => s.builtinBgms);
  const uploadedBgmsForPicker = useVideoPageStore((s) => s.uploadedBgms);
  const smartCutUploadCategories = useMemo(
    () =>
      getUploadCategoryCandidates([
        ...uploadedBgmsForPicker,
        ...builtinBgmsForPicker,
      ]),
    [uploadedBgmsForPicker, builtinBgmsForPicker],
  );
  const allSmartCutBgms = useMemo(
    () => [...localUploadedBgms, ...localBuiltinBgms],
    [localUploadedBgms, localBuiltinBgms],
  );
  const bgmFolders = useMemo(() => {
    const set = new Set(allSmartCutBgms.map(normalizeBgmCategory));
    return orderedBgmCategoryList(set);
  }, [allSmartCutBgms]);
  useEffect(() => {
    if (localBgmEffectConfig) {
      setLocalBgmVolume(
        Math.round(
          (localBgmEffectConfig.volume ?? DEFAULT_BGM_CARD_MUSIC_VOLUME) * 100,
        ),
      );
      setLocalVoiceVolume(
        Math.round(
          (localBgmEffectConfig.voiceVolume ?? DEFAULT_BGM_CARD_VOICE_VOLUME) *
            100,
        ),
      );
      setSelectedBgmId(localBgmEffectConfig.selectedBgmId);
    } else {
      setLocalBgmVolume(Math.round(DEFAULT_BGM_CARD_MUSIC_VOLUME * 100));
      setLocalVoiceVolume(Math.round(DEFAULT_BGM_CARD_VOICE_VOLUME * 100));
      setSelectedBgmId("");
    }
  }, [localBgmEffectConfig]);
  useEffect(() => {
    if (!bgmFolders.length) {
      setActiveBgmFolder("");
      return;
    }
    setActiveBgmFolder((prev) =>
      bgmFolders.includes(prev) ? prev : bgmFolders[0],
    );
  }, [bgmFolders]);
  const handleSelectBgm = (bgmId) => {
    setSelectedBgmId(bgmId);
    onLocalBgmChange({
      selectedBgmId: bgmId,
      volume: localBgmVolume / 100,
      voiceVolume: localVoiceVolume / 100,
    });
  };
  const handleUploadBgmMaterial = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const uploadCategory = pendingBgmUploadCategoryRef.current.trim() || "推荐";
    pendingBgmUploadCategoryRef.current = "";
    const fileExtension = file.name.toLowerCase().split(".").pop();
    const allowedExtensions = ["wav", "mp3", "m4a"];
    if (!allowedExtensions.includes(fileExtension || "")) {
      showToast("只支持上传WAV、MP3、M4A 格式的音频文件", "info");
      event.target.value = "";
      return;
    }
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
            return;
          }
          const uploadResult = await window.api.uploadBgmMaterial(
            saveResult.file_path,
            file.name,
            uploadCategory,
          );
          if (uploadResult.success && uploadResult.file_path) {
            const cfg = await window.api.loadUploadedBgmsConfig();
            const newUploadedBgms = (cfg.bgms ?? []).map((b) =>
              b.id === uploadResult.bgm_id
                ? { ...b, category: uploadCategory }
                : b,
            );
            await window.api.saveUploadedBgmsConfig({ bgms: newUploadedBgms });
            onLocalBgmUpload(
              newUploadedBgms.map((b) => ({ ...b, category: b.category })),
            );
          } else {
            showToast(`上传失败: ${uploadResult.error || "未知错误"}`, "error");
          }
        } catch (error) {
          console.error("Upload bgm error:", error);
          showToast(
            `上传失败: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Read file error:", error);
      showToast(
        `上传失败: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
    event.target.value = "";
  };
  const currentBgmList = useMemo(
    () =>
      allSmartCutBgms.filter(
        (b) => normalizeBgmCategory(b) === activeBgmFolder,
      ),
    [allSmartCutBgms, activeBgmFolder],
  );
  return jsxRuntimeExports.jsxs("div", {
    className: "smartcut-resource-panel",
    children: [
      jsxRuntimeExports.jsxs("div", {
        className: "smartcut-panel-tabs",
        children: [
          jsxRuntimeExports.jsx("button", {
            type: "button",
            className: `smartcut-panel-tab ${activeType === "mix" ? "active" : ""}`,
            onClick: () => onSelectResource("mix"),
            children: "智能混剪",
          }),
          jsxRuntimeExports.jsx("button", {
            type: "button",
            className: `smartcut-panel-tab ${activeType === "pip" ? "active" : ""}`,
            onClick: () => onSelectResource("pip"),
            children: "画中�?,
          }),
          jsxRuntimeExports.jsx("button", {
            type: "button",
            className: `smartcut-panel-tab ${activeType === "title" ? "active" : ""}`,
            onClick: () => onSelectResource("title"),
            children: "标题",
          }),
          jsxRuntimeExports.jsx("button", {
            type: "button",
            className: `smartcut-panel-tab ${activeType === "subtitle" ? "active" : ""}`,
            onClick: () => onSelectResource("subtitle"),
            children: "字幕",
          }),
          jsxRuntimeExports.jsx("button", {
            type: "button",
            className: `smartcut-panel-tab ${activeType === "bgm" ? "active" : ""}`,
            onClick: () => onSelectResource("bgm"),
            children: "背景音乐",
          }),
        ],
      }),
      jsxRuntimeExports.jsxs("div", {
        className: "smartcut-resource-body",
        children: [
          activeType === "mix" &&
            jsxRuntimeExports.jsx("div", {
              className: "smartcut-resource-section smartcut-mix-section",
              children: jsxRuntimeExports.jsxs("div", {
                className: "smartcut-mix-material-tab",
                children: [
                  jsxRuntimeExports.jsx("div", {
                    className: "smartcut-mix-material-sidebar",
                    children: jsxRuntimeExports.jsxs("div", {
                      className: "smartcut-mix-category-list",
                      children: [
                        jsxRuntimeExports.jsx("button", {
                          type: "button",
                          className: `smartcut-mix-category ${activeMixCategory === "全部" ? "active" : ""}`,
                          onClick: () => setActiveMixCategory("全部"),
                          children: "全部",
                        }),
                        mixCategories.map((c) =>
                          jsxRuntimeExports.jsx(
                            "button",
                            {
                              type: "button",
                              className: `smartcut-mix-category ${activeMixCategory === c ? "active" : ""}`,
                              onClick: () => setActiveMixCategory(c),
                              children: c,
                            },
                            c,
                          ),
                        ),
                      ],
                    }),
                  }),
                  jsxRuntimeExports.jsxs("div", {
                    className: "smartcut-mix-material-main",
                    children: [
                      jsxRuntimeExports.jsxs("div", {
                        className: "smartcut-mix-upload-row",
                        children: [
                          jsxRuntimeExports.jsx("button", {
                            type: "button",
                            className: "video-button smartcut-mix-create-btn",
                            onClick: onStartMixWizard,
                            children: "上传素材",
                          }),
                          jsxRuntimeExports.jsx("button", {
                            type: "button",
                            className:
                              "video-button video-button-primary smartcut-mix-create-btn",
                            disabled:
                              autoAddingMix ||
                              mixResourcesWithVector.length === 0,
                            onClick: () => {
                              if (
                                !autoAddCategory &&
                                mixCategories.length > 0
                              ) {
                                setAutoAddCategory(mixCategories[0]);
                              }
                              setShowAutoAddCategoryDialog(true);
                            },
                            title:
                              mixResourcesWithVector.length === 0
                                ? "请先创建带向量的混剪素材"
                                : "根据字幕智能挑选混剪素材",
                            children: autoAddingMix
                              ? "智能添加中�?
                              : "智能添加",
                          }),
                          jsxRuntimeExports.jsx("button", {
                            type: "button",
                            className: "video-button smartcut-mix-create-btn",
                            disabled: !selectedMixResourceId,
                            onClick: () => onAddMixSegment?.(),
                            title: selectedMixResourceId
                              ? "按当前时间轴红线位置添加混剪"
                              : "请先选择一个混剪素材",
                            children: "添加",
                          }),
                        ],
                      }),
                      mixSegments.length > 0 &&
                        jsxRuntimeExports.jsx("div", {
                          className: "smartcut-pip-segment-list",
                          children: mixSegments
                            .slice()
                            .sort((a, b) => a.start - b.start)
                            .map((seg) => {
                              const res = mixResources.find(
                                (r) => r.id === seg.mixResourceId,
                              );
                              return jsxRuntimeExports.jsxs(
                                "div",
                                {
                                  className: "smartcut-pip-segment-row",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "smartcut-pip-segment-name",
                                        title: res?.name,
                                        children:
                                          res?.name ?? seg.mixResourceId,
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "span",
                                      {
                                        className: "smartcut-pip-segment-time",
                                        children: [
                                          seg.start.toFixed(1),
                                          "s - ",
                                          seg.end.toFixed(1),
                                          "s",
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsx(
                                      "button",
                                      {
                                        type: "button",
                                        className:
                                          "smartcut-subtitle-delete-btn smartcut-pip-segment-delete",
                                        onClick: () =>
                                          onMixSegmentsChange(
                                            mixSegments.filter(
                                              (s) => s.id !== seg.id,
                                            ),
                                          ),
                                        title: "删除该段",
                                        "aria-label": "删除",
                                        children:
                                          jsxRuntimeExports.jsx(
                                            "svg",
                                            {
                                              width: "12",
                                              height: "12",
                                              viewBox: "0 0 12 12",
                                              "aria-hidden": "true",
                                              focusable: "false",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "path",
                                                  {
                                                    d: "M3 3.5h6l-.5 6a1 1 0 0 1-1 .9H4.5a1 1 0 0 1-1-.9L3 3.5Zm1.5-1h3L7 1.5a1 1 0 0 0-.71-.3H5.71A1 1 0 0 0 5 1.5L4.5 2.5Z",
                                                    fill: "currentColor",
                                                  },
                                                ),
                                            },
                                          ),
                                      },
                                    ),
                                  ],
                                },
                                seg.id,
                              );
                            }),
                        }),
                      jsxRuntimeExports.jsx("div", {
                        className: "smartcut-mix-icon-grid",
                        children:
                          mixResources.length === 0
                            ? jsxRuntimeExports.jsx("div", {
                                className:
                                  "smartcut-resource-empty smartcut-mix-grid-empty",
                                children: "暂无混剪素材，请通过向导创建",
                              })
                            : mixResources
                                .filter((item) =>
                                  activeMixCategory === "全部"
                                    ? true
                                    : (item.category || "").trim() ===
                                      activeMixCategory,
                                )
                                .map((item) =>
                                  jsxRuntimeExports.jsx(
                                    "div",
                                    {
                                      className: `smartcut-mix-icon-item ${selectedMixResourceId === item.id ? "smartcut-mix-icon-item-selected" : ""}`,
                                      role: "button",
                                      tabIndex: 0,
                                      draggable: true,
                                      onDragStart: (e) => {
                                        e.dataTransfer.setData(
                                          "application/x-mix-resource-id",
                                          item.id,
                                        );
                                        const segDur =
                                          getSmartcutMixInitialSegmentDuration({
                                            duration: item.duration,
                                            path: item.path ?? "",
                                          });
                                        e.dataTransfer.setData(
                                          `application/x-mix-dur-${segDur}`,
                                          "",
                                        );
                                        e.dataTransfer.effectAllowed = "copy";
                                      },
                                      onClick: () =>
                                        onSelectMixResource?.(item.id),
                                      onKeyDown: (e) =>
                                        e.key === "Enter" &&
                                        onSelectMixResource?.(item.id),
                                      children:
                                        jsxRuntimeExports.jsxs(
                                          "div",
                                          {
                                            className: "smartcut-mix-icon-cell",
                                            children: [
                                              jsxRuntimeExports.jsx(
                                                "div",
                                                {
                                                  className:
                                                    "smartcut-mix-icon-thumb",
                                                  title: item.name,
                                                  children:
                                                    jsxRuntimeExports.jsx(
                                                      LocalVideoFirstFrameThumb,
                                                      { videoPath: item.path },
                                                    ),
                                                },
                                              ),
                                              jsxRuntimeExports.jsx(
                                                "span",
                                                {
                                                  className:
                                                    "smartcut-mix-icon-name",
                                                  title: item.name,
                                                  children: item.name,
                                                },
                                              ),
                                              jsxRuntimeExports.jsx(
                                                "span",
                                                {
                                                  className:
                                                    "smartcut-mix-icon-category",
                                                  children:
                                                    item.category || "未分析,
                                                },
                                              ),
                                              onRemoveMixResource &&
                                                jsxRuntimeExports.jsx(
                                                  "button",
                                                  {
                                                    type: "button",
                                                    className:
                                                      "smartcut-mix-icon-remove",
                                                    onClick: (e) => {
                                                      e.stopPropagation();
                                                      onRemoveMixResource(
                                                        item.id,
                                                      );
                                                    },
                                                    title: "删除该素材",
                                                    "aria-label": "删除",
                                                    children: "×",
                                                  },
                                                ),
                                            ],
                                          },
                                        ),
                                    },
                                    item.id,
                                  ),
                                ),
                      }),
                    ],
                  }),
                ],
              }),
            }),
          activeType === "pip" &&
            jsxRuntimeExports.jsxs("div", {
              className: "smartcut-resource-section smartcut-pip-section",
              children: [
                jsxRuntimeExports.jsxs("div", {
                  className:
                    "smartcut-subtitle-table-toolbar smartcut-mix-toolbar smartcut-pip-upload-row",
                  children: [
                    jsxRuntimeExports.jsx("button", {
                      type: "button",
                      className: "video-button smartcut-mix-create-btn",
                      onClick: () => pipFileInputRef.current?.click(),
                      children: "上传素材",
                    }),
                    jsxRuntimeExports.jsx("button", {
                      type: "button",
                      className: "video-button video-button-primary",
                      disabled: !selectedPipResourceId,
                      onClick: () => onAddPipSegment?.(),
                      title: selectedPipResourceId
                        ? "按当前时间轴红线位置添加画中画段"
                        : "请先选择一个画中画素材",
                      children: "添加",
                    }),
                    jsxRuntimeExports.jsx("input", {
                      type: "file",
                      ref: pipFileInputRef,
                      multiple: true,
                      accept:
                        "video/mp4,.mp4,image/jpeg,.jpg,.jpeg,image/png,.png",
                      className: "smartcut-wizard-file-input-hidden",
                      onChange: async (event) => {
                        const files = event.target.files
                          ? Array.from(event.target.files)
                          : [];
                        event.target.value = "";
                        if (files.length === 0 || !onPipResourcesChange) return;
                        const ext = (name) => {
                          const m = name.match(/\.([^.]+)$/);
                          return (m && m[1]) || "mp4";
                        };
                        const newItems = [];
                        let skippedCount = 0;
                        for (let i = 0; i < files.length; i += 1) {
                          const file = files[i];
                          if (!isAllowedSmartcutMp4VideoFile(file)) {
                            skippedCount += 1;
                            continue;
                          }
                          const id = `${Date.now()}_${i}_${file.name}`;
                          const fileName = `${id}.${ext(file.name)}`;
                          try {
                            const base64 = await new Promise(
                              (resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const dataUrl = reader.result;
                                  const base64Content =
                                    dataUrl.indexOf(",") >= 0
                                      ? dataUrl.split(",")[1]
                                      : dataUrl;
                                  resolve(base64Content || "");
                                };
                                reader.onerror = () => reject(reader.error);
                                reader.readAsDataURL(file);
                              },
                            );
                            const res = await window.api.saveFileFromBase64(
                              base64,
                              fileName,
                              "smartcut/pip",
                            );
                            if (res.success && res.file_path) {
                              const path = res.file_path;
                              const fileIsImage = isImageFile(file.name);
                              let duration;
                              if (fileIsImage) {
                                duration = Infinity;
                              } else {
                                const durRes =
                                  await window.api.getVideoDuration(path);
                                duration =
                                  durRes.success &&
                                  durRes.duration != null &&
                                  durRes.duration > 0
                                    ? durRes.duration
                                    : void 0;
                              }
                              newItems.push({
                                id,
                                name: file.name,
                                path,
                                duration,
                              });
                            }
                          } catch {}
                        }
                        if (newItems.length > 0) {
                          onPipResourcesChange([...pipResources, ...newItems]);
                        }
                        if (skippedCount > 0) {
                          showToast(
                            skippedCount === files.length
                              ? "仅支持 MP4 视频或 JPG/PNG 图片，请重新选择"
                              : `已跳过 ${skippedCount} 个不支持的文件，仅支持 MP4 视频或 JPG/PNG 图片`,
                            "info",
                          );
                        }
                      },
                    }),
                  ],
                }),
                pipSegments.length > 0 &&
                  jsxRuntimeExports.jsx("div", {
                    className: "smartcut-pip-segment-list",
                    children: pipSegments
                      .slice()
                      .sort((a, b) => a.start - b.start)
                      .map((seg) => {
                        const res = pipResources.find(
                          (r) => r.id === seg.pipResourceId,
                        );
                        return jsxRuntimeExports.jsxs(
                          "div",
                          {
                            className: "smartcut-pip-segment-row",
                            children: [
                              jsxRuntimeExports.jsx("span", {
                                className: "smartcut-pip-segment-name",
                                title: res?.name,
                                children: res?.name ?? seg.pipResourceId,
                              }),
                              jsxRuntimeExports.jsxs("span", {
                                className: "smartcut-pip-segment-time",
                                children: [
                                  seg.start.toFixed(1),
                                  "s - ",
                                  seg.end.toFixed(1),
                                  "s",
                                ],
                              }),
                              onPipSegmentsChange &&
                                jsxRuntimeExports.jsx(
                                  "button",
                                  {
                                    type: "button",
                                    className:
                                      "smartcut-subtitle-delete-btn smartcut-pip-segment-delete",
                                    onClick: () =>
                                      onPipSegmentsChange(
                                        pipSegments.filter(
                                          (s) => s.id !== seg.id,
                                        ),
                                      ),
                                    title: "删除该段",
                                    "aria-label": "删除",
                                    children:
                                      jsxRuntimeExports.jsx(
                                        "svg",
                                        {
                                          width: "12",
                                          height: "12",
                                          viewBox: "0 0 12 12",
                                          "aria-hidden": "true",
                                          focusable: "false",
                                          children:
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              {
                                                d: "M3 3.5h6l-.5 6a1 1 0 0 1-1 .9H4.5a1 1 0 0 1-1-.9L3 3.5Zm1.5-1h3L7 1.5a1 1 0 0 0-.71-.3H5.71A1 1 0 0 0 5 1.5L4.5 2.5Z",
                                                fill: "currentColor",
                                              },
                                            ),
                                        },
                                      ),
                                  },
                                ),
                            ],
                          },
                          seg.id,
                        );
                      }),
                  }),
                jsxRuntimeExports.jsx("div", {
                  className: "smartcut-mix-icon-grid smartcut-pip-icon-grid",
                  children:
                    pipResources.length === 0
                      ? jsxRuntimeExports.jsx("div", {
                          className:
                            "smartcut-resource-empty smartcut-mix-grid-empty",
                          children:
                            "暂无画中画素材，请点击「上传」添加视频或图片",
                        })
                      : pipResources.map((item) => {
                          const isSelected = selectedPipResourceId === item.id;
                          return jsxRuntimeExports.jsx(
                            "div",
                            {
                              className: `smartcut-mix-icon-item ${isSelected ? "smartcut-mix-icon-item-selected" : ""}`,
                              role: "button",
                              tabIndex: 0,
                              draggable: true,
                              onDragStart: (e) => {
                                e.dataTransfer.setData(
                                  "application/x-pip-resource-id",
                                  item.id,
                                );
                                const segDur =
                                  getSmartcutMixInitialSegmentDuration({
                                    duration: item.duration,
                                    path: item.path ?? "",
                                  });
                                e.dataTransfer.setData(
                                  `application/x-pip-dur-${segDur}`,
                                  "",
                                );
                                e.dataTransfer.effectAllowed = "copy";
                              },
                              onClick: () => {
                                onSelectPipResource?.(item.id);
                              },
                              children: jsxRuntimeExports.jsxs(
                                "div",
                                {
                                  className: "smartcut-mix-icon-cell",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        className: "smartcut-mix-icon-thumb",
                                        title: item.name,
                                        children:
                                          jsxRuntimeExports.jsx(
                                            LocalVideoFirstFrameThumb,
                                            { videoPath: item.path },
                                          ),
                                      },
                                    ),
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "smartcut-mix-icon-name",
                                        title: item.name,
                                        children: item.name,
                                      },
                                    ),
                                    onPipResourcesChange &&
                                      jsxRuntimeExports.jsx(
                                        "button",
                                        {
                                          type: "button",
                                          className: "smartcut-mix-icon-remove",
                                          onClick: (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onPipResourcesChange(
                                              pipResources.filter(
                                                (r) => r.id !== item.id,
                                              ),
                                            );
                                          },
                                          title: "删除该素材",
                                          "aria-label": "删除",
                                          children: "×",
                                        },
                                      ),
                                  ],
                                },
                              ),
                            },
                            item.id,
                          );
                        }),
                }),
              ],
            }),
          activeType === "title" &&
            jsxRuntimeExports.jsx("div", {
              className: "smartcut-resource-section smartcut-title-layout",
              children: !localTitleEffectConfig
                ? jsxRuntimeExports.jsxs("div", {
                    className: "smartcut-resource-empty smartcut-add-empty",
                    children: [
                      jsxRuntimeExports.jsxs("div", {
                        className: "smartcut-add-empty-row",
                        children: [
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-add-empty-title",
                            children: "标题",
                          }),
                          jsxRuntimeExports.jsx("button", {
                            type: "button",
                            className:
                              "smartcut-add-btn-small video-button video-button-primary",
                            disabled: isTitleGenerating,
                            onClick: () =>
                              onAddTitleClick
                                ? onAddTitleClick()
                                : onLocalTitleChange({
                                    ...DEFAULT_TITLE_CONFIG,
                                    mainTitleText: initialMainTitle ?? "",
                                    subTitleText: initialSubTitle ?? "",
                                  }),
                            children: isTitleGenerating
                              ? "生成中.."
                              : "添加标题",
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "smartcut-add-empty-placeholder",
                        children: [
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-add-empty-icon",
                            "aria-hidden": true,
                            children: jsxRuntimeExports.jsx(
                              "svg",
                              {
                                width: "28",
                                height: "28",
                                viewBox: "0 0 24 24",
                                fill: "none",
                                stroke: "currentColor",
                                strokeWidth: "1.5",
                                strokeLinecap: "round",
                                children: jsxRuntimeExports.jsx(
                                  "path",
                                  { d: "M4 6h16M4 12h16M4 18h10" },
                                ),
                              },
                            ),
                          }),
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-add-empty-hint",
                            children:
                              "点击上方按钮添加标题，可配置主标题、副标题及样�?,
                          }),
                        ],
                      }),
                    ],
                  })
                : jsxRuntimeExports.jsxs(
                    React.Fragment,
                    {
                      children: [
                        jsxRuntimeExports.jsxs("div", {
                          className: "sc-tab-bar",
                          children: [
                            jsxRuntimeExports.jsx("span", {
                              className: "sc-tab sc-tab--active",
                              style: {
                                cursor: "default",
                                pointerEvents: "none",
                              },
                              children: "标题样式",
                            }),
                            jsxRuntimeExports.jsx("div", {
                              className: "sc-tab-actions",
                              children: jsxRuntimeExports.jsx(
                                "button",
                                {
                                  type: "button",
                                  className: "smartcut-remove-btn",
                                  onClick: () => onLocalTitleChange(null),
                                  children: "移除标题",
                                },
                              ),
                            }),
                          ],
                        }),
                        jsxRuntimeExports.jsxs("div", {
                          className: "sc-panel-scroll",
                          children: [
                            builtinTitleStyles?.length > 0 &&
                              jsxRuntimeExports.jsx("div", {
                                className: "sc-sub-section",
                                children:
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className:
                                        "sc-style-presets sc-style-presets--title",
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "button",
                                          {
                                            type: "button",
                                            className: `sc-title-preset-card${localTitleEffectConfig?.style?.id === DEFAULT_TITLE_CONFIG.style.id ? " sc-title-preset-card--active" : ""}`,
                                            onClick: () =>
                                              handleApplyTitleStylePreset(
                                                DEFAULT_TITLE_CONFIG.style,
                                              ),
                                            children:
                                              jsxRuntimeExports.jsx(
                                                "div",
                                                {
                                                  className:
                                                    "sc-preset-preview-bg",
                                                  children:
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-title-preset-main",
                                                        style: {
                                                          color: "#aaa",
                                                          fontWeight: 400,
                                                        },
                                                        children: "无模板",
                                                      },
                                                    ),
                                                },
                                              ),
                                          },
                                        ),
                                        builtinTitleStyles.map((style) => {
                                          const m = style.mainTitle;
                                          const s = style.subTitle;
                                          const isActive =
                                            localTitleEffectConfig?.style
                                              ?.id === style.id;
                                          return jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              className: `sc-title-preset-card${isActive ? " sc-title-preset-card--active" : ""}`,
                                              onClick: () =>
                                                handleApplyTitleStylePreset(
                                                  style,
                                                ),
                                              title: style.name,
                                              children:
                                                jsxRuntimeExports.jsxs(
                                                  "div",
                                                  {
                                                    className:
                                                      "sc-preset-preview-bg",
                                                    children: [
                                                      jsxRuntimeExports.jsx(
                                                        "div",
                                                        {
                                                          style: {
                                                            padding:
                                                              m?.borderRadius
                                                                ? "1px 4px"
                                                                : void 0,
                                                            borderRadius:
                                                              m?.borderRadius
                                                                ? `${m.borderRadius * 0.26}px`
                                                                : void 0,
                                                            background:
                                                              m?.backgroundColor &&
                                                              m.backgroundColor !==
                                                                "transparent"
                                                                ? m.backgroundColor
                                                                : void 0,
                                                          },
                                                          children:
                                                            jsxRuntimeExports.jsx(
                                                              "span",
                                                              {
                                                                className:
                                                                  "sc-title-preset-main",
                                                                style: {
                                                                  color:
                                                                    m?.color ??
                                                                    "#fff",
                                                                  fontWeight:
                                                                    m?.fontWeight ??
                                                                    700,
                                                                  fontFamily:
                                                                    m?.font ??
                                                                    "黑体",
                                                                  textShadow:
                                                                    m?.strokeColor
                                                                      ? `1px 1px 2px ${m.strokeColor}`
                                                                      : void 0,
                                                                },
                                                                children:
                                                                  style.previewTitle ??
                                                                  "标题",
                                                              },
                                                            ),
                                                        },
                                                      ),
                                                      style.hasSubTitle &&
                                                        s &&
                                                        jsxRuntimeExports.jsx(
                                                          "div",
                                                          {
                                                            style: {
                                                              padding:
                                                                s.borderRadius
                                                                  ? "1px 4px"
                                                                  : void 0,
                                                              borderRadius:
                                                                s.borderRadius
                                                                  ? `${s.borderRadius * 0.26}px`
                                                                  : void 0,
                                                              background:
                                                                s.backgroundColor &&
                                                                s.backgroundColor !==
                                                                  "transparent"
                                                                  ? s.backgroundColor
                                                                  : void 0,
                                                            },
                                                            children:
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-title-preset-sub",
                                                                  style: {
                                                                    color:
                                                                      s.color ??
                                                                      "#ddd",
                                                                    fontFamily:
                                                                      s.font ??
                                                                      "黑体",
                                                                    fontWeight:
                                                                      s.fontWeight ??
                                                                      400,
                                                                    textShadow:
                                                                      s.strokeColor
                                                                        ? `1px 1px 2px ${s.strokeColor}`
                                                                        : void 0,
                                                                  },
                                                                  children:
                                                                    style.previewSubtitle ??
                                                                    "副标题",
                                                                },
                                                              ),
                                                          },
                                                        ),
                                                    ],
                                                  },
                                                ),
                                            },
                                            style.id,
                                          );
                                        }),
                                      ],
                                    },
                                  ),
                              }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section",
                              children: [
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-section-head",
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "主标题",
                                      },
                                    ),
                                }),
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-row",
                                  style: { marginTop: 4 },
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "input",
                                      {
                                        className: "sc-sub-select sc-sub-flex",
                                        type: "text",
                                        placeholder: "输入主标题内容",
                                        value:
                                          localTitleEffectConfig.mainTitleText ??
                                          "",
                                        onChange: (e) =>
                                          updateMainTitleText(e.target.value),
                                      },
                                    ),
                                }),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-section-head",
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "字体",
                                      },
                                    ),
                                }),
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-row",
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "select",
                                      {
                                        className: "sc-sub-select sc-sub-flex",
                                        value: localMainFont,
                                        onChange: (e) => {
                                          setLocalMainFont(e.target.value);
                                          updateMainTitle({
                                            font: e.target.value,
                                          });
                                        },
                                        children: (availableFonts.includes(
                                          localMainFont,
                                        )
                                          ? availableFonts
                                          : [localMainFont, ...availableFonts]
                                        ).map((f) =>
                                          jsxRuntimeExports.jsx(
                                            "option",
                                            { value: f, children: f },
                                            f,
                                          ),
                                        ),
                                      },
                                    ),
                                }),
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-row",
                                  children: [
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "字号",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className: "sc-sub-num",
                                              type: "number",
                                              min: 10,
                                              max: 200,
                                              value: localMainFontSize,
                                              onChange: (e) => {
                                                const v =
                                                  e.target.value === ""
                                                    ? ""
                                                    : Number(e.target.value);
                                                setLocalMainFontSize(v);
                                                updateMainTitle({
                                                  fontSize:
                                                    v === "" ? void 0 : v,
                                                });
                                              },
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "粗细",
                                            },
                                          ),
                                          jsxRuntimeExports.jsxs(
                                            "select",
                                            {
                                              className: "sc-sub-select-sm",
                                              value: localMainFontWeight || 400,
                                              onChange: (e) => {
                                                const v = Number(
                                                  e.target.value,
                                                );
                                                setLocalMainFontWeight(v);
                                                updateMainTitle({
                                                  fontWeight: v,
                                                });
                                              },
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "option",
                                                  {
                                                    value: 300,
                                                    children: "�?,
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "option",
                                                  {
                                                    value: 400,
                                                    children: "常规",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "option",
                                                  {
                                                    value: 700,
                                                    children: "加粗",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "option",
                                                  {
                                                    value: 900,
                                                    children: "黑体",
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "颜色",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className: "sc-sub-color",
                                              type: "color",
                                              value: localMainColor,
                                              onChange: (e) => {
                                                setLocalMainColor(
                                                  e.target.value,
                                                );
                                                updateMainTitle({
                                                  color: e.target.value,
                                                });
                                              },
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-section-head",
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "位置",
                                      },
                                    ),
                                }),
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-row",
                                  style: { alignItems: "center", gap: 6 },
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        className: "sc-align-btn-group",
                                        children: VALIGN_OPTS.map(([v, Icon]) =>
                                          jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              className: `sc-align-btn${localMainAlignV === v ? " sc-align-btn--active" : ""}`,
                                              onClick: () => {
                                                setLocalMainAlignV(v);
                                                updateMainTitle({ alignV: v });
                                              },
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  Icon,
                                                  {},
                                                ),
                                            },
                                            v,
                                          ),
                                        ),
                                      },
                                    ),
                                    jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        className: "sc-align-btn-group",
                                        children: HALIGN_OPTS.map(([h, Icon]) =>
                                          jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              className: `sc-align-btn${localMainAlignH === h ? " sc-align-btn--active" : ""}`,
                                              onClick: () => {
                                                setLocalMainAlignH(h);
                                                updateMainTitle({ alignH: h });
                                              },
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  Icon,
                                                  {},
                                                ),
                                            },
                                            h,
                                          ),
                                        ),
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "换行",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className: "sc-sub-num",
                                              type: "number",
                                              min: 0,
                                              max: 20,
                                              value: localMainBreakLength,
                                              onChange: (e) => {
                                                const v =
                                                  e.target.value === ""
                                                    ? ""
                                                    : Number(e.target.value);
                                                setLocalMainBreakLength(v);
                                                updateMainTitle({
                                                  breakLength: v === "" ? 0 : v,
                                                });
                                              },
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-row",
                                  children:
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline sc-sub-flex",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "偏移",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className: "sc-sub-range",
                                              type: "range",
                                              min: 0,
                                              max: 400,
                                              value:
                                                typeof localMainTop === "number"
                                                  ? localMainTop
                                                  : 100,
                                              onChange: (e) => {
                                                const v = Number(
                                                  e.target.value,
                                                );
                                                setLocalMainTop(v);
                                                updateMainTitle({ top: v });
                                              },
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-val",
                                              children:
                                                typeof localMainTop === "number"
                                                  ? localMainTop
                                                  : 100,
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                }),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-section-head",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "描边",
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "video-title-style-switch",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className:
                                                "video-title-style-check-input",
                                              type: "checkbox",
                                              checked: localMainStrokeEnabled,
                                              onChange: (e) => {
                                                setLocalMainStrokeEnabled(
                                                  e.target.checked,
                                                );
                                                updateMainTitle({
                                                  strokeEnabled:
                                                    e.target.checked,
                                                });
                                              },
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "video-title-style-switch-track",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "video-title-style-switch-thumb",
                                                  },
                                                ),
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                                localMainStrokeEnabled &&
                                  jsxRuntimeExports.jsxs(
                                    React.Fragment,
                                    {
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className: "sc-sub-inline",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "颜色",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-color",
                                                        type: "color",
                                                        value:
                                                          localMainStrokeColor,
                                                        onChange: (e) => {
                                                          setLocalMainStrokeColor(
                                                            e.target.value,
                                                          );
                                                          updateMainTitle({
                                                            strokeColor:
                                                              e.target.value,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "宽度",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 20,
                                                        step: 0.5,
                                                        value:
                                                          localMainStrokeWidth,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalMainStrokeWidth(
                                                            v,
                                                          );
                                                          updateMainTitle({
                                                            strokeWidth: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localMainStrokeWidth,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-section-head",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "阴影",
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "video-title-style-switch",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className:
                                                "video-title-style-check-input",
                                              type: "checkbox",
                                              checked: localMainShadowEnabled,
                                              onChange: (e) => {
                                                setLocalMainShadowEnabled(
                                                  e.target.checked,
                                                );
                                                updateMainTitle({
                                                  shadowEnabled:
                                                    e.target.checked,
                                                });
                                              },
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "video-title-style-switch-track",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "video-title-style-switch-thumb",
                                                  },
                                                ),
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                                localMainShadowEnabled &&
                                  jsxRuntimeExports.jsxs(
                                    React.Fragment,
                                    {
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className: "sc-sub-inline",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "颜色",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-color",
                                                        type: "color",
                                                        value:
                                                          localMainShadowColor,
                                                        onChange: (e) => {
                                                          setLocalMainShadowColor(
                                                            e.target.value,
                                                          );
                                                          updateMainTitle({
                                                            shadowColor:
                                                              e.target.value,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                        jsxRuntimeExports.jsxs(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children: [
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "X",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: -20,
                                                        max: 20,
                                                        step: 0.5,
                                                        value:
                                                          localMainShadowOffsetX,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalMainShadowOffsetX(
                                                            v,
                                                          );
                                                          updateMainTitle({
                                                            shadowOffsetX: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localMainShadowOffsetX,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "Y",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: -20,
                                                        max: 20,
                                                        step: 0.5,
                                                        value:
                                                          localMainShadowOffsetY,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalMainShadowOffsetY(
                                                            v,
                                                          );
                                                          updateMainTitle({
                                                            shadowOffsetY: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localMainShadowOffsetY,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                            ],
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "模糊",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 20,
                                                        step: 0.5,
                                                        value:
                                                          localMainShadowBlur,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalMainShadowBlur(
                                                            v,
                                                          );
                                                          updateMainTitle({
                                                            shadowBlur: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localMainShadowBlur,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-section-head",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "背景色",
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "video-title-style-switch",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className:
                                                "video-title-style-check-input",
                                              type: "checkbox",
                                              checked: localMainBgEnabled,
                                              onChange: (e) => {
                                                const en = e.target.checked;
                                                setLocalMainBgEnabled(en);
                                                if (en) {
                                                  const a =
                                                    localMainBgAlpha > 0
                                                      ? localMainBgAlpha
                                                      : 100;
                                                  setLocalMainBgAlpha(a);
                                                  updateMainTitle({
                                                    backgroundColor:
                                                      localMainBgColor +
                                                      toHexAlpha(a),
                                                  });
                                                } else {
                                                  updateMainTitle({
                                                    backgroundColor:
                                                      "transparent",
                                                  });
                                                }
                                              },
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "video-title-style-switch-track",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "video-title-style-switch-thumb",
                                                  },
                                                ),
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                                localMainBgEnabled &&
                                  jsxRuntimeExports.jsxs(
                                    React.Fragment,
                                    {
                                      children: [
                                        jsxRuntimeExports.jsxs(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children: [
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className: "sc-sub-inline",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "颜色",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-color",
                                                        type: "color",
                                                        value: localMainBgColor,
                                                        onChange: (e) => {
                                                          setLocalMainBgColor(
                                                            e.target.value,
                                                          );
                                                          updateMainTitle({
                                                            backgroundColor:
                                                              e.target.value +
                                                              toHexAlpha(
                                                                localMainBgAlpha,
                                                              ),
                                                          });
                                                        },
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "不透明",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 100,
                                                        value: localMainBgAlpha,
                                                        onChange: (e) => {
                                                          const v = Math.max(
                                                            0,
                                                            Math.min(
                                                              100,
                                                              Number(
                                                                e.target.value,
                                                              ) || 0,
                                                            ),
                                                          );
                                                          setLocalMainBgAlpha(
                                                            v,
                                                          );
                                                          updateMainTitle({
                                                            backgroundColor:
                                                              localMainBgColor +
                                                              toHexAlpha(v),
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsxs(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children: [
                                                          localMainBgAlpha,
                                                          "%",
                                                        ],
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                            ],
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "圆角",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 50,
                                                        value:
                                                          localMainBorderRadius ||
                                                          0,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalMainBorderRadius(
                                                            v,
                                                          );
                                                          updateMainTitle({
                                                            borderRadius: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localMainBorderRadius ||
                                                          0,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section",
                              children: [
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-section-head",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "副标题",
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "video-title-style-switch",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className:
                                                "video-title-style-check-input",
                                              type: "checkbox",
                                              checked: localSubtitleEnabled,
                                              onChange: (e) =>
                                                onLocalSubtitleEnabledChange(
                                                  e.target.checked,
                                                ),
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "video-title-style-switch-track",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "video-title-style-switch-thumb",
                                                  },
                                                ),
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                                localSubtitleEnabled &&
                                  localTitleEffectConfig.style.hasSubTitle &&
                                  jsxRuntimeExports.jsx("div", {
                                    className: "sc-sub-row",
                                    style: { marginTop: 4 },
                                    children:
                                      jsxRuntimeExports.jsx(
                                        "input",
                                        {
                                          className:
                                            "sc-sub-select sc-sub-flex",
                                          type: "text",
                                          placeholder: "输入副标题内容",
                                          value:
                                            localTitleEffectConfig.subTitleText ??
                                            "",
                                          onChange: (e) =>
                                            updateSubTitleText(e.target.value),
                                        },
                                      ),
                                  }),
                              ],
                            }),
                            localSubtitleEnabled &&
                              localTitleEffectConfig.style.hasSubTitle &&
                              jsxRuntimeExports.jsxs(
                                React.Fragment,
                                {
                                  children: [
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className:
                                          "sc-sub-section sc-sub-section--inner",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "div",
                                            {
                                              className: "sc-sub-section-head",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "sc-sub-section-title",
                                                    children: "字体",
                                                  },
                                                ),
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "div",
                                            {
                                              className: "sc-sub-row",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "select",
                                                  {
                                                    className:
                                                      "sc-sub-select sc-sub-flex",
                                                    value: localSubFont,
                                                    onChange: (e) => {
                                                      setLocalSubFont(
                                                        e.target.value,
                                                      );
                                                      updateSubTitle({
                                                        font: e.target.value,
                                                      });
                                                    },
                                                    children:
                                                      (availableFonts.includes(
                                                        localSubFont,
                                                      )
                                                        ? availableFonts
                                                        : [
                                                            localSubFont,
                                                            ...availableFonts,
                                                          ]
                                                      ).map((f) =>
                                                        jsxRuntimeExports.jsx(
                                                          "option",
                                                          {
                                                            value: f,
                                                            children: f,
                                                          },
                                                          f,
                                                        ),
                                                      ),
                                                  },
                                                ),
                                            },
                                          ),
                                          jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className: "sc-sub-row",
                                              children: [
                                                jsxRuntimeExports.jsxs(
                                                  "label",
                                                  {
                                                    className: "sc-sub-inline",
                                                    children: [
                                                      jsxRuntimeExports.jsx(
                                                        "span",
                                                        {
                                                          className:
                                                            "sc-sub-label-sm",
                                                          children: "字号",
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "sc-sub-num",
                                                          type: "number",
                                                          min: 8,
                                                          max: 200,
                                                          value:
                                                            localSubFontSize,
                                                          onChange: (e) => {
                                                            const v =
                                                              e.target.value ===
                                                              ""
                                                                ? ""
                                                                : Number(
                                                                    e.target
                                                                      .value,
                                                                  );
                                                            setLocalSubFontSize(
                                                              v,
                                                            );
                                                            updateSubTitle({
                                                              fontSize:
                                                                v === ""
                                                                  ? void 0
                                                                  : v,
                                                            });
                                                          },
                                                        },
                                                      ),
                                                    ],
                                                  },
                                                ),
                                                jsxRuntimeExports.jsxs(
                                                  "label",
                                                  {
                                                    className: "sc-sub-inline",
                                                    children: [
                                                      jsxRuntimeExports.jsx(
                                                        "span",
                                                        {
                                                          className:
                                                            "sc-sub-label-sm",
                                                          children: "粗细",
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsxs(
                                                        "select",
                                                        {
                                                          className:
                                                            "sc-sub-select-sm",
                                                          value:
                                                            localSubFontWeight ||
                                                            400,
                                                          onChange: (e) => {
                                                            const v = Number(
                                                              e.target.value,
                                                            );
                                                            setLocalSubFontWeight(
                                                              v,
                                                            );
                                                            updateSubTitle({
                                                              fontWeight: v,
                                                            });
                                                          },
                                                          children: [
                                                            jsxRuntimeExports.jsx(
                                                              "option",
                                                              {
                                                                value: 300,
                                                                children: "�?,
                                                              },
                                                            ),
                                                            jsxRuntimeExports.jsx(
                                                              "option",
                                                              {
                                                                value: 400,
                                                                children:
                                                                  "常规",
                                                              },
                                                            ),
                                                            jsxRuntimeExports.jsx(
                                                              "option",
                                                              {
                                                                value: 700,
                                                                children:
                                                                  "加粗",
                                                              },
                                                            ),
                                                            jsxRuntimeExports.jsx(
                                                              "option",
                                                              {
                                                                value: 900,
                                                                children:
                                                                  "黑体",
                                                              },
                                                            ),
                                                          ],
                                                        },
                                                      ),
                                                    ],
                                                  },
                                                ),
                                                jsxRuntimeExports.jsxs(
                                                  "label",
                                                  {
                                                    className: "sc-sub-inline",
                                                    children: [
                                                      jsxRuntimeExports.jsx(
                                                        "span",
                                                        {
                                                          className:
                                                            "sc-sub-label-sm",
                                                          children: "颜色",
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "sc-sub-color",
                                                          type: "color",
                                                          value: localSubColor,
                                                          onChange: (e) => {
                                                            setLocalSubColor(
                                                              e.target.value,
                                                            );
                                                            updateSubTitle({
                                                              color:
                                                                e.target.value,
                                                            });
                                                          },
                                                        },
                                                      ),
                                                    ],
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className:
                                          "sc-sub-section sc-sub-section--inner",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "div",
                                            {
                                              className: "sc-sub-section-head",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "sc-sub-section-title",
                                                    children: "位置",
                                                  },
                                                ),
                                            },
                                          ),
                                          jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className: "sc-sub-row",
                                              style: {
                                                alignItems: "center",
                                                gap: 6,
                                              },
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "div",
                                                  {
                                                    className:
                                                      "sc-align-btn-group",
                                                    children: VALIGN_OPTS.map(
                                                      ([v, Icon]) =>
                                                        jsxRuntimeExports.jsx(
                                                          "button",
                                                          {
                                                            type: "button",
                                                            className: `sc-align-btn${localSubAlignV === v ? " sc-align-btn--active" : ""}`,
                                                            onClick: () => {
                                                              setLocalSubAlignV(
                                                                v,
                                                              );
                                                              updateSubTitle({
                                                                alignV: v,
                                                              });
                                                            },
                                                            children:
                                                              jsxRuntimeExports.jsx(
                                                                Icon,
                                                                {},
                                                              ),
                                                          },
                                                          v,
                                                        ),
                                                    ),
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "div",
                                                  {
                                                    className:
                                                      "sc-align-btn-group",
                                                    children: HALIGN_OPTS.map(
                                                      ([h, Icon]) =>
                                                        jsxRuntimeExports.jsx(
                                                          "button",
                                                          {
                                                            type: "button",
                                                            className: `sc-align-btn${localSubAlignH === h ? " sc-align-btn--active" : ""}`,
                                                            onClick: () => {
                                                              setLocalSubAlignH(
                                                                h,
                                                              );
                                                              updateSubTitle({
                                                                alignH: h,
                                                              });
                                                            },
                                                            children:
                                                              jsxRuntimeExports.jsx(
                                                                Icon,
                                                                {},
                                                              ),
                                                          },
                                                          h,
                                                        ),
                                                    ),
                                                  },
                                                ),
                                                jsxRuntimeExports.jsxs(
                                                  "label",
                                                  {
                                                    className: "sc-sub-inline",
                                                    children: [
                                                      jsxRuntimeExports.jsx(
                                                        "span",
                                                        {
                                                          className:
                                                            "sc-sub-label-sm",
                                                          children: "换行",
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "sc-sub-num",
                                                          type: "number",
                                                          min: 0,
                                                          max: 20,
                                                          value:
                                                            localSubBreakLength,
                                                          onChange: (e) => {
                                                            const v =
                                                              e.target.value ===
                                                              ""
                                                                ? ""
                                                                : Number(
                                                                    e.target
                                                                      .value,
                                                                  );
                                                            setLocalSubBreakLength(
                                                              v,
                                                            );
                                                            updateSubTitle({
                                                              breakLength:
                                                                v === ""
                                                                  ? 0
                                                                  : v,
                                                            });
                                                          },
                                                        },
                                                      ),
                                                    ],
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "div",
                                            {
                                              className: "sc-sub-row",
                                              children:
                                                jsxRuntimeExports.jsxs(
                                                  "label",
                                                  {
                                                    className:
                                                      "sc-sub-inline sc-sub-flex",
                                                    children: [
                                                      jsxRuntimeExports.jsx(
                                                        "span",
                                                        {
                                                          className:
                                                            "sc-sub-label-sm",
                                                          children: "偏移",
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "sc-sub-range",
                                                          type: "range",
                                                          min: 0,
                                                          max: 500,
                                                          value:
                                                            typeof localSubTop ===
                                                            "number"
                                                              ? localSubTop
                                                              : 50,
                                                          onChange: (e) => {
                                                            const v = Number(
                                                              e.target.value,
                                                            );
                                                            setLocalSubTop(v);
                                                            updateSubTitle({
                                                              top: v,
                                                            });
                                                          },
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
                                                        "span",
                                                        {
                                                          className:
                                                            "sc-sub-val",
                                                          children:
                                                            typeof localSubTop ===
                                                            "number"
                                                              ? localSubTop
                                                              : 50,
                                                        },
                                                      ),
                                                    ],
                                                  },
                                                ),
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className:
                                          "sc-sub-section sc-sub-section--inner",
                                        children: [
                                          jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className: "sc-sub-section-head",
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "sc-sub-section-title",
                                                    children: "描边",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsxs(
                                                  "div",
                                                  {
                                                    className:
                                                      "video-title-style-switch",
                                                    children: [
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "video-title-style-check-input",
                                                          type: "checkbox",
                                                          checked:
                                                            localSubStrokeEnabled,
                                                          onChange: (e) => {
                                                            setLocalSubStrokeEnabled(
                                                              e.target.checked,
                                                            );
                                                            updateSubTitle({
                                                              strokeEnabled:
                                                                e.target
                                                                  .checked,
                                                            });
                                                          },
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
                                                        "span",
                                                        {
                                                          className:
                                                            "video-title-style-switch-track",
                                                          children:
                                                            jsxRuntimeExports.jsx(
                                                              "span",
                                                              {
                                                                className:
                                                                  "video-title-style-switch-thumb",
                                                              },
                                                            ),
                                                        },
                                                      ),
                                                    ],
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                          localSubStrokeEnabled &&
                                            jsxRuntimeExports.jsxs(
                                              React.Fragment,
                                              {
                                                children: [
                                                  jsxRuntimeExports.jsx(
                                                    "div",
                                                    {
                                                      className: "sc-sub-row",
                                                      children:
                                                        jsxRuntimeExports.jsxs(
                                                          "label",
                                                          {
                                                            className:
                                                              "sc-sub-inline",
                                                            children: [
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-label-sm",
                                                                  children:
                                                                    "颜色",
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "input",
                                                                {
                                                                  className:
                                                                    "sc-sub-color",
                                                                  type: "color",
                                                                  value:
                                                                    localSubStrokeColor,
                                                                  onChange: (
                                                                    e,
                                                                  ) => {
                                                                    setLocalSubStrokeColor(
                                                                      e.target
                                                                        .value,
                                                                    );
                                                                    updateSubTitle(
                                                                      {
                                                                        strokeColor:
                                                                          e
                                                                            .target
                                                                            .value,
                                                                      },
                                                                    );
                                                                  },
                                                                },
                                                              ),
                                                            ],
                                                          },
                                                        ),
                                                    },
                                                  ),
                                                  jsxRuntimeExports.jsx(
                                                    "div",
                                                    {
                                                      className: "sc-sub-row",
                                                      children:
                                                        jsxRuntimeExports.jsxs(
                                                          "label",
                                                          {
                                                            className:
                                                              "sc-sub-inline sc-sub-flex",
                                                            children: [
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-label-sm",
                                                                  children:
                                                                    "宽度",
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "input",
                                                                {
                                                                  className:
                                                                    "sc-sub-range",
                                                                  type: "range",
                                                                  min: 0,
                                                                  max: 20,
                                                                  step: 0.5,
                                                                  value:
                                                                    localSubStrokeWidth,
                                                                  onChange: (
                                                                    e,
                                                                  ) => {
                                                                    const v =
                                                                      Number(
                                                                        e.target
                                                                          .value,
                                                                      );
                                                                    setLocalSubStrokeWidth(
                                                                      v,
                                                                    );
                                                                    updateSubTitle(
                                                                      {
                                                                        strokeWidth:
                                                                          v,
                                                                      },
                                                                    );
                                                                  },
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-val",
                                                                  children:
                                                                    localSubStrokeWidth,
                                                                },
                                                              ),
                                                            ],
                                                          },
                                                        ),
                                                    },
                                                  ),
                                                ],
                                              },
                                            ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className:
                                          "sc-sub-section sc-sub-section--inner",
                                        children: [
                                          jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className: "sc-sub-section-head",
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "sc-sub-section-title",
                                                    children: "阴影",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsxs(
                                                  "div",
                                                  {
                                                    className:
                                                      "video-title-style-switch",
                                                    children: [
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "video-title-style-check-input",
                                                          type: "checkbox",
                                                          checked:
                                                            localSubShadowEnabled,
                                                          onChange: (e) => {
                                                            setLocalSubShadowEnabled(
                                                              e.target.checked,
                                                            );
                                                            updateSubTitle({
                                                              shadowEnabled:
                                                                e.target
                                                                  .checked,
                                                            });
                                                          },
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
                                                        "span",
                                                        {
                                                          className:
                                                            "video-title-style-switch-track",
                                                          children:
                                                            jsxRuntimeExports.jsx(
                                                              "span",
                                                              {
                                                                className:
                                                                  "video-title-style-switch-thumb",
                                                              },
                                                            ),
                                                        },
                                                      ),
                                                    ],
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                          localSubShadowEnabled &&
                                            jsxRuntimeExports.jsxs(
                                              React.Fragment,
                                              {
                                                children: [
                                                  jsxRuntimeExports.jsx(
                                                    "div",
                                                    {
                                                      className: "sc-sub-row",
                                                      children:
                                                        jsxRuntimeExports.jsxs(
                                                          "label",
                                                          {
                                                            className:
                                                              "sc-sub-inline",
                                                            children: [
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-label-sm",
                                                                  children:
                                                                    "颜色",
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "input",
                                                                {
                                                                  className:
                                                                    "sc-sub-color",
                                                                  type: "color",
                                                                  value:
                                                                    localSubShadowColor,
                                                                  onChange: (
                                                                    e,
                                                                  ) => {
                                                                    setLocalSubShadowColor(
                                                                      e.target
                                                                        .value,
                                                                    );
                                                                    updateSubTitle(
                                                                      {
                                                                        shadowColor:
                                                                          e
                                                                            .target
                                                                            .value,
                                                                      },
                                                                    );
                                                                  },
                                                                },
                                                              ),
                                                            ],
                                                          },
                                                        ),
                                                    },
                                                  ),
                                                  jsxRuntimeExports.jsxs(
                                                    "div",
                                                    {
                                                      className: "sc-sub-row",
                                                      children: [
                                                        jsxRuntimeExports.jsxs(
                                                          "label",
                                                          {
                                                            className:
                                                              "sc-sub-inline sc-sub-flex",
                                                            children: [
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-label-sm",
                                                                  children: "X",
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "input",
                                                                {
                                                                  className:
                                                                    "sc-sub-range",
                                                                  type: "range",
                                                                  min: -20,
                                                                  max: 20,
                                                                  step: 0.5,
                                                                  value:
                                                                    localSubShadowOffsetX,
                                                                  onChange: (
                                                                    e,
                                                                  ) => {
                                                                    const v =
                                                                      Number(
                                                                        e.target
                                                                          .value,
                                                                      );
                                                                    setLocalSubShadowOffsetX(
                                                                      v,
                                                                    );
                                                                    updateSubTitle(
                                                                      {
                                                                        shadowOffsetX:
                                                                          v,
                                                                      },
                                                                    );
                                                                  },
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-val",
                                                                  children:
                                                                    localSubShadowOffsetX,
                                                                },
                                                              ),
                                                            ],
                                                          },
                                                        ),
                                                        jsxRuntimeExports.jsxs(
                                                          "label",
                                                          {
                                                            className:
                                                              "sc-sub-inline sc-sub-flex",
                                                            children: [
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-label-sm",
                                                                  children: "Y",
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "input",
                                                                {
                                                                  className:
                                                                    "sc-sub-range",
                                                                  type: "range",
                                                                  min: -20,
                                                                  max: 20,
                                                                  step: 0.5,
                                                                  value:
                                                                    localSubShadowOffsetY,
                                                                  onChange: (
                                                                    e,
                                                                  ) => {
                                                                    const v =
                                                                      Number(
                                                                        e.target
                                                                          .value,
                                                                      );
                                                                    setLocalSubShadowOffsetY(
                                                                      v,
                                                                    );
                                                                    updateSubTitle(
                                                                      {
                                                                        shadowOffsetY:
                                                                          v,
                                                                      },
                                                                    );
                                                                  },
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-val",
                                                                  children:
                                                                    localSubShadowOffsetY,
                                                                },
                                                              ),
                                                            ],
                                                          },
                                                        ),
                                                      ],
                                                    },
                                                  ),
                                                  jsxRuntimeExports.jsx(
                                                    "div",
                                                    {
                                                      className: "sc-sub-row",
                                                      children:
                                                        jsxRuntimeExports.jsxs(
                                                          "label",
                                                          {
                                                            className:
                                                              "sc-sub-inline sc-sub-flex",
                                                            children: [
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-label-sm",
                                                                  children:
                                                                    "模糊",
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "input",
                                                                {
                                                                  className:
                                                                    "sc-sub-range",
                                                                  type: "range",
                                                                  min: 0,
                                                                  max: 20,
                                                                  step: 0.5,
                                                                  value:
                                                                    localSubShadowBlur,
                                                                  onChange: (
                                                                    e,
                                                                  ) => {
                                                                    const v =
                                                                      Number(
                                                                        e.target
                                                                          .value,
                                                                      );
                                                                    setLocalSubShadowBlur(
                                                                      v,
                                                                    );
                                                                    updateSubTitle(
                                                                      {
                                                                        shadowBlur:
                                                                          v,
                                                                      },
                                                                    );
                                                                  },
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-val",
                                                                  children:
                                                                    localSubShadowBlur,
                                                                },
                                                              ),
                                                            ],
                                                          },
                                                        ),
                                                    },
                                                  ),
                                                ],
                                              },
                                            ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className:
                                          "sc-sub-section sc-sub-section--inner",
                                        children: [
                                          jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className: "sc-sub-section-head",
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "sc-sub-section-title",
                                                    children: "背景色",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsxs(
                                                  "div",
                                                  {
                                                    className:
                                                      "video-title-style-switch",
                                                    children: [
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "video-title-style-check-input",
                                                          type: "checkbox",
                                                          checked:
                                                            localSubBgEnabled,
                                                          onChange: (e) => {
                                                            const en =
                                                              e.target.checked;
                                                            setLocalSubBgEnabled(
                                                              en,
                                                            );
                                                            if (en) {
                                                              const a =
                                                                localSubBgAlpha >
                                                                0
                                                                  ? localSubBgAlpha
                                                                  : 100;
                                                              setLocalSubBgAlpha(
                                                                a,
                                                              );
                                                              updateSubTitle({
                                                                backgroundColor:
                                                                  localSubBgColor +
                                                                  toHexAlpha(a),
                                                              });
                                                            } else {
                                                              updateSubTitle({
                                                                backgroundColor:
                                                                  "transparent",
                                                              });
                                                            }
                                                          },
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
                                                        "span",
                                                        {
                                                          className:
                                                            "video-title-style-switch-track",
                                                          children:
                                                            jsxRuntimeExports.jsx(
                                                              "span",
                                                              {
                                                                className:
                                                                  "video-title-style-switch-thumb",
                                                              },
                                                            ),
                                                        },
                                                      ),
                                                    ],
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                          localSubBgEnabled &&
                                            jsxRuntimeExports.jsxs(
                                              React.Fragment,
                                              {
                                                children: [
                                                  jsxRuntimeExports.jsxs(
                                                    "div",
                                                    {
                                                      className: "sc-sub-row",
                                                      children: [
                                                        jsxRuntimeExports.jsxs(
                                                          "label",
                                                          {
                                                            className:
                                                              "sc-sub-inline",
                                                            children: [
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-label-sm",
                                                                  children:
                                                                    "颜色",
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "input",
                                                                {
                                                                  className:
                                                                    "sc-sub-color",
                                                                  type: "color",
                                                                  value:
                                                                    localSubBgColor,
                                                                  onChange: (
                                                                    e,
                                                                  ) => {
                                                                    setLocalSubBgColor(
                                                                      e.target
                                                                        .value,
                                                                    );
                                                                    updateSubTitle(
                                                                      {
                                                                        backgroundColor:
                                                                          e
                                                                            .target
                                                                            .value +
                                                                          toHexAlpha(
                                                                            localSubBgAlpha,
                                                                          ),
                                                                      },
                                                                    );
                                                                  },
                                                                },
                                                              ),
                                                            ],
                                                          },
                                                        ),
                                                        jsxRuntimeExports.jsxs(
                                                          "label",
                                                          {
                                                            className:
                                                              "sc-sub-inline sc-sub-flex",
                                                            children: [
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-label-sm",
                                                                  children:
                                                                    "不透明",
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "input",
                                                                {
                                                                  className:
                                                                    "sc-sub-range",
                                                                  type: "range",
                                                                  min: 0,
                                                                  max: 100,
                                                                  value:
                                                                    localSubBgAlpha,
                                                                  onChange: (
                                                                    e,
                                                                  ) => {
                                                                    const v =
                                                                      Math.max(
                                                                        0,
                                                                        Math.min(
                                                                          100,
                                                                          Number(
                                                                            e
                                                                              .target
                                                                              .value,
                                                                          ) ||
                                                                            0,
                                                                        ),
                                                                      );
                                                                    setLocalSubBgAlpha(
                                                                      v,
                                                                    );
                                                                    updateSubTitle(
                                                                      {
                                                                        backgroundColor:
                                                                          localSubBgColor +
                                                                          toHexAlpha(
                                                                            v,
                                                                          ),
                                                                      },
                                                                    );
                                                                  },
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsxs(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-val",
                                                                  children: [
                                                                    localSubBgAlpha,
                                                                    "%",
                                                                  ],
                                                                },
                                                              ),
                                                            ],
                                                          },
                                                        ),
                                                      ],
                                                    },
                                                  ),
                                                  jsxRuntimeExports.jsx(
                                                    "div",
                                                    {
                                                      className: "sc-sub-row",
                                                      children:
                                                        jsxRuntimeExports.jsxs(
                                                          "label",
                                                          {
                                                            className:
                                                              "sc-sub-inline sc-sub-flex",
                                                            children: [
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-label-sm",
                                                                  children:
                                                                    "圆角",
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "input",
                                                                {
                                                                  className:
                                                                    "sc-sub-range",
                                                                  type: "range",
                                                                  min: 0,
                                                                  max: 50,
                                                                  value:
                                                                    localSubBorderRadius ||
                                                                    0,
                                                                  onChange: (
                                                                    e,
                                                                  ) => {
                                                                    const v =
                                                                      Number(
                                                                        e.target
                                                                          .value,
                                                                      );
                                                                    setLocalSubBorderRadius(
                                                                      v,
                                                                    );
                                                                    updateSubTitle(
                                                                      {
                                                                        borderRadius:
                                                                          v,
                                                                      },
                                                                    );
                                                                  },
                                                                },
                                                              ),
                                                              jsxRuntimeExports.jsx(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "sc-sub-val",
                                                                  children:
                                                                    localSubBorderRadius ||
                                                                    0,
                                                                },
                                                              ),
                                                            ],
                                                          },
                                                        ),
                                                    },
                                                  ),
                                                ],
                                              },
                                            ),
                                        ],
                                      },
                                    ),
                                  ],
                                },
                              ),
                          ],
                        }),
                      ],
                    },
                  ),
            }),
          activeType === "subtitle" &&
            jsxRuntimeExports.jsx("div", {
              className: "smartcut-resource-section smartcut-subtitle-layout",
              children: !subtitleEffectConfig
                ? jsxRuntimeExports.jsxs("div", {
                    className: "smartcut-resource-empty smartcut-add-empty",
                    children: [
                      jsxRuntimeExports.jsxs("div", {
                        className: "smartcut-add-empty-row",
                        children: [
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-add-empty-title",
                            children: "字幕",
                          }),
                          jsxRuntimeExports.jsx("button", {
                            type: "button",
                            className:
                              "smartcut-add-btn-small video-button video-button-primary",
                            disabled: isWhisperGenerating,
                            onClick: () =>
                              onAddSubtitleClick
                                ? onAddSubtitleClick()
                                : onSubtitleEffectConfigChange(
                                    DEFAULT_SUBTITLE_CONFIG,
                                  ),
                            children: isWhisperGenerating
                              ? "生成中.."
                              : "添加字幕",
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "smartcut-add-empty-placeholder",
                        children: [
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-add-empty-icon",
                            "aria-hidden": true,
                            children: jsxRuntimeExports.jsx(
                              "svg",
                              {
                                width: "28",
                                height: "28",
                                viewBox: "0 0 24 24",
                                fill: "none",
                                stroke: "currentColor",
                                strokeWidth: "1.5",
                                strokeLinecap: "round",
                                children: jsxRuntimeExports.jsx(
                                  "path",
                                  { d: "M7 8h10M7 12h10M7 16h6" },
                                ),
                              },
                            ),
                          }),
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-add-empty-hint",
                            children:
                              "点击上方按钮添加字幕，可配置样式与时间轴",
                          }),
                        ],
                      }),
                    ],
                  })
                : jsxRuntimeExports.jsxs(
                    React.Fragment,
                    {
                      children: [
                        jsxRuntimeExports.jsxs("div", {
                          className: "sc-tab-bar",
                          children: [
                            jsxRuntimeExports.jsx("button", {
                              type: "button",
                              className: `sc-tab${subtitleTab === "style" ? " sc-tab--active" : ""}`,
                              onClick: () => setSubtitleTab("style"),
                              children: "字幕样式",
                            }),
                            jsxRuntimeExports.jsx("button", {
                              type: "button",
                              className: `sc-tab${subtitleTab === "timeline" ? " sc-tab--active" : ""}`,
                              onClick: () => setSubtitleTab("timeline"),
                              children: "字幕时间戳,
                            }),
                            jsxRuntimeExports.jsx("div", {
                              className: "sc-tab-actions",
                              children: jsxRuntimeExports.jsx(
                                "button",
                                {
                                  type: "button",
                                  className: "smartcut-remove-btn",
                                  onClick: () =>
                                    onSubtitleEffectConfigChange(null),
                                  children: "移除字幕",
                                },
                              ),
                            }),
                          ],
                        }),
                        jsxRuntimeExports.jsxs("div", {
                          className:
                            "smartcut-subtitle-style-section sc-panel-scroll",
                          style: {
                            display: subtitleTab === "style" ? void 0 : "none",
                          },
                          children: [
                            builtinTitleStyles?.filter((s) => s.subtitleEffect)
                              .length > 0 &&
                              jsxRuntimeExports.jsx("div", {
                                className: "sc-sub-section",
                                children:
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className:
                                        "sc-style-presets sc-style-presets--subtitle",
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "button",
                                          {
                                            type: "button",
                                            className: `sc-subtitle-preset-card${localSubtitleStyleId === "__default__" ? " sc-subtitle-preset-card--active" : ""}`,
                                            onClick: () =>
                                              handleApplySubtitlePreset({
                                                subtitleEffect:
                                                  DEFAULT_SUBTITLE_CONFIG,
                                              }),
                                            children:
                                              jsxRuntimeExports.jsx(
                                                "div",
                                                {
                                                  className:
                                                    "sc-preset-preview-bg",
                                                  children:
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-subtitle-preset-text",
                                                        style: {
                                                          color:
                                                            DEFAULT_SUBTITLE_CONFIG.color,
                                                          fontFamily:
                                                            DEFAULT_SUBTITLE_CONFIG.font,
                                                          fontWeight:
                                                            DEFAULT_SUBTITLE_CONFIG.fontWeight,
                                                          WebkitTextStroke:
                                                            DEFAULT_SUBTITLE_CONFIG.strokeEnabled
                                                              ? `${DEFAULT_SUBTITLE_CONFIG.strokeWidth ?? 1}px ${DEFAULT_SUBTITLE_CONFIG.strokeColor ?? "#000"}`
                                                              : void 0,
                                                          paintOrder:
                                                            DEFAULT_SUBTITLE_CONFIG.strokeEnabled
                                                              ? "stroke fill"
                                                              : void 0,
                                                          textShadow:
                                                            DEFAULT_SUBTITLE_CONFIG.shadowEnabled
                                                              ? `2px 2px 3px ${DEFAULT_SUBTITLE_CONFIG.shadowColor ?? "#000"}`
                                                              : void 0,
                                                        },
                                                        children: "无模板",
                                                      },
                                                    ),
                                                },
                                              ),
                                          },
                                        ),
                                        builtinTitleStyles
                                          .filter((s) => s.subtitleEffect)
                                          .map((style) => {
                                            const se = style.subtitleEffect;
                                            const isActive =
                                              localSubtitleStyleId === style.id;
                                            const bgHex = se.bgEnabled
                                              ? `${se.bgColor ?? "#000"}${Math.round(
                                                  ((se.bgOpacity ?? 50) / 100) *
                                                    255,
                                                )
                                                  .toString(16)
                                                  .padStart(2, "0")}`
                                              : void 0;
                                            return jsxRuntimeExports.jsx(
                                              "button",
                                              {
                                                type: "button",
                                                className: `sc-subtitle-preset-card${isActive ? " sc-subtitle-preset-card--active" : ""}`,
                                                onClick: () =>
                                                  handleApplySubtitlePreset(
                                                    style,
                                                  ),
                                                title: style.name,
                                                children:
                                                  jsxRuntimeExports.jsx(
                                                    "div",
                                                    {
                                                      className:
                                                        "sc-preset-preview-bg",
                                                      children:
                                                        jsxRuntimeExports.jsx(
                                                          "span",
                                                          {
                                                            className:
                                                              "sc-subtitle-preset-text",
                                                            style: {
                                                              color:
                                                                se.color ??
                                                                "#fff",
                                                              fontFamily:
                                                                se.font ??
                                                                "黑体",
                                                              fontWeight:
                                                                se.fontWeight ??
                                                                400,
                                                              WebkitTextStroke:
                                                                se.strokeEnabled
                                                                  ? `${se.strokeWidth ?? 1}px ${se.strokeColor ?? "#000"}`
                                                                  : void 0,
                                                              paintOrder:
                                                                se.strokeEnabled
                                                                  ? "stroke fill"
                                                                  : void 0,
                                                              textShadow:
                                                                se.shadowEnabled
                                                                  ? `2px 2px 3px ${se.shadowColor ?? "#000"}`
                                                                  : void 0,
                                                              background: bgHex,
                                                            },
                                                            children:
                                                              style
                                                                .previewCaptions?.[0] ??
                                                              "字幕示例",
                                                          },
                                                        ),
                                                    },
                                                  ),
                                              },
                                              style.id,
                                            );
                                          }),
                                      ],
                                    },
                                  ),
                              }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-section-head",
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "字体",
                                      },
                                    ),
                                }),
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-row",
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "select",
                                      {
                                        className: "sc-sub-select sc-sub-flex",
                                        value: localSubtitleFont,
                                        onChange: (e) => {
                                          setLocalSubtitleFont(e.target.value);
                                          updateSubtitleStyle({
                                            font: e.target.value,
                                          });
                                        },
                                        children: (availableFonts.includes(
                                          localSubtitleFont,
                                        )
                                          ? availableFonts
                                          : [
                                              localSubtitleFont,
                                              ...availableFonts,
                                            ]
                                        ).map((f) =>
                                          jsxRuntimeExports.jsx(
                                            "option",
                                            { value: f, children: f },
                                            f,
                                          ),
                                        ),
                                      },
                                    ),
                                }),
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-row",
                                  children: [
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "字号",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className: "sc-sub-num",
                                              type: "number",
                                              min: 12,
                                              max: 200,
                                              value: localSubtitleFontSize,
                                              onChange: (e) => {
                                                const v = Math.max(
                                                  12,
                                                  Number(e.target.value) || 12,
                                                );
                                                setLocalSubtitleFontSize(v);
                                                updateSubtitleStyle({
                                                  fontSize: v,
                                                });
                                              },
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "粗细",
                                            },
                                          ),
                                          jsxRuntimeExports.jsxs(
                                            "select",
                                            {
                                              className: "sc-sub-select-sm",
                                              value: localSubtitleFontWeight,
                                              onChange: (e) => {
                                                const v = Number(
                                                  e.target.value,
                                                );
                                                setLocalSubtitleFontWeight(v);
                                                updateSubtitleStyle({
                                                  fontWeight: v,
                                                });
                                              },
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "option",
                                                  {
                                                    value: 400,
                                                    children: "常规",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "option",
                                                  {
                                                    value: 700,
                                                    children: "加粗",
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "颜色",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className: "sc-sub-color",
                                              type: "color",
                                              value: localSubtitleColor,
                                              onChange: (e) => {
                                                setLocalSubtitleColor(
                                                  e.target.value,
                                                );
                                                updateSubtitleStyle({
                                                  color: e.target.value,
                                                });
                                              },
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-section-head",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "位置",
                                      },
                                    ),
                                    subtitleEffectConfig?.posX != null &&
                                      jsxRuntimeExports.jsx(
                                        "button",
                                        {
                                          type: "button",
                                          className:
                                            "smartcut-subtitle-reset-pos-btn",
                                          onClick: () =>
                                            updateSubtitleStyle({
                                              posX: null,
                                              posY: null,
                                            }),
                                          children: "重置",
                                        },
                                      ),
                                  ],
                                }),
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-row",
                                  style: { alignItems: "center", gap: 6 },
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        className: "sc-align-btn-group",
                                        children: VALIGN_OPTS.map(
                                          ([v, Icon]) => {
                                            const curV =
                                              localSubtitleAlignment >= 7
                                                ? "top"
                                                : localSubtitleAlignment >= 4
                                                  ? "middle"
                                                  : "bottom";
                                            return jsxRuntimeExports.jsx(
                                              "button",
                                              {
                                                type: "button",
                                                className: `sc-align-btn${curV === v ? " sc-align-btn--active" : ""}`,
                                                onClick: () => {
                                                  const vBase =
                                                    v === "top"
                                                      ? 7
                                                      : v === "middle"
                                                        ? 4
                                                        : 1;
                                                  const hOff =
                                                    localSubtitleAlignment %
                                                      3 ===
                                                    0
                                                      ? 2
                                                      : localSubtitleAlignment %
                                                            3 ===
                                                          1
                                                        ? 0
                                                        : 1;
                                                  const a = vBase + hOff;
                                                  setLocalSubtitleAlignment(a);
                                                  updateSubtitleStyle({
                                                    alignment: a,
                                                    posX: null,
                                                    posY: null,
                                                  });
                                                },
                                                children:
                                                  jsxRuntimeExports.jsx(
                                                    Icon,
                                                    {},
                                                  ),
                                              },
                                              v,
                                            );
                                          },
                                        ),
                                      },
                                    ),
                                    jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        className: "sc-align-btn-group",
                                        children: HALIGN_OPTS.map(
                                          ([h, Icon]) => {
                                            const curH =
                                              localSubtitleAlignment % 3 === 1
                                                ? "left"
                                                : localSubtitleAlignment % 3 ===
                                                    2
                                                  ? "center"
                                                  : "right";
                                            return jsxRuntimeExports.jsx(
                                              "button",
                                              {
                                                type: "button",
                                                className: `sc-align-btn${curH === h ? " sc-align-btn--active" : ""}`,
                                                onClick: () => {
                                                  const vBase =
                                                    localSubtitleAlignment >= 7
                                                      ? 7
                                                      : localSubtitleAlignment >=
                                                          4
                                                        ? 4
                                                        : 1;
                                                  const hOff =
                                                    h === "left"
                                                      ? 0
                                                      : h === "center"
                                                        ? 1
                                                        : 2;
                                                  const a = vBase + hOff;
                                                  setLocalSubtitleAlignment(a);
                                                  updateSubtitleStyle({
                                                    alignment: a,
                                                    posX: null,
                                                    posY: null,
                                                  });
                                                },
                                                children:
                                                  jsxRuntimeExports.jsx(
                                                    Icon,
                                                    {},
                                                  ),
                                              },
                                              h,
                                            );
                                          },
                                        ),
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "换行",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className: "sc-sub-num",
                                              type: "number",
                                              min: 0,
                                              max: 20,
                                              value: localSubtitleBreakLength,
                                              onChange: (e) => {
                                                const v =
                                                  e.target.value === ""
                                                    ? ""
                                                    : Number(e.target.value);
                                                setLocalSubtitleBreakLength(v);
                                                updateSubtitleStyle({
                                                  breakLength: v === "" ? 0 : v,
                                                });
                                              },
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-row",
                                  children:
                                    jsxRuntimeExports.jsxs(
                                      "label",
                                      {
                                        className: "sc-sub-inline sc-sub-flex",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-label-sm",
                                              children: "边距",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className: "sc-sub-range",
                                              type: "range",
                                              min: 0,
                                              max: 400,
                                              value: localSubtitleBottomMargin,
                                              onChange: (e) => {
                                                const v = Number(
                                                  e.target.value,
                                                );
                                                setLocalSubtitleBottomMargin(v);
                                                updateSubtitleStyle({
                                                  bottomMargin: v,
                                                  posX: null,
                                                  posY: null,
                                                });
                                              },
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className: "sc-sub-val",
                                              children:
                                                localSubtitleBottomMargin,
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                }),
                                jsxRuntimeExports.jsx("span", {
                                  className: "smartcut-subtitle-drag-hint",
                                  children: "可在预览中拖拽字幕调整位�?,
                                }),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-section-head",
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "入场效果",
                                      },
                                    ),
                                }),
                                jsxRuntimeExports.jsx("div", {
                                  className: "sc-sub-row",
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        className:
                                          "smartcut-subtitle-effect-row",
                                        children: [
                                          { value: "none", label: "�? },
                                          { value: "fade", label: "淡入淡出" },
                                          {
                                            value: "slide_up",
                                            label: "向上滑入",
                                          },
                                          {
                                            value: "typewriter",
                                            label: "打字幕,
                                          },
                                          { value: "pop", label: "弹出" },
                                        ].map((opt) =>
                                          jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              className: `smartcut-subtitle-effect-btn ${localSubtitleEntranceEffect === opt.value ? "smartcut-subtitle-effect-btn-active" : ""}`,
                                              onClick: () => {
                                                setLocalSubtitleEntranceEffect(
                                                  opt.value,
                                                );
                                                updateSubtitleStyle({
                                                  entranceEffect: opt.value,
                                                });
                                              },
                                              children: opt.label,
                                            },
                                            opt.value,
                                          ),
                                        ),
                                      },
                                    ),
                                }),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-section-head",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "描边",
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "video-title-style-switch",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className:
                                                "video-title-style-check-input",
                                              type: "checkbox",
                                              checked:
                                                localSubtitleStrokeEnabled,
                                              onChange: (e) => {
                                                setLocalSubtitleStrokeEnabled(
                                                  e.target.checked,
                                                );
                                                updateSubtitleStyle({
                                                  strokeEnabled:
                                                    e.target.checked,
                                                });
                                              },
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "video-title-style-switch-track",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "video-title-style-switch-thumb",
                                                  },
                                                ),
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                                localSubtitleStrokeEnabled &&
                                  jsxRuntimeExports.jsxs(
                                    React.Fragment,
                                    {
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className: "sc-sub-inline",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "颜色",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-color",
                                                        type: "color",
                                                        value:
                                                          localSubtitleStrokeColor,
                                                        onChange: (e) => {
                                                          setLocalSubtitleStrokeColor(
                                                            e.target.value,
                                                          );
                                                          updateSubtitleStyle({
                                                            strokeColor:
                                                              e.target.value,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "宽度",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 20,
                                                        step: 0.5,
                                                        value:
                                                          localSubtitleStrokeWidth,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalSubtitleStrokeWidth(
                                                            v,
                                                          );
                                                          updateSubtitleStyle({
                                                            strokeWidth: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localSubtitleStrokeWidth,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-section-head",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "阴影",
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "video-title-style-switch",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className:
                                                "video-title-style-check-input",
                                              type: "checkbox",
                                              checked:
                                                localSubtitleShadowEnabled,
                                              onChange: (e) => {
                                                setLocalSubtitleShadowEnabled(
                                                  e.target.checked,
                                                );
                                                updateSubtitleStyle({
                                                  shadowEnabled:
                                                    e.target.checked,
                                                });
                                              },
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "video-title-style-switch-track",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "video-title-style-switch-thumb",
                                                  },
                                                ),
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                                localSubtitleShadowEnabled &&
                                  jsxRuntimeExports.jsxs(
                                    React.Fragment,
                                    {
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className: "sc-sub-inline",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "颜色",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-color",
                                                        type: "color",
                                                        value:
                                                          localSubtitleShadowColor,
                                                        onChange: (e) => {
                                                          setLocalSubtitleShadowColor(
                                                            e.target.value,
                                                          );
                                                          updateSubtitleStyle({
                                                            shadowColor:
                                                              e.target.value,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                        jsxRuntimeExports.jsxs(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children: [
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "X",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: -20,
                                                        max: 20,
                                                        step: 0.5,
                                                        value:
                                                          localSubtitleShadowOffsetX,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalSubtitleShadowOffsetX(
                                                            v,
                                                          );
                                                          updateSubtitleStyle({
                                                            shadowOffsetX: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localSubtitleShadowOffsetX,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "Y",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: -20,
                                                        max: 20,
                                                        step: 0.5,
                                                        value:
                                                          localSubtitleShadowOffsetY,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalSubtitleShadowOffsetY(
                                                            v,
                                                          );
                                                          updateSubtitleStyle({
                                                            shadowOffsetY: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localSubtitleShadowOffsetY,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                            ],
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "模糊",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 20,
                                                        step: 0.5,
                                                        value:
                                                          localSubtitleShadowBlur,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalSubtitleShadowBlur(
                                                            v,
                                                          );
                                                          updateSubtitleStyle({
                                                            shadowBlur: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localSubtitleShadowBlur,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className: "sc-sub-section sc-sub-section--inner",
                              children: [
                                jsxRuntimeExports.jsxs("div", {
                                  className: "sc-sub-section-head",
                                  children: [
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "sc-sub-section-title",
                                        children: "背景色",
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "video-title-style-switch",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              className:
                                                "video-title-style-check-input",
                                              type: "checkbox",
                                              checked: localSubtitleBgEnabled,
                                              onChange: (e) => {
                                                setLocalSubtitleBgEnabled(
                                                  e.target.checked,
                                                );
                                                updateSubtitleStyle({
                                                  bgEnabled: e.target.checked,
                                                });
                                              },
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "video-title-style-switch-track",
                                              children:
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "video-title-style-switch-thumb",
                                                  },
                                                ),
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                                localSubtitleBgEnabled &&
                                  jsxRuntimeExports.jsxs(
                                    React.Fragment,
                                    {
                                      children: [
                                        jsxRuntimeExports.jsxs(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children: [
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className: "sc-sub-inline",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "颜色",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-color",
                                                        type: "color",
                                                        value:
                                                          localSubtitleBgColor,
                                                        onChange: (e) => {
                                                          setLocalSubtitleBgColor(
                                                            e.target.value,
                                                          );
                                                          updateSubtitleStyle({
                                                            bgColor:
                                                              e.target.value,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "不透明",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 100,
                                                        value:
                                                          localSubtitleBgOpacity,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalSubtitleBgOpacity(
                                                            v,
                                                          );
                                                          updateSubtitleStyle({
                                                            bgOpacity: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsxs(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children: [
                                                          localSubtitleBgOpacity,
                                                          "%",
                                                        ],
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                            ],
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children:
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "圆角",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 30,
                                                        step: 1,
                                                        value:
                                                          localSubtitleBgBorderRadius,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalSubtitleBgBorderRadius(
                                                            v,
                                                          );
                                                          updateSubtitleStyle({
                                                            bgBorderRadius: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localSubtitleBgBorderRadius,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                          },
                                        ),
                                        jsxRuntimeExports.jsxs(
                                          "div",
                                          {
                                            className: "sc-sub-row",
                                            children: [
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "水平边距",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 40,
                                                        step: 1,
                                                        value:
                                                          localSubtitleBgPaddingH,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalSubtitleBgPaddingH(
                                                            v,
                                                          );
                                                          updateSubtitleStyle({
                                                            bgPaddingH: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localSubtitleBgPaddingH,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                              jsxRuntimeExports.jsxs(
                                                "label",
                                                {
                                                  className:
                                                    "sc-sub-inline sc-sub-flex",
                                                  children: [
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className:
                                                          "sc-sub-label-sm",
                                                        children: "垂直边距",
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "input",
                                                      {
                                                        className:
                                                          "sc-sub-range",
                                                        type: "range",
                                                        min: 0,
                                                        max: 40,
                                                        step: 1,
                                                        value:
                                                          localSubtitleBgPaddingV,
                                                        onChange: (e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          setLocalSubtitleBgPaddingV(
                                                            v,
                                                          );
                                                          updateSubtitleStyle({
                                                            bgPaddingV: v,
                                                          });
                                                        },
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsx(
                                                      "span",
                                                      {
                                                        className: "sc-sub-val",
                                                        children:
                                                          localSubtitleBgPaddingV,
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                            ],
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              ],
                            }),
                          ],
                        }),
                        jsxRuntimeExports.jsxs("div", {
                          className: "smartcut-subtitle-content",
                          style: {
                            display:
                              subtitleTab === "timeline" ? void 0 : "none",
                          },
                          children: [
                            jsxRuntimeExports.jsxs("div", {
                              className: "smartcut-subtitle-title-row",
                              children: [
                                jsxRuntimeExports.jsx("div", {
                                  className:
                                    "smartcut-resource-section-title smartcut-subtitle-title",
                                  children: "字幕时间戳,
                                }),
                                jsxRuntimeExports.jsxs("div", {
                                  className: "smartcut-subtitle-table-toolbar",
                                  children: [
                                    jsxRuntimeExports.jsxs(
                                      "button",
                                      {
                                        type: "button",
                                        className: "smartcut-subtitle-add-btn",
                                        onMouseDown: (e) => e.preventDefault(),
                                        onClick: handleAddSubtitleRow,
                                        children: [
                                          jsxRuntimeExports.jsxs(
                                            "svg",
                                            {
                                              width: "12",
                                              height: "12",
                                              viewBox: "0 0 12 12",
                                              "aria-hidden": "true",
                                              focusable: "false",
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "rect",
                                                  {
                                                    x: "2",
                                                    y: "5.25",
                                                    width: "8",
                                                    height: "1.5",
                                                    rx: "0.75",
                                                    fill: "currentColor",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "rect",
                                                  {
                                                    x: "5.25",
                                                    y: "2",
                                                    width: "1.5",
                                                    height: "8",
                                                    rx: "0.75",
                                                    fill: "currentColor",
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              children:
                                                focusedSubtitleOriginalIndex !==
                                                null
                                                  ? "插入�?
                                                  : "新增档案",
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    onRegenerateSubtitleSegments &&
                                      jsxRuntimeExports.jsx(
                                        "button",
                                        {
                                          type: "button",
                                          className:
                                            "smartcut-subtitle-add-btn",
                                          disabled: isWhisperGenerating,
                                          onClick: onRegenerateSubtitleSegments,
                                          children:
                                            jsxRuntimeExports.jsx(
                                              "span",
                                              {
                                                children: isWhisperGenerating
                                                  ? "生成中.."
                                                  : "重新生成字幕",
                                              },
                                            ),
                                        },
                                      ),
                                  ],
                                }),
                              ],
                            }),
                            jsxRuntimeExports.jsxs("div", {
                              className:
                                "smartcut-subtitle-timeline-body sc-panel-scroll",
                              children: [
                                localSubtitles.length === 0 &&
                                  jsxRuntimeExports.jsx("p", {
                                    className: "smartcut-wizard-hint",
                                    style: { marginBottom: 8 },
                                    children:
                                      "暂无字幕时间轴，可点击「新增行」添加，或先在视频页生成字幕后进入智能精剪",
                                  }),
                                jsxRuntimeExports.jsxs("div", {
                                  className: "smartcut-subtitle-table",
                                  onBlur: (e) => {
                                    if (
                                      !e.currentTarget.contains(e.relatedTarget)
                                    ) {
                                      setFocusedSubtitleOriginalIndex(null);
                                    }
                                  },
                                  children: [
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className:
                                          "smartcut-subtitle-row smartcut-subtitle-row-header",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "smartcut-subtitle-col-index",
                                              children: "#",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "smartcut-subtitle-col-text",
                                              children: "内容",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "smartcut-subtitle-col-time",
                                              children: "开始时�?,
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "smartcut-subtitle-col-time",
                                              children: "结束时间",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "smartcut-subtitle-col-actions",
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    localSubtitles
                                      .map((seg, originalIndex) => ({
                                        seg,
                                        originalIndex,
                                      }))
                                      .sort((a, b) => a.seg.start - b.seg.start)
                                      .map(
                                        (
                                          { seg, originalIndex },
                                          displayIndex,
                                        ) =>
                                          jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className:
                                                "smartcut-subtitle-row",
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-subtitle-col-index",
                                                    children: displayIndex + 1,
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-subtitle-col-text",
                                                    children:
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "video-input smartcut-subtitle-text-input",
                                                          type: "text",
                                                          value: seg.text,
                                                          onFocus: () =>
                                                            setFocusedSubtitleOriginalIndex(
                                                              originalIndex,
                                                            ),
                                                          onChange: (e) =>
                                                            handleSubtitleTextChange(
                                                              originalIndex,
                                                              e.target.value,
                                                            ),
                                                        },
                                                      ),
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-subtitle-col-time",
                                                    children:
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "video-input smartcut-subtitle-time-input",
                                                          type: "number",
                                                          step: 0.1,
                                                          value:
                                                            Number.isFinite(
                                                              seg.start,
                                                            )
                                                              ? seg.start.toFixed(
                                                                  1,
                                                                )
                                                              : "",
                                                          onFocus: () =>
                                                            setFocusedSubtitleOriginalIndex(
                                                              originalIndex,
                                                            ),
                                                          onChange: (e) =>
                                                            handleSubtitleTimeChange(
                                                              originalIndex,
                                                              "start",
                                                              e.target.value,
                                                            ),
                                                        },
                                                      ),
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-subtitle-col-time",
                                                    children:
                                                      jsxRuntimeExports.jsx(
                                                        "input",
                                                        {
                                                          className:
                                                            "video-input smartcut-subtitle-time-input",
                                                          type: "number",
                                                          step: 0.1,
                                                          value:
                                                            Number.isFinite(
                                                              seg.end,
                                                            )
                                                              ? seg.end.toFixed(
                                                                  1,
                                                                )
                                                              : "",
                                                          onFocus: () =>
                                                            setFocusedSubtitleOriginalIndex(
                                                              originalIndex,
                                                            ),
                                                          onChange: (e) =>
                                                            handleSubtitleTimeChange(
                                                              originalIndex,
                                                              "end",
                                                              e.target.value,
                                                            ),
                                                        },
                                                      ),
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "smartcut-subtitle-col-actions",
                                                    children:
                                                      jsxRuntimeExports.jsx(
                                                        "button",
                                                        {
                                                          type: "button",
                                                          className:
                                                            "smartcut-subtitle-delete-btn",
                                                          onClick: () =>
                                                            handleRemoveSubtitleRow(
                                                              originalIndex,
                                                            ),
                                                          "aria-label":
                                                            "删除字幕层,
                                                          children:
                                                            jsxRuntimeExports.jsx(
                                                              "svg",
                                                              {
                                                                width: "12",
                                                                height: "12",
                                                                viewBox:
                                                                  "0 0 12 12",
                                                                "aria-hidden":
                                                                  "true",
                                                                focusable:
                                                                  "false",
                                                                children:
                                                                  jsxRuntimeExports.jsx(
                                                                    "path",
                                                                    {
                                                                      d: "M3 3.5h6l-.5 6a1 1 0 0 1-1 .9H4.5a1 1 0 0 1-1-.9L3 3.5Zm1.5-1h3L7 1.5a1 1 0 0 0-.71-.3H5.71A1 1 0 0 0 5 1.5L4.5 2.5Z",
                                                                      fill: "currentColor",
                                                                    },
                                                                  ),
                                                              },
                                                            ),
                                                        },
                                                      ),
                                                  },
                                                ),
                                              ],
                                            },
                                            originalIndex,
                                          ),
                                      ),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    },
                  ),
            }),
          activeType === "bgm" &&
            jsxRuntimeExports.jsxs("div", {
              className: "smartcut-resource-section smartcut-bgm-layout",
              children: [
                jsxRuntimeExports.jsxs("div", {
                  className:
                    "smartcut-title-section-header smartcut-title-section-header-with-remove",
                  children: [
                    jsxRuntimeExports.jsx("span", {
                      className: "smartcut-title-section-title",
                      children: "背景音乐",
                    }),
                    jsxRuntimeExports.jsxs("div", {
                      className: "smartcut-bgm-header-actions",
                      children: [
                        localBgmEffectConfig &&
                          jsxRuntimeExports.jsx("button", {
                            type: "button",
                            className: "smartcut-remove-btn",
                            onClick: () => onLocalBgmChange(null),
                            title: "移除背景音乐",
                            children: "移除背景音乐",
                          }),
                        jsxRuntimeExports.jsx("button", {
                          type: "button",
                          className: "smartcut-bgm-upload-label",
                          onClick: () => setBgmUploadCategoryModalOpen(true),
                          children: "添加音乐资源",
                        }),
                        jsxRuntimeExports.jsx("input", {
                          ref: bgmUploadInputRef,
                          type: "file",
                          accept:
                            "audio/wav,audio/mpeg,audio/mp3,audio/mp4,.wav,.mp3,.m4a",
                          className: "smartcut-bgm-file-input",
                          onChange: handleUploadBgmMaterial,
                        }),
                        jsxRuntimeExports.jsx(
                          BgmUploadCategoryModal,
                          {
                            open: bgmUploadCategoryModalOpen,
                            onClose: () => setBgmUploadCategoryModalOpen(false),
                            categories: smartCutUploadCategories,
                            showToast,
                            onConfirmPickFile: (category) => {
                              pendingBgmUploadCategoryRef.current = category;
                              setBgmUploadCategoryModalOpen(false);
                              requestAnimationFrame(() =>
                                bgmUploadInputRef.current?.click(),
                              );
                            },
                          },
                        ),
                      ],
                    }),
                  ],
                }),
                jsxRuntimeExports.jsxs("div", {
                  className: "smartcut-bgm-explorer",
                  children: [
                    jsxRuntimeExports.jsx("div", {
                      className: "smartcut-bgm-folder-list",
                      children: bgmFolders.map((folder) =>
                        jsxRuntimeExports.jsxs(
                          "div",
                          {
                            className: `smartcut-bgm-folder ${activeBgmFolder === folder ? "active" : ""}`,
                            onClick: () => setActiveBgmFolder(folder),
                            children: [
                              jsxRuntimeExports.jsx("svg", {
                                width: "14",
                                height: "14",
                                viewBox: "0 0 24 24",
                                fill: "none",
                                stroke: "currentColor",
                                strokeWidth: "2",
                                children: jsxRuntimeExports.jsx(
                                  "path",
                                  {
                                    d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
                                  },
                                ),
                              }),
                              jsxRuntimeExports.jsx("span", {
                                children: folder,
                              }),
                            ],
                          },
                          folder,
                        ),
                      ),
                    }),
                    jsxRuntimeExports.jsx("div", {
                      className: "smartcut-bgm-file-list",
                      children:
                        currentBgmList.length === 0
                          ? jsxRuntimeExports.jsx("div", {
                              className: "smartcut-bgm-empty",
                              children: "当前分类暂无音乐",
                            })
                          : currentBgmList.map((bgm) =>
                              jsxRuntimeExports.jsxs(
                                "div",
                                {
                                  className: `smartcut-bgm-file-item ${selectedBgmId === bgm.id ? "selected" : ""} ${appliedBgmEffectConfig?.selectedBgmId === bgm.id ? "applied" : ""}`,
                                  onClick: () => handleSelectBgm(bgm.id),
                                  children: [
                                    jsxRuntimeExports.jsxs(
                                      "svg",
                                      {
                                        width: "12",
                                        height: "12",
                                        viewBox: "0 0 24 24",
                                        fill: "none",
                                        stroke: "currentColor",
                                        strokeWidth: "2",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "path",
                                            { d: "M9 18V5l12-2v13" },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "circle",
                                            { cx: "6", cy: "18", r: "3" },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "circle",
                                            { cx: "18", cy: "16", r: "3" },
                                          ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsx(
                                      "span",
                                      {
                                        className: "smartcut-bgm-file-name",
                                        children: bgm.name,
                                      },
                                    ),
                                    appliedBgmEffectConfig?.selectedBgmId ===
                                      bgm.id &&
                                      jsxRuntimeExports.jsx(
                                        "span",
                                        {
                                          className: "smartcut-bgm-applied-tag",
                                          children: "应用",
                                        },
                                      ),
                                  ],
                                },
                                bgm.id,
                              ),
                            ),
                    }),
                  ],
                }),
                selectedBgmId &&
                  jsxRuntimeExports.jsxs("div", {
                    className: "smartcut-bgm-volume-row",
                    children: [
                      jsxRuntimeExports.jsxs("div", {
                        className: "smartcut-bgm-volume-control",
                        children: [
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-bgm-volume-label",
                            children: "人声音量",
                          }),
                          jsxRuntimeExports.jsx("input", {
                            type: "range",
                            min: "0",
                            max: "300",
                            value: localVoiceVolume,
                            onChange: (e) => {
                              const value = Number(e.target.value);
                              setLocalVoiceVolume(value);
                              if (selectedBgmId) {
                                onLocalBgmChange({
                                  selectedBgmId,
                                  volume: localBgmVolume / 100,
                                  voiceVolume: value / 100,
                                });
                              }
                            },
                            className: "smartcut-bgm-volume-slider",
                          }),
                          jsxRuntimeExports.jsxs("span", {
                            className: "smartcut-bgm-volume-value",
                            children: [localVoiceVolume, "%"],
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "smartcut-bgm-volume-control",
                        children: [
                          jsxRuntimeExports.jsx("span", {
                            className: "smartcut-bgm-volume-label",
                            children: "背景音乐",
                          }),
                          jsxRuntimeExports.jsx("input", {
                            type: "range",
                            min: "0",
                            max: "100",
                            value: localBgmVolume,
                            onChange: (e) => {
                              const value = Number(e.target.value);
                              setLocalBgmVolume(value);
                              if (selectedBgmId) {
                                onLocalBgmChange({
                                  selectedBgmId,
                                  volume: value / 100,
                                  voiceVolume: localVoiceVolume / 100,
                                });
                              }
                            },
                            className: "smartcut-bgm-volume-slider",
                          }),
                          jsxRuntimeExports.jsxs("span", {
                            className: "smartcut-bgm-volume-value",
                            children: [localBgmVolume, "%"],
                          }),
                        ],
                      }),
                    ],
                  }),
              ],
            }),
        ],
      }),
      showAutoAddCategoryDialog &&
        jsxRuntimeExports.jsx("div", {
          className: "video-modal-overlay",
          onClick: (e) => {
            if (e.target === e.currentTarget)
              setShowAutoAddCategoryDialog(false);
          },
          style: {
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2e3,
          },
          children: jsxRuntimeExports.jsxs("div", {
            className: "video-modal-content",
            style: {
              backgroundColor: "white",
              borderRadius: "8px",
              width: "360px",
              maxWidth: "90%",
              maxHeight: "70vh",
              padding: "16px 20px 12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            },
            onClick: (e) => e.stopPropagation(),
            children: [
              jsxRuntimeExports.jsx("h2", {
                style: {
                  margin: "0 0 8px",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#333",
                },
                children: "选择用于智能添加的分析,
              }),
              jsxRuntimeExports.jsx("p", {
                style: { margin: "0 0 8px", fontSize: 13, color: "#666" },
                children: "智能添加只会在所选分类下的混剪素材中进行检紀�?,
              }),
              jsxRuntimeExports.jsx("div", {
                style: { marginBottom: 12 },
                children: jsxRuntimeExports.jsx("select", {
                  className: "video-select",
                  style: { width: "100%" },
                  value: autoAddCategory,
                  onChange: (e) => setAutoAddCategory(e.target.value),
                  children: mixCategories.map((cat) =>
                    jsxRuntimeExports.jsx(
                      "option",
                      { value: cat, children: cat },
                      cat,
                    ),
                  ),
                }),
              }),
              jsxRuntimeExports.jsxs("div", {
                style: { marginBottom: 16 },
                children: [
                  jsxRuntimeExports.jsxs("div", {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    },
                    children: [
                      jsxRuntimeExports.jsx("span", {
                        style: { fontSize: 13, color: "#555" },
                        children: "相似度阈�?,
                      }),
                      jsxRuntimeExports.jsx("span", {
                        style: { fontSize: 13, fontWeight: 600, color: "#333" },
                        children: autoAddSimThreshold.toFixed(2),
                      }),
                    ],
                  }),
                  jsxRuntimeExports.jsx("input", {
                    type: "range",
                    min: 0,
                    max: 1,
                    step: 0.01,
                    value: autoAddSimThreshold,
                    onChange: (e) =>
                      setAutoAddSimThreshold(Number(e.target.value)),
                    style: { width: "100%" },
                  }),
                  jsxRuntimeExports.jsxs("div", {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "#999",
                      marginTop: 2,
                    },
                    children: [
                      jsxRuntimeExports.jsx("span", {
                        children: "0（全部匹配）",
                      }),
                      jsxRuntimeExports.jsx("span", {
                        children: "1（精确匹配）",
                      }),
                    ],
                  }),
                ],
              }),
              jsxRuntimeExports.jsxs("div", {
                style: { display: "flex", justifyContent: "flex-end", gap: 8 },
                children: [
                  jsxRuntimeExports.jsx("button", {
                    type: "button",
                    className: "video-button",
                    onClick: () => setShowAutoAddCategoryDialog(false),
                    style: {
                      backgroundColor: "#f5f5f5",
                      color: "#333",
                      border: "1px solid #d0d0d0",
                    },
                    children: "取消",
                  }),
                  jsxRuntimeExports.jsx("button", {
                    type: "button",
                    className: "video-button video-button-primary",
                    disabled: !autoAddCategory || autoAddingMix,
                    onClick: () => {
                      if (!autoAddCategory) return;
                      void handleAutoAddMixSegments();
                    },
                    children: "确认并开始智能添�?,
                  }),
                ],
              }),
            ],
          }),
        }),
    ],
  });
}
function SmartCutMixUploadWizard({ onCancel, onFinished }) {
  const showToast = useToast();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState(["默认分类"]);
  const [selectedCategory, setSelectedCategory] =
    useState("默认分类");
  const [newCategory, setNewCategory] = useState("");
  const [showCreateCategoryDialog, setShowCreateCategoryDialog] =
    useState(false);
  const [tasks, setTasks] = useState([]);
  const tasksRef = useRef(tasks);
  const fileInputRef = useRef(null);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    window.api.loadMixResourcesConfig().then((res) => {
      const items = res?.items ?? [];
      const fromConfig = new Set();
      items.forEach((item) => {
        const c = item.category?.trim();
        if (c) fromConfig.add(c);
      });
      setCategories((prev) => {
        const combined = new Set([
          "默认分类",
          ...prev,
          ...fromConfig,
        ]);
        return Array.from(combined);
      });
    });
  }, []);
  const canNextFromStep1 =
    selectedCategory && tasks.some((t) => t.uploadStatus === "success");
  const canNextFromStep2 = tasks.some((t) => t.captionText.trim().length > 0);
  const allVectorsDone =
    tasks.length > 0 && tasks.every((t) => t.vectorStatus === "success");
  const handleCreateCategoryConfirm = () => {
    const name = newCategory.trim();
    if (!name) return;
    if (!categories.includes(name)) {
      setCategories((prev) => [...prev, name]);
    }
    setSelectedCategory(name);
    setNewCategory("");
    setShowCreateCategoryDialog(false);
  };
  const removeTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };
  const [saving, setSaving] = useState(false);
  const handleFilesSelected = async (event) => {
    const filesArray = event.target.files ? Array.from(event.target.files) : [];
    if (filesArray.length === 0) {
      event.target.value = "";
      return;
    }
    const categoryToUse = selectedCategory;
    event.target.value = "";
    const ext = (name) => {
      const m = name.match(/\.([^.]+)$/);
      return (m && m[1]) || "mp4";
    };
    setSaving(true);
    const newTasks = [];
    let skippedNonMp4 = 0;
    for (let i = 0; i < filesArray.length; i += 1) {
      const file = filesArray[i];
      if (!isAllowedSmartcutMp4VideoFile(file)) {
        skippedNonMp4 += 1;
        continue;
      }
      const id = `${Date.now()}_${i}_${file.name}`;
      const fileName = `${id}.${ext(file.name)}`;
      let path = "";
      let uploadStatus = "pending";
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            const base64Content =
              dataUrl.indexOf(",") >= 0 ? dataUrl.split(",")[1] : dataUrl;
            resolve(base64Content || "");
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const res = await window.api.saveFileFromBase64(
          base64,
          fileName,
          "smartcut/mix",
        );
        if (res.success && res.file_path) {
          path = res.file_path;
          uploadStatus = "success";
        }
      } catch {
        uploadStatus = "pending";
      }
      let duration;
      if (path) {
        if (isImageFile(file.name)) {
          duration = SMARTCUT_MIX_INITIAL_SEGMENT_SEC;
        } else {
          const durRes = await window.api.getVideoDuration(path);
          if (
            durRes.success &&
            durRes.duration != null &&
            durRes.duration > 0
          ) {
            duration = durRes.duration;
          }
        }
      }
      newTasks.push({
        id,
        fileName: file.name,
        category: categoryToUse,
        path,
        uploadStatus,
        frameStatus: "pending",
        captionStatus: "pending",
        captionText: "",
        vectorStatus: "pending",
        duration,
      });
    }
    setTasks((prev) => [...prev, ...newTasks]);
    setSaving(false);
    if (skippedNonMp4 > 0) {
      showToast(
        skippedNonMp4 === filesArray.length
          ? "仅支持 MP4 视频或 JPG/PNG 图片，请重新选择"
          : `已跳过 ${skippedNonMp4} 个不支持的文件，仅支持 MP4 视频或 JPG/PNG 图片`,
        "info",
      );
    }
  };
  const [recognizing, setRecognizing] = useState(false);
  const [recognizeError, setRecognizeError] = useState(null);
  const goToStep = (nextStep) => {
    setStep(nextStep);
  };
  const handleRecognizeAll = async () => {
    const pending = tasksRef.current.filter(
      (t) => t.path && t.frameStatus !== "success",
    );
    if (pending.length === 0) {
      setRecognizeError(null);
      return;
    }
    setRecognizeError(null);
    setRecognizing(true);
    for (const task of pending) {
      setTasks((prev) =>
        prev.map((x) =>
          x.id === task.id
            ? { ...x, frameStatus: "pending", captionStatus: "pending" }
            : x,
        ),
      );
      let imagePath = null;
      if (isImageFile(task.path)) {
        imagePath = task.path;
      } else {
        const extractRes = await window.api.extractFrameFromVideo(task.path);
        if (!extractRes.success || !extractRes.image_path) {
          setTasks((prev) =>
            prev.map((x) =>
              x.id === task.id
                ? {
                    ...x,
                    frameStatus: "pending",
                    captionStatus: "pending",
                    captionText: ``,
                  }
                : x,
            ),
          );
          console.error(extractRes.error);
          setRecognizeError("视频处理失败：请手动添加视频描述");
          continue;
        }
        imagePath = extractRes.image_path;
      }
      setTasks((prev) =>
        prev.map((x) =>
          x.id === task.id ? { ...x, frameStatus: "success" } : x,
        ),
      );
      let base64Content = "";
      if (isImageFile(task.path)) {
        const prep = await window.api.prepareStillImageBase64ForLlm(imagePath);
        if (!prep.success || !prep.base64) {
          setTasks((prev) =>
            prev.map((x) =>
              x.id === task.id
                ? { ...x, captionStatus: "pending", captionText: `` }
                : x,
            ),
          );
          console.error(prep.error);
          setRecognizeError(
            prep.error || "图片处理失败：请缩小图片或换用 JPG 后重试",
          );
          continue;
        }
        base64Content = prep.base64;
      } else {
        const fileBase64 = await window.api.readFileAsBase64(imagePath);
        base64Content = fileBase64?.base64 || "";
      }
      const describeRes =
        await llmService.describeImageFromBase64(base64Content);
      if (!describeRes.data || !describeRes.data.caption) {
        setTasks((prev) =>
          prev.map((x) =>
            x.id === task.id
              ? { ...x, captionStatus: "pending", captionText: `` }
              : x,
          ),
        );
        console.error(describeRes.message);
        setRecognizeError("视频识别失败：请手动添加视频描述");
        continue;
      }
      setTasks((prev) =>
        prev.map((x) =>
          x.id === task.id
            ? {
                ...x,
                captionStatus: "success",
                captionText: describeRes.data?.caption || "",
              }
            : x,
        ),
      );
    }
    setRecognizing(false);
  };
  const [vectorizing, setVectorizing] = useState(false);
  const [vectorError, setVectorError] = useState(null);
  const handleVectorizeAll = async () => {
    const pending = tasksRef.current.filter(
      (t) =>
        t.vectorStatus !== "success" &&
        (t.captionText?.trim() ?? "").length > 0,
    );
    if (pending.length === 0) {
      setVectorError(null);
      return;
    }
    setVectorError(null);
    setVectorizing(true);
    for (const task of pending) {
      const text = (task.captionText ?? "").trim();
      if (!text) continue;
      const res = await llmService.getTextEmbedding(text);
      if (
        !res.data ||
        !Array.isArray(res.data.embedding) ||
        res.data.embedding.length === 0
      ) {
        setTasks((prev) =>
          prev.map((x) =>
            x.id === task.id ? { ...x, vectorStatus: "pending" } : x,
          ),
        );
        setVectorError(res.message || "向量化失败");
        continue;
      }
      setTasks((prev) =>
        prev.map((x) =>
          x.id === task.id
            ? { ...x, vectorStatus: "success", vector: res.data?.embedding }
            : x,
        ),
      );
    }
    setVectorizing(false);
  };
  const handleFinish = () => {
    const items = tasks
      .filter(
        (t) =>
          t.uploadStatus === "success" &&
          t.vectorStatus === "success" &&
          t.path,
      )
      .map((t) => ({
        id: t.id,
        name: t.fileName,
        category: t.category,
        caption: t.captionText,
        path: t.path,
        ...(t.vector && t.vector.length > 0 ? { vector: t.vector } : {}),
        ...(t.duration != null && t.duration > 0
          ? { duration: t.duration }
          : {}),
      }));
    if (items.length === 0) {
      onCancel();
      return;
    }
    onFinished(items);
  };
  const busyWizard = recognizing || vectorizing;
  const goNextFromStep1 = async () => {
    if (!canNextFromStep1 || busyWizard) return;
    setRecognizeError(null);
    goToStep(2);
    await handleRecognizeAll();
  };
  const goNextFromStep2 = async () => {
    if (!canNextFromStep2 || busyWizard) return;
    setRecognizeError(null);
    setVectorError(null);
    await handleRecognizeAll();
    goToStep(3);
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    await handleVectorizeAll();
  };
  return jsxRuntimeExports.jsxs(React.Fragment, {
    children: [
      jsxRuntimeExports.jsxs("div", {
        className: "smartcut-body smartcut-body-wizard",
        children: [
          jsxRuntimeExports.jsxs("div", {
            className: "smartcut-wizard-steps",
            children: [
              jsxRuntimeExports.jsxs("div", {
                className: `smartcut-wizard-step ${step === 1 ? "active" : ""}`,
                children: [
                  jsxRuntimeExports.jsx("span", {
                    className: "smartcut-wizard-step-index",
                    children: "1",
                  }),
                  jsxRuntimeExports.jsx("span", {
                    className: "smartcut-wizard-step-label",
                    children: "分类与上传",
                  }),
                ],
              }),
              jsxRuntimeExports.jsxs("div", {
                className: `smartcut-wizard-step ${step === 2 ? "active" : ""}`,
                children: [
                  jsxRuntimeExports.jsx("span", {
                    className: "smartcut-wizard-step-index",
                    children: "2",
                  }),
                  jsxRuntimeExports.jsx("span", {
                    className: "smartcut-wizard-step-label",
                    children: "视频识别",
                  }),
                ],
              }),
              jsxRuntimeExports.jsxs("div", {
                className: `smartcut-wizard-step ${step === 3 ? "active" : ""}`,
                children: [
                  jsxRuntimeExports.jsx("span", {
                    className: "smartcut-wizard-step-index",
                    children: "3",
                  }),
                  jsxRuntimeExports.jsx("span", {
                    className: "smartcut-wizard-step-label",
                    children: "向量化：",
                  }),
                ],
              }),
            ],
          }),
          step === 1 &&
            jsxRuntimeExports.jsxs("div", {
              className: "smartcut-wizard-step-body",
              children: [
                jsxRuntimeExports.jsxs("div", {
                  className: "smartcut-wizard-card",
                  children: [
                    jsxRuntimeExports.jsx("h3", {
                      className: "smartcut-wizard-card-title",
                      children: "上传到分析,
                    }),
                    jsxRuntimeExports.jsx("p", {
                      className: "smartcut-wizard-hint",
                      children:
                        "先选择或创建分类，再点击「上传」添加视频；新创建的分类会自动被选中�?,
                    }),
                    jsxRuntimeExports.jsxs("div", {
                      className:
                        "smartcut-wizard-toolbar smartcut-wizard-category-row",
                      children: [
                        jsxRuntimeExports.jsxs("label", {
                          className: "smartcut-wizard-category-group",
                          children: [
                            jsxRuntimeExports.jsx("span", {
                              className: "smartcut-wizard-category-group-label",
                              children: "选择分类",
                            }),
                            jsxRuntimeExports.jsx("select", {
                              className: "video-select smartcut-wizard-select",
                              value: selectedCategory,
                              onChange: (e) =>
                                setSelectedCategory(e.target.value),
                              children: categories.map((c) =>
                                jsxRuntimeExports.jsx(
                                  "option",
                                  { value: c, children: c },
                                  c,
                                ),
                              ),
                            }),
                          ],
                        }),
                        jsxRuntimeExports.jsx("button", {
                          type: "button",
                          className: "smartcut-subtitle-add-btn",
                          onClick: () => setShowCreateCategoryDialog(true),
                          children: jsxRuntimeExports.jsx(
                            "span",
                            { children: "创建新分析 },
                          ),
                        }),
                      ],
                    }),
                    showCreateCategoryDialog &&
                      jsxRuntimeExports.jsx("div", {
                        className: "smartcut-wizard-dialog-overlay",
                        onClick: () => {
                          setShowCreateCategoryDialog(false);
                          setNewCategory("");
                        },
                        children: jsxRuntimeExports.jsxs(
                          "div",
                          {
                            className: "smartcut-wizard-dialog",
                            onClick: (e) => e.stopPropagation(),
                            children: [
                              jsxRuntimeExports.jsx("div", {
                                className: "smartcut-wizard-dialog-title",
                                children: "新建分类",
                              }),
                              jsxRuntimeExports.jsx("input", {
                                className:
                                  "video-input smartcut-wizard-dialog-input",
                                placeholder: "输入分类名称",
                                value: newCategory,
                                onChange: (e) => setNewCategory(e.target.value),
                                onKeyDown: (e) => {
                                  if (e.key === "Enter")
                                    handleCreateCategoryConfirm();
                                  if (e.key === "Escape") {
                                    setShowCreateCategoryDialog(false);
                                    setNewCategory("");
                                  }
                                },
                                autoFocus: true,
                              }),
                              jsxRuntimeExports.jsxs("div", {
                                className: "smartcut-wizard-dialog-actions",
                                children: [
                                  jsxRuntimeExports.jsx(
                                    "button",
                                    {
                                      type: "button",
                                      className: "video-button",
                                      onClick: () => {
                                        setShowCreateCategoryDialog(false);
                                        setNewCategory("");
                                      },
                                      children: "取消",
                                    },
                                  ),
                                  jsxRuntimeExports.jsx(
                                    "button",
                                    {
                                      type: "button",
                                      className:
                                        "video-button video-button-primary",
                                      onClick: handleCreateCategoryConfirm,
                                      disabled: !newCategory.trim(),
                                      children: "确定",
                                    },
                                  ),
                                ],
                              }),
                            ],
                          },
                        ),
                      }),
                  ],
                }),
                jsxRuntimeExports.jsxs("div", {
                  className: "smartcut-wizard-card",
                  children: [
                    jsxRuntimeExports.jsx("h3", {
                      className: "smartcut-wizard-card-title",
                      children: "上传视频",
                    }),
                    jsxRuntimeExports.jsx("p", {
                      className: "smartcut-wizard-hint",
                      children:
                        "选中的视频会保存到本地，刷新后仍可使用。已添加的素材可点击右侧移除",
                    }),
                    jsxRuntimeExports.jsx("input", {
                      ref: fileInputRef,
                      type: "file",
                      multiple: true,
                      accept:
                        "video/mp4,.mp4,image/jpeg,.jpg,.jpeg,image/png,.png",
                      className: "smartcut-wizard-file-input-hidden",
                      disabled: saving,
                      onChange: handleFilesSelected,
                    }),
                    jsxRuntimeExports.jsx("div", {
                      className: "smartcut-wizard-toolbar",
                      children: jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          className: "video-button video-button-primary",
                          disabled: saving,
                          onClick: () => fileInputRef.current?.click(),
                          children: saving ? "保存中…" : "上传",
                        },
                      ),
                    }),
                    jsxRuntimeExports.jsx("div", {
                      className: "smartcut-wizard-task-list",
                      children:
                        tasks.length === 0
                          ? jsxRuntimeExports.jsx("div", {
                              className: "smartcut-wizard-empty",
                              children:
                                "请点击上方「上传」按钮选择要上传的混剪视频或图�?,
                            })
                          : tasks.map((t) =>
                              jsxRuntimeExports.jsxs(
                                "div",
                                {
                                  className: "smartcut-wizard-task-item",
                                  children: [
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className:
                                          "smartcut-resource-item-name",
                                        children: [
                                          t.fileName,
                                          jsxRuntimeExports.jsxs(
                                            "span",
                                            {
                                              style: {
                                                marginLeft: 6,
                                                fontSize: 10,
                                                color: "#6b7280",
                                              },
                                              children: ["[", t.category, "]"],
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className:
                                          "smartcut-wizard-task-item-right",
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "span",
                                            {
                                              className:
                                                "smartcut-resource-item-tag",
                                              children:
                                                t.uploadStatus === "success"
                                                  ? "已上传
                                                  : "待上传",
                                            },
                                          ),
                                          jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              className:
                                                "smartcut-wizard-task-remove",
                                              onClick: () => removeTask(t.id),
                                              title: "移除此项",
                                              "aria-label": "移除",
                                              children: "×",
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                },
                                t.id,
                              ),
                            ),
                    }),
                  ],
                }),
              ],
            }),
          step === 2 &&
            jsxRuntimeExports.jsx("div", {
              className: "smartcut-wizard-step-body",
              children: jsxRuntimeExports.jsxs("div", {
                className: "smartcut-wizard-card",
                children: [
                  jsxRuntimeExports.jsx("h3", {
                    className: "smartcut-wizard-card-title",
                    children: "视频识别",
                  }),
                  jsxRuntimeExports.jsx("p", {
                    className: "smartcut-wizard-hint",
                    children:
                      "从上一步进入本步时会自动识别尚未处理的视频并生成文案；识别结果可在此修改，修改后进入下一步时会重新向量化对应条目�?,
                  }),
                  recognizing &&
                    jsxRuntimeExports.jsx("p", {
                      className: "smartcut-wizard-progress-msg",
                      children: "正在识别视频内容",
                    }),
                  recognizeError &&
                    jsxRuntimeExports.jsx("p", {
                      className: "smartcut-wizard-progress-msg",
                      style: { marginTop: 8, color: "#dc2626" },
                      children: recognizeError,
                    }),
                  jsxRuntimeExports.jsx("div", {
                    className: "smartcut-wizard-task-list",
                    children:
                      tasks.length === 0
                        ? jsxRuntimeExports.jsx("div", {
                            className: "smartcut-wizard-empty",
                            children: "暂无待处理的视频，请返回上一步上传",
                          })
                        : tasks.map((t) =>
                            jsxRuntimeExports.jsxs(
                              "div",
                              {
                                className: "smartcut-wizard-task-row",
                                children: [
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className:
                                        "smartcut-wizard-task-row-body",
                                      children: [
                                        jsxRuntimeExports.jsxs(
                                          "div",
                                          {
                                            className:
                                              "smartcut-wizard-task-main",
                                            children: [
                                              jsxRuntimeExports.jsxs(
                                                "div",
                                                {
                                                  className:
                                                    "smartcut-resource-item-name",
                                                  children: [
                                                    t.fileName,
                                                    jsxRuntimeExports.jsxs(
                                                      "span",
                                                      {
                                                        style: {
                                                          marginLeft: 6,
                                                          fontSize: 10,
                                                          color: "#6b7280",
                                                        },
                                                        children: [
                                                          "[",
                                                          t.category,
                                                          "]",
                                                        ],
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                              jsxRuntimeExports.jsxs(
                                                "div",
                                                {
                                                  className:
                                                    "smartcut-wizard-task-status",
                                                  children: [
                                                    jsxRuntimeExports.jsxs(
                                                      "span",
                                                      {
                                                        children: [
                                                          "视频处理：",
                                                          t.frameStatus ===
                                                          "success"
                                                            ? "完成"
                                                            : "待处�?,
                                                        ],
                                                      },
                                                    ),
                                                    jsxRuntimeExports.jsxs(
                                                      "span",
                                                      {
                                                        children: [
                                                          "识别：",
                                                          t.captionStatus ===
                                                          "success"
                                                            ? "完成"
                                                            : "待处�?,
                                                        ],
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                            ],
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className:
                                              "smartcut-wizard-task-caption",
                                            children:
                                              jsxRuntimeExports.jsx(
                                                "input",
                                                {
                                                  className: "video-input",
                                                  value: t.captionText,
                                                  onChange: (e) => {
                                                    const value =
                                                      e.target.value;
                                                    setTasks((prev) =>
                                                      prev.map((x) =>
                                                        x.id === t.id
                                                          ? {
                                                              ...x,
                                                              captionText:
                                                                value,
                                                              vectorStatus:
                                                                "pending",
                                                              vector: void 0,
                                                            }
                                                          : x,
                                                      ),
                                                    );
                                                  },
                                                  placeholder:
                                                    "识别出的内容，可在此修改优化",
                                                },
                                              ),
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                                  jsxRuntimeExports.jsx(
                                    "button",
                                    {
                                      type: "button",
                                      className: "smartcut-wizard-task-remove",
                                      onClick: () => removeTask(t.id),
                                      title: "移除此项",
                                      "aria-label": "移除",
                                      children: "×",
                                    },
                                  ),
                                ],
                              },
                              t.id,
                            ),
                          ),
                  }),
                ],
              }),
            }),
          step === 3 &&
            jsxRuntimeExports.jsx("div", {
              className: "smartcut-wizard-step-body",
              children: jsxRuntimeExports.jsxs("div", {
                className: "smartcut-wizard-card",
                children: [
                  jsxRuntimeExports.jsx("h3", {
                    className: "smartcut-wizard-card-title",
                    children: "语义向量",
                  }),
                  jsxRuntimeExports.jsx("p", {
                    className: "smartcut-wizard-hint",
                    children:
                      "从上一步进入本步时会根据文案自动为未向量化的条目生成语义向量，便于混剪时匹配素材",
                  }),
                  vectorizing &&
                    jsxRuntimeExports.jsx("p", {
                      className: "smartcut-wizard-progress-msg",
                      children: "正在生成语义向量化：",
                    }),
                  vectorError &&
                    jsxRuntimeExports.jsx("p", {
                      className: "smartcut-wizard-progress-msg",
                      style: { marginTop: 8, color: "#dc2626" },
                      children: vectorError,
                    }),
                  jsxRuntimeExports.jsx("div", {
                    className: "smartcut-wizard-task-list",
                    children:
                      tasks.length === 0
                        ? jsxRuntimeExports.jsx("div", {
                            className: "smartcut-wizard-empty",
                            children: "暂无待向量化的视频，请返回上一�?,
                          })
                        : tasks.map((t) =>
                            jsxRuntimeExports.jsxs(
                              "div",
                              {
                                className: "smartcut-wizard-task-row",
                                children: [
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className:
                                        "smartcut-wizard-task-row-body",
                                      children: [
                                        jsxRuntimeExports.jsxs(
                                          "div",
                                          {
                                            className:
                                              "smartcut-wizard-task-main",
                                            children: [
                                              jsxRuntimeExports.jsxs(
                                                "div",
                                                {
                                                  className:
                                                    "smartcut-resource-item-name",
                                                  children: [
                                                    t.fileName,
                                                    jsxRuntimeExports.jsxs(
                                                      "span",
                                                      {
                                                        style: {
                                                          marginLeft: 6,
                                                          fontSize: 10,
                                                          color: "#6b7280",
                                                        },
                                                        children: [
                                                          "[",
                                                          t.category,
                                                          "]",
                                                        ],
                                                      },
                                                    ),
                                                  ],
                                                },
                                              ),
                                              jsxRuntimeExports.jsx(
                                                "div",
                                                {
                                                  className:
                                                    "smartcut-wizard-task-status",
                                                  children:
                                                    jsxRuntimeExports.jsxs(
                                                      "span",
                                                      {
                                                        children: [
                                                          "向量化：",
                                                          t.vectorStatus ===
                                                          "success"
                                                            ? "完成"
                                                            : "待处�?,
                                                        ],
                                                      },
                                                    ),
                                                },
                                              ),
                                            ],
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "div",
                                          {
                                            className:
                                              "smartcut-wizard-task-caption",
                                            children:
                                              jsxRuntimeExports.jsx(
                                                "span",
                                                {
                                                  className:
                                                    "smartcut-wizard-task-caption-text",
                                                  children:
                                                    t.captionText ||
                                                    "暂无识别内容",
                                                },
                                              ),
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                                  jsxRuntimeExports.jsx(
                                    "button",
                                    {
                                      type: "button",
                                      className: "smartcut-wizard-task-remove",
                                      onClick: () => removeTask(t.id),
                                      title: "移除此项",
                                      "aria-label": "移除",
                                      children: "×",
                                    },
                                  ),
                                ],
                              },
                              t.id,
                            ),
                          ),
                  }),
                ],
              }),
            }),
        ],
      }),
      jsxRuntimeExports.jsxs("div", {
        className: "smartcut-footer smartcut-footer-wizard",
        children: [
          jsxRuntimeExports.jsx("button", {
            type: "button",
            className: "video-button",
            onClick: onCancel,
            children: "取消创建",
          }),
          jsxRuntimeExports.jsxs("div", {
            style: { display: "flex", gap: 8 },
            children: [
              step > 1 &&
                jsxRuntimeExports.jsx("button", {
                  type: "button",
                  className: "video-button",
                  disabled: busyWizard,
                  onClick: () =>
                    setStep((prev) => (prev === 1 ? prev : prev - 1)),
                  children: "上一�?,
                }),
              step < 3 &&
                jsxRuntimeExports.jsx("button", {
                  type: "button",
                  className: "video-button video-button-primary",
                  disabled:
                    busyWizard ||
                    (step === 1 && !canNextFromStep1) ||
                    (step === 2 && !canNextFromStep2),
                  onClick: () => {
                    if (step === 1) void goNextFromStep1();
                    else if (step === 2) void goNextFromStep2();
                  },
                  children: "下一步",
                }),
              step === 3 &&
                jsxRuntimeExports.jsx("button", {
                  type: "button",
                  className: "video-button video-button-primary",
                  disabled: !allVectorsDone || vectorizing,
                  onClick: handleFinish,
                  children: "完成",
                }),
            ],
          }),
        ],
      }),
    ],
  });
}
async function applyTitleToVideo(inputPath, titleConfig, titleTimeRange) {
  if (!inputPath)
    throw new Error("inputPath is required for applyTitleToVideo");
  if (!titleConfig?.style || !titleConfig.mainTitleText) {
    return { outputPath: inputPath };
  }
  const currentTitleStyle = titleConfig.style;
  const mainTitleText = titleConfig.mainTitleText;
  const subTitleText = currentTitleStyle.hasSubTitle
    ? (titleConfig.subTitleText ?? "")
    : void 0;
  const mainTitleDefaults = {
    font: "黑体",
    fontSize: 48,
    fontWeight: 400,
    color: "#FFFFFF",
    strokeColor: "#000000",
    top: 100,
    borderRadius: 10,
    backgroundColor: "transparent",
  };
  const subTitleDefaults = {
    font: "黑体",
    fontSize: 36,
    fontWeight: 400,
    color: "#FFFFFF",
    strokeColor: "#000000",
    top: 50,
    borderRadius: 10,
    backgroundColor: "transparent",
  };
  const mainTitleConfig = {
    ...mainTitleDefaults,
    ...(currentTitleStyle.mainTitle || {}),
  };
  const mainTitleResult = await generateTitleImage(
    mainTitleText,
    mainTitleConfig,
  );
  const mainTitleImageData = mainTitleResult.dataUrl;
  const mainTitleImageHeight = mainTitleResult.height;
  let subTitleImageData;
  if (currentTitleStyle.hasSubTitle && subTitleText) {
    const subTitleConfig = {
      ...subTitleDefaults,
      ...(currentTitleStyle.subTitle || {}),
    };
    const subResult = await generateTitleImage(subTitleText, subTitleConfig);
    subTitleImageData = subResult.dataUrl;
  }
  const titleResult = await window.api.addTitleToVideo(
    inputPath,
    mainTitleImageData,
    subTitleImageData,
    {
      hasSubTitle: currentTitleStyle.hasSubTitle || false,
      mainTitle: currentTitleStyle.mainTitle,
      subTitle: currentTitleStyle.subTitle,
      mainTitleImageHeight,
      startTime: titleTimeRange?.start,
      endTime: titleTimeRange?.end,
    },
  );
  if (!titleResult.success || !titleResult.file_path) {
    throw new Error(titleResult.error || "添加标题失败");
  }
  return { outputPath: titleResult.file_path };
}
async function applySubtitleToVideo(inputPath, subtitleConfig, segments) {
  if (!inputPath)
    throw new Error("inputPath is required for applySubtitleToVideo");
  if (!subtitleConfig) return { outputPath: inputPath };
  if (!Array.isArray(segments) || segments.length === 0) {
    return { outputPath: inputPath };
  }
  const breakLen = subtitleConfig.breakLength ?? 0;
  const lineSegments = segments
    .map((s) => {
      let t = (s.text || "").trim();
      if (breakLen > 0 && t.length >= breakLen) {
        t = splitTextByBreakLength(t, breakLen).join("\n");
      }
      return { text: t, start: s.start, end: s.end };
    })
    .filter((s) => s.text);
  if (lineSegments.length === 0) return { outputPath: inputPath };
  const subtitleResult = await window.api.addSubtitleToVideoCanvas(inputPath, {
    lineSegments,
    style: {
      font: subtitleConfig.font,
      fontSize: subtitleConfig.fontSize,
      fontWeight: subtitleConfig.fontWeight,
      color: subtitleConfig.color,
      strokeEnabled: subtitleConfig.strokeEnabled,
      strokeWidth: subtitleConfig.strokeWidth,
      strokeColor: subtitleConfig.strokeColor,
      shadowEnabled: subtitleConfig.shadowEnabled,
      shadowColor: subtitleConfig.shadowColor,
      shadowOffsetX: subtitleConfig.shadowOffsetX,
      shadowOffsetY: subtitleConfig.shadowOffsetY,
      shadowBlur: subtitleConfig.shadowBlur,
      bgEnabled: subtitleConfig.bgEnabled,
      bgColor: subtitleConfig.bgColor,
      bgOpacity: subtitleConfig.bgOpacity,
      bgBorderRadius: subtitleConfig.bgBorderRadius,
      bgPaddingH: subtitleConfig.bgPaddingH,
      bgPaddingV: subtitleConfig.bgPaddingV,
    },
    alignment: subtitleConfig.alignment,
    posX: subtitleConfig.posX ?? null,
    posY: subtitleConfig.posY ?? null,
    bottomMargin: subtitleConfig.bottomMargin,
    entranceEffect: subtitleConfig.entranceEffect ?? "none",
  });
  if (!subtitleResult.success || !subtitleResult.file_path) {
    throw new Error(subtitleResult.error || "添加字幕失败");
  }
  return { outputPath: subtitleResult.file_path };
}
async function applyBgmToVideo(
  inputPath,
  bgmPath,
  volume,
  bgmTimeRange,
  videoDuration,
  voiceVolume,
) {
  if (!inputPath) throw new Error("inputPath is required for applyBgmToVideo");
  if (!bgmPath) return { outputPath: inputPath };
  const safeVolume = Number.isFinite(volume)
    ? Math.min(1, Math.max(0, volume))
    : 0.6;
  const safeVoice =
    typeof voiceVolume === "number" && Number.isFinite(voiceVolume)
      ? Math.min(3, Math.max(0, voiceVolume))
      : 2;
  const bgmResult = await window.api.addBgmToVideo(
    inputPath,
    bgmPath,
    safeVolume,
    {
      startTime: bgmTimeRange?.start,
      endTime: bgmTimeRange?.end,
      videoDuration,
      voiceVolume: safeVoice,
    },
  );
  if (!bgmResult.success || !bgmResult.file_path) {
    throw new Error(bgmResult.error || "添加BGM失败");
  }
  return { outputPath: bgmResult.file_path };
}
async function applyMixSegmentsToVideo(
  inputPath,
  totalDurationSeconds,
  segments,
) {
  if (!inputPath)
    throw new Error("inputPath is required for applyMixSegmentsToVideo");
  if (!Array.isArray(segments) || segments.length === 0) {
    return { outputPath: inputPath };
  }
  const result = await window.api.composeVideoWithMixSegments(
    inputPath,
    totalDurationSeconds,
    segments,
  );
  if (!result.success || !result.file_path) {
    throw new Error(result.error || "混剪合成失败");
  }
  return { outputPath: result.file_path };
}
async function applyPipToVideo(
  inputPath,
  totalDurationSeconds,
  segments,
  defaultPipRect,
  pipResources,
  mainVideoScaling,
) {
  if (!inputPath) throw new Error("inputPath is required for applyPipToVideo");
  const withPath = (segments || [])
    .filter((s) => s.start < s.end && s.pipResourceId)
    .map((s) => {
      const res = pipResources.find((r) => r.id === s.pipResourceId);
      return res?.path
        ? {
            start: s.start,
            end: s.end,
            pipVideoPath: res.path,
            rect: s.rect ?? defaultPipRect,
            zIndex: s.zIndex ?? 0,
          }
        : null;
    })
    .filter((x) => x != null);
  const isMainScaled =
    mainVideoScaling &&
    (mainVideoScaling.rect.x !== 0 ||
      mainVideoScaling.rect.y !== 0 ||
      mainVideoScaling.rect.width !== 100 ||
      mainVideoScaling.rect.height !== 100);
  if (withPath.length === 0 && !isMainScaled) {
    return { outputPath: inputPath };
  }
  if (withPath.length === 0 && isMainScaled) {
    const scaleResult = await window.api.scaleMainVideo(
      inputPath,
      mainVideoScaling.rect,
      mainVideoScaling.bgColor,
    );
    if (!scaleResult.success || !scaleResult.file_path) {
      throw new Error(scaleResult.error || "主视频缩放失败");
    }
    return { outputPath: scaleResult.file_path };
  }
  const result = await window.api.composeVideoWithPipSegments(
    inputPath,
    totalDurationSeconds,
    withPath,
    isMainScaled ? mainVideoScaling : void 0,
  );
  if (!result.success || !result.file_path) {
    throw new Error(result.error || "画中画合成失败");
  }
  return { outputPath: result.file_path };
}
function readSmartCutInitialSnapshot() {
  const store = useVideoPageStore.getState();
  return {
    generatedVideoPreview: store.generatedVideoPreview,
    generatedVideoPath: store.generatedVideoPath,
    originalVideoPath: store.originalVideoPath,
    bgmedVideoPath: store.bgmedVideoPath,
    subtitledVideoPath: store.subtitledVideoPath,
    titledVideoPath: store.titledVideoPath,
    smartCutVideoPath: store.smartCutVideoPath,
    finalVideoPath: store.finalVideoPath ?? "",
    audioDuration: store.audioDuration,
    videoAlreadyHasSubtitle: store.alreadySubtitled ?? false,
    mainTitle: store.mainTitle ?? "",
    subTitle: store.subTitle ?? "",
    titleEffectConfig: store.titleEffectConfig,
    subtitleEffectConfig: store.subtitleEffectConfig,
    bgmEffectConfig: store.bgmEffectConfig,
    titleSegmentRange: store.titleSegmentRange ?? null,
    bgmSegmentRange: store.bgmSegmentRange ?? null,
    mixSegments: store.mixSegments ?? [],
    pipSegments: store.pipSegments ?? [],
    pipRect: store.pipRect ?? null,
    mainVideoRect: store.mainVideoRect ?? {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    },
    mainVideoBgColor: store.mainVideoBgColor ?? "#000000",
    mainVideoZIndex: store.mainVideoZIndex ?? 0,
    whisperSegments: store.whisperSegments ?? [],
    subtitleText: store.subtitleText ?? "",
    availableFonts: store.availableFonts ?? ["黑体"],
    builtinBgms: store.builtinBgms ?? [],
    uploadedBgms: store.uploadedBgms ?? [],
    loadBgms: store.loadBgms,
  };
}
function writeSmartCutConfig(payload) {
  const store = useVideoPageStore.getState();
  store.setTitleEffectConfig(payload.titleEffectConfig ?? null);
  if (!payload.titleEffectConfig) {
    store.setTitledVideoPath("");
  }
  store.setSubtitleEffectConfig(payload.subtitleEffectConfig ?? null);
  if (payload.subtitleEffectConfig) {
    const subtitleTextToStore =
      payload.subtitleText ?? payload.subtitleEffectConfig.text ?? "";
    store.setSubtitleText(subtitleTextToStore);
  }
  if (!payload.subtitleEffectConfig) {
    store.setSubtitledVideoPath("");
    store.setAlreadySubtitled(false);
    store.setSubtitleEnabled(false);
  } else {
    store.setAlreadySubtitled(true);
    store.setSubtitleEnabled(true);
  }
  store.setBgmEffectConfig(payload.bgmEffectConfig ?? null);
  if (!payload.bgmEffectConfig) {
    store.setBgmedVideoPath("");
    store.setAlreadyBgmAdded(false);
    store.setBgmEnabled(false);
  } else {
    store.setAlreadyBgmAdded(true);
    store.setBgmEnabled(true);
  }
  if (Array.isArray(payload.mixSegments)) {
    store.setMixSegments(payload.mixSegments);
  }
  if (Array.isArray(payload.pipSegments)) {
    store.setPipSegments(payload.pipSegments);
  }
  store.setPipRect(payload.pipRect ?? null);
  if (payload.mainVideoRect) {
    store.setMainVideoRect(payload.mainVideoRect);
  }
  if (payload.mainVideoBgColor != null) {
    store.setMainVideoBgColor(payload.mainVideoBgColor);
  }
  if (payload.mainVideoZIndex != null) {
    store.setMainVideoZIndex(payload.mainVideoZIndex);
  }
  if (payload.titleSegmentRange) {
    store.setTitleSegmentRange(payload.titleSegmentRange);
  } else {
    store.setTitleSegmentRange(null);
  }
  if (payload.bgmSegmentRange) {
    store.setBgmSegmentRange(payload.bgmSegmentRange);
  } else {
    store.setBgmSegmentRange(null);
  }
  if (typeof payload.smartCutVideoPath === "string") {
    store.setSmartCutVideoPath(payload.smartCutVideoPath);
    store.setFinalVideoPath(payload.smartCutVideoPath);
  }
  if (typeof payload.smartCutBaseVideoPath === "string") {
    store.setSmartCutBaseVideoPath(payload.smartCutBaseVideoPath);
  } else if (payload.smartCutBaseVideoPath === null) {
    store.setSmartCutBaseVideoPath("");
  }
}
async function updateHistoryAfterSmartCutSave() {
  await updateVideoGenerateHistorySnapshot();
}
const MIN_PIP_SIZE$1 = 8;
const MAX_PIP_PERCENT$1 = 100;
function snapValue(val, targets, threshold, enabled) {
  if (!enabled || threshold <= 0) return val;
  for (const t of targets) {
    if (Math.abs(val - t) <= threshold) return t;
  }
  return val;
}
function snapRect(rect, containerMax, threshold, enabled) {
  if (!enabled) return rect;
  const targets = [0, 50, containerMax];
  const x = snapValue(
    rect.x,
    [...targets, containerMax - rect.width],
    threshold,
    enabled,
  );
  const y = snapValue(
    rect.y,
    [...targets, containerMax - rect.height],
    threshold,
    enabled,
  );
  return { ...rect, x, y };
}
const MAIN_VIDEO_LAYER_ID = "__main_video__";
function CompositePreview(props) {
  const {
    videoRef,
    videoSrc,
    currentTime,
    isPlaying,
    duration,
    onVideoLoadedMetadata,
    onVideoPlay,
    onVideoPause,
    onVideoSeeking,
    onVideoTimeUpdate,
    onVideoEnded,
    mixSegments,
    mixResources,
    pipSegments,
    pipResources,
    defaultPipRect,
    onPipSegmentRectChange,
    mainVideoSize,
    mainVideoRect,
    onMainVideoRectChange,
    mainVideoBgColor,
    mainVideoZIndex,
    selectedLayerId,
    onSelectLayer,
    snapEnabled,
    snapThreshold,
    titleConfig,
    titleRange,
    subtitleConfig,
    subtitleSegments,
    onSubtitleDrag,
    bgmSelectedBgmId,
    bgmVolume,
    voiceVolume,
    bgmRange,
    allBgms,
    placeholderText,
  } = props;
  const containerRef = useRef(null);
  const bgmAudioRef = useRef(null);
  const mixVideoRefs = useRef({});
  const pipVideoRefs = useRef({});
  const subtitleCanvasRef = useRef(null);
  const [overlayRect, setOverlayRect] = useState({
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  });
  const [resourceUrls, setResourceUrls] = useState({});
  const [bgmUrl, setBgmUrl] = useState(null);
  const [mainVidDrag, setMainVidDrag] = useState(null);
  const [pipDrag, setPipDrag] = useState(null);
  const subDragRef = useRef(null);
  useEffect(() => {
    if (!videoSrc || !selectedLayerId) return;
    const root = containerRef.current;
    if (!root) return;
    const onMouseDownCapture = (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.closest("[data-smartcut-layer-toolbar]")) return;
      if (t.closest("[data-smartcut-select-layer]")) return;
      if (t.closest(".smartcut-subtitle-drag-handle")) return;
      onSelectLayer(null);
    };
    document.addEventListener("mousedown", onMouseDownCapture, true);
    return () =>
      document.removeEventListener("mousedown", onMouseDownCapture, true);
  }, [videoSrc, selectedLayerId, onSelectLayer]);
  useEffect(() => {
    const allRes = [];
    mixResources.forEach((r) => {
      if (r.path) allRes.push({ id: r.id, path: r.path });
    });
    pipResources.forEach((r) => {
      if (r.path) allRes.push({ id: r.id, path: r.path });
    });
    if (allRes.length === 0) {
      setResourceUrls({});
      return;
    }
    let cancelled = false;
    Promise.all(
      allRes.map(async ({ id, path }) => {
        try {
          const result = await window.api.getLocalFileUrl(path);
          return { id, url: result.success && result.url ? result.url : null };
        } catch {
          return { id, url: null };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const map = {};
      results.forEach((r) => {
        if (r.url) map[r.id] = r.url;
      });
      setResourceUrls(map);
    });
    return () => {
      cancelled = true;
    };
  }, [mixResources, pipResources]);
  useEffect(() => {
    if (!bgmSelectedBgmId) {
      setBgmUrl(null);
      return;
    }
    const bgm = allBgms.find((b) => b.id === bgmSelectedBgmId);
    if (!bgm?.path) {
      setBgmUrl(null);
      return;
    }
    let cancelled = false;
    window.api
      .getLocalFileUrl(bgm.path)
      .then((res) => {
        if (!cancelled && res.success && res.url) setBgmUrl(res.url);
        else if (!cancelled) setBgmUrl(null);
      })
      .catch(() => {
        if (!cancelled) setBgmUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bgmSelectedBgmId, allBgms]);
  const [containerSize, setContainerSize] = useState({
    w: 0,
    h: 0,
  });
  const updateContainerSize = useCallback(() => {
    const c = containerRef.current;
    const parent = c?.parentElement;
    if (!c || !parent) return;
    const pw = parent.clientWidth - 24;
    const ph = parent.clientHeight - 20;
    if (
      !mainVideoSize ||
      mainVideoSize.width <= 0 ||
      mainVideoSize.height <= 0 ||
      pw <= 0 ||
      ph <= 0
    ) {
      setContainerSize({ w: pw > 0 ? pw : 0, h: ph > 0 ? ph : 0 });
      setOverlayRect({ x: 0, y: 0, w: pw > 0 ? pw : 0, h: ph > 0 ? ph : 0 });
      return;
    }
    const va = mainVideoSize.width / mainVideoSize.height;
    const pa = pw / ph;
    let w, h;
    if (va > pa) {
      w = pw;
      h = pw / va;
    } else {
      h = ph;
      w = ph * va;
    }
    w = Math.round(w);
    h = Math.round(h);
    setContainerSize({ w, h });
    setOverlayRect({ x: 0, y: 0, w, h });
  }, [containerRef, mainVideoSize]);
  useEffect(() => {
    const c = containerRef.current;
    const parent = c?.parentElement;
    if (!parent) return;
    updateContainerSize();
    const ro = new ResizeObserver(updateContainerSize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [containerRef, updateContainerSize, videoSrc]);
  useEffect(() => {
    if (bgmAudioRef.current) bgmAudioRef.current.volume = bgmVolume;
  }, [bgmVolume]);
  useEffect(() => {
    if (videoRef.current)
      videoRef.current.volume = Math.min(1, bgmSelectedBgmId ? voiceVolume : 1);
  }, [voiceVolume, bgmSelectedBgmId, videoRef]);
  const syncBgm = useCallback(
    (videoTime, play, forceSeek = false) => {
      const audio = bgmAudioRef.current;
      if (!audio || !bgmUrl) return;
      const r = bgmRange;
      if (!r) {
        if (!audio.paused) audio.pause();
        return;
      }
      if (videoTime >= r.start && videoTime < r.end) {
        const needStart = play && audio.paused;
        if (forceSeek || needStart) {
          audio.currentTime = videoTime - r.start;
        }
        if (needStart) audio.play().catch(() => {});
      } else {
        if (!audio.paused) audio.pause();
      }
    },
    [bgmUrl, bgmRange],
  );
  const activeMixSeg = useMemo(
    () =>
      mixSegments.find((s) => currentTime >= s.start && currentTime < s.end) ??
      null,
    [mixSegments, currentTime],
  );
  const activePipSegs = useMemo(
    () =>
      pipSegments.filter((s) => currentTime >= s.start && currentTime < s.end),
    [pipSegments, currentTime],
  );
  const prevActiveMixIdRef = useRef(null);
  const prevActivePipIdsRef = useRef(new Set());
  useEffect(() => {
    const mixResId = activeMixSeg?.mixResourceId ?? null;
    if (mixResId !== prevActiveMixIdRef.current) {
      if (prevActiveMixIdRef.current) {
        const old = mixVideoRefs.current[prevActiveMixIdRef.current];
        if (old && !old.paused) old.pause();
      }
      prevActiveMixIdRef.current = mixResId;
    }
    if (mixResId && activeMixSeg) {
      const v = mixVideoRefs.current[mixResId];
      if (v) {
        const target = currentTime - activeMixSeg.start;
        if (Math.abs(v.currentTime - target) > 0.3)
          v.currentTime = Math.max(0, target);
        if (isPlaying && v.paused) v.play().catch(() => {});
        if (!isPlaying && !v.paused) v.pause();
      }
    }
  }, [activeMixSeg, currentTime, isPlaying]);
  useEffect(() => {
    const currentIds = new Set(activePipSegs.map((s) => s.pipResourceId));
    for (const oldId of prevActivePipIdsRef.current) {
      if (!currentIds.has(oldId)) {
        const old = pipVideoRefs.current[oldId];
        if (old && !old.paused) old.pause();
      }
    }
    prevActivePipIdsRef.current = currentIds;
    for (const seg of activePipSegs) {
      const v = pipVideoRefs.current[seg.pipResourceId];
      if (v) {
        const target = currentTime - seg.start;
        if (Math.abs(v.currentTime - target) > 0.3)
          v.currentTime = Math.max(0, target);
        if (isPlaying && v.paused) v.play().catch(() => {});
        if (!isPlaying && !v.paused) v.pause();
      }
    }
  }, [activePipSegs, currentTime, isPlaying]);
  const mixVideoIds = useMemo(() => {
    const ids = [
      ...new Set(mixSegments.map((s) => s.mixResourceId).filter(Boolean)),
    ];
    return ids.filter((id) => {
      const res = mixResources.find((r) => r.id === id);
      return res?.path && !isImageFile(res.path);
    });
  }, [mixSegments, mixResources]);
  const mixImageIds = useMemo(() => {
    const ids = [
      ...new Set(mixSegments.map((s) => s.mixResourceId).filter(Boolean)),
    ];
    return ids.filter((id) => {
      const res = mixResources.find((r) => r.id === id);
      return res?.path && isImageFile(res.path);
    });
  }, [mixSegments, mixResources]);
  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    if (Number.isFinite(d) && d > 0) onVideoLoadedMetadata?.(d);
    updateContainerSize();
  }, [videoRef, onVideoLoadedMetadata, updateContainerSize]);
  const handlePlay = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    onVideoPlay?.(t);
    syncBgm(t, true, true);
    const mixResId = activeMixSeg?.mixResourceId;
    if (mixResId) {
      const mv = mixVideoRefs.current[mixResId];
      if (mv) {
        mv.currentTime = Math.max(0, t - (activeMixSeg?.start ?? 0));
        mv.play().catch(() => {});
      }
    }
    for (const seg of activePipSegs) {
      const pv = pipVideoRefs.current[seg.pipResourceId];
      if (pv) {
        pv.currentTime = Math.max(0, t - seg.start);
        pv.play().catch(() => {});
      }
    }
  }, [videoRef, onVideoPlay, syncBgm, activeMixSeg, activePipSegs]);
  const handlePause = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    onVideoPause?.(t);
    bgmAudioRef.current?.pause();
    Object.values(mixVideoRefs.current).forEach((v) => {
      if (v && !v.paused) v.pause();
    });
    Object.values(pipVideoRefs.current).forEach((v) => {
      if (v && !v.paused) v.pause();
    });
  }, [videoRef, onVideoPause]);
  const handleSeeking = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    onVideoSeeking?.(t);
    syncBgm(t, isPlaying, true);
  }, [videoRef, onVideoSeeking, syncBgm, isPlaying]);
  const handleTimeUpdate = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    onVideoTimeUpdate?.(t);
    syncBgm(t, isPlaying);
  }, [videoRef, onVideoTimeUpdate, syncBgm, isPlaying]);
  const handleEnded = useCallback(() => {
    const t = videoRef.current?.duration ?? duration;
    onVideoEnded?.(t);
    bgmAudioRef.current?.pause();
    Object.values(mixVideoRefs.current).forEach((v) => {
      if (v && !v.paused) v.pause();
    });
    Object.values(pipVideoRefs.current).forEach((v) => {
      if (v && !v.paused) v.pause();
    });
  }, [videoRef, onVideoEnded, duration]);
  const showTitle = useMemo(() => {
    if (!titleConfig?.mainTitleText?.trim()) return false;
    const r = titleRange;
    if (!r) return false;
    return currentTime >= r.start && currentTime < r.end;
  }, [titleConfig, titleRange, currentTime]);
  const currentSubLine = useMemo(() => {
    if (!subtitleConfig) return null;
    return (
      subtitleSegments.find(
        (s) => currentTime >= s.start && currentTime < s.end,
      ) ?? null
    );
  }, [subtitleConfig, subtitleSegments, currentTime]);
  const renderSubtitleCanvas = useCallback(() => {
    const canvas = subtitleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!currentSubLine || !subtitleConfig) return;
    const effect = subtitleConfig.entranceEffect ?? "none";
    const entranceDur = getEntranceDuration(effect);
    const elapsed = currentTime - currentSubLine.start;
    const remaining = currentSubLine.end - currentTime;
    const ep = entranceDur > 0 ? Math.min(1, elapsed / entranceDur) : 1;
    const xp = remaining < EXIT_DURATION ? 1 - remaining / EXIT_DURATION : 0;
    const breakLen = subtitleConfig.breakLength ?? 0;
    let subText = currentSubLine.text;
    if (breakLen > 0 && subText.length >= breakLen) {
      subText = splitTextByBreakLength(subText, breakLen).join("\n");
    }
    renderSubtitleFrame(ctx, {
      text: subText,
      style: {
        font: subtitleConfig.font || "黑体",
        fontSize: subtitleConfig.fontSize ?? 36,
        fontWeight: subtitleConfig.fontWeight ?? 400,
        color: subtitleConfig.color || "#FFFFFF",
        strokeEnabled: subtitleConfig.strokeEnabled,
        strokeWidth: subtitleConfig.strokeWidth,
        strokeColor: subtitleConfig.strokeColor,
        shadowEnabled: subtitleConfig.shadowEnabled,
        shadowColor: subtitleConfig.shadowColor,
        shadowOffsetX: subtitleConfig.shadowOffsetX,
        shadowOffsetY: subtitleConfig.shadowOffsetY,
        shadowBlur: subtitleConfig.shadowBlur,
        bgEnabled: subtitleConfig.bgEnabled,
        bgColor: subtitleConfig.bgColor,
        bgOpacity: subtitleConfig.bgOpacity,
        bgBorderRadius: subtitleConfig.bgBorderRadius,
        bgPaddingH: subtitleConfig.bgPaddingH,
        bgPaddingV: subtitleConfig.bgPaddingV,
      },
      canvasWidth: w,
      canvasHeight: h,
      posX: subtitleConfig.posX ?? null,
      posY: subtitleConfig.posY ?? null,
      alignment: subtitleConfig.alignment ?? 2,
      bottomMargin: subtitleConfig.bottomMargin ?? 240,
      entranceEffect: effect,
      entranceProgress: ep,
      exitProgress: xp,
    });
  }, [currentSubLine, subtitleConfig, currentTime, overlayRect.w, overlayRect.h]);
  useEffect(() => {
    renderSubtitleCanvas();
    if (!isPlaying) return;
    let rafId;
    const tick = () => {
      renderSubtitleCanvas();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, renderSubtitleCanvas]);
  const scale = overlayRect.h > 0 ? overlayRect.h / 1280 : 1;
  const stageH = overlayRect.h;
  const overlayToPercent = useCallback((clientX, clientY) => {
    const el = containerRef.current?.querySelector(
      ".smartcut-overlay-container",
    );
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  }, []);
  const mainVideoPercentRatio = 1;
  useEffect(() => {
    if (!mainVidDrag) return;
    const onMove = (e) => {
      const { x, y } = overlayToPercent(e.clientX, e.clientY);
      if (mainVidDrag.mode === "move") {
        const dx = x - mainVidDrag.startX;
        const dy = y - mainVidDrag.startY;
        let nx = mainVidDrag.startRect.x + dx;
        let ny = mainVidDrag.startRect.y + dy;
        nx = Math.max(
          -mainVidDrag.startRect.width + MIN_PIP_SIZE$1,
          Math.min(MAX_PIP_PERCENT$1 - MIN_PIP_SIZE$1, nx),
        );
        ny = Math.max(
          -mainVidDrag.startRect.height + MIN_PIP_SIZE$1,
          Math.min(MAX_PIP_PERCENT$1 - MIN_PIP_SIZE$1, ny),
        );
        const snapped = snapRect(
          { ...mainVidDrag.startRect, x: nx, y: ny },
          MAX_PIP_PERCENT$1,
          snapThreshold,
          snapEnabled,
        );
        onMainVideoRectChange(snapped);
      } else {
        const rawH = Math.max(MIN_PIP_SIZE$1, y - mainVidDrag.startRect.y);
        const rawW = rawH * mainVideoPercentRatio;
        onMainVideoRectChange({
          ...mainVidDrag.startRect,
          width: Math.max(MIN_PIP_SIZE$1, rawW),
          height: rawH,
        });
      }
    };
    const onUp = () => setMainVidDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [
    mainVidDrag,
    overlayToPercent,
    onMainVideoRectChange,
    mainVideoPercentRatio,
    snapEnabled,
    snapThreshold,
  ]);
  const [pipMaterialSizes, setPipMaterialSizes] = useState({});
  const pipSizeRatio = useMemo(() => {
    const dragSeg = pipDrag
      ? pipSegments.find((s) => s.id === pipDrag.segId)
      : null;
    const pipResId = dragSeg?.pipResourceId;
    if (!pipResId) return 1;
    const matSize = pipMaterialSizes[pipResId];
    const materialAspect = matSize ? matSize.w / matSize.h : 16 / 9;
    const stageAspect =
      mainVideoSize && mainVideoSize.width > 0
        ? mainVideoSize.height / mainVideoSize.width
        : 16 / 9;
    return materialAspect * stageAspect;
  }, [pipDrag, pipSegments, pipMaterialSizes, mainVideoSize]);
  useEffect(() => {
    if (!pipDrag) return;
    const onMove = (e) => {
      const { x, y } = overlayToPercent(e.clientX, e.clientY);
      if (pipDrag.mode === "move") {
        const dx = x - pipDrag.startX;
        const dy = y - pipDrag.startY;
        let nx = pipDrag.startRect.x + dx;
        let ny = pipDrag.startRect.y + dy;
        nx = Math.max(
          -pipDrag.startRect.width + MIN_PIP_SIZE$1,
          Math.min(MAX_PIP_PERCENT$1 - MIN_PIP_SIZE$1, nx),
        );
        ny = Math.max(
          -pipDrag.startRect.height + MIN_PIP_SIZE$1,
          Math.min(MAX_PIP_PERCENT$1 - MIN_PIP_SIZE$1, ny),
        );
        const snapped = snapRect(
          { ...pipDrag.startRect, x: nx, y: ny },
          MAX_PIP_PERCENT$1,
          snapThreshold,
          snapEnabled,
        );
        onPipSegmentRectChange(pipDrag.segId, snapped);
      } else {
        const rawH = Math.max(
          MIN_PIP_SIZE$1,
          Math.min(
            MAX_PIP_PERCENT$1 - pipDrag.startRect.y,
            y - pipDrag.startRect.y,
          ),
        );
        const rawW = rawH * pipSizeRatio;
        const newW = Math.max(
          MIN_PIP_SIZE$1,
          Math.min(MAX_PIP_PERCENT$1 - pipDrag.startRect.x, rawW),
        );
        const newH = Math.max(
          MIN_PIP_SIZE$1,
          Math.min(
            MAX_PIP_PERCENT$1 - pipDrag.startRect.y,
            newW / pipSizeRatio,
          ),
        );
        onPipSegmentRectChange(pipDrag.segId, {
          ...pipDrag.startRect,
          width: newW,
          height: newH,
        });
      }
    };
    const onUp = () => setPipDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [
    pipDrag,
    overlayToPercent,
    onPipSegmentRectChange,
    pipSizeRatio,
    snapEnabled,
    snapThreshold,
  ]);
  const [subtitleDragging, setSubtitleDragging] = useState(false);
  useEffect(() => {
    const handleMove = (e) => {
      const d = subDragRef.current;
      if (!d || !onSubtitleDrag || stageH <= 0) return;
      const s = stageH / 1280;
      const dx = (e.clientX - d.startMouseX) / s;
      const dy = (e.clientY - d.startMouseY) / s;
      const newX = Math.max(0, Math.min(720, Math.round(d.startPosX + dx)));
      const newY = Math.max(0, Math.min(1280, Math.round(d.startPosY + dy)));
      onSubtitleDrag(newX, newY);
    };
    const handleUp = () => {
      subDragRef.current = null;
      setSubtitleDragging(false);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [onSubtitleDrag, stageH]);
  const renderTitleOverlay = () => {
    if (!showTitle || !titleConfig) return null;
    const style = titleConfig.style;
    const main = style?.mainTitle ?? {};
    const sub = style?.subTitle ?? {};
    const mainText = titleConfig.mainTitleText || "";
    const subText = titleConfig.subTitleText || "";
    const mainBreak = main.breakLength ?? 0;
    const subBreak = sub.breakLength ?? 0;
    const mainLines = splitTextByBreakLength(mainText, mainBreak);
    const subLines = style?.hasSubTitle
      ? splitTextByBreakLength(subText, subBreak)
      : [];
    const mainFontSize = (main.fontSize ?? 48) * scale;
    const subFontSize = (sub.fontSize ?? 36) * scale;
    const mainBg = main.backgroundColor || "transparent";
    const mainRadius = (main.borderRadius ?? 0) * scale;
    const subBg = sub.backgroundColor || "transparent";
    const subRadius = (sub.borderRadius ?? 0) * scale;
    const mainTitleHeightPx =
      mainLines.length * (mainFontSize * 1.2) + mainFontSize;
    const mainTitleHeight1280 = mainTitleHeightPx / scale;
    const subTitleTop1280 =
      (main.top ?? 100) + mainTitleHeight1280 + (sub.top ?? 0);
    const mainAlignV = main.alignV || "top";
    const mainAlignH = main.alignH || "center";
    const subAlignV = sub.alignV || "top";
    const subAlignH = sub.alignH || "center";
    const titleLayerStyle = (alignV, alignH, offsetPx) => {
      const offsetPct = `${(offsetPx / 1280) * 100}%`;
      const vStyle =
        alignV === "bottom"
          ? { top: "auto", bottom: offsetPct }
          : alignV === "middle"
            ? { top: "50%" }
            : { top: offsetPct };
      const hStyle =
        alignH === "left"
          ? {
              left: "5%",
              transform: alignV === "middle" ? "translateY(-50%)" : "none",
            }
          : alignH === "right"
            ? {
                left: "auto",
                right: "5%",
                transform: alignV === "middle" ? "translateY(-50%)" : "none",
              }
            : {
                left: "50%",
                transform:
                  alignV === "middle"
                    ? "translate(-50%,-50%)"
                    : "translateX(-50%)",
              };
      return { ...vStyle, ...hStyle };
    };
    const mainItemsAlign =
      mainAlignH === "left"
        ? "flex-start"
        : mainAlignH === "right"
          ? "flex-end"
          : "center";
    const subItemsAlign =
      subAlignH === "left"
        ? "flex-start"
        : subAlignH === "right"
          ? "flex-end"
          : "center";
    return jsxRuntimeExports.jsxs(React.Fragment, {
      children: [
        jsxRuntimeExports.jsx("div", {
          className: "smartcut-title-layer",
          style: titleLayerStyle(mainAlignV, mainAlignH, main.top ?? 100),
          children: jsxRuntimeExports.jsx("div", {
            style: {
              padding: `${Math.round(mainFontSize * 0.5)}px`,
              borderRadius: mainRadius > 0 ? `${mainRadius}px` : void 0,
              backgroundColor:
                mainBg !== "transparent" && mainBg ? mainBg : void 0,
              display: "flex",
              flexDirection: "column",
              alignItems: mainItemsAlign,
              gap: 2,
              lineHeight: 1.2,
              overflow: "hidden",
            },
            children: mainLines.map((line, i) =>
              jsxRuntimeExports.jsx(
                "span",
                {
                  style: {
                    fontFamily: main.font || "黑体",
                    fontSize: `${mainFontSize}px`,
                    fontWeight: main.fontWeight ?? 400,
                    color: main.color || "#FFFFFF",
                    WebkitTextStroke:
                      main.strokeEnabled !== false &&
                      (main.strokeWidth ?? 0) > 0
                        ? `${main.strokeWidth}px ${main.strokeColor || "#000000"}`
                        : void 0,
                    paintOrder:
                      main.strokeEnabled !== false &&
                      (main.strokeWidth ?? 0) > 0
                        ? "stroke fill"
                        : void 0,
                    textShadow: main.shadowEnabled
                      ? `${main.shadowOffsetX ?? 2}px ${main.shadowOffsetY ?? 2}px ${main.shadowBlur ?? 0}px ${main.shadowColor || "#000000"}`
                      : void 0,
                    whiteSpace: "nowrap",
                  },
                  children: line || " ",
                },
                i,
              ),
            ),
          }),
        }),
        style?.hasSubTitle &&
          subLines.length > 0 &&
          jsxRuntimeExports.jsx("div", {
            className: "smartcut-title-layer",
            style: titleLayerStyle(subAlignV, subAlignH, subTitleTop1280),
            children: jsxRuntimeExports.jsx("div", {
              style: {
                padding: `${Math.round(subFontSize * 0.5)}px`,
                borderRadius: subRadius > 0 ? `${subRadius}px` : void 0,
                backgroundColor:
                  subBg !== "transparent" && subBg ? subBg : void 0,
                display: "flex",
                flexDirection: "column",
                alignItems: subItemsAlign,
                gap: 2,
                lineHeight: 1.2,
                overflow: "hidden",
              },
              children: subLines.map((line, i) =>
                jsxRuntimeExports.jsx(
                  "span",
                  {
                    style: {
                      fontFamily: sub.font || "黑体",
                      fontSize: `${subFontSize}px`,
                      fontWeight: sub.fontWeight ?? 400,
                      color: sub.color || "#FFFFFF",
                      WebkitTextStroke:
                        sub.strokeEnabled !== false &&
                        (sub.strokeWidth ?? 0) > 0
                          ? `${sub.strokeWidth}px ${sub.strokeColor || "#000000"}`
                          : void 0,
                      paintOrder:
                        sub.strokeEnabled !== false &&
                        (sub.strokeWidth ?? 0) > 0
                          ? "stroke fill"
                          : void 0,
                      textShadow: sub.shadowEnabled
                        ? `${sub.shadowOffsetX ?? 2}px ${sub.shadowOffsetY ?? 2}px ${sub.shadowBlur ?? 0}px ${sub.shadowColor || "#000000"}`
                        : void 0,
                      whiteSpace: "nowrap",
                    },
                    children: line || " ",
                  },
                  i,
                ),
              ),
            }),
          }),
      ],
    });
  };
  if (!videoSrc) {
    return jsxRuntimeExports.jsx("div", {
      className: "smartcut-composite-preview",
      children: jsxRuntimeExports.jsx("div", {
        className: "smartcut-preview-placeholder",
        children: placeholderText || "生成后的视频将显示在这里",
      }),
    });
  }
  return jsxRuntimeExports.jsxs("div", {
    className: "smartcut-composite-preview",
    ref: containerRef,
    style: {
      background: mainVideoBgColor || "#000",
      width: containerSize.w > 0 ? `${containerSize.w}px` : "100%",
      height: containerSize.h > 0 ? `${containerSize.h}px` : "100%",
    },
    children: [
      jsxRuntimeExports.jsxs("div", {
        className: "smartcut-overlay-container",
        style: {
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
        },
        children: [
          jsxRuntimeExports.jsxs("div", {
            "data-smartcut-select-layer": "",
            style: {
              position: "absolute",
              left: `${mainVideoRect.x}%`,
              top: `${mainVideoRect.y}%`,
              width: `${mainVideoRect.width}%`,
              height: `${mainVideoRect.height}%`,
              zIndex: mainVideoZIndex,
              cursor: mainVidDrag ? "grabbing" : "grab",
              pointerEvents: "auto",
              boxSizing: "border-box",
              outline:
                selectedLayerId === MAIN_VIDEO_LAYER_ID
                  ? "2px solid #3b82f6"
                  : "none",
              outlineOffset: -1,
            },
            onMouseDown: (e) => {
              onSelectLayer(MAIN_VIDEO_LAYER_ID);
              if (e.target !== e.currentTarget) return;
              const pos = overlayToPercent(e.clientX, e.clientY);
              setMainVidDrag({
                mode: "move",
                startX: pos.x,
                startY: pos.y,
                startRect: { ...mainVideoRect },
              });
            },
            children: [
              jsxRuntimeExports.jsx("video", {
                ref: videoRef,
                src: videoSrc,
                playsInline: true,
                preload: "auto",
                onLoadedMetadata: handleLoadedMetadata,
                onPlay: handlePlay,
                onPause: handlePause,
                onSeeking: handleSeeking,
                onTimeUpdate: handleTimeUpdate,
                onEnded: handleEnded,
                style: {
                  width: "100%",
                  height: "100%",
                  objectFit: "fill",
                  pointerEvents: "none",
                  display: "block",
                },
              }),
              jsxRuntimeExports.jsx("span", {
                className: "smartcut-pip-resize-handle",
                onMouseDown: (e) => {
                  e.stopPropagation();
                  onSelectLayer(MAIN_VIDEO_LAYER_ID);
                  const pos = overlayToPercent(e.clientX, e.clientY);
                  setMainVidDrag({
                    mode: "resize",
                    startX: pos.x,
                    startY: pos.y,
                    startRect: { ...mainVideoRect },
                  });
                },
              }),
            ],
          }),
          (mixVideoIds.length > 0 || mixImageIds.length > 0) &&
            jsxRuntimeExports.jsxs("div", {
              className: "smartcut-mix-layer",
              style: {
                opacity: activeMixSeg ? 1 : 0,
                pointerEvents: activeMixSeg ? "auto" : "none",
              },
              children: [
                mixVideoIds.map((resId) =>
                  jsxRuntimeExports.jsx(
                    "video",
                    {
                      ref: (el) => {
                        mixVideoRefs.current[resId] = el;
                      },
                      src: resourceUrls[resId],
                      preload: "auto",
                      muted: true,
                      playsInline: true,
                      style: {
                        opacity: activeMixSeg?.mixResourceId === resId ? 1 : 0,
                        pointerEvents: "none",
                      },
                    },
                    resId,
                  ),
                ),
                mixImageIds.map((resId) =>
                  jsxRuntimeExports.jsx(
                    "img",
                    {
                      src: resourceUrls[resId],
                      alt: "",
                      draggable: false,
                      style: {
                        opacity: activeMixSeg?.mixResourceId === resId ? 1 : 0,
                        pointerEvents: "none",
                      },
                    },
                    resId,
                  ),
                ),
              ],
            }),
          activePipSegs.map((seg) => {
            const resId = seg.pipResourceId;
            const url = resourceUrls[resId];
            if (!url) return null;
            const res = pipResources.find((r) => r.id === resId);
            const isPipImage = res?.path ? isImageFile(res.path) : false;
            const segRect = seg.rect ?? defaultPipRect;
            const layerZ = seg.zIndex ?? 0;
            const isSelected = selectedLayerId === seg.id;
            return jsxRuntimeExports.jsxs(
              "div",
              {
                className: "smartcut-pip-layer",
                "data-smartcut-select-layer": "",
                style: {
                  left: `${segRect.x}%`,
                  top: `${segRect.y}%`,
                  width: `${segRect.width}%`,
                  height: `${segRect.height}%`,
                  zIndex: layerZ,
                  outline: isSelected ? "2px solid #3b82f6" : "none",
                  outlineOffset: -1,
                },
                onMouseDown: (e) => {
                  onSelectLayer(seg.id);
                  if (e.target !== e.currentTarget) return;
                  const { x, y } = overlayToPercent(e.clientX, e.clientY);
                  setPipDrag({
                    mode: "move",
                    startX: x,
                    startY: y,
                    startRect: { ...segRect },
                    segId: seg.id,
                  });
                },
                children: [
                  isPipImage
                    ? jsxRuntimeExports.jsx("img", {
                        src: url,
                        alt: "",
                        draggable: false,
                        onLoad: (e) => {
                          const img = e.currentTarget;
                          if (img.naturalWidth && img.naturalHeight) {
                            setPipMaterialSizes((prev) => ({
                              ...prev,
                              [resId]: {
                                w: img.naturalWidth,
                                h: img.naturalHeight,
                              },
                            }));
                          }
                        },
                      })
                    : jsxRuntimeExports.jsx("video", {
                        ref: (el) => {
                          pipVideoRefs.current[resId] = el;
                        },
                        src: url,
                        preload: "auto",
                        muted: true,
                        playsInline: true,
                        onLoadedMetadata: (e) => {
                          const v = e.currentTarget;
                          if (v.videoWidth && v.videoHeight) {
                            setPipMaterialSizes((prev) => ({
                              ...prev,
                              [resId]: { w: v.videoWidth, h: v.videoHeight },
                            }));
                          }
                        },
                      }),
                  jsxRuntimeExports.jsx("span", {
                    className: "smartcut-pip-resize-handle",
                    onMouseDown: (e) => {
                      e.stopPropagation();
                      onSelectLayer(seg.id);
                      const { x, y } = overlayToPercent(e.clientX, e.clientY);
                      setPipDrag({
                        mode: "resize",
                        startX: x,
                        startY: y,
                        startRect: { ...segRect },
                        segId: seg.id,
                      });
                    },
                  }),
                ],
              },
              seg.id,
            );
          }),
          renderTitleOverlay(),
          jsxRuntimeExports.jsx("canvas", {
            ref: subtitleCanvasRef,
            className: "smartcut-subtitle-canvas",
            width: Math.round(
              overlayRect.w *
                (typeof window !== "undefined"
                  ? window.devicePixelRatio || 1
                  : 1),
            ),
            height: Math.round(
              overlayRect.h *
                (typeof window !== "undefined"
                  ? window.devicePixelRatio || 1
                  : 1),
            ),
            style: { width: "100%", height: "100%" },
          }),
          currentSubLine &&
            onSubtitleDrag &&
            subtitleConfig &&
            (() => {
              const scaleX = overlayRect.w / 720;
              const scaleY = overlayRect.h / 1280;
              const sc = Math.min(scaleX, scaleY);
              const fontSize = (subtitleConfig.fontSize ?? 36) * sc;
              const fontWeight = subtitleConfig.fontWeight ?? 400;
              const fontFamily = subtitleConfig.font ?? "黑体";
              const padH =
                (subtitleConfig.bgEnabled
                  ? (subtitleConfig.bgPaddingH ?? 6)
                  : 0) * sc;
              const padV =
                (subtitleConfig.bgEnabled
                  ? (subtitleConfig.bgPaddingV ?? 2)
                  : 0) * sc;
              const measureCanvas = document.createElement("canvas");
              const mCtx = measureCanvas.getContext("2d");
              let measuredW = currentSubLine.text.length * fontSize * 0.6;
              if (mCtx) {
                mCtx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
                measuredW = mCtx.measureText(currentSubLine.text).width;
              }
              const textW = measuredW + padH * 2;
              const textH = fontSize + padV * 2;
              const posX =
                subtitleConfig.posX != null
                  ? subtitleConfig.posX * scaleX
                  : overlayRect.w / 2;
              const posY =
                subtitleConfig.posY != null
                  ? subtitleConfig.posY * scaleY
                  : overlayRect.h -
                    (subtitleConfig.bottomMargin ?? 240) * scaleY;
              return jsxRuntimeExports.jsx("div", {
                className: `smartcut-subtitle-drag-handle${subtitleDragging ? " smartcut-subtitle-drag-active" : ""}`,
                style: {
                  left: `${posX - textW / 2}px`,
                  top: `${posY - textH / 2}px`,
                  width: `${textW}px`,
                  height: `${textH}px`,
                  cursor: subtitleDragging ? "grabbing" : "grab",
                },
                onMouseDown: (e) => {
                  e.preventDefault();
                  setSubtitleDragging(true);
                  const curX =
                    subtitleConfig.posX != null ? subtitleConfig.posX : 360;
                  const curY =
                    subtitleConfig.posY != null
                      ? subtitleConfig.posY
                      : 1280 - (subtitleConfig.bottomMargin ?? 240);
                  subDragRef.current = {
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startPosX: curX,
                    startPosY: curY,
                  };
                },
              });
            })(),
        ],
      }),
      bgmUrl &&
        jsxRuntimeExports.jsx("audio", {
          ref: bgmAudioRef,
          src: bgmUrl,
          preload: "auto",
          loop: false,
        }),
    ],
  });
}
const SmartCutResourcePanelAny = SmartCutResourcePanel;
const DEFAULT_PIP_RECT = { x: 70, y: 10, width: 25, height: 25 };
const MIN_PIP_SIZE = 8;
const MAX_PIP_PERCENT = 100;
function SmartCutModal({ show, onClose }) {
  const showToast = useToast();
  const [audioDuration, setAudioDuration] = useState(0);
  const [generatedVideoPreview, setGeneratedVideoPreview] =
    useState("");
  const [mode, setMode] = useState("editing");
  const [mixResources, setMixResources] = useState([]);
  const [pipResources, setPipResources] = useState([]);
  const [localMixSegments, setLocalMixSegments] = useState([]);
  const [lastAppliedMixSegments, setLastAppliedMixSegments] =
    useState(null);
  const [localPipSegments, setLocalPipSegments] = useState([]);
  const [lastAppliedPipSegments, setLastAppliedPipSegments] =
    useState(null);
  const [lastAppliedPipRect, setLastAppliedPipRect] =
    useState(null);
  const [activeResourceType, setActiveResourceType] =
    useState("mix");
  const [mixSubTab, setMixSubTab] = useState("timeline");
  const [rightPanelTab, setRightPanelTab] = useState("preview");
  const [baseVideoPreviewUrl, setBaseVideoPreviewUrl] =
    useState(null);
  const [selectedMixResourceId, setSelectedMixResourceId] =
    useState(null);
  const [materialPreviewUrl, setMaterialPreviewUrl] =
    useState(null);
  const [materialPreviewIsImage, setMaterialPreviewIsImage] =
    useState(false);
  const [selectedPipResourceId, setSelectedPipResourceId] =
    useState(null);
  const [pipRect, setPipRect] = useState(DEFAULT_PIP_RECT);
  const [mainVideoSize, setMainVideoSize] = useState(null);
  const [pipVideoSize, setPipVideoSize] = useState(null);
  const [mainVideoRect, setMainVideoRect] = useState({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const [mainVideoBgColor, setMainVideoBgColor] =
    useState("#000000");
  const [mainVideoZIndex, setMainVideoZIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapThreshold, setSnapThreshold] = useState(3);
  const [_videoFirstFrameUrl, setVideoFirstFrameUrl] =
    useState(null);
  const [_pipFirstFrameUrl, setPipFirstFrameUrl] = useState(null);
  const [localBuiltinBgms, setLocalBuiltinBgms] = useState([]);
  const [localUploadedBgms, setLocalUploadedBgms] = useState([]);
  const [localBgmEffectConfig, setLocalBgmEffectConfig] =
    useState(null);
  const [localTitleEffectConfig, setLocalTitleEffectConfig] =
    useState(null);
  const [localSubtitleEffectConfig, setLocalSubtitleEffectConfig] =
    useState(null);
  const [localWhisperSegments, setLocalWhisperSegments] = useState(
    [],
  );
  const [localSubtitleEnabled, setLocalSubtitleEnabled] =
    useState(false);
  const [videoAlreadyHasSubtitle, setVideoAlreadyHasSubtitle] =
    useState(false);
  const [initialMainTitle, setInitialMainTitle] = useState("");
  const [initialSubTitle, setInitialSubTitle] = useState("");
  const [lastAppliedTitleConfig, setLastAppliedTitleConfig] =
    useState(null);
  const [lastAppliedSubtitleConfig, setLastAppliedSubtitleConfig] =
    useState(null);
  const [lastAppliedWhisperSegments, setLastAppliedWhisperSegments] =
    useState(null);
  const [lastAppliedBgmConfig, setLastAppliedBgmConfig] =
    useState(null);
  const [titleSegmentRange, setTitleSegmentRange] = useState(null);
  const [lastAppliedTitleSegmentRange, setLastAppliedTitleSegmentRange] =
    useState(null);
  const [bgmSegmentRange, setBgmSegmentRange] = useState(null);
  const [lastAppliedBgmSegmentRange, setLastAppliedBgmSegmentRange] =
    useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [localVideoPath, setLocalVideoPath] = useState(null);
  const [sessionInitialized, setSessionInitialized] =
    useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isTitleGenerating, setIsTitleGenerating] =
    useState(false);
  const [isWhisperGenerating, setIsWhisperGenerating] =
    useState(false);
  const initialTitleConfigRef = useRef(null);
  const initialSubtitleConfigRef = useRef(null);
  const initialWhisperSegmentsRef = useRef(null);
  const initialBgmConfigRef = useRef(null);
  const initialVideoPathRef = useRef(null);
  const lastAppliedVideoPathRef = useRef(null);
  const [availableFonts, setAvailableFonts] = useState(["黑体"]);
  const subtitleTextFromStoreRef = useRef("");
  const whisperSegmentsFromStoreRef = useRef([]);
  useEffect(() => {
    if (show) {
      setActiveResourceType("mix");
      setRightPanelTab("preview");
      const snapshot = readSmartCutInitialSnapshot();
      subtitleTextFromStoreRef.current = snapshot.subtitleText ?? "";
      whisperSegmentsFromStoreRef.current = snapshot.whisperSegments ?? [];
      setAvailableFonts(snapshot.availableFonts ?? ["黑体"]);
      window.api
        .loadMixResourcesConfig()
        .then((res) => {
          const list = res?.items ?? [];
          setMixResources(Array.isArray(list) ? list : []);
        })
        .catch(() => {});
      window.api
        .loadPipResourcesConfig()
        .then((res) => {
          const list = res?.items ?? [];
          setPipResources(Array.isArray(list) ? list : []);
        })
        .catch(() => {});
      setLocalBuiltinBgms(snapshot.builtinBgms ?? []);
      setLocalUploadedBgms(snapshot.uploadedBgms ?? []);
      snapshot
        .loadBgms()
        .then(() => {
          const refreshed = readSmartCutInitialSnapshot();
          setLocalBuiltinBgms(refreshed.builtinBgms ?? []);
          setLocalUploadedBgms(refreshed.uploadedBgms ?? []);
        })
        .catch(() => {});
      if (!sessionInitialized) {
        const previewBase =
          snapshot.finalVideoPath ||
          snapshot.smartCutVideoPath ||
          snapshot.bgmedVideoPath ||
          snapshot.subtitledVideoPath ||
          snapshot.titledVideoPath ||
          snapshot.generatedVideoPath ||
          snapshot.originalVideoPath ||
          "";
        const processingBase =
          snapshot.originalVideoPath || snapshot.generatedVideoPath || "";
        const nextPreviewPath = previewBase || null;
        setLocalVideoPath(nextPreviewPath);
        lastAppliedVideoPathRef.current = nextPreviewPath;
        initialVideoPathRef.current = processingBase || null;
        setAudioDuration(snapshot.audioDuration);
        setGeneratedVideoPreview(snapshot.generatedVideoPreview);
        if (snapshot.generatedVideoPreview) {
          setLocalPreviewUrl(snapshot.generatedVideoPreview);
        } else if (nextPreviewPath) {
          window.api
            .getLocalFileUrl(nextPreviewPath)
            .then((res) => {
              if (res.success && res.url) setLocalPreviewUrl(res.url);
            })
            .catch(() => {
              setLocalPreviewUrl(null);
            });
        }
        if (processingBase) {
          window.api
            .getLocalFileUrl(processingBase)
            .then((res) => {
              if (res.success && res.url) setBaseVideoPreviewUrl(res.url);
            })
            .catch(() => {});
        }
        const titleConfig = snapshot.titleEffectConfig;
        const defaultMain = {
          font: "黑体",
          fontSize: 48,
          fontWeight: 400,
          color: "#FFFFFF",
          strokeColor: "#000000",
          top: 100,
          borderRadius: 10,
          backgroundColor: "transparent",
          breakLength: 0,
        };
        const defaultSub = {
          font: "黑体",
          fontSize: 36,
          fontWeight: 400,
          color: "#FFFFFF",
          strokeColor: "#000000",
          top: 50,
          borderRadius: 10,
          backgroundColor: "transparent",
          breakLength: 0,
        };
        const mergedTitleConfig =
          titleConfig != null
            ? {
                ...titleConfig,
                mainTitleText:
                  (snapshot.mainTitle?.trim() || titleConfig.mainTitleText) ??
                  "",
                subTitleText:
                  snapshot.subTitle?.trim() ?? titleConfig.subTitleText ?? "",
                style: {
                  ...titleConfig.style,
                  mainTitle: {
                    ...defaultMain,
                    ...titleConfig.style?.mainTitle,
                  },
                  subTitle:
                    titleConfig.style?.subTitle != null
                      ? { ...defaultSub, ...titleConfig.style.subTitle }
                      : titleConfig.style?.subTitle,
                },
              }
            : null;
        setLocalTitleEffectConfig(mergedTitleConfig);
        setVideoAlreadyHasSubtitle(snapshot.videoAlreadyHasSubtitle ?? false);
        setInitialMainTitle(snapshot.mainTitle ?? "");
        setInitialSubTitle(snapshot.subTitle ?? "");
        setLocalSubtitleEnabled(
          !!snapshot.titleEffectConfig?.style?.hasSubTitle,
        );
        if (snapshot.videoAlreadyHasSubtitle) {
          setLocalSubtitleEffectConfig(snapshot.subtitleEffectConfig);
        } else {
          setLocalSubtitleEffectConfig(null);
        }
        setLocalBgmEffectConfig(
          snapshot.bgmEffectConfig
            ? {
                ...snapshot.bgmEffectConfig,
                volume:
                  snapshot.bgmEffectConfig.volume ??
                  DEFAULT_BGM_CARD_MUSIC_VOLUME,
                voiceVolume:
                  snapshot.bgmEffectConfig.voiceVolume ??
                  DEFAULT_BGM_CARD_VOICE_VOLUME,
              }
            : null,
        );
        const baseDuration =
          snapshot.audioDuration && snapshot.audioDuration > 0
            ? snapshot.audioDuration
            : 60;
        const savedLineSegments =
          snapshot.subtitleEffectConfig?.lineSegments ?? [];
        const rawSubtitleText = (
          snapshot.subtitleEffectConfig?.text ??
          snapshot.subtitleText ??
          ""
        ).trim();
        let segmentsFromStore = [];
        const externalText = snapshot.subtitleText ?? "";
        const textUnchanged =
          snapshot.subtitleEffectConfig?.text === externalText;
        if (savedLineSegments.length > 0 && textUnchanged) {
          segmentsFromStore = savedLineSegments.map((s) => ({
            start: s.start,
            end: s.end,
            text: s.text,
          }));
        } else if (rawSubtitleText) {
          const lineSegs = computeLineSegmentsFromWhisper(
            snapshot.whisperSegments ?? [],
            rawSubtitleText,
            baseDuration,
          );
          segmentsFromStore = lineSegs.map((s) => ({
            start: s.start,
            end: s.end,
            text: s.text,
          }));
        } else {
          segmentsFromStore = [];
        }
        setLocalWhisperSegments((prev) =>
          prev.length > 0 ? prev : segmentsFromStore,
        );
        initialTitleConfigRef.current = mergedTitleConfig;
        initialSubtitleConfigRef.current = snapshot.videoAlreadyHasSubtitle
          ? snapshot.subtitleEffectConfig || null
          : null;
        initialWhisperSegmentsRef.current = segmentsFromStore;
        initialBgmConfigRef.current = snapshot.bgmEffectConfig || null;
        setLastAppliedTitleConfig(mergedTitleConfig);
        setLastAppliedSubtitleConfig(
          snapshot.videoAlreadyHasSubtitle
            ? snapshot.subtitleEffectConfig || null
            : null,
        );
        setLastAppliedWhisperSegments(
          segmentsFromStore.length > 0 ? segmentsFromStore : null,
        );
        setLastAppliedBgmConfig(
          snapshot.bgmEffectConfig
            ? {
                selectedBgmId: snapshot.bgmEffectConfig.selectedBgmId,
                volume:
                  snapshot.bgmEffectConfig.volume ??
                  DEFAULT_BGM_CARD_MUSIC_VOLUME,
                voiceVolume:
                  snapshot.bgmEffectConfig.voiceVolume ??
                  DEFAULT_BGM_CARD_VOICE_VOLUME,
              }
            : null,
        );
        if (mergedTitleConfig) {
          const savedTitleRange = snapshot.titleSegmentRange;
          const fullTitleRange = savedTitleRange ?? {
            start: 0,
            end: baseDuration,
          };
          setTitleSegmentRange(fullTitleRange);
          setLastAppliedTitleSegmentRange(fullTitleRange);
        } else {
          setTitleSegmentRange(null);
          setLastAppliedTitleSegmentRange(null);
        }
        if (snapshot.bgmEffectConfig) {
          const savedBgmRange = snapshot.bgmSegmentRange;
          const fullBgmRange = savedBgmRange ?? { start: 0, end: baseDuration };
          setBgmSegmentRange(fullBgmRange);
          setLastAppliedBgmSegmentRange(fullBgmRange);
        } else {
          setBgmSegmentRange(null);
          setLastAppliedBgmSegmentRange(null);
        }
        setLocalMixSegments(snapshot.mixSegments ?? []);
        setLastAppliedMixSegments(
          snapshot.mixSegments?.length ? snapshot.mixSegments : null,
        );
        setLocalPipSegments(snapshot.pipSegments ?? []);
        setLastAppliedPipSegments(
          snapshot.pipSegments?.length ? snapshot.pipSegments : null,
        );
        if (snapshot.pipRect != null) {
          setPipRect(snapshot.pipRect);
          setLastAppliedPipRect(snapshot.pipRect);
        } else {
          setPipRect(DEFAULT_PIP_RECT);
          setLastAppliedPipRect(null);
        }
        setMainVideoRect(
          snapshot.mainVideoRect ?? { x: 0, y: 0, width: 100, height: 100 },
        );
        setMainVideoBgColor(snapshot.mainVideoBgColor ?? "#000000");
        setMainVideoZIndex(snapshot.mainVideoZIndex ?? 0);
        const mainPath =
          snapshot.originalVideoPath || snapshot.generatedVideoPath || "";
        if (mainPath) {
          window.api
            .getVideoDimensions(mainPath)
            .then((res) => {
              if (res.success && res.width != null && res.height != null) {
                setMainVideoSize({ width: res.width, height: res.height });
              }
            })
            .catch(() => {});
          window.api
            .extractFrameFromVideo(mainPath)
            .then((frameRes) => {
              if (frameRes.success && frameRes.image_path) {
                return window.api.getLocalFileUrl(frameRes.image_path);
              }
              return null;
            })
            .then((urlRes) => {
              if (urlRes?.success && urlRes?.url) {
                setVideoFirstFrameUrl(urlRes.url);
              }
            })
            .catch(() => {});
        }
        setSessionInitialized(true);
      }
    } else {
      setLocalPreviewUrl(null);
      setLocalVideoPath(null);
      setBaseVideoPreviewUrl(null);
      setLocalTitleEffectConfig(null);
      setLocalSubtitleEffectConfig(null);
      setLocalWhisperSegments([]);
      setLocalBgmEffectConfig(null);
      setLocalSubtitleEnabled(false);
      setVideoAlreadyHasSubtitle(false);
      setLastAppliedTitleConfig(null);
      setLastAppliedTitleSegmentRange(null);
      setLastAppliedSubtitleConfig(null);
      setLastAppliedWhisperSegments(null);
      setLastAppliedBgmConfig(null);
      setTitleSegmentRange(null);
      setBgmSegmentRange(null);
      setLastAppliedBgmSegmentRange(null);
      setLocalMixSegments([]);
      setLastAppliedMixSegments(null);
      setLocalPipSegments([]);
      setLastAppliedPipSegments(null);
      setLastAppliedPipRect(null);
      setPipRect(DEFAULT_PIP_RECT);
      setPipResources([]);
      setSelectedMixResourceId(null);
      setSelectedPipResourceId(null);
      setMainVideoSize(null);
      setPipVideoSize(null);
      setPipFirstFrameUrl(null);
      setVideoFirstFrameUrl(null);
      setMaterialPreviewUrl(null);
      initialTitleConfigRef.current = null;
      initialSubtitleConfigRef.current = null;
      initialWhisperSegmentsRef.current = null;
      initialBgmConfigRef.current = null;
      initialVideoPathRef.current = null;
      setSessionInitialized(false);
    }
  }, [show, sessionInitialized]);
  useEffect(() => {
    const isPipMaterial = activeResourceType === "pip";
    const selectedId = isPipMaterial
      ? selectedPipResourceId
      : selectedMixResourceId;
    if (!selectedId) {
      setMaterialPreviewUrl(null);
      setMaterialPreviewIsImage(false);
      return;
    }
    const selectedPath = isPipMaterial
      ? pipResources.find((r) => r.id === selectedId)?.path
      : mixResources.find((r) => r.id === selectedId)?.path;
    if (!selectedPath) {
      setMaterialPreviewUrl(null);
      setMaterialPreviewIsImage(false);
      return;
    }
    const resIsImage = isImageFile(selectedPath);
    let cancelled = false;
    window.api
      .getLocalFileUrl(selectedPath)
      .then((result) => {
        if (!cancelled && result.success && result.url) {
          setMaterialPreviewUrl(result.url);
          setMaterialPreviewIsImage(resIsImage);
        } else if (!cancelled) {
          setMaterialPreviewUrl(null);
          setMaterialPreviewIsImage(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMaterialPreviewUrl(null);
          setMaterialPreviewIsImage(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeResourceType,
    selectedMixResourceId,
    selectedPipResourceId,
    mixResources,
    pipResources,
  ]);
  const pipSizeOwnerRef = useRef(null);
  useEffect(() => {
    if (!selectedPipResourceId) {
      setPipVideoSize(null);
      setPipFirstFrameUrl(null);
      pipSizeOwnerRef.current = null;
      return;
    }
    pipSizeOwnerRef.current = null;
    const currentPipId = selectedPipResourceId;
    const mainPath = initialVideoPathRef.current;
    const pipRes = pipResources.find((r) => r.id === currentPipId);
    const pipPath = pipRes?.path;
    let cancelled = false;
    if (mainPath) {
      window.api
        .getVideoDimensions(mainPath)
        .then((res) => {
          if (
            !cancelled &&
            res.success &&
            res.width != null &&
            res.height != null
          ) {
            setMainVideoSize({ width: res.width, height: res.height });
          } else if (!cancelled) {
            setMainVideoSize(null);
          }
        })
        .catch(() => {
          if (!cancelled) setMainVideoSize(null);
        });
    }
    if (pipPath) {
      const pipIsImage = isImageFile(pipPath);
      if (pipIsImage) {
        const img = new Image();
        img.onload = () => {
          if (!cancelled) {
            pipSizeOwnerRef.current = currentPipId;
            setPipVideoSize({
              width: img.naturalWidth,
              height: img.naturalHeight,
            });
          }
        };
        img.onerror = () => {
          if (!cancelled) setPipVideoSize(null);
        };
        window.api
          .getLocalFileUrl(pipPath)
          .then((urlRes) => {
            if (!cancelled && urlRes?.success && urlRes?.url) {
              img.src = urlRes.url;
              setPipFirstFrameUrl(urlRes.url);
            } else if (!cancelled) {
              setPipVideoSize(null);
              setPipFirstFrameUrl(null);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setPipVideoSize(null);
              setPipFirstFrameUrl(null);
            }
          });
      } else {
        window.api
          .getVideoDimensions(pipPath)
          .then((res) => {
            if (
              !cancelled &&
              res.success &&
              res.width != null &&
              res.height != null
            ) {
              pipSizeOwnerRef.current = currentPipId;
              setPipVideoSize({ width: res.width, height: res.height });
            } else if (!cancelled) {
              setPipVideoSize(null);
            }
          })
          .catch(() => {
            if (!cancelled) setPipVideoSize(null);
          });
        window.api
          .extractFrameFromVideo(pipPath)
          .then((frameRes) => {
            if (cancelled || !frameRes.success || !frameRes.image_path)
              return null;
            return window.api.getLocalFileUrl(frameRes.image_path);
          })
          .then((urlRes) => {
            if (!cancelled && urlRes?.success && urlRes?.url) {
              setPipFirstFrameUrl(urlRes.url);
            } else if (!cancelled) {
              setPipFirstFrameUrl(null);
            }
          })
          .catch(() => {
            if (!cancelled) setPipFirstFrameUrl(null);
          });
      }
    } else {
      setPipVideoSize(null);
      setPipFirstFrameUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedPipResourceId, pipResources]);
  const pipNormalizedRef = useRef(null);
  useEffect(() => {
    if (!mainVideoSize || !pipVideoSize || !selectedPipResourceId) return;
    if (pipSizeOwnerRef.current !== selectedPipResourceId) return;
    if (pipNormalizedRef.current === selectedPipResourceId) return;
    const ratio =
      (pipVideoSize.width / pipVideoSize.height) *
      (mainVideoSize.height / mainVideoSize.width);
    pipNormalizedRef.current = selectedPipResourceId;
    setPipRect((prev) => {
      const newH = Math.max(
        MIN_PIP_SIZE,
        Math.min(MAX_PIP_PERCENT - prev.y, prev.width / ratio),
      );
      const newW = newH * ratio;
      return {
        ...prev,
        width: Math.min(MAX_PIP_PERCENT - prev.x, newW),
        height: newH,
      };
    });
  }, [mainVideoSize, pipVideoSize, selectedPipResourceId]);
  const handleRemoveMixResource = useCallback((id) => {
    setMixResources((prev) => {
      const next = prev.filter((r) => r.id !== id);
      window.api.saveMixResourcesConfig({ items: next }).catch(() => {});
      return next;
    });
  }, []);
  const handleAddPipSegment = useCallback(
    (resourceId, dropTime, centered) => {
      const resId = resourceId || selectedPipResourceId;
      if (!resId) return;
      const dur = Math.max(audioDuration, 1);
      const pipRes = pipResources.find((r) => r.id === resId);
      const maxSegLen = pipRes
        ? getSmartcutMixInitialSegmentDuration({
            duration: pipRes.duration,
            path: pipRes.path ?? "",
          })
        : SMARTCUT_MIX_INITIAL_SEGMENT_SEC;
      let start;
      if (dropTime != null) {
        if (centered) {
          start = Math.max(
            0,
            Math.min(dropTime - maxSegLen / 2, dur - maxSegLen),
          );
        } else {
          start = Math.max(0, Math.min(dropTime, dur - maxSegLen));
        }
      } else {
        const sorted = [...localPipSegments].sort((a, b) => a.end - b.end);
        const lastEnd = sorted.length > 0 ? sorted[sorted.length - 1].end : 0;
        start = Math.min(lastEnd, Math.max(0, dur - maxSegLen));
      }
      const end = Math.min(start + maxSegLen, dur);
      if (end <= start) return;
      setLocalPipSegments((prev) => [
        ...prev,
        {
          id: `pip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          start,
          end,
          pipResourceId: resId,
        },
      ]);
      onSelectPipResource(resId);
    },
    [selectedPipResourceId, audioDuration, localPipSegments, pipResources],
  );
  const onSelectPipResource = useCallback((id) => {
    setSelectedPipResourceId(id);
  }, []);
  const timelineCurrentTimeRef = useRef(0);
  const handleDropPipResource = useCallback(
    (resourceId, dropTime) => {
      if (dropTime != null) {
        handleAddPipSegment(resourceId, dropTime, true);
      } else {
        handleAddPipSegment(resourceId, timelineCurrentTimeRef.current, false);
      }
    },
    [handleAddPipSegment],
  );
  const handleAddMixSegmentFromDrop = useCallback(
    (resourceId, dropTime, centered) => {
      const dur = Math.max(audioDuration, videoDuration, 1);
      const mixRes = mixResources.find((r) => r.id === resourceId);
      const maxSegLen = mixRes
        ? getSmartcutMixInitialSegmentDuration({
            duration: mixRes.duration,
            path: mixRes.path ?? "",
          })
        : SMARTCUT_MIX_INITIAL_SEGMENT_SEC;
      let start;
      if (dropTime != null) {
        if (centered) {
          start = Math.max(
            0,
            Math.min(dropTime - maxSegLen / 2, dur - maxSegLen),
          );
        } else {
          start = Math.max(0, Math.min(dropTime, dur - maxSegLen));
        }
      } else {
        const sorted = [...localMixSegments].sort((a, b) => a.end - b.end);
        const lastEnd = sorted.length > 0 ? sorted[sorted.length - 1].end : 0;
        start = Math.min(lastEnd, Math.max(0, dur - maxSegLen));
      }
      const end = Math.min(start + maxSegLen, dur);
      if (end <= start) return;
      setLocalMixSegments((prev) => [
        ...prev,
        {
          id: `mix_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          start,
          end,
          mixResourceId: resourceId,
        },
      ]);
    },
    [audioDuration, videoDuration, localMixSegments, mixResources],
  );
  const handleDropMixResource = useCallback(
    (resourceId, dropTime) => {
      if (dropTime != null) {
        handleAddMixSegmentFromDrop(resourceId, dropTime, true);
      } else {
        handleAddMixSegmentFromDrop(
          resourceId,
          timelineCurrentTimeRef.current,
          false,
        );
      }
    },
    [handleAddMixSegmentFromDrop],
  );
  const handleAddMixSegmentAtPlayhead = useCallback(() => {
    if (!selectedMixResourceId) return;
    handleAddMixSegmentFromDrop(
      selectedMixResourceId,
      timelineCurrentTimeRef.current,
      false,
    );
  }, [selectedMixResourceId, handleAddMixSegmentFromDrop]);
  const handleAddPipSegmentAtPlayhead = useCallback(() => {
    if (!selectedPipResourceId) return;
    handleAddPipSegment(
      selectedPipResourceId,
      timelineCurrentTimeRef.current,
      false,
    );
  }, [selectedPipResourceId, handleAddPipSegment]);
  const handleUpdatePipMaterial = useCallback(() => {
    if (!selectedPipResourceId) return;
    setLocalPipSegments((prev) =>
      prev.map((s) => ({ ...s, pipResourceId: selectedPipResourceId })),
    );
  }, [selectedPipResourceId]);
  const effectiveTitleRange = localTitleEffectConfig
    ? (titleSegmentRange ?? {
        start: 0,
        end: Math.max(audioDuration, videoDuration) || 60,
      })
    : null;
  const hasTitleChanges =
    JSON.stringify(localTitleEffectConfig) !==
      JSON.stringify(lastAppliedTitleConfig) ||
    (effectiveTitleRange != null &&
      (lastAppliedTitleSegmentRange == null ||
        effectiveTitleRange.start !== lastAppliedTitleSegmentRange.start ||
        effectiveTitleRange.end !== lastAppliedTitleSegmentRange.end));
  const hasSubtitleChanges =
    JSON.stringify(localSubtitleEffectConfig) !==
      JSON.stringify(lastAppliedSubtitleConfig) ||
    JSON.stringify(localWhisperSegments) !==
      JSON.stringify(lastAppliedWhisperSegments ?? []);
  const effectiveBgmRange = localBgmEffectConfig
    ? (bgmSegmentRange ?? {
        start: 0,
        end: Math.max(audioDuration, videoDuration) || 60,
      })
    : null;
  const hasBgmChanges =
    JSON.stringify(localBgmEffectConfig) !==
      JSON.stringify(lastAppliedBgmConfig) ||
    (effectiveBgmRange != null &&
      (lastAppliedBgmSegmentRange == null ||
        effectiveBgmRange.start !== lastAppliedBgmSegmentRange.start ||
        effectiveBgmRange.end !== lastAppliedBgmSegmentRange.end));
  const hasMixSegmentChanges =
    JSON.stringify(localMixSegments) !==
    JSON.stringify(lastAppliedMixSegments ?? []);
  const hasPipSegmentChanges =
    localPipSegments.length > 0 &&
    (JSON.stringify(localPipSegments) !==
      JSON.stringify(lastAppliedPipSegments ?? []) ||
      JSON.stringify(pipRect) !== JSON.stringify(lastAppliedPipRect ?? {}));
  const canApplyEffects =
    hasTitleChanges ||
    hasSubtitleChanges ||
    hasBgmChanges ||
    hasMixSegmentChanges ||
    hasPipSegmentChanges;
  const autoSwitchToTextPreview = useCallback(() => {
    setRightPanelTab("preview");
  }, []);
  const handleSubtitleEffectConfigChange = useCallback(
    (config) => {
      const wasNull = localSubtitleEffectConfig == null;
      setLocalSubtitleEffectConfig(config);
      if (config === null) {
        setLocalWhisperSegments([]);
      } else if (wasNull) {
        const baseDuration =
          audioDuration && audioDuration > 0 ? audioDuration : 60;
        const baseText =
          (subtitleTextFromStoreRef.current &&
            subtitleTextFromStoreRef.current.trim()) ||
          (config.text ?? "").trim();
        if (baseText && whisperSegmentsFromStoreRef.current.length > 0) {
          const lineSegs = computeLineSegmentsFromWhisper(
            whisperSegmentsFromStoreRef.current,
            baseText,
            baseDuration,
          );
          setLocalWhisperSegments(
            lineSegs.map((s) => ({ start: s.start, end: s.end, text: s.text })),
          );
        } else {
          const sentences = baseText
            .split(/\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (sentences.length > 0) {
            const per = baseDuration / sentences.length;
            setLocalWhisperSegments(
              sentences.map((t, idx) => ({
                text: t,
                start: Math.max(0, idx * per),
                end:
                  idx === sentences.length - 1
                    ? baseDuration
                    : Math.min(baseDuration, (idx + 1) * per),
              })),
            );
          }
        }
      }
      autoSwitchToTextPreview();
    },
    [localSubtitleEffectConfig, audioDuration, autoSwitchToTextPreview],
  );
  const ensureSubtitleSeedText = useCallback(() => {
    const cached = subtitleTextFromStoreRef.current.trim();
    if (cached) return cached;
    const storeState = useVideoPageStore.getState();
    const scriptContent = (
      (storeState.showTranslatedInTextarea && storeState.translatedText) ||
      storeState.rewrittenScript ||
      storeState.originalScript ||
      ""
    ).trim();
    if (!scriptContent) return "";
    const seeded = splitSubtitleByLanguage(
      scriptContent,
      storeState.sourceLanguage,
    ).trim();
    if (seeded) {
      subtitleTextFromStoreRef.current = seeded;
      storeState.setSubtitleText(seeded);
    }
    return seeded;
  }, []);
  const fetchAndApplyWhisper = useCallback(async () => {
    const audioPath = useVideoPageStore.getState().generatedAudioPath;
    const subtitleText = ensureSubtitleSeedText();
    if (!audioPath || !subtitleText) return [];
    const segs = await fetchWhisperSegmentsFromCloud(audioPath, subtitleText);
    if (segs.length) {
      whisperSegmentsFromStoreRef.current = segs;
      useVideoPageStore.getState().setWhisperSegments(segs);
    }
    return segs;
  }, [ensureSubtitleSeedText]);
  const handleAddTitleClick = useCallback(async () => {
    const storeState = useVideoPageStore.getState();
    let mainTitleText = initialMainTitle;
    let subTitleText = initialSubTitle;
    if (!mainTitleText.trim()) {
      const scriptContent =
        storeState.rewrittenScript?.trim() ||
        storeState.originalScript?.trim() ||
        "";
      if (scriptContent) {
        setIsTitleGenerating(true);
        try {
          const langName = getLanguageName(storeState.sourceLanguage);
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
            storeState.llmModel || "DeepSeek",
            messages,
            { temperature: 0.8, max_tokens: 500 },
          );
          const content =
            (data?.data || data)?.choices?.[0]?.message?.content || "";
          const parsed = (() => {
            try {
              return JSON.parse(content.trim());
            } catch {
              return null;
            }
          })();
          mainTitleText =
            parsed?.mainTitle ||
            content.match(/"mainTitle"\s*:\s*"([^"]+)"/)?.[1] ||
            "";
          subTitleText =
            parsed?.subTitle ||
            content.match(/"subTitle"\s*:\s*"([^"]+)"/)?.[1] ||
            "";
          if (mainTitleText) storeState.setMainTitle(mainTitleText);
          if (subTitleText) storeState.setSubTitle(subTitleText);
          setInitialMainTitle(mainTitleText);
          setInitialSubTitle(subTitleText);
        } catch {
        } finally {
          setIsTitleGenerating(false);
        }
      }
    }
    setLocalTitleEffectConfig({
      ...DEFAULT_TITLE_CONFIG,
      mainTitleText,
      subTitleText,
    });
  }, [initialMainTitle, initialSubTitle]);
  const handleAddSubtitleClick = useCallback(async () => {
    const ensuredText = ensureSubtitleSeedText();
    if (!whisperSegmentsFromStoreRef.current.length) {
      setIsWhisperGenerating(true);
      try {
        await fetchAndApplyWhisper();
      } catch {
      } finally {
        setIsWhisperGenerating(false);
      }
    }
    const text = ensuredText || subtitleTextFromStoreRef.current.trim();
    handleSubtitleEffectConfigChange({ ...DEFAULT_SUBTITLE_CONFIG, text });
  }, [
    ensureSubtitleSeedText,
    fetchAndApplyWhisper,
    handleSubtitleEffectConfigChange,
  ]);
  const handleRegenerateSubtitleSegments =
    useCallback(async () => {
      ensureSubtitleSeedText();
      setIsWhisperGenerating(true);
      try {
        const segs = await fetchAndApplyWhisper();
        if (segs.length) {
          const baseDuration = audioDuration > 0 ? audioDuration : 60;
          const text = subtitleTextFromStoreRef.current.trim();
          const lineSegs = computeLineSegmentsFromWhisper(
            segs,
            text,
            baseDuration,
          );
          setLocalWhisperSegments(
            lineSegs.map((s) => ({ start: s.start, end: s.end, text: s.text })),
          );
        }
      } catch {
      } finally {
        setIsWhisperGenerating(false);
      }
    }, [ensureSubtitleSeedText, fetchAndApplyWhisper, audioDuration]);
  const [isApplyingEffects, setIsApplyingEffects] =
    useState(false);
  const lastMixPipBasePathRef = useRef(null);
  const handleApplyEffects = useCallback(async () => {
    if (!canApplyEffects || isApplyingEffects) return;
    const basePath = initialVideoPathRef.current || localVideoPath;
    if (!basePath) return;
    setIsApplyingEffects(true);
    lastMixPipBasePathRef.current = null;
    let currentPath = basePath;
    try {
      let pipActuallyApplied = false;
      const isMainScaled =
        mainVideoRect.x !== 0 ||
        mainVideoRect.y !== 0 ||
        mainVideoRect.width !== 100 ||
        mainVideoRect.height !== 100;
      const hasPipSegments = localPipSegments.some(
        (s) => s.start < s.end && s.pipResourceId,
      );
      if ((hasPipSegments || isMainScaled) && currentPath) {
        const totalDuration = Math.max(audioDuration, videoDuration) || 60;
        const mvScaling = isMainScaled
          ? {
              rect: mainVideoRect,
              bgColor: mainVideoBgColor,
              zIndex: mainVideoZIndex,
            }
          : void 0;
        const pipResult = await applyPipToVideo(
          currentPath,
          totalDuration,
          localPipSegments,
          pipRect,
          pipResources,
          mvScaling,
        );
        currentPath = pipResult.outputPath;
        setLocalVideoPath(pipResult.outputPath);
        lastAppliedVideoPathRef.current = pipResult.outputPath;
        pipActuallyApplied = true;
        lastMixPipBasePathRef.current = pipResult.outputPath;
      }
      let mixActuallyApplied = false;
      if (localMixSegments.length > 0 && currentPath) {
        const segmentsWithPath = localMixSegments
          .filter((s) => s.start < s.end && s.mixResourceId)
          .map((s) => {
            const res = mixResources.find((r) => r.id === s.mixResourceId);
            return res?.path
              ? { start: s.start, end: s.end, overlayVideoPath: res.path }
              : null;
          })
          .filter((x) => x != null);
        if (segmentsWithPath.length === 0) {
          showToast(
            "混剪段未关联到有效素材（请为每段选择已上传且带路径的混剪素材",
            "info",
          );
        } else {
          const totalDuration = Math.max(audioDuration, videoDuration) || 60;
          const mixResult = await applyMixSegmentsToVideo(
            currentPath,
            totalDuration,
            segmentsWithPath,
          );
          currentPath = mixResult.outputPath;
          setLocalVideoPath(mixResult.outputPath);
          lastAppliedVideoPathRef.current = mixResult.outputPath;
          mixActuallyApplied = true;
          lastMixPipBasePathRef.current = mixResult.outputPath;
        }
      }
      if (localTitleEffectConfig?.mainTitleText?.trim()) {
        const titleResult = await applyTitleToVideo(
          currentPath,
          localTitleEffectConfig,
          effectiveTitleRange ?? void 0,
        );
        currentPath = titleResult.outputPath;
        setLocalVideoPath(titleResult.outputPath);
        lastAppliedVideoPathRef.current = titleResult.outputPath;
      } else if (localTitleEffectConfig) {
        showToast(
          "主标题为空，未应用标题效果；请填写主标题后再次点击应用",
          "info",
        );
      }
      let effectiveWhisperSegments = localWhisperSegments;
      if (localSubtitleEffectConfig && effectiveWhisperSegments.length === 0) {
        const audioPath = useVideoPageStore.getState().generatedAudioPath;
        const subtitleText = subtitleTextFromStoreRef.current;
        if (audioPath && subtitleText) {
          try {
            const segs = await fetchWhisperSegmentsFromCloud(
              audioPath,
              subtitleText,
            );
            if (segs.length) {
              whisperSegmentsFromStoreRef.current = segs;
              useVideoPageStore.getState().setWhisperSegments(segs);
              const baseDuration = Math.max(audioDuration, videoDuration) || 60;
              const lineSegs = computeLineSegmentsFromWhisper(
                segs,
                subtitleText,
                baseDuration,
              );
              effectiveWhisperSegments = lineSegs.map((s) => ({
                start: s.start,
                end: s.end,
                text: s.text,
              }));
              setLocalWhisperSegments(effectiveWhisperSegments);
            }
          } catch {}
        }
      }
      if (localSubtitleEffectConfig && effectiveWhisperSegments.length > 0) {
        const subtitleResult = await applySubtitleToVideo(
          currentPath,
          localSubtitleEffectConfig,
          effectiveWhisperSegments,
        );
        currentPath = subtitleResult.outputPath;
        setLocalVideoPath(subtitleResult.outputPath);
        lastAppliedVideoPathRef.current = subtitleResult.outputPath;
      }
      if (localBgmEffectConfig) {
        const snapshot = readSmartCutInitialSnapshot();
        const allBgms = [...snapshot.uploadedBgms, ...snapshot.builtinBgms];
        const selectedBgm = allBgms.find(
          (b) => b.id === localBgmEffectConfig.selectedBgmId,
        );
        if (selectedBgm) {
          const totalDur = Math.max(audioDuration, videoDuration) || 60;
          const bgmResult = await applyBgmToVideo(
            currentPath,
            selectedBgm.path,
            localBgmEffectConfig.volume,
            effectiveBgmRange ?? void 0,
            totalDur,
            localBgmEffectConfig.voiceVolume ?? DEFAULT_BGM_CARD_VOICE_VOLUME,
          );
          currentPath = bgmResult.outputPath;
          setLocalVideoPath(bgmResult.outputPath);
          lastAppliedVideoPathRef.current = bgmResult.outputPath;
        }
      }
      if (currentPath) {
        const urlResult = await window.api.getLocalFileUrl(currentPath);
        if (urlResult.success && urlResult.url) {
          setLocalPreviewUrl(urlResult.url);
        }
      }
      setLastAppliedTitleConfig(
        localTitleEffectConfig?.mainTitleText?.trim()
          ? localTitleEffectConfig
          : null,
      );
      setLastAppliedTitleSegmentRange(
        localTitleEffectConfig?.mainTitleText?.trim() && effectiveTitleRange
          ? effectiveTitleRange
          : null,
      );
      setLastAppliedSubtitleConfig(localSubtitleEffectConfig);
      setLastAppliedWhisperSegments([...localWhisperSegments]);
      setLastAppliedBgmConfig(
        localBgmEffectConfig
          ? {
              selectedBgmId: localBgmEffectConfig.selectedBgmId,
              volume:
                localBgmEffectConfig.volume ?? DEFAULT_BGM_CARD_MUSIC_VOLUME,
              voiceVolume:
                localBgmEffectConfig.voiceVolume ??
                DEFAULT_BGM_CARD_VOICE_VOLUME,
            }
          : null,
      );
      setLastAppliedBgmSegmentRange(
        localBgmEffectConfig && effectiveBgmRange ? effectiveBgmRange : null,
      );
      setLastAppliedMixSegments(
        mixActuallyApplied
          ? [...localMixSegments]
          : (lastAppliedMixSegments ?? null),
      );
      setLastAppliedPipSegments(
        pipActuallyApplied
          ? [...localPipSegments]
          : (lastAppliedPipSegments ?? null),
      );
      setLastAppliedPipRect(
        pipActuallyApplied ? { ...pipRect } : (lastAppliedPipRect ?? null),
      );
      setRightPanelTab("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "应用效果失败";
      showToast(msg, "error");
    } finally {
      setIsApplyingEffects(false);
    }
  }, [
    canApplyEffects,
    isApplyingEffects,
    localVideoPath,
    localTitleEffectConfig,
    localSubtitleEffectConfig,
    localWhisperSegments,
    localBgmEffectConfig,
    localMixSegments,
    lastAppliedMixSegments,
    localPipSegments,
    lastAppliedPipSegments,
    pipResources,
    pipRect,
    mainVideoRect,
    mainVideoBgColor,
    mainVideoZIndex,
    audioDuration,
    videoDuration,
    titleSegmentRange,
    effectiveTitleRange,
    effectiveBgmRange,
    showToast,
  ]);
  const handleSaveAndClose = useCallback(async () => {
    previewVideoRef.current?.pause();
    setIsVideoPlaying(false);
    if (canApplyEffects && !isApplyingEffects) {
      await handleApplyEffects();
    }
    const sortedSegments = [...localWhisperSegments].sort(
      (a, b) => a.start - b.start,
    );
    const subtitleTextFromSegments = sortedSegments
      .map((s) => s.text)
      .join("\n");
    const subtitleConfigToSave =
      localSubtitleEffectConfig != null
        ? {
            ...localSubtitleEffectConfig,
            text: subtitleTextFromSegments,
            lineSegments: sortedSegments.map((s) => ({
              text: s.text,
              start: s.start,
              end: s.end,
            })),
          }
        : null;
    writeSmartCutConfig({
      titleEffectConfig: localTitleEffectConfig,
      subtitleEffectConfig: subtitleConfigToSave,
      bgmEffectConfig: localBgmEffectConfig,
      mixSegments: localMixSegments,
      pipSegments: localPipSegments,
      pipRect,
      mainVideoRect,
      mainVideoBgColor,
      mainVideoZIndex,
      subtitleText: subtitleTextFromSegments,
      smartCutVideoPath:
        lastAppliedVideoPathRef.current ?? localVideoPath ?? null,
      smartCutBaseVideoPath: lastMixPipBasePathRef.current ?? null,
      titleSegmentRange,
      bgmSegmentRange,
    });
    await updateHistoryAfterSmartCutSave();
    onClose();
  }, [
    canApplyEffects,
    isApplyingEffects,
    handleApplyEffects,
    localWhisperSegments,
    localSubtitleEffectConfig,
    localTitleEffectConfig,
    localBgmEffectConfig,
    localMixSegments,
    localPipSegments,
    pipRect,
    mainVideoRect,
    mainVideoBgColor,
    mainVideoZIndex,
    titleSegmentRange,
    bgmSegmentRange,
    localVideoPath,
    onClose,
  ]);
  const handleClose = useCallback(() => {
    previewVideoRef.current?.pause();
    setIsVideoPlaying(false);
    setLocalPreviewUrl(null);
    setLocalVideoPath(null);
    onClose();
  }, [onClose]);
  const initialSegments = useMemo(() => {
    const dur = Math.max(audioDuration, videoDuration) || 60;
    const segments2 = [];
    if (localTitleEffectConfig) {
      const tr = titleSegmentRange ?? { start: 0, end: dur };
      segments2.push({
        id: "title",
        label: "标题",
        type: "title",
        start: tr.start,
        end: tr.end,
        color: "#3b82f6",
      });
    }
    if (localBgmEffectConfig) {
      const br = bgmSegmentRange ?? { start: 0, end: dur };
      segments2.push({
        id: "bgm",
        label: "BGM",
        type: "bgm",
        start: br.start,
        end: br.end,
        color: "#f59e0b",
      });
    }
    return segments2;
  }, [
    audioDuration,
    videoDuration,
    localTitleEffectConfig,
    localBgmEffectConfig,
    titleSegmentRange,
    bgmSegmentRange,
  ]);
  const [segments, setSegments] = useState(initialSegments);
  const [timelineCurrentTime, setTimelineCurrentTimeRaw] =
    useState(0);
  const setTimelineCurrentTime = useCallback((t) => {
    setTimelineCurrentTimeRaw(t);
    timelineCurrentTimeRef.current = t;
  }, []);
  const previewVideoRef = useRef(null);
  const duration = Math.max(audioDuration, videoDuration) || 60;
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const lastSyncVideoTimeRef = useRef(0);
  const lastSyncWallTimeRef = useRef(0);
  const rafIdRef = useRef(null);
  React.useEffect(() => {
    setSegments(initialSegments);
  }, [initialSegments]);
  useEffect(() => {
    if (!isVideoPlaying) {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }
    const tick = () => {
      const base = lastSyncVideoTimeRef.current;
      const baseWall = lastSyncWallTimeRef.current;
      const now = performance.now();
      const deltaSec = (now - baseWall) / 1e3;
      const nextTime = Math.max(0, Math.min(duration, base + deltaSec));
      setTimelineCurrentTime(nextTime);
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isVideoPlaying, duration]);
  const handleTimelineSeek = useCallback(
    (time) => {
      const clamped = Math.max(0, Math.min(duration, time));
      setTimelineCurrentTime(clamped);
      if (previewVideoRef.current) {
        previewVideoRef.current.currentTime = clamped;
      }
      lastSyncVideoTimeRef.current = clamped;
      lastSyncWallTimeRef.current = performance.now();
    },
    [duration],
  );
  const togglePreviewPlay = useCallback(() => {
    const v = previewVideoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      void v.play();
    } else {
      v.pause();
    }
  }, []);
  if (!show) return null;
  return jsxRuntimeExports.jsx("div", {
    className: "smartcut-overlay",
    children: jsxRuntimeExports.jsxs("div", {
      className: "smartcut-modal",
      onClick: (e) => e.stopPropagation(),
      children: [
        jsxRuntimeExports.jsxs("div", {
          className: "smartcut-header",
          children: [
            jsxRuntimeExports.jsx("div", {
              className: "smartcut-header-left",
              children: jsxRuntimeExports.jsx("h2", {
                className: "smartcut-title",
                children: "智能精剪",
              }),
            }),
            jsxRuntimeExports.jsx("button", {
              type: "button",
              className: "smartcut-close-button",
              onClick: handleClose,
              "aria-label": "关闭智能精剪",
              children: jsxRuntimeExports.jsxs("svg", {
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                children: [
                  jsxRuntimeExports.jsx("line", {
                    x1: "18",
                    y1: "6",
                    x2: "6",
                    y2: "18",
                  }),
                  jsxRuntimeExports.jsx("line", {
                    x1: "6",
                    y1: "6",
                    x2: "18",
                    y2: "18",
                  }),
                ],
              }),
            }),
          ],
        }),
        mode === "editing"
          ? jsxRuntimeExports.jsxs(React.Fragment, {
              children: [
                jsxRuntimeExports.jsxs("div", {
                  className: "smartcut-body",
                  children: [
                    jsxRuntimeExports.jsxs("div", {
                      className: "smartcut-top",
                      children: [
                        jsxRuntimeExports.jsx("div", {
                          className: "smartcut-top-left",
                          children: jsxRuntimeExports.jsx(
                            SmartCutResourcePanelAny,
                            {
                              activeType: activeResourceType,
                              onSelectResource: (type) => {
                                setActiveResourceType(type);
                                setRightPanelTab("preview");
                              },
                              mixSubTab,
                              onMixSubTabChange: setMixSubTab,
                              mixResources,
                              onStartMixWizard: () => setMode("mixWizard"),
                              onRemoveMixResource: handleRemoveMixResource,
                              onSelectMixResource: (id) => {
                                setSelectedMixResourceId(id);
                                if (id) setRightPanelTab("material");
                              },
                              selectedMixResourceId,
                              localBuiltinBgms,
                              localUploadedBgms,
                              localBgmEffectConfig,
                              appliedBgmEffectConfig: localBgmEffectConfig,
                              onLocalBgmChange: setLocalBgmEffectConfig,
                              onLocalBgmUpload: setLocalUploadedBgms,
                              localTitleEffectConfig,
                              onLocalTitleChange: (config) => {
                                setLocalTitleEffectConfig(config);
                                if (
                                  config &&
                                  typeof config.mainTitleText === "string"
                                ) {
                                  setInitialMainTitle(config.mainTitleText);
                                }
                                if (
                                  config &&
                                  typeof config.subTitleText === "string"
                                ) {
                                  setInitialSubTitle(config.subTitleText);
                                }
                                if (config != null)
                                  setLocalSubtitleEnabled(
                                    !!config.style?.hasSubTitle,
                                  );
                                autoSwitchToTextPreview();
                              },
                              localSubtitleEnabled,
                              onLocalSubtitleEnabledChange: (checked) => {
                                setLocalSubtitleEnabled(checked);
                                if (localTitleEffectConfig) {
                                  const style =
                                    localTitleEffectConfig.style || {};
                                  const currentSub = style.subTitle || {};
                                  const nextStyle = checked
                                    ? {
                                        ...style,
                                        hasSubTitle: true,
                                        subTitle: {
                                          // 默认�?TitleStyleModal 一致：top �?50，表示相对主标题向下 50
                                          top:
                                            typeof currentSub.top ===
                                              "number" && currentSub.top > 0
                                              ? currentSub.top
                                              : 50,
                                          ...currentSub,
                                        },
                                      }
                                    : {
                                        ...style,
                                        hasSubTitle: false,
                                      };
                                  setLocalTitleEffectConfig({
                                    ...localTitleEffectConfig,
                                    style: nextStyle,
                                  });
                                }
                                autoSwitchToTextPreview();
                              },
                              subtitleEffectConfig: localSubtitleEffectConfig,
                              onSubtitleEffectConfigChange:
                                handleSubtitleEffectConfigChange,
                              subtitleSegments: localWhisperSegments,
                              onSubtitleSegmentsChange: (segs) => {
                                setLocalWhisperSegments(segs);
                                autoSwitchToTextPreview();
                              },
                              videoAlreadyHasSubtitle,
                              initialMainTitle,
                              initialSubTitle,
                              mixSegments: localMixSegments,
                              onMixSegmentsChange: setLocalMixSegments,
                              onAddMixSegment: handleAddMixSegmentAtPlayhead,
                              mixTimelineDuration:
                                Math.max(audioDuration, videoDuration) || 60,
                              pipResources,
                              onPipResourcesChange: (next) => {
                                setPipResources(next);
                                window.api
                                  .savePipResourcesConfig({ items: next })
                                  .catch(() => {});
                              },
                              selectedPipResourceId,
                              onSelectPipResource: (id) => {
                                setSelectedPipResourceId(id);
                                if (id) setRightPanelTab("material");
                              },
                              pipSegments: localPipSegments,
                              onPipSegmentsChange: setLocalPipSegments,
                              onAddPipSegment: handleAddPipSegmentAtPlayhead,
                              onUpdatePipMaterial: handleUpdatePipMaterial,
                              pipTimelineDuration: audioDuration,
                              availableFonts,
                              onAddTitleClick: handleAddTitleClick,
                              isTitleGenerating,
                              onAddSubtitleClick: handleAddSubtitleClick,
                              isWhisperGenerating,
                              onRegenerateSubtitleSegments:
                                handleRegenerateSubtitleSegments,
                            },
                          ),
                        }),
                        jsxRuntimeExports.jsxs("div", {
                          className: "smartcut-top-right",
                          children: [
                            jsxRuntimeExports.jsxs("div", {
                              className: "smartcut-panel-tabs",
                              children: [
                                jsxRuntimeExports.jsx(
                                  "button",
                                  {
                                    type: "button",
                                    className: `smartcut-panel-tab ${rightPanelTab === "preview" ? "active" : ""}`,
                                    onClick: () => setRightPanelTab("preview"),
                                    children: "效果预览",
                                  },
                                ),
                                jsxRuntimeExports.jsx(
                                  "button",
                                  {
                                    type: "button",
                                    className: `smartcut-panel-tab ${rightPanelTab === "material" ? "active" : ""}`,
                                    onClick: () => setRightPanelTab("material"),
                                    children: "素材预览",
                                  },
                                ),
                                rightPanelTab === "preview" &&
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      "data-smartcut-layer-toolbar": "",
                                      style: {
                                        marginLeft: "auto",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        fontSize: 12,
                                      },
                                      children: [
                                        selectedLayerId &&
                                          (() => {
                                            const isMain =
                                              selectedLayerId ===
                                              MAIN_VIDEO_LAYER_ID;
                                            const pipSeg = isMain
                                              ? null
                                              : localPipSegments.find(
                                                  (s) =>
                                                    s.id === selectedLayerId,
                                                );
                                            if (!isMain && !pipSeg) return null;
                                            const curZ = isMain
                                              ? mainVideoZIndex
                                              : (pipSeg?.zIndex ?? 0);
                                            const label = isMain
                                              ? "层级"
                                              : "层级";
                                            const setZ = (v) => {
                                              if (isMain) setMainVideoZIndex(v);
                                              else
                                                setLocalPipSegments((prev) =>
                                                  prev.map((s) =>
                                                    s.id === selectedLayerId
                                                      ? { ...s, zIndex: v }
                                                      : s,
                                                  ),
                                                );
                                            };
                                            return jsxRuntimeExports.jsxs(
                                              "span",
                                              {
                                                style: {
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: 4,
                                                },
                                                children: [
                                                  jsxRuntimeExports.jsx(
                                                    "span",
                                                    {
                                                      style: {
                                                        color: "#94a3b8",
                                                      },
                                                      children: label,
                                                    },
                                                  ),
                                                  jsxRuntimeExports.jsx(
                                                    "button",
                                                    {
                                                      type: "button",
                                                      onClick: () =>
                                                        setZ(
                                                          Math.max(0, curZ - 1),
                                                        ),
                                                      style: {
                                                        width: 20,
                                                        height: 20,
                                                        fontSize: 14,
                                                        lineHeight: 1,
                                                        border:
                                                          "1px solid #475569",
                                                        borderRadius: 3,
                                                        background: "#1e293b",
                                                        color: "#fff",
                                                        cursor: "pointer",
                                                        padding: 0,
                                                      },
                                                      children: "�?,
                                                    },
                                                  ),
                                                  jsxRuntimeExports.jsx(
                                                    "input",
                                                    {
                                                      type: "number",
                                                      min: 0,
                                                      max: 10,
                                                      value: curZ,
                                                      onChange: (e) => {
                                                        const v = parseInt(
                                                          e.target.value,
                                                          10,
                                                        );
                                                        if (Number.isFinite(v))
                                                          setZ(
                                                            Math.min(
                                                              10,
                                                              Math.max(0, v),
                                                            ),
                                                          );
                                                      },
                                                      style: {
                                                        width: 36,
                                                        height: 20,
                                                        textAlign: "center",
                                                        fontSize: 12,
                                                        border:
                                                          "1px solid #475569",
                                                        borderRadius: 3,
                                                        background: "#1e293b",
                                                        color: "#fff",
                                                        padding: 0,
                                                      },
                                                    },
                                                  ),
                                                  jsxRuntimeExports.jsx(
                                                    "button",
                                                    {
                                                      type: "button",
                                                      onClick: () =>
                                                        setZ(
                                                          Math.min(
                                                            10,
                                                            curZ + 1,
                                                          ),
                                                        ),
                                                      style: {
                                                        width: 20,
                                                        height: 20,
                                                        fontSize: 14,
                                                        lineHeight: 1,
                                                        border:
                                                          "1px solid #475569",
                                                        borderRadius: 3,
                                                        background: "#1e293b",
                                                        color: "#fff",
                                                        cursor: "pointer",
                                                        padding: 0,
                                                      },
                                                      children: "+",
                                                    },
                                                  ),
                                                ],
                                              },
                                            );
                                          })(),
                                        jsxRuntimeExports.jsx(
                                          "span",
                                          {
                                            style: {
                                              width: 1,
                                              height: 14,
                                              background: "#334155",
                                            },
                                          },
                                        ),
                                        jsxRuntimeExports.jsxs(
                                          "label",
                                          {
                                            style: {
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 3,
                                              cursor: "pointer",
                                              color: "#94a3b8",
                                            },
                                            children: [
                                              jsxRuntimeExports.jsx(
                                                "input",
                                                {
                                                  type: "checkbox",
                                                  checked: snapEnabled,
                                                  onChange: (e) =>
                                                    setSnapEnabled(
                                                      e.target.checked,
                                                    ),
                                                  style: {
                                                    width: 13,
                                                    height: 13,
                                                    cursor: "pointer",
                                                  },
                                                },
                                              ),
                                              "吸边",
                                            ],
                                          },
                                        ),
                                        snapEnabled &&
                                          jsxRuntimeExports.jsx(
                                            "input",
                                            {
                                              type: "number",
                                              min: 1,
                                              max: 20,
                                              value: snapThreshold,
                                              onChange: (e) => {
                                                const v = parseInt(
                                                  e.target.value,
                                                  10,
                                                );
                                                if (v >= 1 && v <= 20)
                                                  setSnapThreshold(v);
                                              },
                                              title: "吸边范围 (%)",
                                              style: {
                                                width: 36,
                                                height: 20,
                                                textAlign: "center",
                                                fontSize: 12,
                                                border: "1px solid #475569",
                                                borderRadius: 3,
                                                background: "#1e293b",
                                                color: "#fff",
                                                padding: 0,
                                              },
                                            },
                                          ),
                                        jsxRuntimeExports.jsx(
                                          "span",
                                          {
                                            style: {
                                              width: 1,
                                              height: 14,
                                              background: "#334155",
                                            },
                                          },
                                        ),
                                        jsxRuntimeExports.jsxs(
                                          "label",
                                          {
                                            style: {
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 4,
                                              cursor: "pointer",
                                            },
                                            children: [
                                              "背景色",
                                              jsxRuntimeExports.jsx(
                                                "input",
                                                {
                                                  type: "color",
                                                  value: mainVideoBgColor,
                                                  onChange: (e) =>
                                                    setMainVideoBgColor(
                                                      e.target.value,
                                                    ),
                                                  style: {
                                                    width: 22,
                                                    height: 18,
                                                    border: "none",
                                                    padding: 0,
                                                    cursor: "pointer",
                                                  },
                                                },
                                              ),
                                            ],
                                          },
                                        ),
                                        (mainVideoRect.x !== 0 ||
                                          mainVideoRect.y !== 0 ||
                                          mainVideoRect.width !== 100 ||
                                          mainVideoRect.height !== 100) &&
                                          jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              onClick: () =>
                                                setMainVideoRect({
                                                  x: 0,
                                                  y: 0,
                                                  width: 100,
                                                  height: 100,
                                                }),
                                              style: {
                                                fontSize: 12,
                                                color: "#3b82f6",
                                                cursor: "pointer",
                                                background: "none",
                                                border: "none",
                                                padding: 0,
                                              },
                                              children: "重置位置",
                                            },
                                          ),
                                      ],
                                    },
                                  ),
                              ],
                            }),
                            jsxRuntimeExports.jsx("div", {
                              className: `smartcut-preview-area${rightPanelTab === "preview" ? "" : " smartcut-preview-area-hidden"}`,
                              children: jsxRuntimeExports.jsx(
                                CompositePreview,
                                {
                                  videoRef: previewVideoRef,
                                  videoSrc:
                                    baseVideoPreviewUrl ||
                                    localPreviewUrl ||
                                    generatedVideoPreview ||
                                    null,
                                  currentTime: timelineCurrentTime,
                                  isPlaying: isVideoPlaying,
                                  duration,
                                  onVideoLoadedMetadata: (d) => {
                                    if (Number.isFinite(d) && d > 0)
                                      setVideoDuration(d);
                                  },
                                  onVideoPlay: (t) => {
                                    lastSyncVideoTimeRef.current = t;
                                    lastSyncWallTimeRef.current =
                                      performance.now();
                                    setTimelineCurrentTime(
                                      Math.max(0, Math.min(duration, t)),
                                    );
                                    setIsVideoPlaying(true);
                                  },
                                  onVideoPause: (t) => {
                                    lastSyncVideoTimeRef.current = t;
                                    lastSyncWallTimeRef.current =
                                      performance.now();
                                    setTimelineCurrentTime(
                                      Math.max(0, Math.min(duration, t)),
                                    );
                                    setIsVideoPlaying(false);
                                  },
                                  onVideoSeeking: (t) => {
                                    lastSyncVideoTimeRef.current = t;
                                    lastSyncWallTimeRef.current =
                                      performance.now();
                                    setTimelineCurrentTime(
                                      Math.max(0, Math.min(duration, t)),
                                    );
                                  },
                                  onVideoTimeUpdate: (t) => {
                                    lastSyncVideoTimeRef.current = t;
                                    lastSyncWallTimeRef.current =
                                      performance.now();
                                  },
                                  onVideoEnded: (t) => {
                                    lastSyncVideoTimeRef.current = t;
                                    lastSyncWallTimeRef.current =
                                      performance.now();
                                    setTimelineCurrentTime(
                                      Math.max(0, Math.min(duration, t)),
                                    );
                                    setIsVideoPlaying(false);
                                  },
                                  mixSegments: localMixSegments,
                                  mixResources,
                                  pipSegments: localPipSegments,
                                  pipResources,
                                  defaultPipRect: pipRect,
                                  onPipSegmentRectChange: (segId, rect) => {
                                    setLocalPipSegments((prev) =>
                                      prev.map((seg) =>
                                        seg.id === segId
                                          ? { ...seg, rect }
                                          : seg,
                                      ),
                                    );
                                  },
                                  mainVideoSize,
                                  mainVideoRect,
                                  onMainVideoRectChange: setMainVideoRect,
                                  mainVideoBgColor,
                                  mainVideoZIndex,
                                  selectedLayerId,
                                  onSelectLayer: setSelectedLayerId,
                                  snapEnabled,
                                  snapThreshold,
                                  titleConfig: localTitleEffectConfig,
                                  titleRange: effectiveTitleRange ?? null,
                                  subtitleConfig: localSubtitleEffectConfig,
                                  subtitleSegments: localWhisperSegments,
                                  onSubtitleDrag: (posX, posY) => {
                                    setLocalSubtitleEffectConfig((prev) =>
                                      prev ? { ...prev, posX, posY } : prev,
                                    );
                                  },
                                  bgmSelectedBgmId:
                                    localBgmEffectConfig?.selectedBgmId ?? null,
                                  bgmVolume:
                                    localBgmEffectConfig?.volume ??
                                    DEFAULT_BGM_CARD_MUSIC_VOLUME,
                                  voiceVolume:
                                    localBgmEffectConfig?.voiceVolume ??
                                    DEFAULT_BGM_CARD_VOICE_VOLUME,
                                  bgmRange: effectiveBgmRange ?? null,
                                  allBgms: [
                                    ...localUploadedBgms,
                                    ...localBuiltinBgms,
                                  ].filter((b) => b.path),
                                  placeholderText:
                                    "生成后的视频将显示在这里，可在剪辑中预览效果",
                                },
                              ),
                            }),
                            rightPanelTab === "material" &&
                              jsxRuntimeExports.jsx("div", {
                                className:
                                  "smartcut-preview-area smartcut-material-preview-area",
                                children: materialPreviewUrl
                                  ? materialPreviewIsImage
                                    ? jsxRuntimeExports.jsx(
                                        "img",
                                        {
                                          className: "smartcut-preview-video",
                                          src: materialPreviewUrl,
                                          alt: "素材预览",
                                          draggable: false,
                                          style: { objectFit: "contain" },
                                        },
                                      )
                                    : jsxRuntimeExports.jsx(
                                        "video",
                                        {
                                          className: "smartcut-preview-video",
                                          src: materialPreviewUrl,
                                          controls: true,
                                          playsInline: true,
                                        },
                                      )
                                  : jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        className:
                                          "smartcut-preview-placeholder",
                                        children:
                                          activeResourceType === "pip"
                                            ? selectedPipResourceId
                                              ? "正在加载素材"
                                              : "请在左侧画中画素材中点击一项进行预览
                                            : selectedMixResourceId
                                              ? "正在加载素材"
                                              : "请在左侧混剪素材中点击一项进行预览",
                                      },
                                    ),
                              }),
                          ],
                        }),
                      ],
                    }),
                    jsxRuntimeExports.jsx("div", {
                      className: "smartcut-bottom",
                      children: jsxRuntimeExports.jsx(
                        SmartCutTimeline,
                        {
                          duration,
                          segments,
                          onChangeSegment: (id, next) => {
                            if (id === "title") {
                              setTitleSegmentRange({
                                start: next.start,
                                end: next.end,
                              });
                            } else if (id === "bgm") {
                              setBgmSegmentRange({
                                start: next.start,
                                end: next.end,
                              });
                            } else {
                              setSegments((prev) =>
                                prev.map((seg) =>
                                  seg.id === id ? { ...seg, ...next } : seg,
                                ),
                              );
                            }
                          },
                          currentTime: timelineCurrentTime,
                          onSeek: handleTimelineSeek,
                          isPlaying: isVideoPlaying,
                          onTogglePlay: () => {
                            setRightPanelTab("preview");
                            togglePreviewPlay();
                          },
                          hasSubtitle: !!localSubtitleEffectConfig,
                          subtitleSegments: localWhisperSegments,
                          onChangeSubtitleSegment: (index, next) => {
                            setLocalWhisperSegments((prev) => {
                              if (
                                !Array.isArray(prev) ||
                                index < 0 ||
                                index >= prev.length
                              ) {
                                return prev;
                              }
                              return prev.map((seg, i) =>
                                i === index ? { ...seg, ...next } : seg,
                              );
                            });
                          },
                          mixSegments: localMixSegments,
                          mixResourceDurations: (() => {
                            const map = {};
                            mixResources.forEach((r) => {
                              if (!r.id || r.duration == null) return;
                              let d = r.duration;
                              if (d === Infinity || !Number.isFinite(d))
                                d = SMARTCUT_MIX_INITIAL_SEGMENT_SEC;
                              if (d > 0) map[r.id] = d;
                            });
                            return map;
                          })(),
                          onChangeMixSegment: (id, next) => {
                            setLocalMixSegments((prev) =>
                              prev.map((seg) =>
                                seg.id === id
                                  ? { ...seg, start: next.start, end: next.end }
                                  : seg,
                              ),
                            );
                          },
                          pipSegments: localPipSegments,
                          pipResourceDurations: (() => {
                            const map = {};
                            pipResources.forEach((r) => {
                              if (!r.id) return;
                              const path = r.path ?? "";
                              const isImg =
                                r.duration === Infinity || isImageFile(path);
                              if (isImg) {
                                map[r.id] = SMARTCUT_MIX_INITIAL_SEGMENT_SEC;
                                return;
                              }
                              const d = r.duration;
                              if (d != null && d > 0 && Number.isFinite(d))
                                map[r.id] = d;
                              else map[r.id] = SMARTCUT_MIX_INITIAL_SEGMENT_SEC;
                            });
                            return map;
                          })(),
                          onChangePipSegment: (id, next) => {
                            setLocalPipSegments((prev) =>
                              prev.map((seg) =>
                                seg.id === id
                                  ? { ...seg, start: next.start, end: next.end }
                                  : seg,
                              ),
                            );
                          },
                          onDropPipResource: handleDropPipResource,
                          onDropMixResource: handleDropMixResource,
                        },
                      ),
                    }),
                  ],
                }),
                isApplyingEffects &&
                  jsxRuntimeExports.jsx("div", {
                    className: "smartcut-applying-mask",
                    children: jsxRuntimeExports.jsxs("div", {
                      className: "smartcut-applying-dialog",
                      children: [
                        jsxRuntimeExports.jsx("div", {
                          className: "smartcut-applying-spinner",
                        }),
                        jsxRuntimeExports.jsx("div", {
                          className: "smartcut-applying-text-main",
                          children: "正在应用剪辑效果",
                        }),
                        jsxRuntimeExports.jsx("div", {
                          className: "smartcut-applying-text-sub",
                          children: "请稍候，完成前请不要关闭或修改设�?,
                        }),
                      ],
                    }),
                  }),
                jsxRuntimeExports.jsxs("div", {
                  className: "smartcut-footer",
                  children: [
                    jsxRuntimeExports.jsx("button", {
                      type: "button",
                      className: "video-button",
                      onClick: handleClose,
                      disabled: isApplyingEffects,
                      children: "取消",
                    }),
                    jsxRuntimeExports.jsx("button", {
                      type: "button",
                      className: "video-button video-button-primary",
                      onClick: handleSaveAndClose,
                      disabled: isApplyingEffects,
                      children: "保存剪辑配置",
                    }),
                  ],
                }),
              ],
            })
          : jsxRuntimeExports.jsx(SmartCutMixUploadWizard, {
              onCancel: () => {
                setMixSubTab("material");
                setMode("editing");
              },
              onFinished: (items) => {
                setMixResources((prev) => {
                  const next = [...prev, ...items];
                  window.api
                    .saveMixResourcesConfig({ items: next })
                    .catch(() => {});
                  return next;
                });
                setActiveResourceType("mix");
                setMixSubTab("material");
                setMode("editing");
              },
            }),
      ],
    }),
  });
}
const TEMPLATE_REPLACE_SUBTITLE_DEFAULTS = {
  font: "黑体",
  fontSize: 24,
  fontWeight: 400,
  color: "#DE0202",
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
};
function templateSubtitleEffectToPartial(se) {
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
  };
}