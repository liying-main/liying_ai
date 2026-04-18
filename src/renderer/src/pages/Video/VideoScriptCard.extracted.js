function VideoScriptCard() {
  const showToast = useToast();
  const phoneModal = usePhoneModal(false);
  const userInfo = useUserInfoStore((s) => s.userInfo);
  const autoFlowStep = useVideoPageStore((s) => s.autoFlowStep);
  const autoFlowRunning = useVideoPageStore((s) => s.autoFlowRunning);
  const flowMode = useVideoPageStore((s) => s.flowMode);
  const {
    setOriginalVideoPath,
    originalScript,
    setOriginalScript,
    rewrittenScript,
    setRewrittenScript,
    translatedText,
    setTranslatedText,
    showTranslatedInTextarea,
    setShowTranslatedInTextarea,
    sourceLanguage,
    setSourceLanguage,
    targetLanguage,
    setTargetLanguage,
    preTranslationLanguage,
    setPreTranslationLanguage,
    llmModel,
    llmModels,
  } = useVideoPageStore();
  const fixedLlmModel = llmModels[0]?.value || llmModel || "DeepSeek";
  const filterWordLevelLegalEdits = (edits, sourceText) => {
    const result = [];
    for (const e of edits) {
      const original = e.original.trim();
      const replacement = e.replacement.trim();
      if (!original) continue;
      if (!sourceText.includes(original)) continue;
      if (original.length <= 10 && !/[。！？\n]/.test(original)) {
        if (!replacement || replacement.length <= original.length * 2 + 8) {
          result.push({ original, replacement, reason: e.reason });
          continue;
        }
      }
      if (original.length > 10) {
        const matches = original.match(LEGAL_KEYWORDS_PATTERN);
        if (matches) {
          for (const kw of matches) {
            if (
              sourceText.includes(kw) &&
              !result.some((r) => r.original === kw)
            ) {
              result.push({
                original: kw,
                replacement: "",
                reason: e.reason + "（从长片段中提取消,
              });
            }
          }
        }
      }
    }
    return result;
  };
  const applyEditsToSourceText = (sourceText, edits) => {
    let next = sourceText;
    const sorted = [...edits].sort(
      (a, b) => b.original.length - a.original.length,
    );
    for (const e of sorted) {
      const original = e.original.trim();
      const replacement = e.replacement.trim();
      if (!original || !replacement) continue;
      if (!next.includes(original)) continue;
      next = next.split(original).join(replacement);
    }
    return next;
  };
  const isReviewedTextOverwritten = (sourceText, reviewedText) => {
    const src = sourceText.trim();
    const rev = reviewedText.trim();
    if (!src || !rev) return false;
    const delta = Math.abs(rev.length - src.length);
    return delta > Math.max(24, Math.floor(src.length * 0.25));
  };
  const [scriptMode, setScriptMode] = reactExports.useState("learn");
  const IP_BRAIN_STORAGE_KEY = "qt-ip-brain-profiles";
  const [ipBrain, setIpBrain] = reactExports.useState(null);
  const [showIpBrainModal, setShowIpBrainModal] = reactExports.useState(false);
  const [ipBrainProfiles, setIpBrainProfiles] = reactExports.useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(IP_BRAIN_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
          id: String(x.id ?? Date.now() + Math.random()),
          name: String(x.name ?? "未命名借东风),
          homepage: String(x.homepage ?? ""),
          createdAt: String(x.createdAt ?? ""),
          deepLearn: Boolean(x.deepLearn),
        }));
    } catch {
      return [];
    }
  });
  const [ipBrainModalTab, setIpBrainModalTab] = reactExports.useState("create");
  const [ipBrainName, setIpBrainName] = reactExports.useState("");
  const [ipBrainHomepage, setIpBrainHomepage] = reactExports.useState("");
  const [ipBrainDeepLearn, setIpBrainDeepLearn] = reactExports.useState(false);
  const [showTopicModal, setShowTopicModal] = reactExports.useState(false);
  const [isTopicAnalyzing, setIsTopicAnalyzing] = reactExports.useState(false);
  const [topicStage, setTopicStage] = reactExports.useState("idle");
  const [topicStyleText, setTopicStyleText] = reactExports.useState("");
  const [topicIdeas, setTopicIdeas] = reactExports.useState([]);
  const [selectedTopic, setSelectedTopic] = reactExports.useState(null);
  const [topicScripts, setTopicScripts] = reactExports.useState([]);
  const [isTopicScriptsLoading, setIsTopicScriptsLoading] =
    reactExports.useState(false);
  const [topicError, setTopicError] = reactExports.useState(null);
  const [topicPostsSnapshot, setTopicPostsSnapshot] =
    reactExports.useState(null);
  reactExports.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        IP_BRAIN_STORAGE_KEY,
        JSON.stringify(ipBrainProfiles),
      );
    } catch (e) {
      console.warn("Failed to save IP brain profiles to localStorage", e);
    }
  }, [ipBrainProfiles]);
  const runTopicStyleAnalysisWithPosts = async (posts) => {
    if (!posts.length) {
      setTopicError("未获取到可用的视频描述，无法分析选题。");
      setIsTopicAnalyzing(false);
      return;
    }
    try {
      const nonEmptyDescs = posts
        .map((p) => (p.desc || "").trim())
        .filter(Boolean);
      const limitedDescs = nonEmptyDescs.slice(0, 30);
      const joined = limitedDescs
        .map((d, idx) => `${idx + 1}. ${d}`)
        .join("\n");
      const systemPrompt =
        "你是一名资深抖音短视频内容策划和选题分析专家，擅长根据创作者近期视频的文案风格，总结账号定位与风格特点。";
      const userPrompt = `下面是某个抖音账号最近发布的视频文案（desc），每条一行：

${joined}

请用中文简要总结该账号的整体风格和选题特点，要求：
1. 只输出一段标题为【风格与定位分析】的文字内容；\n2. 正文控制在 3-6 行以内，语言简洁但有概括性；
3. 不要输出其他任何标题、小结或推荐选题；\n4. 不要输出与平台规则明显冲突的内容。\n5. 不要输出任何emoji和特殊标点符号。`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      const data = await llmService.completion(fixedLlmModel, messages, {
        temperature: 0.65,
        max_tokens: 1200,
      });
      const responseData = data.data || data;
      const content = responseData?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("AI 未返回有效结果");
      }
      const raw = content.replace(/\uFEFF/g, "").trim();
      let stylePart = raw;
      const styleIndex = raw.indexOf("【风格与定位分析】");
      if (styleIndex !== -1) {
        stylePart = raw
          .substring(styleIndex + "【风格与定位分析】".length)
          .trim();
      }
      setTopicStyleText(stylePart);
      setTopicError(null);
    } catch (e) {
      console.error("借东风风格分析失败", e);
      setTopicError(e?.message || "风格与定位分析失败，请稍后重试");
    } finally {
      setIsTopicAnalyzing(false);
      setTopicStage("idle");
    }
  };
  const runTopicIdeasWithPosts = async (posts, reason) => {
    if (!posts.length) {
      setTopicError("未获取到可用的视频描述，无法分析选题。");
      setIsTopicAnalyzing(false);
      setTopicStage("idle");
      return;
    }
    try {
      const nonEmptyDescs = posts
        .map((p) => (p.desc || "").trim())
        .filter(Boolean);
      const limitedDescs = nonEmptyDescs.slice(0, 30);
      const joined = limitedDescs
        .map((d, idx) => `${idx + 1}. ${d}`)
        .join("\n");
      const systemPrompt =
        "你是一名资深抖音短视频内容策划和选题分析专家，擅长根据账号的既有风格与定位，给出高质量的后续选题建议。";
      const userPrompt = `下面是该账号的【风格与定位分析】：

${topicStyleText || "（风格分析略）"}

这是该账号最近发布的一批视频文案（desc）：

${joined}

请在保持上述风格与定位不变的前提下，给出 5 个新的后续推荐选题，要求：
1. 只输出标题为【推荐选题】的部分析2. 严格给出 5 条，按�?�?�?�?�?」编号；
3. 每个推荐选题用一句话描述清楚拍什么内容，尽量贴近原账号的说话方式和世界观；\n4. 不要重复上一批已经出现过的表述；
5. 不要输出与平台规则明显冲突的内容。\n6. 不要输出任何emoji和特殊标点符号。`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      const data = await llmService.completion(fixedLlmModel, messages, {
        temperature: reason === "initial" ? 0.75 : 0.9,
        max_tokens: 800,
      });
      const responseData = data.data || data;
      const content = responseData?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("AI 未返回有效结果");
      }
      const raw = content.replace(/\uFEFF/g, "").trim();
      const ideaLines = raw.split("\n").map((l) => l.trim());
      const collected = [];
      for (const line of ideaLines) {
        const m = line.match(/^\d+\s*[、\.．]\s*(.+)$/);
        if (m && m[1]) {
          collected.push(m[1].trim());
        }
      }
      if (!collected.length) {
        throw new Error("未能解析出推荐选题，请重试一次。");
      }
      setTopicIdeas(collected);
      setSelectedTopic(null);
      setTopicScripts([]);
      setTopicError(null);
    } catch (e) {
      console.error("借东风推荐选题失败:", e);
      setTopicError(e?.message || "推荐选题生成失败，请稍后重试");
    } finally {
      setIsTopicAnalyzing(false);
      setTopicStage("idle");
    }
  };
  const handleOpenTopicAnalysis = async () => {
    if (!ipBrain || !ipBrain.homepage.trim()) {
      showToast("请先在 借东风中填写主页地址", "info");
      return;
    }
    setShowTopicModal(true);
    setIsTopicAnalyzing(true);
    setTopicStage("style");
    setTopicStyleText("");
    setTopicIdeas([]);
    setSelectedTopic(null);
    setTopicScripts([]);
    setTopicError(null);
    try {
      const result = await window.api.downloadDouyinUserPosts(
        ipBrain.homepage.trim(),
      );
      if (!result?.success) {
        throw new Error(
          result?.message || result?.error || "获取抖音主页视频失败",
        );
      }
      const posts = result.posts;
      if (!posts || !posts.length) {
        throw new Error("未获取到该账号的近期视频列表");
      }
      setTopicPostsSnapshot(posts);
      await runTopicStyleAnalysisWithPosts(posts);
      setIsTopicAnalyzing(true);
      setTopicStage("ideas");
      await runTopicIdeasWithPosts(posts, "initial");
    } catch (e) {
      console.error("获取抖音主页视频失败:", e);
      setTopicError(e?.message || "获取抖音主页视频失败");
      setIsTopicAnalyzing(false);
      setTopicStage("idle");
    }
  };
  const handleRefreshTopicIdeas = async () => {
    if (!topicPostsSnapshot || !topicPostsSnapshot.length) {
      if (ipBrain && ipBrain.homepage.trim()) {
        setIsTopicAnalyzing(true);
        setTopicStage("ideas");
        setTopicError(null);
        try {
          const result = await window.api.downloadDouyinUserPosts(
            ipBrain.homepage.trim(),
          );
          if (!result?.success) {
            throw new Error(
              result?.message || result?.error || "获取抖音主页视频失败",
            );
          }
          const posts = result.posts;
          if (!posts || !posts.length) {
            throw new Error("未获取到该账号的近期视频列表");
          }
          setTopicPostsSnapshot(posts);
          await runTopicIdeasWithPosts(posts, "refresh");
        } catch (e) {
          console.error("刷新选题分析失败:", e);
          setTopicError(e?.message || "刷新选题分析失败");
          setIsTopicAnalyzing(false);
          setTopicStage("idle");
        }
      }
      return;
    }
    setIsTopicAnalyzing(true);
    setTopicStage("ideas");
    setTopicError(null);
    setSelectedTopic(null);
    setTopicScripts([]);
    await runTopicIdeasWithPosts(topicPostsSnapshot, "refresh");
  };
  const handleGenerateScriptsForTopic = async (topic, reason = "initial") => {
    if (!topic) return;
    setSelectedTopic(topic);
    setIsTopicScriptsLoading(true);
    setTopicScripts([]);
    setTopicError(null);
    try {
      const lengthNum = parseInt(ipBrainLength.trim(), 10);
      const safeLengthBase =
        Number.isFinite(lengthNum) && lengthNum > 0 ? lengthNum : 150;
      const ipBrainSafeLength = Math.max(0, Math.min(1e3, safeLengthBase));
      const currentLangName = getLanguageName(sourceLanguage);
      const systemPrompt = `你是一名资深短视频文案策划，擅长基于账号既有风格，为给定选题创作多条不同视角、不同切入点的${currentLangName}口播文案。`;
      const userPrompt = `下面是该账号的【风格与定位分析】：

${topicStyleText || "（风格分析略）"}

这是当前要创作的选题：\n${topic}

请基于上述风格和选题，创建3 条不同角度的推荐文案，要求：
1. 输出一个标题为【基于选题的推荐文案】的部分析2. 下面严格给出 3 条文案，按�?�?�?」编号，每条为一整段可直接用于口播配音的${currentLangName}文案；\n3. 语言口语化、有代入感和节奏感；
4. 不要再解释风格或选题，只输出编号+文案内容即可；\n5. 不要输出与平台规则明显冲突的内容。\n6. 不要输出任何emoji和特殊标点符号。\n7. 每条文案整体控制在约 ${ipBrainSafeLength} 字左右，可略多一点但不要明显超出。`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      const data = await llmService.completion(fixedLlmModel, messages, {
        temperature: reason === "initial" ? 0.85 : 0.95,
        max_tokens: 1600,
      });
      const responseData = data.data || data;
      const content = responseData?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("AI 未返回有效结果");
      }
      const raw = content.replace(/\uFEFF/g, "").trim();
      const lines = raw.split("\n").map((l) => l.trim());
      const collected = [];
      for (const line of lines) {
        const m = line.match(/^\d+\s*[、\.．]\s*(.+)$/);
        if (m && m[1]) {
          collected.push(m[1].trim());
        }
      }
      if (!collected.length) {
        collected.push(raw);
      }
      setTopicScripts(collected.slice(0, 3));
    } catch (e) {
      console.error("生成选题文案失败:", e);
      setTopicError(e?.message || "生成基于选题的文案失败");
    } finally {
      setIsTopicScriptsLoading(false);
    }
  };
  const isHourCard =
    userInfo?.validityUnit === 1 || userInfo?.validityUnit === 2;
  const lengthMax = isHourCard ? 150 : 1e3;
  const [learnLength, setLearnLength] = reactExports.useState("100");
  const [ipBrainLength, setIpBrainLength] = reactExports.useState("100");
  const [originalPurpose, setOriginalPurpose] =
    reactExports.useState("短视频口播");
  const [originalProductInfo, setOriginalProductInfo] =
    reactExports.useState("");
  const [originalAudience, setOriginalAudience] = reactExports.useState("");
  const [originalLength, setOriginalLength] = reactExports.useState("100");
  const [originalGoal, setOriginalGoal] = reactExports.useState("引流");
  const [isGeneratingOriginal, setIsGeneratingOriginal] =
    reactExports.useState(false);
  const downloadVideoRef = reactExports.useRef(null);
  const [videoUrl, setVideoUrl] = reactExports.useState("");
  const [previewVideoFilePath, setPreviewVideoFilePath] =
    reactExports.useState("");
  const [isUploadMode, setIsUploadMode] = reactExports.useState(false);
  const [uploadFileName, setUploadFileName] = reactExports.useState("");
  const [inputVideoUrl, setInputVideoUrl] = reactExports.useState("");
  const [isDownloading, setIsDownloading] = reactExports.useState(false);
  const [downloadProgress, setDownloadProgress] = reactExports.useState(0);
  const [isExtracting, setIsExtracting] = reactExports.useState(false);
  const [extractProgress, setExtractProgress] = reactExports.useState(0);
  const [isRewriting, setIsRewriting] = reactExports.useState(false);
  const [rewriteProgress, setRewriteProgress] = reactExports.useState(0);
  const [showTranslateModal, setShowTranslateModal] =
    reactExports.useState(false);
  const [isTranslating, setIsTranslating] = reactExports.useState(false);
  const [translateProgress, setTranslateProgress] = reactExports.useState(0);
  const [showAiLegalModal, setShowAiLegalModal] = reactExports.useState(false);
  const [isAiLegalReviewing, setIsAiLegalReviewing] =
    reactExports.useState(false);
  const [aiLegalProgress, setAiLegalProgress] = reactExports.useState(0);
  const [aiLegalReviewedText, setAiLegalReviewedText] =
    reactExports.useState("");
  const [aiLegalSuggestions, setAiLegalSuggestions] = reactExports.useState("");
  const [aiLegalEdits, setAiLegalEdits] = reactExports.useState([]);
  const downloadIntervalRef = reactExports.useRef(null);
  const extractIntervalRef = reactExports.useRef(null);
  const rewriteIntervalRef = reactExports.useRef(null);
  const aiLegalIntervalRef = reactExports.useRef(null);
  const [isTranscribeQueuing, setIsTranscribeQueuing] =
    reactExports.useState(false);
  const isTranscribeQueueingRef = reactExports.useRef(false);
  const extractProgressRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    const applyQueue = (pluginName, data) => {
      const isTranscribe =
        pluginName === "transcribe" || pluginName === "plugin-proxy-whisper";
      if (!isTranscribe) return;
      if (data.type === "queue_waiting") {
        isTranscribeQueueingRef.current = true;
        setIsTranscribeQueuing(true);
      } else if (data.type === "queue_active" || data.type === "queue_done") {
        extractProgressRef.current = 0;
        setExtractProgress(0);
        isTranscribeQueueingRef.current = false;
        setIsTranscribeQueuing(false);
      }
    };
    const unsubs = [];
    if (typeof window.api.onPluginProgress === "function") {
      unsubs.push(
        window.api.onPluginProgress((data) =>
          applyQueue(data.pluginName, data),
        ),
      );
    }
    if (typeof window.api.onPluginProxyProgress === "function") {
      unsubs.push(
        window.api.onPluginProxyProgress((data) => {
          if (data.type === "job_progress") return;
          applyQueue(data.pluginName, data);
        }),
      );
    }
    return () => unsubs.forEach((u) => u());
  }, []);
  reactExports.useEffect(() => {
    return () => {
      if (downloadIntervalRef.current)
        clearInterval(downloadIntervalRef.current);
      if (extractIntervalRef.current) clearInterval(extractIntervalRef.current);
      if (rewriteIntervalRef.current) clearInterval(rewriteIntervalRef.current);
      if (aiLegalIntervalRef.current) clearInterval(aiLegalIntervalRef.current);
    };
  }, []);
  const handleDownloadVideo = async () => {
    if (isDownloading) return;
    if (!inputVideoUrl.trim()) {
      showToast("请输入视频链接", "info");
      return;
    }
    setIsDownloading(true);
    setDownloadProgress(0);
    setVideoUrl("");
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 5;
      if (progress < 90) setDownloadProgress(Math.round(progress));
    }, 500);
    const downloadTraceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (userInfo?.phone) {
      exceptionService.submitException({
        cardNum: userInfo.phone,
        feature: "script_download",
        traceId: downloadTraceId,
        eventType: "start",
        exceptionInfo: "",
      });
    }
    try {
      const result = await window.api.downloadDouyinVideo(inputVideoUrl.trim());
      console.log("Download result:", result);
      clearInterval(progressInterval);
      setDownloadProgress(100);
      if (result.success && result.file_path) {
        setPreviewVideoFilePath(result.file_path);
        try {
          const res = await window.api.getLocalFileUrl(result.file_path);
          if (!res.success) throw new Error(res.error || "无法播放");
          setVideoUrl(res.url || "");
        } catch (error) {
          console.error("Failed to load video:", error);
          showToast(`视频下载成功，加载预览失败 ${error}`, "error");
        }
        await runExtractScriptForFile(result.file_path);
        if (userInfo?.phone) {
          exceptionService.submitException({
            cardNum: userInfo.phone,
            feature: "script_download",
            traceId: downloadTraceId,
            eventType: "end",
            exceptionInfo: "",
          });
        }
      } else {
        showToast(
          `下载失败: ${result.message || result.error || "未知错误"}`,
          "error",
        );
        if (userInfo?.phone) {
          exceptionService.submitException({
            cardNum: userInfo.phone,
            feature: "script_download",
            traceId: downloadTraceId,
            eventType: "exception",
            exceptionInfo: JSON.stringify(result),
          });
        }
      }
    } catch (error) {
      console.error("Download video failed:", error);
      const err = error;
      clearInterval(progressInterval);
      showToast(`下载失败: ${err.message || err.error || "未知错误"}`, "error");
      if (userInfo?.phone) {
        exceptionService.submitException({
          cardNum: userInfo.phone,
          feature: "script_download",
          traceId: downloadTraceId,
          eventType: "exception",
          exceptionInfo: JSON.stringify(error),
        });
      }
    } finally {
      setIsDownloading(false);
      if (downloadIntervalRef.current) {
        clearInterval(downloadIntervalRef.current);
        downloadIntervalRef.current = null;
      }
    }
  };
  const handleVideoFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "mp4" && file.type !== "video/mp4") {
      showToast("只支持上传MP4格式的视频文案", "info");
      event.target.value = "";
      return;
    }
    setIsDownloading(true);
    setDownloadProgress(0);
    setVideoUrl("");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const byteArray = new Uint8Array(arrayBuffer);
      const byteCharacters = Array.from(byteArray)
        .map((byte) => String.fromCharCode(byte))
        .join("");
      const base64 = btoa(byteCharacters);
      const timestamp = /* @__PURE__ */ new Date()
        .toISOString()
        .replace(/[:.]/g, "-");
      const fileName = `uploaded_${timestamp}_${file.name}`;
      const saveResult = await window.api.saveFileFromBase64(
        base64,
        fileName,
        "videos/uploaded",
      );
      if (saveResult.success && saveResult.file_path) {
        const result = await window.api.getLocalFileUrl(saveResult.file_path);
        if (!result.success) throw new Error(result.error || "无法播放");
        setVideoUrl(result.url || "");
        setPreviewVideoFilePath(saveResult.file_path);
        setDownloadProgress(100);
        await runExtractScriptForFile(saveResult.file_path);
      } else {
        showToast(`保存文件失败: ${saveResult.error || "未知错误"}`, "error");
      }
    } catch (error) {
      console.error("保存文件失败", error);
      const err = error;
      showToast(`保存文件失败: ${err.message || "未知错误"}`, "error");
    } finally {
      setIsDownloading(false);
    }
    event.target.value = "";
  };
  const runExtractScriptForFile = async (filePath) => {
    if (isExtracting) return;
    if (!filePath) return;
    setIsExtracting(true);
    setExtractProgress(0);
    setOriginalScript("");
    extractProgressRef.current = 0;
    const progressInterval = setInterval(() => {
      if (isTranscribeQueueingRef.current) return;
      extractProgressRef.current += Math.random() * 5;
      if (extractProgressRef.current < 90)
        setExtractProgress(Math.round(extractProgressRef.current));
    }, 500);
    const extractTraceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (userInfo?.phone) {
      exceptionService.submitException({
        cardNum: userInfo.phone,
        feature: "script_extract",
        traceId: extractTraceId,
        eventType: "start",
        exceptionInfo: "",
      });
    }
    try {
      const wavResult = await window.api.extractVideoAudioToWav(filePath);
      if (!wavResult.success || !wavResult.file_path) {
        clearInterval(progressInterval);
        showToast(`提取音频失败: ${wavResult.error || "未知错误"}`, "error");
        return;
      }
      await refreshTokenOnce();
      const text = await window.api.pluginProxyWhisperTranscribeRun({
        audioPath: wavResult.file_path,
      });
      console.log("提取音频结果:", text);
      clearInterval(progressInterval);
      setOriginalScript(text);
      setExtractProgress(100);
      if (userInfo?.phone) {
        exceptionService.submitException({
          cardNum: userInfo.phone,
          feature: "script_extract",
          traceId: extractTraceId,
          eventType: "end",
          exceptionInfo: "",
        });
      }
    } catch (error) {
      if (isUserCancelledPluginError(error)) {
        clearInterval(progressInterval);
        showToast("已取消", "success");
        return;
      }
      console.error("Extract script failed:", error);
      const err = error;
      clearInterval(progressInterval);
      showToast(
        err.message?.includes("fetch failed")
          ? "请联系客服人员，激活账号"
          : `提取失败: ${err.message || "未知错误"}`,
        "error",
      );
      if (userInfo?.phone) {
        exceptionService.submitException({
          cardNum: userInfo.phone,
          feature: "script_extract",
          traceId: extractTraceId,
          eventType: "exception",
          exceptionInfo: JSON.stringify(error),
        });
      }
    } finally {
      setIsExtracting(false);
      if (extractIntervalRef.current) {
        clearInterval(extractIntervalRef.current);
        extractIntervalRef.current = null;
      }
    }
  };
  const handleRewriteScript = async () => {
    if (isRewriting) return;
    if (!originalScript.trim()) {
      showToast("请先提取视频文案或输入原文案", "info");
      return;
    }
    setIsRewriting(true);
    setRewriteProgress(0);
    setRewrittenScript("");
    setTranslatedText("");
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 5;
      if (progress < 90) setRewriteProgress(Math.round(progress));
    }, 500);
    try {
      const langName = getLanguageName(sourceLanguage);
      const lengthNum = parseInt(learnLength.trim(), 10);
      const safeLengthBase =
        Number.isFinite(lengthNum) && lengthNum > 0 ? lengthNum : 150;
      const rewriteLength = Math.max(0, Math.min(1e3, safeLengthBase));
      const { systemPrompt, userPrompts } =
        await templateService.getParsedTemplate("rewrite", {
          langName,
          originalScript,
          targetLength: String(rewriteLength),
        });
      const messages = [
        { role: "system", content: systemPrompt },
        ...userPrompts.map((prompt) => ({ role: "user", content: prompt })),
      ];
      const data = await llmService.completion(fixedLlmModel, messages, {
        temperature: 0.7,
        max_tokens: 2e3,
      });
      clearInterval(progressInterval);
      setRewriteProgress(100);
      const responseData = data.data || data;
      if (responseData.choices?.[0]?.message?.content) {
        const content = responseData.choices[0].message.content;
        try {
          const result = JSON.parse(content.trim());
          if (result.rewrittenText) setRewrittenScript(result.rewrittenText);
          else throw new Error("API返回格式异常");
        } catch (error) {
          console.error(
            "Parse JSON failed, trying to extract from text:",
            error,
          );
          const match = content.match(/"rewrittenText"\s*:\s*"([^"]+)"/);
          if (match) setRewrittenScript(match[1]);
          else {
            const cleaned = content
              .replace(/```json\s*/g, "")
              .replace(/```\s*/g, "")
              .trim();
            const result = JSON.parse(cleaned);
            if (result.rewrittenText) setRewrittenScript(result.rewrittenText);
            else throw new Error("无法解析");
          }
        }
      } else throw new Error("API未返回有效结果");
    } catch (error) {
      console.error("Rewrite script failed:", error);
      const err = error;
      clearInterval(progressInterval);
      showToast(`仿写失败: ${err.message || "未知错误"}`, "error");
    } finally {
      setIsRewriting(false);
      if (rewriteIntervalRef.current) {
        clearInterval(rewriteIntervalRef.current);
        rewriteIntervalRef.current = null;
      }
    }
  };
  const handleGenerateOriginalScript = async () => {
    if (isGeneratingOriginal) return;
    const product = originalProductInfo.trim();
    if (!product) {
      showToast("请先填写「产品主体（名字、卖点、优势）」", "info");
      return;
    }
    const lengthNum = parseInt(originalLength.trim(), 10);
    const safeLengthBase =
      Number.isFinite(lengthNum) && lengthNum > 0 ? lengthNum : 150;
    const safeLength = Math.max(0, Math.min(1e3, safeLengthBase));
    setIsGeneratingOriginal(true);
    try {
      const purpose = originalPurpose || "短视频口播";
      const audience = originalAudience.trim() || "泛用途;
      const goal = originalGoal || "引流";
      const lines = [];
      lines.push(`文案用途：${purpose}`);
      lines.push(`产品主体（名字、卖点、优势）：${product}`);
      lines.push(`目标人群：${audience}`);
      lines.push(`期望字数：约 ${safeLength} 字`);
      lines.push(`文案目标题{goal}`);
      const baseOriginal = originalScript.trim();
      const baseRewritten = rewrittenScript.trim();
      if (baseRewritten) {
        lines.push(`可参考但不要照抄的历史文案：${baseRewritten}`);
      } else if (baseOriginal) {
        lines.push(`可参考的视频原始文案：${baseOriginal}`);
      }
      const currentLangName = getLanguageName(sourceLanguage);
      const systemPrompt = `你是一名资深短视频与新媒体文案策划，擅长根据产品卖点和目标用户从零创作高转化${currentLangName}原创文案。`;
      const userPrompt =
        lines.join("\n") +
        `

请根据以上要素，创作一段适合在对应场景直接使用的${currentLangName}原创文案：\n1. 文案整体控制在约 ${safeLength} 字左右，可略多一点但不要明显超出。\n2. 语言口语化、有代入感和节奏感，适合朗读或配旁白使用途3. 重点突出产品卖点和目标人群共鸣，结尾最好带一点行动号召。\n4. 只输出成品文案正文，不要加「标题」二字、编号、分点、解释或任何提示语。\n5. 输出结果中也不需要任何emoji表情，不要有特殊标点符号。`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      const data = await llmService.completion(fixedLlmModel, messages, {
        temperature: 0.85,
        max_tokens: Math.max(1e3, safeLength * 3),
      });
      const responseData = data.data || data;
      const content = responseData?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("API未返回有效结果");
      }
      setRewrittenScript(content);
      setTranslatedText("");
      showToast("原创文案已生成", "success");
    } catch (error) {
      console.error("Generate original script failed:", error);
      const err = error;
      showToast(`原创文案生成失败: ${err.message || "未知错误"}`, "error");
    } finally {
      setIsGeneratingOriginal(false);
    }
  };
  const handleTranslate = async () => {
    if (isTranslating) return;
    const scriptContent = rewrittenScript.trim();
    if (!scriptContent) {
      showToast("请先输入文案", "info");
      return;
    }
    setIsTranslating(true);
    setTranslateProgress(0);
    setTranslatedText("");
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 5;
      if (progress < 90) setTranslateProgress(Math.round(progress));
    }, 500);
    try {
      const sourceLangName = getLanguageName(sourceLanguage);
      const targetLangName = getLanguageName(targetLanguage);
      const { systemPrompt, userPrompts } =
        await templateService.getParsedTemplate("translate", {
          sourceLangName,
          targetLangName,
          scriptContent,
        });
      const messages = [
        { role: "system", content: systemPrompt },
        ...userPrompts.map((prompt) => ({ role: "user", content: prompt })),
      ];
      const data = await llmService.completion(fixedLlmModel, messages, {
        temperature: 0.3,
        max_tokens: 2e3,
      });
      clearInterval(progressInterval);
      setTranslateProgress(100);
      const responseData = data.data || data;
      if (responseData.choices?.[0]?.message?.content) {
        setTranslatedText(
          responseData.choices[0].message.content
            .replace(/```[\s\S]*?```/g, "")
            .trim(),
        );
      } else throw new Error("API未返回有效结果");
    } catch (error) {
      console.error("Translate failed:", error);
      const err = error;
      clearInterval(progressInterval);
      showToast(`翻译失败: ${err.message || "未知错误"}`, "error");
    } finally {
      setIsTranslating(false);
    }
  };
  const handleOpenTranslateModal = () => {
    if (!rewrittenScript.trim()) {
      showToast("请先生成文案", "info");
      return;
    }
    setShowTranslateModal(true);
  };
  const handleOpenAiLegalModal = () => {
    const scriptContent = rewrittenScript.trim() || originalScript.trim();
    if (!scriptContent) {
      showToast("请先输入文案内容或提取视频文案", "info");
      return;
    }
    setAiLegalReviewedText("");
    setAiLegalSuggestions("");
    setAiLegalEdits([]);
    setAiLegalProgress(0);
    setShowAiLegalModal(true);
  };
  const handleCloseTranslateModal = () => {
    setShowTranslateModal(false);
  };
  const handleCloseAiLegalModal = () => {
    setShowAiLegalModal(false);
  };
  const handleCompleteTranslate = () => {
    setShowTranslateModal(false);
    if (translatedText && !showTranslatedInTextarea) {
      setPreTranslationLanguage(sourceLanguage);
      setSourceLanguage(targetLanguage);
      setShowTranslatedInTextarea(true);
    }
  };
  const handleCompleteAiLegal = (reviewedText) => {
    setShowAiLegalModal(false);
    if (reviewedText.trim()) {
      setRewrittenScript(reviewedText.trim());
      setTranslatedText("");
      setShowTranslatedInTextarea(false);
      showToast("已应用 AI 法务审核后的文案", "success");
    }
  };
  const handleToggleTranslatedText = () => {
    if (showTranslatedInTextarea) {
      setShowTranslatedInTextarea(false);
      setSourceLanguage(preTranslationLanguage);
    } else {
      setShowTranslatedInTextarea(true);
      setSourceLanguage(targetLanguage);
    }
  };
  const openPreview = () => phoneModal.openPhoneModal(videoUrl);
  const shouldShowPreviewDownload = String(CHANNEL.id) === "jiuzhe";
  const handleDownloadPreviewVideo = async () => {
    const path = previewVideoFilePath;
    if (!path) {
      showToast("无可下载的视频", "info");
      return;
    }
    const result = await window.api.saveLocalFileAs(path);
    if (result.canceled) return;
    if (result.success && result.filePath) showToast("视频已保存", "success");
    else showToast(result.error || "保存失败", "error");
  };
  const toggleMode = () => {
    setIsUploadMode(!isUploadMode);
    setInputVideoUrl("");
    setVideoUrl("");
    setPreviewVideoFilePath("");
    setUploadFileName("");
    setOriginalVideoPath("");
  };
  const handleAiLegalReview = async () => {
    if (isAiLegalReviewing) return;
    const scriptContent = rewrittenScript.trim() || originalScript.trim();
    if (!scriptContent) {
      showToast("请先输入文案内容或提取视频文案", "info");
      return;
    }
    setIsAiLegalReviewing(true);
    setAiLegalProgress(0);
    setAiLegalReviewedText("");
    setAiLegalSuggestions("");
    setAiLegalEdits([]);
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 5;
      if (progress < 90) setAiLegalProgress(Math.round(progress));
    }, 500);
    aiLegalIntervalRef.current = progressInterval;
    try {
      let systemPrompt = "";
      let userPrompts = [];
      try {
        const parsed = await templateService.getParsedTemplate("legal_review", {
          scriptContent,
        });
        systemPrompt = parsed.systemPrompt;
        userPrompts = parsed.userPrompts;
        userPrompts.push(
          "补充约束：请逐词扫描文案，只检测并替换广告法明确禁止的违禁词（极限词、绝对化用语、虚假承诺、权威性虚构等）；只允许词级替换（2-10字），不整句改写；edits.original 必须是原文中存在的精确连续片段；reviewedText 必须体现所有 edits 的替换结果",
        );
      } catch {
        systemPrompt =
          "你是一名中国广告法合规审核员。你的唯一职责：逐词扫描文案，找出违反《中华人民共和国广告法》(2015修订")、《消费者权益保护法》、《反不正当竞争法》中明确禁止使用的广告用语，并给出最小化的词级替捀��\n\n## 必须检测的违禁词类别\n1. 极限词：最、第一、唯一、首个、首选、冠军、顶级、极品、王牌\n2. 绝对化用语：绝对、100%、完全、永远、万能、全能、一切\n3. 虚假承诺：治愈、根治、永不反弹、无效退款、药到病除、一次见效\n4. 权威性虚构：国家级、世界级、驰名、特供、专供、指定、特效\n5. 无依据数据声称：销量第一、全网最低价、零风险、无副作用、纯天然\n\n## 不属于违禁词（不要标记）\n- 合法比较级：更好、更强、升级版、加强版\n- 合法修饰语：优质、精选、热销、经典、人气\n- 情绪表达：超值、超赞、太棒了、好用到哭\n- 产品描述：天然成分、温和配方、创新设计\n- 限时促销：限时、限量、特惠、折扣\n\n## 工作规则\n- 只做词级或短语级替换（2-10字），绝不整句改写\n- 不润色文风、不调整语气、不修改语法、不重组句式\n- edits.original 必须是原文中连续存在的精确片段";
        userPrompts = [
          `请逐词扫描以下文案，找出所有中国广告法明确禁止的违禁词。输出纯JSON（不要代码块标记）。
## 输出格式
{
  "reviewedText": "将所有违禁词替换后的完整文案（如无违禁词则与原文完全一致）",
  "suggestions": "列出每个被替换的词及原因；如无违禁词则输出：文案未发现违禁词。",
  "edits": [
    { "original": "原文中的违禁词（2-10字精确摘录）", "replacement": "合规替换词", "reason": "违反广告法哪条规定" }
  ]
}

## 示例1（有违禁词）
输入文案：这是全网最好的面膜，100%纯天然成分，国家级品质保证，用了绝对有效。\n正确输出：\n{"reviewedText":"这是全网热销的面膜，天然植物成分，高品质保证，用了会有明显改善","suggestions":"最好→热销（极限词）；100%纯天然→天然植物（绝对化+无依据）；国家级→高（权威性虚构）；绝对有效→会有明显改善（绝对化用语）","edits":[{"original":"最好","replacement":"热销","reason":"极限词，广告法第9条"},{"original":"100%纯天然","replacement":"天然植物","reason":"绝对化用途无法证实"},{"original":"国家级","replacement":"高","reason":"权威性虚构，广告法第11条"},{"original":"绝对有效","replacement":"会有明显改善","reason":"绝对化用语，广告法第9条"}]}

## 示例2（无违禁词）
输入文案：这款面膜采用升级配方，使用感更好，限时特惠中，超值推荐！
正确输出：\n{"reviewedText":"这款面膜采用升级配方，使用感更好，限时特惠中，超值推荐！","suggestions":"文案未发现违禁词。","edits":[]}

## 待审核文案${scriptContent}`,
        ];
      }
      const messages = [
        { role: "system", content: systemPrompt || "你是一名专业法务审核员。" },
        ...userPrompts.map((p) => ({ role: "user", content: p })),
      ];
      const data = await llmService.completion(fixedLlmModel, messages, {
        temperature: 0.3,
        max_tokens: 2200,
      });
      clearInterval(progressInterval);
      aiLegalIntervalRef.current = null;
      setAiLegalProgress(100);
      const responseData = data.data || data;
      const content = responseData?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("API未返回有效结果");
      const cleaned = content
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      try {
        const result = JSON.parse(cleaned);
        const reviewed = (result.reviewedText ?? "").toString().trim();
        const suggestions = (result.suggestions ?? "").toString().trim();
        if (!reviewed) throw new Error("缺少 reviewedText");
        let nextReviewed = reviewed;
        let nextSuggestions = suggestions;
        const edits = Array.isArray(result.edits) ? result.edits : [];
        const normalized = edits
          .map((e) => ({
            original: (e?.original ?? "").toString(),
            replacement: (e?.replacement ?? "").toString(),
            reason: (e?.reason ?? "").toString(),
          }))
          .filter((e) => e.original && (e.replacement || e.reason));
        const wordLevelEdits = filterWordLevelLegalEdits(
          normalized,
          scriptContent,
        );
        if (wordLevelEdits.length > 0) {
          nextReviewed = applyEditsToSourceText(scriptContent, wordLevelEdits);
          if (isReviewedTextOverwritten(scriptContent, reviewed)) {
            const note = "已自动约束为词级法务替换，避免整句改写作;
            nextSuggestions = nextSuggestions
              ? `${nextSuggestions}

${note}`
              : note;
          }
        } else if (normalized.length > 0 && wordLevelEdits.length === 0) {
          const note = `AI 检测到 ${normalized.length} 处可能的违禁内容，但标注粒度过大（整句级），已被过滤。建议点击"重新审核"重试。`;
          nextSuggestions = nextSuggestions
            ? `${nextSuggestions}

${note}`
            : note;
          nextReviewed = scriptContent;
        }
        setAiLegalReviewedText(nextReviewed);
        setAiLegalSuggestions(nextSuggestions);
        setAiLegalEdits(wordLevelEdits);
      } catch (e) {
        setAiLegalReviewedText(cleaned);
        setAiLegalSuggestions(
          "（解析失败：未能提取结构化“修改意见”。如需，请点击“重新审核”。）",
        );
      }
    } catch (error) {
      console.error("AI legal review failed:", error);
      const err = error;
      if (aiLegalIntervalRef.current) {
        clearInterval(aiLegalIntervalRef.current);
        aiLegalIntervalRef.current = null;
      }
      showToast(`AI法务失败: ${err.message || "未知错误"}`, "error");
    } finally {
      setIsAiLegalReviewing(false);
    }
  };
  const manualScriptBusy =
    flowMode === "manual" &&
    (isDownloading ||
      isExtracting ||
      isRewriting ||
      isGeneratingOriginal ||
      isTranslating ||
      isAiLegalReviewing ||
      isTopicAnalyzing ||
      isTopicScriptsLoading);
  const autoLoading =
    (autoFlowRunning && autoFlowStep === "script") || manualScriptBusy;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
    className: "video-column",
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
        className: `video-card ${autoLoading ? "video-card-auto-loading" : ""}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-card-header",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
                className: "video-card-number",
                children: "01",
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
                className: "video-card-title",
                children: "文案生成",
              }),
            ],
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-card-body",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                className: "video-form-group",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                  style: { display: "flex", justifyContent: "center" },
                  children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                    className: "script-mode-tabs",
                    role: "tablist",
                    "aria-label": "文案模式切换",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                        type: "button",
                        role: "tab",
                        "aria-selected": scriptMode === "learn",
                        className: `script-mode-tab ${scriptMode === "learn" ? "active" : ""}`,
                        onClick: () => setScriptMode("learn"),
                        children: "文案学习",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                        type: "button",
                        role: "tab",
                        "aria-selected": scriptMode === "ipBrain",
                        className: `script-mode-tab ${scriptMode === "ipBrain" ? "active" : ""}`,
                        onClick: () => setScriptMode("ipBrain"),
                        children: "借东风",
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                        type: "button",
                        role: "tab",
                        "aria-selected": scriptMode === "original",
                        className: `script-mode-tab ${scriptMode === "original" ? "active" : ""}`,
                        onClick: () => setScriptMode("original"),
                        children: "文案原创",
                      }),
                    ],
                  }),
                }),
              }),
              scriptMode === "learn" &&
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  jsxRuntimeExports.Fragment,
                  {
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                                className: "video-label",
                                style: { flex: 1 },
                                children: isUploadMode
                                  ? "本地视频"
                                  : "视频链接",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                onClick: toggleMode,
                                title: isUploadMode
                                  ? "切换到下载模板
                                  : "切换到上传模板,
                                style: {
                                  padding: "1.5px",
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: "4px",
                                  transition:
                                    "background-color 0.2s, color 0.2s",
                                  width: "17.59px",
                                  height: "17.59px",
                                  minWidth: "17.59px",
                                  minHeight: "17.59px",
                                  color: "var(--ly-text-2)",
                                },
                                onMouseEnter: (e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "var(--ly-primary-soft)";
                                  e.currentTarget.style.color =
                                    "var(--ly-primary-2)";
                                },
                                onMouseLeave: (e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "transparent";
                                  e.currentTarget.style.color =
                                    "var(--ly-text-2)";
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
                                      children: [
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "line",
                                          {
                                            x1: "5",
                                            y1: "8",
                                            x2: "19",
                                            y2: "8",
                                          },
                                        ),
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "polyline",
                                          { points: "15 5 19 8 15 11" },
                                        ),
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "line",
                                          {
                                            x1: "19",
                                            y1: "16",
                                            x2: "5",
                                            y2: "16",
                                          },
                                        ),
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "polyline",
                                          { points: "9 13 5 16 9 19" },
                                        ),
                                      ],
                                    },
                                  ),
                              }),
                            ],
                          }),
                          isUploadMode
                            ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                                style: { width: "100%" },
                                children:
                                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className: `video-file-input video-file-input-wrap ${isDownloading || isExtracting ? "disabled" : ""}`,
                                      title:
                                        uploadFileName || "上传视频提取文案",
                                      children: [
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "span",
                                          {
                                            className: "video-file-input-text",
                                            children:
                                              uploadFileName ||
                                              "上传视频提取文案",
                                          },
                                        ),
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "input",
                                          {
                                            type: "file",
                                            accept: "video/mp4,.mp4",
                                            onChange: handleVideoFileSelect,
                                            disabled:
                                              isDownloading || isExtracting,
                                            className: "video-file-input-real",
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              })
                            : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                },
                                children: [
                                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      style: {
                                        position: "relative",
                                        flex: 1,
                                        minWidth: 0,
                                      },
                                      children: [
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "input",
                                          {
                                            type: "text",
                                            value: inputVideoUrl,
                                            onChange: (e) =>
                                              setInputVideoUrl(e.target.value),
                                            placeholder: "输入视频链接",
                                            className: "video-input",
                                            disabled:
                                              isDownloading || isExtracting,
                                            style: {
                                              width: "100%",
                                              boxSizing: "border-box",
                                              paddingRight:
                                                inputVideoUrl.trim() !== ""
                                                  ? 34
                                                  : void 0,
                                            },
                                          },
                                        ),
                                        inputVideoUrl.trim() !== "" &&
                                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              onClick: () =>
                                                setInputVideoUrl(""),
                                              disabled:
                                                isDownloading || isExtracting,
                                              title: "清除链接",
                                              "aria-label": "清除链接",
                                              style: {
                                                position: "absolute",
                                                right: 4,
                                                top: "50%",
                                                transform: "translateY(-50%)",
                                                padding: 4,
                                                border: "none",
                                                background: "transparent",
                                                cursor:
                                                  isDownloading || isExtracting
                                                    ? "not-allowed"
                                                    : "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                borderRadius: 4,
                                                transition:
                                                  "background-color 0.2s, color 0.2s",
                                                width: 26,
                                                height: 26,
                                                minWidth: 26,
                                                minHeight: 26,
                                                color: "var(--ly-text-2)",
                                              },
                                              onMouseEnter: (e) => {
                                                if (
                                                  isDownloading ||
                                                  isExtracting
                                                )
                                                  return;
                                                e.currentTarget.style.backgroundColor =
                                                  "var(--ly-primary-soft)";
                                                e.currentTarget.style.color =
                                                  "var(--ly-primary-2)";
                                              },
                                              onMouseLeave: (e) => {
                                                e.currentTarget.style.backgroundColor =
                                                  "transparent";
                                                e.currentTarget.style.color =
                                                  "var(--ly-text-2)";
                                              },
                                              children:
                                                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                                  "svg",
                                                  {
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
                                                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                        "line",
                                                        {
                                                          x1: "18",
                                                          y1: "6",
                                                          x2: "6",
                                                          y2: "18",
                                                        },
                                                      ),
                                                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                        "line",
                                                        {
                                                          x1: "6",
                                                          y1: "6",
                                                          x2: "18",
                                                          y2: "18",
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
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "button",
                                    {
                                      onClick: handleDownloadVideo,
                                      disabled: isDownloading || isExtracting,
                                      className:
                                        "video-button video-button-primary",
                                      style: {
                                        whiteSpace: "nowrap",
                                        width: "auto",
                                      },
                                      children: isExtracting
                                        ? isTranscribeQueuing
                                          ? "排队中.."
                                          : `提取消${extractProgress}%`
                                        : isDownloading
                                          ? `提取消${downloadProgress}%`
                                          : "提取文案",
                                    },
                                  ),
                                ],
                              }),
                          (isDownloading || isExtracting) &&
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                              className: "video-progress",
                              children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "div",
                                {
                                  className: "video-progress-bar",
                                  style: {
                                    width: `${isExtracting ? (isTranscribeQueuing ? 0 : extractProgress) : downloadProgress}%`,
                                  },
                                },
                              ),
                            }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "视频预览",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                            className:
                              "video-preview-box video-preview-box-with-play",
                            children: videoUrl
                              ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                  jsxRuntimeExports.Fragment,
                                  {
                                    children: [
                                      " ",
                                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                                        "video",
                                        {
                                          ref: downloadVideoRef,
                                          className: "video-preview-media",
                                          preload: "metadata",
                                          onClick: (e) => {
                                            e.preventDefault();
                                            openPreview();
                                          },
                                          children:
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "source",
                                              { src: videoUrl },
                                            ),
                                        },
                                        videoUrl,
                                      ),
                                      shouldShowPreviewDownload &&
                                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                                          "button",
                                          {
                                            type: "button",
                                            onClick: (e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleDownloadPreviewVideo();
                                            },
                                            title: "下载视频",
                                            "aria-label": "下载视频",
                                            style: {
                                              position: "absolute",
                                              right: "8px",
                                              bottom: "8px",
                                              padding: "2px",
                                              border: "none",
                                              background:
                                                "rgba(2, 6, 23, 0.55)",
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
                                              e.currentTarget.style.color =
                                                "#e2e8f0";
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
                                                      {
                                                        points:
                                                          "7 10 12 15 17 10",
                                                      },
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
                                          },
                                        ),
                                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                                        "button",
                                        {
                                          className: "video-play-button",
                                          onClick: openPreview,
                                          children:
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
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
                                        },
                                      ),
                                    ],
                                  },
                                )
                              : /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                                  className: "video-preview-placeholder",
                                  children: "暂无视频",
                                }),
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "文案内容",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", {
                            value: originalScript,
                            onChange: (e) => setOriginalScript(e.target.value),
                            placeholder: "提取的文案将显示在这里..",
                            rows: 5,
                            className: "video-textarea",
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
                                children: "语言",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("select", {
                                value: sourceLanguage,
                                onChange: (e) =>
                                  setSourceLanguage(e.target.value),
                                className: "video-select",
                                children: LANG_OPTIONS.map((o) =>
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "option",
                                    { value: o.value, children: o.label },
                                    o.value,
                                  ),
                                ),
                              }),
                            ],
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            className: "video-form-group",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                                className: "video-label",
                                children: "字数",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                                type: "number",
                                min: 0,
                                max: lengthMax,
                                value: learnLength,
                                onChange: (e) => {
                                  setLearnLength(e.target.value);
                                },
                                onBlur: (e) => {
                                  const raw = e.target.value.trim();
                                  if (!raw) {
                                    setLearnLength("100");
                                    return;
                                  }
                                  const num = parseInt(raw, 10);
                                  if (!Number.isFinite(num)) {
                                    setLearnLength("100");
                                    return;
                                  }
                                  setLearnLength(
                                    String(
                                      Math.max(0, Math.min(lengthMax, num)),
                                    ),
                                  );
                                },
                                className: "video-input",
                              }),
                            ],
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                            onClick: handleRewriteScript,
                            disabled: isRewriting,
                            className: "video-button video-button-primary",
                            children: isRewriting
                              ? `仿写作${rewriteProgress}%`
                              : "执行仿写",
                          }),
                          isRewriting &&
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                              className: "video-progress",
                              children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "div",
                                {
                                  className: "video-progress-bar",
                                  style: { width: `${rewriteProgress}%` },
                                },
                              ),
                            }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", {
                                className: "video-label",
                                style: { flex: 1 },
                                children: [
                                  "仿写文案",
                                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                    "span",
                                    {
                                      style: {
                                        color: "#666",
                                        fontWeight: "normal",
                                      },
                                      children: [
                                        "�?,
                                        getLanguageName(sourceLanguage),
                                        "�?,
                                      ],
                                    },
                                  ),
                                ],
                              }),
                              translatedText &&
                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "button",
                                  {
                                    onClick: handleToggleTranslatedText,
                                    title: showTranslatedInTextarea
                                      ? "显示原文"
                                      : "显示译文",
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
                                    },
                                    onMouseEnter: (e) => {
                                      e.currentTarget.style.backgroundColor =
                                        "var(--ly-primary-soft)";
                                      e.currentTarget.style.color =
                                        "var(--ly-primary-2)";
                                    },
                                    onMouseLeave: (e) => {
                                      e.currentTarget.style.backgroundColor =
                                        "transparent";
                                      e.currentTarget.style.color =
                                        "var(--ly-text-2)";
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
                                          children: [
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M8 3L4 7l4 4" },
                                            ),
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M4 7h16" },
                                            ),
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M16 21l4-4-4-4" },
                                            ),
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M20 17H4" },
                                            ),
                                          ],
                                        },
                                      ),
                                  },
                                ),
                            ],
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", {
                            value:
                              showTranslatedInTextarea && translatedText
                                ? translatedText
                                : rewrittenScript,
                            onChange: (e) => {
                              if (showTranslatedInTextarea && translatedText)
                                setTranslatedText(e.target.value);
                              else setRewrittenScript(e.target.value);
                            },
                            placeholder: "仿写后的文案将显示在这里...",
                            rows: 5,
                            className: "video-textarea",
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                          "div",
                          {
                            style: { display: "flex", gap: "8px" },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                onClick: handleOpenAiLegalModal,
                                className: "video-button video-button-warning",
                                style: { flex: 1 },
                                children: "AI法务",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                onClick: handleOpenTranslateModal,
                                className: "video-button video-button-primary",
                                style: { flex: 1 },
                                children: "翻译文案",
                              }),
                            ],
                          },
                        ),
                      }),
                    ],
                  },
                ),
              scriptMode === "ipBrain" &&
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  jsxRuntimeExports.Fragment,
                  {
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: !ipBrain
                          ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                              className: "ipbrain-placeholder",
                              children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                "div",
                                {
                                  className: "ipbrain-placeholder-inner",
                                  children: [
                                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", {
                                      className: "ipbrain-placeholder-title",
                                      children: "还没有配置 借东风",
                                    }),
                                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", {
                                      className: "ipbrain-placeholder-desc",
                                      children:
                                        "为你的文案添加一个借东风，便于后续选题分析和深度学习。",
                                    }),
                                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                                      "button",
                                      {
                                        type: "button",
                                        className:
                                          "video-button video-button-primary",
                                        onClick: () =>
                                          setShowIpBrainModal(true),
                                        children: "添加 借东风",
                                      },
                                    ),
                                  ],
                                },
                              ),
                            })
                          : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                              className: "ipbrain-card",
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                                  className: "ipbrain-card-header",
                                  children: [
                                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        children: [
                                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                                            "div",
                                            {
                                              className: "ipbrain-title",
                                              children:
                                                ipBrain.name || "未命名借东风,
                                            },
                                          ),
                                          /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className: "ipbrain-meta-row",
                                              children: [
                                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "ipbrain-meta-label",
                                                    children: "主页地址",
                                                  },
                                                ),
                                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "ipbrain-meta-value",
                                                    children: ipBrain.homepage
                                                      ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                          "span",
                                                          {
                                                            children:
                                                              ipBrain.homepage,
                                                          },
                                                        )
                                                      : "未填写",
                                                  },
                                                ),
                                              ],
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        style: {
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 6,
                                        },
                                        children:
                                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              "aria-label": "删除 借东风",
                                              title: "删除 借东风",
                                              style: {
                                                width: 22,
                                                height: 22,
                                                borderRadius: 999,
                                                border: "none",
                                                background: "transparent",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                cursor: "pointer",
                                                color: "var(--ly-text-3)",
                                                transition:
                                                  "background-color 0.15s ease, color 0.15s ease",
                                              },
                                              onMouseEnter: (e) => {
                                                e.currentTarget.style.backgroundColor =
                                                  "var(--ly-danger-soft)";
                                                e.currentTarget.style.color =
                                                  "var(--ly-danger)";
                                              },
                                              onMouseLeave: (e) => {
                                                e.currentTarget.style.backgroundColor =
                                                  "transparent";
                                                e.currentTarget.style.color =
                                                  "var(--ly-text-3)";
                                              },
                                              onClick: () => setIpBrain(null),
                                              children:
                                                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                                  "svg",
                                                  {
                                                    width: "10",
                                                    height: "10",
                                                    viewBox: "0 0 24 24",
                                                    fill: "none",
                                                    stroke: "currentColor",
                                                    strokeWidth: "2",
                                                    strokeLinecap: "round",
                                                    strokeLinejoin: "round",
                                                    children: [
                                                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                        "line",
                                                        {
                                                          x1: "18",
                                                          y1: "6",
                                                          x2: "6",
                                                          y2: "18",
                                                        },
                                                      ),
                                                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                        "line",
                                                        {
                                                          x1: "6",
                                                          y1: "6",
                                                          x2: "18",
                                                          y2: "18",
                                                        },
                                                      ),
                                                    ],
                                                  },
                                                ),
                                            },
                                          ),
                                      },
                                    ),
                                  ],
                                }),
                                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                                  className: "ipbrain-card-footer",
                                  children: [
                                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "ipbrain-card-footer-left",
                                        children: [
                                          /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                            "span",
                                            {
                                              className: "ipbrain-meta-small",
                                              children: [
                                                "创建时间戳,
                                                ipBrain.createdAt,
                                              ],
                                            },
                                          ),
                                          /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                            "span",
                                            {
                                              className: "ipbrain-meta-small",
                                              children: [
                                                "深度学习：",
                                                ipBrain.deepLearn ? "�? : "�?,
                                              ],
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        className: "ipbrain-card-footer-bottom",
                                        children:
                                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              className:
                                                "video-button video-button-primary",
                                              style: {
                                                width: "100%",
                                                whiteSpace: "nowrap",
                                              },
                                              onClick: handleOpenTopicAnalysis,
                                              children: "选题分析",
                                            },
                                          ),
                                      },
                                    ),
                                  ],
                                }),
                              ],
                            }),
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-row ipbrain-language-row",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            className: "video-form-group",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                                className: "video-label",
                                children: "语言",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("select", {
                                value: sourceLanguage,
                                onChange: (e) =>
                                  setSourceLanguage(e.target.value),
                                className: "video-select",
                                children: LANG_OPTIONS.map((o) =>
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "option",
                                    { value: o.value, children: o.label },
                                    o.value,
                                  ),
                                ),
                              }),
                            ],
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            className: "video-form-group",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                                className: "video-label",
                                children: "字数",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                                type: "number",
                                min: 0,
                                max: lengthMax,
                                value: ipBrainLength,
                                onChange: (e) => {
                                  setIpBrainLength(e.target.value);
                                },
                                onBlur: (e) => {
                                  const raw = e.target.value.trim();
                                  if (!raw) {
                                    setIpBrainLength("100");
                                    return;
                                  }
                                  const num = parseInt(raw, 10);
                                  if (!Number.isFinite(num)) {
                                    setIpBrainLength("100");
                                    return;
                                  }
                                  setIpBrainLength(
                                    String(
                                      Math.max(0, Math.min(lengthMax, num)),
                                    ),
                                  );
                                },
                                className: "video-input",
                              }),
                            ],
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", {
                                className: "video-label",
                                style: { flex: 1 },
                                children: [
                                  "借东风文案",
                                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                    "span",
                                    {
                                      style: {
                                        color: "#666",
                                        fontWeight: "normal",
                                      },
                                      children: [
                                        "�?,
                                        getLanguageName(sourceLanguage),
                                        "�?,
                                      ],
                                    },
                                  ),
                                ],
                              }),
                              translatedText &&
                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "button",
                                  {
                                    onClick: handleToggleTranslatedText,
                                    title: showTranslatedInTextarea
                                      ? "显示原文"
                                      : "显示译文",
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
                                    },
                                    onMouseEnter: (e) => {
                                      e.currentTarget.style.backgroundColor =
                                        "var(--ly-primary-soft)";
                                      e.currentTarget.style.color =
                                        "var(--ly-primary-2)";
                                    },
                                    onMouseLeave: (e) => {
                                      e.currentTarget.style.backgroundColor =
                                        "transparent";
                                      e.currentTarget.style.color =
                                        "var(--ly-text-2)";
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
                                          children: [
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M8 3L4 7l4 4" },
                                            ),
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M4 7h16" },
                                            ),
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M16 21l4-4-4-4" },
                                            ),
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M20 17H4" },
                                            ),
                                          ],
                                        },
                                      ),
                                  },
                                ),
                            ],
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", {
                            value:
                              showTranslatedInTextarea && translatedText
                                ? translatedText
                                : rewrittenScript,
                            onChange: (e) => {
                              if (showTranslatedInTextarea && translatedText)
                                setTranslatedText(e.target.value);
                              else setRewrittenScript(e.target.value);
                            },
                            placeholder: "借东风相关的描述、介绍或素材文案...",
                            rows: 5,
                            className: "video-textarea",
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                          "div",
                          {
                            style: { display: "flex", gap: "8px" },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                onClick: handleOpenAiLegalModal,
                                className: "video-button video-button-warning",
                                style: { flex: 1 },
                                children: "AI法务",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                onClick: handleOpenTranslateModal,
                                className: "video-button video-button-primary",
                                style: { flex: 1 },
                                children: "翻译文案",
                              }),
                            ],
                          },
                        ),
                      }),
                    ],
                  },
                ),
              scriptMode === "original" &&
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  jsxRuntimeExports.Fragment,
                  {
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "文案用途",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("select", {
                            value: originalPurpose,
                            onChange: (e) => setOriginalPurpose(e.target.value),
                            className: "video-select",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "朋友圈",
                                children: "朋友圈",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "短视频口播",
                                children: "短视频口播",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "海报",
                                children: "海报",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "店铺宣传",
                                children: "店铺宣传",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "带货",
                                children: "带货",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "活动通知",
                                children: "活动通知",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "产品介绍",
                                children: "产品介绍",
                              }),
                            ],
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "产品主体（名字、卖点、优势）",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", {
                            value: originalProductInfo,
                            onChange: (e) =>
                              setOriginalProductInfo(e.target.value),
                            placeholder:
                              "请输入产品名字、核心卖点、优势亮点等信息...",
                            rows: 4,
                            className: "video-textarea",
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "目标人群",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                            type: "text",
                            value: originalAudience,
                            onChange: (e) =>
                              setOriginalAudience(e.target.value),
                            placeholder: "如：商家、博主、宝妈、学生、大众等",
                            className: "video-input",
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "目标",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("select", {
                            value: originalGoal,
                            onChange: (e) => setOriginalGoal(e.target.value),
                            className: "video-select",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "引流",
                                children: "引流",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "涨粉",
                                children: "涨粉",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "带货",
                                children: "带货",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "通知",
                                children: "通知",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "同城",
                                children: "同城",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "宣传",
                                children: "宣传",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", {
                                value: "其他",
                                children: "其他",
                              }),
                            ],
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "语言",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("select", {
                            value: sourceLanguage,
                            onChange: (e) => setSourceLanguage(e.target.value),
                            className: "video-select",
                            children: LANG_OPTIONS.map((o) =>
                              /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "option",
                                { value: o.value, children: o.label },
                                o.value,
                              ),
                            ),
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "字数",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                            type: "number",
                            min: 0,
                            max: lengthMax,
                            value: originalLength,
                            onChange: (e) => {
                              setOriginalLength(e.target.value);
                            },
                            onBlur: (e) => {
                              const raw = e.target.value.trim();
                              if (!raw) {
                                setOriginalLength("100");
                                return;
                              }
                              const num = parseInt(raw, 10);
                              if (!Number.isFinite(num)) {
                                setOriginalLength("100");
                                return;
                              }
                              setOriginalLength(
                                String(Math.max(0, Math.min(lengthMax, num))),
                              );
                            },
                            className: "video-input",
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "button",
                          {
                            onClick: handleGenerateOriginalScript,
                            disabled: isGeneratingOriginal,
                            className: "video-button video-button-primary",
                            children: isGeneratingOriginal
                              ? "生成中…"
                              : "生成原创文案",
                          },
                        ),
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", {
                                className: "video-label",
                                style: { flex: 1 },
                                children: [
                                  "原创文案",
                                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                    "span",
                                    {
                                      style: {
                                        color: "#666",
                                        fontWeight: "normal",
                                      },
                                      children: [
                                        "�?,
                                        getLanguageName(sourceLanguage),
                                        "�?,
                                      ],
                                    },
                                  ),
                                ],
                              }),
                              translatedText &&
                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "button",
                                  {
                                    onClick: handleToggleTranslatedText,
                                    title: showTranslatedInTextarea
                                      ? "显示原文"
                                      : "显示译文",
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
                                    },
                                    onMouseEnter: (e) => {
                                      e.currentTarget.style.backgroundColor =
                                        "var(--ly-primary-soft)";
                                      e.currentTarget.style.color =
                                        "var(--ly-primary-2)";
                                    },
                                    onMouseLeave: (e) => {
                                      e.currentTarget.style.backgroundColor =
                                        "transparent";
                                      e.currentTarget.style.color =
                                        "var(--ly-text-2)";
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
                                          children: [
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M8 3L4 7l4 4" },
                                            ),
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M4 7h16" },
                                            ),
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M16 21l4-4-4-4" },
                                            ),
                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M20 17H4" },
                                            ),
                                          ],
                                        },
                                      ),
                                  },
                                ),
                            ],
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", {
                            value:
                              showTranslatedInTextarea && translatedText
                                ? translatedText
                                : rewrittenScript,
                            onChange: (e) => {
                              if (showTranslatedInTextarea && translatedText)
                                setTranslatedText(e.target.value);
                              else setRewrittenScript(e.target.value);
                            },
                            placeholder: "生成的原创文案将显示在这里..",
                            rows: 5,
                            className: "video-textarea",
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                          "div",
                          {
                            style: { display: "flex", gap: "8px" },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                onClick: handleOpenAiLegalModal,
                                className: "video-button video-button-warning",
                                style: { flex: 1 },
                                children: "AI法务",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                onClick: handleOpenTranslateModal,
                                className: "video-button video-button-primary",
                                style: { flex: 1 },
                                children: "翻译文案",
                              }),
                            ],
                          },
                        ),
                      }),
                    ],
                  },
                ),
            ],
          }),
        ],
      }),
      showTranslateModal &&
        /* @__PURE__ */ jsxRuntimeExports.jsx(TranslateModal, {
          show: showTranslateModal,
          sourceLanguage,
          targetLanguage,
          setSourceLanguage,
          setTargetLanguage,
          rewrittenScript,
          setRewrittenScript,
          translatedText,
          setTranslatedText,
          isTranslating,
          translateProgress,
          onClose: handleCloseTranslateModal,
          onTranslate: handleTranslate,
          onComplete: handleCompleteTranslate,
        }),
      showAiLegalModal &&
        /* @__PURE__ */ jsxRuntimeExports.jsx(AiLegalModal, {
          show: showAiLegalModal,
          originalText: rewrittenScript.trim() || originalScript.trim(),
          reviewedText: aiLegalReviewedText,
          setReviewedText: setAiLegalReviewedText,
          suggestions: aiLegalSuggestions,
          setSuggestions: setAiLegalSuggestions,
          edits: aiLegalEdits,
          isReviewing: isAiLegalReviewing,
          progress: aiLegalProgress,
          onClose: handleCloseAiLegalModal,
          onReview: handleAiLegalReview,
          onComplete: (reviewed, _suggestions) =>
            handleCompleteAiLegal(reviewed),
        }),
      showIpBrainModal &&
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
          className: "video-modal-overlay",
          onClick: (e) => {
            if (e.target === e.currentTarget) setShowIpBrainModal(false);
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
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-modal-content ipbrain-profile-modal",
            style: {
              backgroundColor: "var(--ly-surface-solid)",
              borderRadius: "8px",
              padding: "20px 22px",
              width: "90%",
              maxWidth: "720px",
              maxHeight: "70vh",
              overflow: "auto",
              position: "relative",
              border: "1px solid var(--ly-border)",
              boxShadow: "var(--ly-shadow-lg)",
            },
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                onClick: () => setShowIpBrainModal(false),
                style: {
                  position: "absolute",
                  top: 12,
                  right: 12,
                  border: "none",
                  background: "transparent",
                  fontSize: 18,
                  cursor: "pointer",
                  color: "var(--ly-text-2)",
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  transition: "background-color 0.2s",
                },
                onMouseEnter: (e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(148, 163, 184, 0.16)";
                },
                onMouseLeave: (e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                },
                "aria-label": "关闭",
                children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", {
                  width: "14",
                  height: "14",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: "2",
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("line", {
                      x1: "18",
                      y1: "6",
                      x2: "6",
                      y2: "18",
                    }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("line", {
                      x1: "6",
                      y1: "6",
                      x2: "18",
                      y2: "18",
                    }),
                  ],
                }),
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                style: {
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--ly-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", {
                  style: {
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--ly-text)",
                  },
                  children: "借东风",
                }),
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                style: { marginBottom: 12 },
                children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                  style: {
                    display: "inline-flex",
                    padding: 2,
                    borderRadius: 999,
                    border: "1px solid var(--ly-border)",
                    background: "rgba(148, 163, 184, 0.12)",
                  },
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                      type: "button",
                      onClick: () => setIpBrainModalTab("create"),
                      style: {
                        border: "none",
                        borderRadius: 999,
                        padding: "4px 14px",
                        fontSize: 12,
                        cursor: "pointer",
                        background:
                          ipBrainModalTab === "create"
                            ? "var(--ly-primary-soft)"
                            : "transparent",
                        color:
                          ipBrainModalTab === "create"
                            ? "var(--ly-primary-2)"
                            : "var(--ly-text-2)",
                        fontWeight: ipBrainModalTab === "create" ? 600 : 500,
                        transition:
                          "background-color 0.15s ease, color 0.15s ease",
                      },
                      children: "新增档案",
                    }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                      type: "button",
                      onClick: () => setIpBrainModalTab("select"),
                      style: {
                        border: "none",
                        borderRadius: 999,
                        padding: "4px 14px",
                        fontSize: 12,
                        cursor: "pointer",
                        background:
                          ipBrainModalTab === "select"
                            ? "var(--ly-primary-soft)"
                            : "transparent",
                        color:
                          ipBrainModalTab === "select"
                            ? "var(--ly-primary-2)"
                            : "var(--ly-text-2)",
                        fontWeight: ipBrainModalTab === "select" ? 600 : 500,
                        transition:
                          "background-color 0.15s ease, color 0.15s ease",
                      },
                      children: "选择已有档案",
                    }),
                  ],
                }),
              }),
              ipBrainModalTab === "create"
                ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      marginBottom: 12,
                    },
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "档案名称",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                            type: "text",
                            value: ipBrainName,
                            onChange: (e) => setIpBrainName(e.target.value),
                            placeholder:
                              "请输入IP 档案名称，例如：个人账号 / 品牌名..",
                            className: "video-input",
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "主页地址",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
                            type: "text",
                            value: ipBrainHomepage,
                            onChange: (e) => setIpBrainHomepage(e.target.value),
                            placeholder: "请输入抖音主页或其他主要阵地链接...",
                            className: "video-input",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", {
                            style: {
                              margin: "4px 0 0",
                              fontSize: 11,
                              color: "var(--ly-text-3)",
                              lineHeight: 1.4,
                            },
                            children: [
                              "格式示例：",
                              /* @__PURE__ */ jsxRuntimeExports.jsx("code", {
                                style: { fontFamily: "monospace" },
                                children:
                                  "https://www.douyin.com/user/xxx?from_tab_name=main",
                              }),
                              "新建议直接粘贴电脑端或手机端分享名片里的主页链接。如链接地址填错，将无法正常分析该博主。",
                            ],
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "深度学习模式",
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            className: "ipbrain-deep-learn-stack",
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("button", {
                                type: "button",
                                onClick: () => setIpBrainDeepLearn(false),
                                className: `ipbrain-deep-learn-btn ${ipBrainDeepLearn ? "ipbrain-deep-learn-btn--off" : "ipbrain-deep-learn-btn--on"}`,
                                style: {
                                  textAlign: "left",
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: ipBrainDeepLearn
                                    ? "1px solid var(--ly-border)"
                                    : "1px solid var(--ly-primary)",
                                  background: ipBrainDeepLearn
                                    ? "var(--ly-bg-soft)"
                                    : "var(--ly-primary-soft)",
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 4,
                                },
                                children: [
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "span",
                                    {
                                      className: "ipbrain-deep-learn-title",
                                      style: {
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: "var(--ly-text)",
                                      },
                                      children: "学习选题和浅度分析写作分析,
                                    },
                                  ),
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "span",
                                    {
                                      className: "ipbrain-deep-learn-desc",
                                      style: {
                                        fontSize: 12,
                                        color: "var(--ly-text-3)",
                                      },
                                      children:
                                        "快速分析博主近期视频选题，适合快速模仿选题思路",
                                    },
                                  ),
                                ],
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("button", {
                                type: "button",
                                onClick: () => setIpBrainDeepLearn(true),
                                className: `ipbrain-deep-learn-btn ${ipBrainDeepLearn ? "ipbrain-deep-learn-btn--on" : "ipbrain-deep-learn-btn--off"}`,
                                style: {
                                  textAlign: "left",
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: ipBrainDeepLearn
                                    ? "1px solid var(--ly-primary)"
                                    : "1px solid var(--ly-border)",
                                  background: ipBrainDeepLearn
                                    ? "var(--ly-primary-soft)"
                                    : "var(--ly-bg-soft)",
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 4,
                                },
                                children: [
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "span",
                                    {
                                      className: "ipbrain-deep-learn-title",
                                      style: {
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: "var(--ly-text)",
                                      },
                                      children: "深度学习写作风格",
                                    },
                                  ),
                                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                                    "span",
                                    {
                                      className: "ipbrain-deep-learn-desc",
                                      style: {
                                        fontSize: 12,
                                        color: "var(--ly-text-3)",
                                      },
                                      children: "深度模仿语言风格（耗时较长）",
                                    },
                                  ),
                                ],
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  })
                : /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                    style: { marginBottom: 12 },
                    children:
                      ipBrainProfiles.length === 0
                        ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                            style: {
                              padding: "24px 12px",
                              textAlign: "center",
                              fontSize: 13,
                              color: "var(--ly-text-3)",
                            },
                            children:
                              "暂无已保存的 IP 档案，请先在「新增档案」中创建。",
                          })
                        : /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              maxHeight: "40vh",
                              overflowY: "auto",
                            },
                            children: ipBrainProfiles.map((p) =>
                              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                "div",
                                {
                                  className: "ipbrain-profile-item",
                                  style: {
                                    borderRadius: 8,
                                    border: "1px solid var(--ly-border)",
                                    padding: "8px 10px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                    background: "var(--ly-bg-soft)",
                                  },
                                  children: [
                                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        style: {
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          gap: 8,
                                        },
                                        children: [
                                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                                            "div",
                                            {
                                              style: {
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: "var(--ly-text)",
                                              },
                                              children:
                                                p.name || "未命名借东风,
                                            },
                                          ),
                                          /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              style: {
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                              },
                                              children: [
                                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                  "button",
                                                  {
                                                    type: "button",
                                                    className:
                                                      "video-button video-button-primary",
                                                    style: {
                                                      width: "auto",
                                                      paddingInline: 12,
                                                      fontSize: 12,
                                                    },
                                                    onClick: () => {
                                                      setIpBrain(p);
                                                      setShowIpBrainModal(
                                                        false,
                                                      );
                                                    },
                                                    children: "使用",
                                                  },
                                                ),
                                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                  "button",
                                                  {
                                                    type: "button",
                                                    "aria-label": "移除档案",
                                                    title: "移除档案",
                                                    style: {
                                                      width: 20,
                                                      height: 20,
                                                      borderRadius: 999,
                                                      border: "none",
                                                      background: "transparent",
                                                      display: "flex",
                                                      alignItems: "center",
                                                      justifyContent: "center",
                                                      cursor: "pointer",
                                                      color: "var(--ly-text-3)",
                                                      transition:
                                                        "background-color 0.15s ease, color 0.15s ease",
                                                    },
                                                    onMouseEnter: (e) => {
                                                      e.currentTarget.style.backgroundColor =
                                                        "var(--ly-danger-soft)";
                                                      e.currentTarget.style.color =
                                                        "var(--ly-danger)";
                                                    },
                                                    onMouseLeave: (e) => {
                                                      e.currentTarget.style.backgroundColor =
                                                        "transparent";
                                                      e.currentTarget.style.color =
                                                        "var(--ly-text-3)";
                                                    },
                                                    onClick: () => {
                                                      setIpBrainProfiles(
                                                        (prev) =>
                                                          prev.filter(
                                                            (x) =>
                                                              x.id !== p.id,
                                                          ),
                                                      );
                                                      if (ipBrain?.id === p.id)
                                                        setIpBrain(null);
                                                    },
                                                    children:
                                                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                                        "svg",
                                                        {
                                                          width: "10",
                                                          height: "10",
                                                          viewBox: "0 0 24 24",
                                                          fill: "none",
                                                          stroke:
                                                            "currentColor",
                                                          strokeWidth: "2",
                                                          strokeLinecap:
                                                            "round",
                                                          strokeLinejoin:
                                                            "round",
                                                          children: [
                                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                              "line",
                                                              {
                                                                x1: "18",
                                                                y1: "6",
                                                                x2: "6",
                                                                y2: "18",
                                                              },
                                                            ),
                                                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                                                              "line",
                                                              {
                                                                x1: "6",
                                                                y1: "6",
                                                                x2: "18",
                                                                y2: "18",
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
                                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                                      "div",
                                      {
                                        style: {
                                          fontSize: 11,
                                          color: "var(--ly-text-3)",
                                        },
                                        children:
                                          p.homepage || "未填写主页地址",
                                      },
                                    ),
                                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        style: {
                                          fontSize: 11,
                                          color: "var(--ly-text-3)",
                                          display: "flex",
                                          gap: 8,
                                        },
                                        children: [
                                          /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                            "span",
                                            {
                                              children: [
                                                "创建时间戳,
                                                p.createdAt,
                                              ],
                                            },
                                          ),
                                          /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                            "span",
                                            {
                                              children: [
                                                "深度学习：",
                                                p.deepLearn ? "�? : "�?,
                                              ],
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                  ],
                                },
                                p.id,
                              ),
                            ),
                          }),
                  }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                style: {
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 8,
                },
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                    type: "button",
                    className: "video-button video-button-outline",
                    style: { width: "auto", paddingInline: 14 },
                    onClick: () => setShowIpBrainModal(false),
                    children: "取消",
                  }),
                  ipBrainModalTab === "create" &&
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                      type: "button",
                      className: "video-button video-button-primary",
                      style: { width: "auto", paddingInline: 14 },
                      onClick: () => {
                        const name = ipBrainName.trim() || "未命名借东风;
                        const homepage = ipBrainHomepage.trim();
                        const now = /* @__PURE__ */ new Date();
                        const profile = {
                          id: String(Date.now()),
                          name,
                          homepage,
                          createdAt: now.toLocaleString(),
                          deepLearn: ipBrainDeepLearn,
                        };
                        setIpBrainProfiles((prev) => [...prev, profile]);
                        setIpBrain(profile);
                        setShowIpBrainModal(false);
                        setIpBrainName("");
                        setIpBrainHomepage("");
                        setIpBrainDeepLearn(false);
                      },
                      children: "完成",
                    }),
                ],
              }),
            ],
          }),
        }),
      showTopicModal &&
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
          className: "video-modal-overlay",
          onClick: (e) => {
            if (e.target === e.currentTarget && !isTopicAnalyzing)
              setShowTopicModal(false);
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
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
            className: "video-modal-content ipbrain-topic-modal",
            style: {
              backgroundColor: "var(--ly-surface-solid)",
              borderRadius: "8px",
              padding: "20px 22px",
              width: "90%",
              maxWidth: "720px",
              maxHeight: "70vh",
              overflow: "auto",
              position: "relative",
              border: "1px solid var(--ly-border)",
              boxShadow: "var(--ly-shadow-lg)",
            },
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                onClick: () => {
                  if (!isTopicAnalyzing) setShowTopicModal(false);
                },
                style: {
                  position: "absolute",
                  top: 12,
                  right: 12,
                  border: "none",
                  background: "transparent",
                  fontSize: 18,
                  cursor: isTopicAnalyzing ? "not-allowed" : "pointer",
                  color: "var(--ly-text-2)",
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  transition: "background-color 0.2s",
                },
                disabled: isTopicAnalyzing,
                onMouseEnter: (e) => {
                  if (isTopicAnalyzing) return;
                  e.currentTarget.style.backgroundColor =
                    "rgba(148, 163, 184, 0.16)";
                },
                onMouseLeave: (e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                },
                "aria-label": "关闭",
                children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", {
                  width: "14",
                  height: "14",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: "2",
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("line", {
                      x1: "18",
                      y1: "6",
                      x2: "6",
                      y2: "18",
                    }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("line", {
                      x1: "6",
                      y1: "6",
                      x2: "18",
                      y2: "18",
                    }),
                  ],
                }),
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                style: {
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--ly-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", {
                  style: {
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--ly-text)",
                  },
                  children: "借东风选题分析",
                }),
              }),
              isTopicAnalyzing || isTopicScriptsLoading
                ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                    className: "ipbrain-topic-loading",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                      className: "ipbrain-topic-loading-inner",
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                          className: "ipbrain-topic-orbit",
                          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                            "div",
                            { className: "ipbrain-topic-orbit-dot" },
                          ),
                        }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                          children: isTopicAnalyzing
                            ? topicStage === "style"
                              ? "AI 正在解析该账号的整体风格与选题脉络…"
                              : "AI 正在为该账号生成一批新的推荐选题"
                            : "AI 正在围绕当前选题打磨多种文案表达…",
                        }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                          className: "ipbrain-topic-loading-text-sub",
                          children: "这可能需要几秒钟，请稍候",
                        }),
                      ],
                    }),
                  })
                : selectedTopic && (topicScripts.length > 0 || topicError)
                  ? // 推荐文案视图
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                      children: [
                        topicError &&
                          /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                            style: {
                              marginBottom: 12,
                              padding: "10px 10px",
                              borderRadius: 8,
                              background: "var(--ly-danger-soft)",
                              color: "var(--ly-danger)",
                              fontSize: 13,
                            },
                            children: topicError,
                          }),
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                          style: {
                            marginBottom: 6,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 8,
                          },
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                              style: {
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--ly-text-2)",
                              },
                              children: "基于选题的推荐文案",
                            }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                              type: "button",
                              className: "video-button video-button-outline",
                              style: {
                                width: "auto",
                                paddingInline: 10,
                                fontSize: 12,
                              },
                              onClick: () =>
                                handleGenerateScriptsForTopic(
                                  selectedTopic,
                                  "refresh",
                                ),
                              disabled: isTopicScriptsLoading,
                              children: "换一批",
                            }),
                          ],
                        }),
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                          style: {
                            marginBottom: 8,
                            fontSize: 12,
                            color: "var(--ly-text-3)",
                          },
                          children: ["当前选题：", selectedTopic],
                        }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          },
                          children: topicScripts.map((script, idx) =>
                            /* @__PURE__ */ jsxRuntimeExports.jsxs(
                              "div",
                              {
                                className: "ipbrain-topic-script-card",
                                style: {
                                  borderRadius: 8,
                                  border: "1px solid var(--ly-border)",
                                  padding: "8px 10px",
                                  background: "var(--ly-surface)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                },
                                children: [
                                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className: "ipbrain-topic-script-label",
                                      style: {
                                        fontSize: 12,
                                        color: "var(--ly-text-3)",
                                      },
                                      children: ["文案 ", idx + 1],
                                    },
                                  ),
                                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                                    className: "ipbrain-topic-script-body",
                                    style: {
                                      fontSize: 13,
                                      color: "var(--ly-text)",
                                      whiteSpace: "pre-wrap",
                                      lineHeight: 1.7,
                                    },
                                    children: script,
                                  }),
                                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                                    style: {
                                      display: "flex",
                                      justifyContent: "flex-end",
                                      marginTop: 4,
                                    },
                                    children:
                                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                                        "button",
                                        {
                                          type: "button",
                                          className:
                                            "video-button video-button-primary",
                                          style: {
                                            width: "auto",
                                            paddingInline: 10,
                                            fontSize: 12,
                                          },
                                          onClick: () => {
                                            setScriptMode("ipBrain");
                                            setRewrittenScript(script);
                                            setShowTopicModal(false);
                                            showToast(
                                              "已将文案写入 借东风文案区域",
                                              "success",
                                            );
                                          },
                                          children: "使用",
                                        },
                                      ),
                                  }),
                                ],
                              },
                              `${idx}-${script.slice(0, 30)}`,
                            ),
                          ),
                        }),
                      ],
                    })
                  : // 风格与定位+ 推荐选题视图
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      jsxRuntimeExports.Fragment,
                      {
                        children: [
                          topicError &&
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                              style: {
                                marginBottom: 12,
                                padding: "10px 10px",
                                borderRadius: 8,
                                background: "var(--ly-danger-soft)",
                                color: "var(--ly-danger)",
                                fontSize: 13,
                              },
                              children: topicError,
                            }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            style: { marginBottom: 12 },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                                style: {
                                  marginBottom: 6,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--ly-text-2)",
                                },
                                children: "风格与定位分析",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "textarea",
                                {
                                  readOnly: true,
                                  value: topicStyleText,
                                  placeholder: "还没有分析结果",
                                  className: "ipbrain-topic-style-textarea",
                                  style: {
                                    width: "100%",
                                    minHeight: 120,
                                    resize: "vertical",
                                    borderRadius: 6,
                                    border: "1px solid var(--ly-border)",
                                    padding: "8px 10px",
                                    fontSize: 13,
                                    lineHeight: 1.6,
                                    backgroundColor: "var(--ly-bg-soft)",
                                    color: "var(--ly-text)",
                                    boxSizing: "border-box",
                                  },
                                },
                              ),
                            ],
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            style: {
                              marginBottom: 8,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            },
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                                style: {
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--ly-text-2)",
                                },
                                children: "推荐选题",
                              }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
                                type: "button",
                                className: "video-button video-button-outline",
                                style: {
                                  width: "auto",
                                  paddingInline: 10,
                                  fontSize: 12,
                                },
                                onClick: handleRefreshTopicIdeas,
                                disabled: !topicPostsSnapshot,
                                children: "换一批",
                              }),
                            ],
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
                            style: {
                              marginBottom: 12,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            },
                            children: [
                              topicIdeas.length === 0 &&
                                !topicError &&
                                /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                                  style: {
                                    fontSize: 12,
                                    color: "var(--ly-text-3)",
                                  },
                                  children:
                                    "尚未生成推荐选题，请先执行一次选题分析。",
                                }),
                              topicIdeas.map((idea, idx) =>
                                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                  "div",
                                  {
                                    className: "ipbrain-topic-idea-item",
                                    style: {
                                      borderRadius: 8,
                                      border: "1px solid var(--ly-border)",
                                      padding: "8px 10px",
                                      display: "flex",
                                      alignItems: "flex-start",
                                      justifyContent: "space-between",
                                      gap: 8,
                                      background: "var(--ly-bg-soft)",
                                    },
                                    children: [
                                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                        "div",
                                        {
                                          className: "ipbrain-topic-idea-main",
                                          style: {
                                            fontSize: 13,
                                            color: "var(--ly-text)",
                                            flex: 1,
                                          },
                                          children: [
                                            /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                              "span",
                                              {
                                                className:
                                                  "ipbrain-topic-idea-num",
                                                style: {
                                                  marginRight: 4,
                                                  color: "var(--ly-text-3)",
                                                },
                                                children: [idx + 1, "."],
                                              },
                                            ),
                                            idea,
                                          ],
                                        },
                                      ),
                                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                                        "button",
                                        {
                                          type: "button",
                                          className:
                                            "video-button video-button-primary",
                                          style: {
                                            width: "auto",
                                            paddingInline: 10,
                                            fontSize: 12,
                                            whiteSpace: "nowrap",
                                          },
                                          onClick: () =>
                                            handleGenerateScriptsForTopic(idea),
                                          children: "去创建,
                                        },
                                      ),
                                    ],
                                  },
                                  `${idx}-${idea.slice(0, 30)}`,
                                ),
                              ),
                            ],
                          }),
                        ],
                      },
                    ),
            ],
          }),
        }),
      phoneModal.showPhoneModal &&
        phoneModal.phoneModalVideoSrc &&
        /* @__PURE__ */ jsxRuntimeExports.jsx(PhoneModal, {
          ...phoneModal.phoneModalProps,
        }),
    ],
  });
}
const TTS_EMOTION_CUSTOM_VALUE = "__custom__";
function sliceTtsEmotionCustomTextMax(str, max = 8) {
  return [...str].slice(0, max).join("");
}
function resolveTtsEmotionForPlugin(ttsEmotion, ttsEmotionCustomText) {
  if (ttsEmotion === TTS_EMOTION_CUSTOM_VALUE) {
    return sliceTtsEmotionCustomTextMax((ttsEmotionCustomText || "").trim(), 8);
  }
  return (ttsEmotion || "").trim();
}
var reactDomExports = requireReactDom();
function AudioPreviewSelect(props) {
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
  const rootRef = reactExports.useRef(null);
  const triggerRef = reactExports.useRef(null);
  const menuRef = reactExports.useRef(null);
  const audioRef = reactExports.useRef(null);
  const urlCacheByPathRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const [isOpen, setIsOpen] = reactExports.useState(false);
  const [previewingId, setPreviewingId] = reactExports.useState(null);
  const [isPlaying, setIsPlaying] = reactExports.useState(false);
  const [menuDirection, setMenuDirection] = reactExports.useState("down");
  const [anchorRect, setAnchorRect] = reactExports.useState(null);
  const selected = reactExports.useMemo(
    () => options.find((o) => o.id === value) || null,
    [options, value],
  );
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
  reactExports.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      const localCache = urlCacheByPathRef.current;
      for (const opt of options) {
        if (cancelled) return;
        if (!opt.path) continue;
        if (localCache.has(opt.path)) continue;
        try {
          const res = await window.api.getLocalFileUrl(opt.path);
          if (!res.success || !res.url) continue;
          localCache.set(opt.path, res.url);
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, options]);
  const ensurePreviewUrl = async (opt) => {
    const cache = urlCacheByPathRef.current;
    const cached = cache.get(opt.path);
    if (cached) return cached;
    const res = await window.api.getLocalFileUrl(opt.path);
    if (!res.success || !res.url) {
      throw new Error(res.error || "无法播放音频");
    }
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
      const msg = e instanceof Error ? e.message : "无法播放音频";
      showToast?.(msg, "error");
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
    ref: rootRef,
    className: `audio-preview-select ${disabled ? "disabled" : ""} ${className}`,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", {
        ref: triggerRef,
        className: `audio-preview-select-trigger ${isOpen ? "open" : ""}`,
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
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
            className: "audio-preview-select-play-inline",
            children: selected
              ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
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
                      ? /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", {
                          width: "16",
                          height: "16",
                          viewBox: "0 0 16 16",
                          fill: "currentColor",
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("rect", {
                              x: "4",
                              y: "3",
                              width: "3",
                              height: "10",
                              rx: "1",
                            }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("rect", {
                              x: "9",
                              y: "3",
                              width: "3",
                              height: "10",
                              rx: "1",
                            }),
                          ],
                        })
                      : /* @__PURE__ */ jsxRuntimeExports.jsx("svg", {
                          width: "16",
                          height: "16",
                          viewBox: "0 0 16 16",
                          fill: "currentColor",
                          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                            "path",
                            { d: "M6 4.2V11.8L12 8L6 4.2Z" },
                          ),
                        }),
                })
              : null,
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
            className: "audio-preview-select-text",
            children: selected ? selected.name : placeholder,
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
            className: "audio-preview-select-caret",
          }),
        ],
      }),
      isOpen
        ? reactDomExports.createPortal(
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
              ref: menuRef,
              className: "audio-preview-select-menu",
              style: menuPositionStyle,
              children: options.length
                ? options.map((opt) => {
                    const isSelected = opt.id === value;
                    const isOptPlaying = previewingId === opt.id && isPlaying;
                    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "div",
                      {
                        className: `audio-preview-select-item ${isSelected ? "selected" : ""}`,
                        role: "option",
                        "aria-selected": isSelected,
                        onClick: () => {
                          if (disabled) return;
                          onChange(opt.id);
                          setIsOpen(false);
                          if (previewOnSelect) void play(opt);
                        },
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("button", {
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
                              ? /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", {
                                  width: "16",
                                  height: "16",
                                  viewBox: "0 0 16 16",
                                  fill: "currentColor",
                                  children: [
                                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                                      "rect",
                                      {
                                        x: "4",
                                        y: "3",
                                        width: "3",
                                        height: "10",
                                        rx: "1",
                                      },
                                    ),
                                    /* @__PURE__ */ jsxRuntimeExports.jsx(
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
                                })
                              : /* @__PURE__ */ jsxRuntimeExports.jsx("svg", {
                                  width: "16",
                                  height: "16",
                                  viewBox: "0 0 16 16",
                                  fill: "currentColor",
                                  children:
                                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                                      "path",
                                      { d: "M6 4.2V11.8L12 8L6 4.2Z" },
                                    ),
                                }),
                          }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
                            className: "audio-preview-select-item-name",
                            children: opt.name,
                          }),
                        ],
                      },
                      opt.id,
                    );
                  })
                : /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
                    className: "audio-preview-select-empty",
                    children: placeholder,
                  }),
            }),
            document.body,
          )
        : null,
      /* @__PURE__ */ jsxRuntimeExports.jsx("audio", {
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
function RangeValueTooltip({
  min,
  max,
  step,
  value,
  disabled = false,
  className = "",
  onChange,
  format,
}) {
  const inputRef = reactExports.useRef(null);
  const [visible, setVisible] = reactExports.useState(false);
  const [pos, setPos] = reactExports.useState({
    left: 0,
    top: 0,
    direction: "up",
  });
  const displayText = reactExports.useMemo(() => {
    if (format) return format(value);
    return String(value);
  }, [format, value]);
  const ratio = reactExports.useMemo(() => {
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
    const direction =
      spaceAbove >= 28 || spaceAbove >= spaceBelow ? "up" : "down";
    const top = direction === "up" ? rect.top - 8 : rect.bottom + 8;
    setPos({ left: x, top, direction });
  };
  reactExports.useEffect(() => {
    if (!visible) return;
    computePos();
    const onScroll = () => computePos();
    const onResize = () => computePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [visible, ratio]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, {
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
        ref: inputRef,
        type: "range",
        min,
        max,
        step,
        value,
        disabled,
        className,
        onChange: (e) => onChange(Number(e.target.value)),
        onMouseEnter: () => {
          if (disabled) return;
          setVisible(true);
        },
        onMouseLeave: () => setVisible(false),
      }),
      visible
        ? reactDomExports.createPortal(
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
              className: `range-value-tooltip ${pos.direction === "down" ? "down" : "up"}`,
              style: { left: pos.left, top: pos.top },
              children: displayText,
            }),
            document.body,
          )
        : null,
    ],
  });
}