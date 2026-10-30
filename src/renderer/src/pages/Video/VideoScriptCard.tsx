// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom'
import { jsxRuntimeExports } from '../../utils/jsxRuntime'
import { useVideoPageStore } from '../../store/VideoPageStore'
import { useUserInfoStore } from '../../store/UserInfoStore'
import { useToast } from '../../hooks/useToast'
import { usePhoneModal } from '../../hooks/usePhoneModal'
import { AiLegalModal } from '../../components/AiLegalModal'
import { TranslateModal } from '../../components/TranslateModal'
import { PhoneModal } from '../../components/PhoneModal'
import { CHANNEL } from '../../config/channel'
import {
  formatDouyinProfileError,
  applyResolvedDouyinProfile,
  validateHomepageForTopicAnalysis,
  normalizeDouyinUrlForDownloader,
  DOUYIN_HOMEPAGE_HINT,
} from '../../utils/douyinUrlHelpers'

// API Services
import { llmService } from '../../api/llm'
import { templateService } from '../../api/template'
import { exceptionService } from '../../api/exception'

// Language name mapping
const LANG_NAME_MAP: Record<string, string> = {
  'zh': '中文',
  'en': '英语',
  'ja': '日语',
  'ko': '韩语',
  'es': '西班牙语',
  'fr': '法语',
  'de': '德语',
  'pt': '葡萄牙语',
  'ru': '俄语',
  'ar': '阿拉伯语',
}
const getLanguageName = (code: string) => LANG_NAME_MAP[code] || code

function getPostDescription(post) {
  if (!post || typeof post !== "object") return "";
  return String(
    post.desc ||
      post.description ||
      post.title ||
      post.text ||
      post.caption ||
      post.content ||
      "",
  ).trim();
}

function buildPostDescLines(posts, limit = 30) {
  return posts
    .map(getPostDescription)
    .filter(Boolean)
    .slice(0, limit)
    .map((desc, idx) => `${idx + 1}. ${desc}`)
    .join("\n");
}

const TOPIC_ANALYSIS_GUARDRAIL =
  "必须严格依据下方真实视频文案归纳，不得编造与文案无关的行业、技术或热点话题；如果文案以读稿、口播、直播回放为主，应识别为读稿/口播类账号。";

// Legal keywords pattern for compliance check
const LEGAL_KEYWORDS_PATTERN = /最(?:好|佳|强|大|优|高|低|新|快|便宜|安全|先进|权威)|第一|唯一|首选|首个|冠军|顶[级尖]|极[致品]|王牌|绝对|100%|百分之百|完全(?:无|没)|永[远不]|万能|全能|治愈|根治|永不反弹|无效退款|药到病除|一次见效|国家级|世界级|驰名|特[供效]|专供|指定|销量第一|全网最|零风险|无副作用|纯天然|独一无二|史无前例|前所未有/g

const LOCAL_LEGAL_REVIEW_RULES = [
  { pattern: /全网最低价/g, replacement: "实惠价格", reason: "包含绝对化低价承诺，容易被认定为极限化广告用语" },
  { pattern: /销量第一/g, replacement: "销量表现较好", reason: "涉及排名第一的广告声称，需充分证明" },
  { pattern: /一考定终身/g, replacement: "一考影响深远", reason: "容易制造升学焦虑和绝对化结果判断" },
  { pattern: /世界名校/g, replacement: "知名院校", reason: "名校背书表述较绝对，建议弱化" },
  { pattern: /官方高中学籍/g, replacement: "高中学籍", reason: "官方背书类表述需明确资质依据" },
  { pattern: /录取率直接翻倍/g, replacement: "录取机会有望提升", reason: "对录取效果作确定性承诺，存在夸大风险" },
  { pattern: /直接翻倍/g, replacement: "有望提升", reason: "效果提升幅度过于确定，建议弱化" },
  { pattern: /独享/g, replacement: "享有", reason: "排他性权益表述需充分证明" },
  { pattern: /全程督学/g, replacement: "持续督学", reason: "服务覆盖范围过于绝对，建议弱化" },
  { pattern: /全额奖学金/g, replacement: "奖学金", reason: "奖学金结果表述需避免暗示确定获得" },
  { pattern: /国企联合高校办学/g, replacement: "联合办学", reason: "权威背书及合作办学表述需明确证明材料" },
  { pattern: /国家级/g, replacement: "高规格", reason: "属于权威背书类敏感表述" },
  { pattern: /世界级/g, replacement: "高水平", reason: "属于绝对化或权威背书类表述" },
  { pattern: /唯一/g, replacement: "特色", reason: "排他性绝对化表述" },
  { pattern: /第一/g, replacement: "领先", reason: "排名第一类表述需充分证明" },
  { pattern: /100%|百分之百/g, replacement: "较高", reason: "绝对化承诺表述" },
  { pattern: /零风险/g, replacement: "风险较低", reason: "绝对化风险承诺" },
  { pattern: /治愈|根治|药到病除|一次见效/g, replacement: "改善", reason: "效果承诺过于绝对" },
  { pattern: /最(?:好|佳|强|大|优|高|低|新|快|便宜|安全|先进|权威)/g, replacement: "较优", reason: "包含极限词，建议弱化" },
]


// Token refresh helper
const refreshTokenOnce = async () => {
  // Placeholder - implement token refresh if needed
}

// Check if error is user cancelled
function isUserCancelledPluginError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "")
  return msg === "已取消" || msg.includes("已取消")
}
const LANG_OPTIONS = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'es', label: '西班牙语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
  { value: 'pt', label: '葡萄牙语' },
  { value: 'ru', label: '俄语' },
  { value: 'ar', label: '阿拉伯语' },
]

function toFilePreviewUrl(filePath) {
  if (!filePath) return "";
  if (/^https?:\/\//i.test(filePath) || /^file:\/\//i.test(filePath)) return filePath;
  const normalized = String(filePath).replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

function getImmediatePreviewUrl(sourcePath, file) {
  if (sourcePath) return toFilePreviewUrl(sourcePath);
  if (file && typeof URL !== "undefined" && URL.createObjectURL) {
    return URL.createObjectURL(file);
  }
  return "";
}

async function copyReferenceVideoToUserData(sourcePath, fileName, file) {
  if (window.api.copyLocalFileToUserData && sourcePath) {
    return window.api.copyLocalFileToUserData(sourcePath, fileName, "temp/reference-videos");
  }

  if (sourcePath && window.api.readFileAsBase64 && window.api.saveFileFromBase64) {
    const fileData = await window.api.readFileAsBase64(sourcePath);
    const base64 = typeof fileData === "string" ? fileData : fileData?.base64;
    if (base64) return window.api.saveFileFromBase64(base64, fileName, "temp/reference-videos");
  }

  if (file && window.api.saveFileFromBase64) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = String(event.target?.result || "");
        resolve(dataUrl.split(",")[1] || "");
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    if (base64) return window.api.saveFileFromBase64(base64, fileName, "temp/reference-videos");
  }

  return { success: true, file_path: sourcePath };
}

function stripModelJsonDecorators(content: string) {
  return String(content ?? "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function decodeLooseJsonString(value: string) {
  return value.replace(/\\(["\\/bfnrt])/g, (_, ch) => {
    switch (ch) {
      case '"':
        return '"';
      case '\\':
        return '\\';
      case '/':
        return '/';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return ch;
    }
  });
}

function extractModelStringField(content: string, field: string): string | null {
  const cleaned = stripModelJsonDecorators(content);
  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned);
    const value = parsed?.[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // 继续尝试从模型输出中做容错提取
  }

  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const strictMatch = cleaned.match(
    new RegExp(
      `"${escapedField}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"(?=\\s*[},\\]]|\\s*$)`,
    ),
  );
  if (strictMatch?.[1]) {
    const value = decodeLooseJsonString(strictMatch[1]).trim();
    if (value) return value;
  }

  const looseMatch = cleaned.match(
    new RegExp(`"${escapedField}"\\s*:\\s*"([\\s\\S]*)"\\s*[}\\]]?\\s*$`),
  );
  if (looseMatch?.[1]) {
    const value = decodeLooseJsonString(looseMatch[1]).trim();
    if (value) return value;
  }

  return null;
}

export function VideoScriptCard() {
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
  const fixedLlmModel = (llmModels || [])[0]?.value || llmModel || "DeepSeek";
  // Each run owns its cancellation state: a late result from an earlier run may
  // neither trigger another paid request nor overwrite the current dialog.
  const topicRunRef = useRef(null);
  const beginTopicRun = () => {
    topicRunRef.current?.abort();
    const run = new AbortController();
    topicRunRef.current = run;
    setIsTopicAnalyzing(false);
    setIsTopicScriptsLoading(false);
    setTopicStage("idle");
    return run;
  };
  const isTopicRunActive = (run) =>
    topicRunRef.current === run && !run.signal.aborted;
  useEffect(() => () => topicRunRef.current?.abort(), []);
  const collectTopicPosts = async (homepage, run) => {
    run.signal.throwIfAborted();
    const requestId = crypto.randomUUID();
    const cancel = () => {
      void window.api.cancelDouyinUserPosts(requestId).catch(() => {});
    };
    run.signal.addEventListener("abort", cancel, { once: true });
    try {
      return await window.api.downloadDouyinUserPosts(homepage, requestId);
    } finally {
      run.signal.removeEventListener("abort", cancel);
    }
  };
  const requestTopicLlmContent = async (
    messages,
    options,
    emptyMessage = "AI 暂未生成内容，请稍后重试",
    run,
  ) => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      run.signal.throwIfAborted();
      try {
        const data = await llmService.completion(fixedLlmModel, messages, {
          ...options,
          signal: run.signal,
          temperature:
            attempt === 0
              ? options?.temperature
              : Math.max(0.5, Number(options?.temperature ?? 0.7) - 0.1),
        });
        run.signal.throwIfAborted();
        const responseData = data.data || data;
        const content = responseData?.choices?.[0]?.message?.content?.trim();
        if (content) return content;
        lastError = new Error(emptyMessage);
      } catch (e) {
        run.signal.throwIfAborted();
        lastError = e;
      }
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw lastError || new Error(emptyMessage);
  };
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
                reason: e.reason + "（从长片段中提取）",
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
  const buildLocalLegalReviewResult = (sourceText) => {
    const ranges = [];
    for (const rule of LOCAL_LEGAL_REVIEW_RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of sourceText.matchAll(rule.pattern)) {
        const original = match[0]?.trim();
        if (!original) continue;
        const start = match.index ?? sourceText.indexOf(original);
        const end = start + original.length;
        if (ranges.some((r) => start < r.end && end > r.start)) continue;
        if (ranges.some((r) => r.edit.original === original)) continue;
        ranges.push({
          start,
          end,
          edit: {
            original,
            replacement: rule.replacement,
            reason: rule.reason,
          },
        });
      }
    }
    const edits = ranges
      .sort((a, b) => a.start - b.start)
      .map((range) => range.edit);
    const reviewedText = edits.length
      ? applyEditsToSourceText(sourceText, edits)
      : sourceText;
    const suggestions = edits.length
      ? [
          ...edits.map(
            (edit) =>
              `${edit.original} → ${edit.replacement}：${edit.reason}`,
          ),
          "AI 输出被截断时已启用本地基础合规词库兜底，建议发布前结合资质材料复核。",
        ].join("\n")
      : "文案未发现违禁词。\nAI 输出被截断时已启用本地基础合规词库兜底，建议发布前结合资质材料复核。";
    return { reviewedText, suggestions, edits };
  };
  const shouldUseLocalLegalFallback = (error) => {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return (
      message.includes("模型输出被截断") ||
      message.includes("未生成最终结果") ||
      message.includes("未返回最终结果") ||
      message.includes("API未返回有效结果") ||
      message.includes("法务审核结果为空") ||
      message.includes("AI 未返回有效结果") ||
      message.includes("AI法务服务异常") ||
      message.includes("法务模型接口请求失败") ||
      message.includes("法务模型接口网络异常") ||
      message.includes("HTTP 404") ||
      message.includes("Unexpected token") ||
      message.includes("Unexpected end of JSON input") ||
      message.includes("Failed to fetch") ||
      message.includes("NetworkError")
    );
  };
  const mergeLegalEdits = (primary = [], secondary = []) => {
    const merged = [];
    const seen = new Set();
    for (const edit of [...primary, ...secondary]) {
      const original = (edit?.original || "").trim();
      if (!original) continue;
      const key = original.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(edit);
    }
    return merged;
  };
  const [scriptMode, setScriptMode] = useState("learn");
  const IP_BRAIN_STORAGE_KEY = "qt-ip-brain-profiles";
  const [ipBrain, setIpBrain] = useState(null);
  const [showIpBrainModal, setShowIpBrainModal] = useState(false);
  const [ipBrainProfiles, setIpBrainProfiles] = useState(() => {
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
          name: String(x.name ?? "未命名 学灵感"),
          homepage: String(x.homepage ?? ""),
          createdAt: String(x.createdAt ?? ""),
          deepLearn: Boolean(x.deepLearn),
        }));
    } catch {
      return [];
    }
  });
  const [ipBrainModalTab, setIpBrainModalTab] = useState("create");
  const [ipBrainName, setIpBrainName] = useState("");
  const [ipBrainHomepage, setIpBrainHomepage] = useState("");
  const [ipBrainDeepLearn, setIpBrainDeepLearn] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [isTopicAnalyzing, setIsTopicAnalyzing] = useState(false);
  const [topicStage, setTopicStage] = useState("idle");
  const [topicStyleText, setTopicStyleText] = useState("");
  const [topicIdeas, setTopicIdeas] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [topicScripts, setTopicScripts] = useState([]);
  const [isTopicScriptsLoading, setIsTopicScriptsLoading] =
    useState(false);
  const [topicError, setTopicError] = useState(null);
  const [topicPostsSnapshot, setTopicPostsSnapshot] =
    useState(null);
  useEffect(() => {
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
  const runTopicStyleAnalysisWithPosts = async (posts, run) => {
    if (!isTopicRunActive(run)) return null;
    if (!posts.length) {
      setTopicError("未获取到可用的视频描述，无法分析选题。");
      setIsTopicAnalyzing(false);
      return null;
    }
    try {
      const joined = buildPostDescLines(posts, 30);
      if (!joined) {
        setTopicError(
          "未获取到视频文案，无法分析。读稿/直播类账号建议改用「解析视频」提取口播内容。",
        );
        setIsTopicAnalyzing(false);
        return null;
      }
      const systemPrompt =
        "你是一名资深抖音短视频内容策划和选题分析专家，擅长根据创作者近期视频的文案风格，总结账号定位与风格特点。";
      const userPrompt = `下面是某个抖音账号最近发布的视频文案（desc），每条一行：

${joined}

${TOPIC_ANALYSIS_GUARDRAIL}

请用中文简要总结该账号的整体风格和选题特点，要求：
1. 只输出一段标题为【风格与定位分析】的文字内容；\n2. 正文控制在 3-6 行以内，语言简洁但有概括性；
3. 不要输出其他任何标题、小结或推荐选题；\n4. 不要输出与平台规则明显冲突的内容。\n5. 不要输出任何emoji和特殊标点符号。`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      const content = await requestTopicLlmContent(
        messages,
        {
          temperature: 0.65,
          max_tokens: 1200,
        },
        "风格分析暂未生成有效内容，请稍后重试",
        run,
      );
      if (!isTopicRunActive(run)) return null;
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
      return stylePart;
    } catch (e) {
      if (!isTopicRunActive(run)) return null;
      console.error("学灵感风格分析失败", e);
      setTopicError(e?.message || "风格与定位分析失败，请稍后重试");
      return null;
    } finally {
      if (isTopicRunActive(run)) {
        setIsTopicAnalyzing(false);
        setTopicStage("idle");
      }
    }
  };
  const runTopicIdeasWithPosts = async (posts, reason, styleTextOverride, run) => {
    if (!isTopicRunActive(run)) return;
    if (!posts.length) {
      setTopicError("未获取到可用的视频描述，无法分析选题。");
      setIsTopicAnalyzing(false);
      setTopicStage("idle");
      return;
    }
    try {
      const joined = buildPostDescLines(posts, 30);
      if (!joined) {
        setTopicError(
          "未获取到视频文案，无法生成推荐选题。读稿/直播类账号建议改用「解析视频」。",
        );
        setIsTopicAnalyzing(false);
        setTopicStage("idle");
        return;
      }
      const effectiveStyleText = styleTextOverride ?? topicStyleText;
      const systemPrompt =
        "你是一名资深抖音短视频内容策划和选题分析专家，擅长根据账号的既有风格与定位，给出高质量的后续选题建议。";
      const userPrompt = `下面是该账号的【风格与定位分析】：

${effectiveStyleText || "（风格分析略）"}

这是该账号最近发布的一批视频文案（desc）：

${joined}

${TOPIC_ANALYSIS_GUARDRAIL}

请在保持上述风格与定位不变的前提下，给出 5 个新的后续推荐选题，要求：
1. 只输出标题为【推荐选题】的部分；\n2. 严格给出 5 条，按「1、2、3、4、5」编号；
3. 每个推荐选题用一句话描述清楚拍什么内容，必须贴近上述文案的实际主题与表达方式；\n4. 不要重复上一批已经出现过的表述；
5. 不要输出与平台规则明显冲突的内容。\n6. 不要输出任何emoji和特殊标点符号。`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      const content = await requestTopicLlmContent(
        messages,
        {
          temperature: reason === "initial" ? 0.65 : 0.7,
          max_tokens: 800,
        },
        "推荐选题暂未生成有效内容，请点击换一批重试",
        run,
      );
      if (!isTopicRunActive(run)) return;
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
      if (!isTopicRunActive(run)) return;
      console.error("学灵感推荐选题失败:", e);
      setTopicError(e?.message || "推荐选题生成失败，请稍后重试");
    } finally {
      if (isTopicRunActive(run)) {
        setIsTopicAnalyzing(false);
        setTopicStage("idle");
      }
    }
  };
  const handleOpenTopicAnalysis = async () => {
    if (!ipBrain || !ipBrain.homepage.trim()) {
      showToast("请先在学灵感中填写主页地址", "info");
      return;
    }
    const homepageCheck = validateHomepageForTopicAnalysis(ipBrain.homepage);
    if (!homepageCheck.ok) {
      showToast(homepageCheck.hint || DOUYIN_HOMEPAGE_HINT, "info");
      return;
    }
    const run = beginTopicRun();
    setShowTopicModal(true);
    setIsTopicAnalyzing(true);
    setTopicStage("style");
    setTopicStyleText("");
    setTopicIdeas([]);
    setSelectedTopic(null);
    setTopicScripts([]);
    setTopicError(null);
    setTopicPostsSnapshot(null);
    try {
      const result = await collectTopicPosts(
        normalizeDouyinUrlForDownloader(ipBrain.homepage.trim()) ||
          ipBrain.homepage.trim(),
        run,
      );
      if (!isTopicRunActive(run)) return;
      if (!result?.success) {
        throw new Error(
          formatDouyinProfileError(
            result?.message || result?.error,
            ipBrain.homepage,
          ) || "获取抖音主页视频失败",
        );
      }
      applyResolvedDouyinProfile(
        result,
        ipBrain.id,
        setIpBrain,
        setIpBrainProfiles,
        showToast,
      );
      const posts = result.posts;
      if (!posts || !posts.length) {
        throw new Error("未获取到该账号的近期视频列表");
      }
      setTopicPostsSnapshot(posts);
      const styleText = await runTopicStyleAnalysisWithPosts(posts, run);
      if (!isTopicRunActive(run)) return;
      if (!styleText) {
        setIsTopicAnalyzing(false);
        setTopicStage("idle");
        return;
      }
      setIsTopicAnalyzing(true);
      setTopicStage("ideas");
      await runTopicIdeasWithPosts(posts, "initial", styleText, run);
    } catch (e) {
      if (!isTopicRunActive(run)) return;
      console.error("获取抖音主页视频失败:", e);
      setTopicError(
        formatDouyinProfileError(e?.message, ipBrain?.homepage) ||
          "获取抖音主页视频失败",
      );
      setIsTopicAnalyzing(false);
      setTopicStage("idle");
    }
  };
  const handleCancelTopicAnalysis = () => {
    topicRunRef.current?.abort();
    topicRunRef.current = null;
    setShowTopicModal(false);
    setIsTopicAnalyzing(false);
    setIsTopicScriptsLoading(false);
    setTopicStage("idle");
    setTopicError(null);
  };
  const handleRemoveIpBrain = () => {
    setIpBrain(null);
    handleCancelTopicAnalysis();
  };
  const handleRefreshTopicIdeas = async () => {
    const run = beginTopicRun();
    if (!topicPostsSnapshot || !topicPostsSnapshot.length) {
      if (ipBrain && ipBrain.homepage.trim()) {
        setIsTopicAnalyzing(true);
        setTopicStage("ideas");
        setTopicError(null);
        try {
          const result = await collectTopicPosts(
            normalizeDouyinUrlForDownloader(ipBrain.homepage.trim()) ||
              ipBrain.homepage.trim(),
            run,
          );
          if (!isTopicRunActive(run)) return;
          if (!result?.success) {
            throw new Error(
              formatDouyinProfileError(
                result?.message || result?.error,
                ipBrain.homepage,
              ) || "获取抖音主页视频失败",
            );
          }
          applyResolvedDouyinProfile(
            result,
            ipBrain.id,
            setIpBrain,
            setIpBrainProfiles,
            showToast,
          );
          const posts = result.posts;
          if (!posts || !posts.length) {
            throw new Error("未获取到该账号的近期视频列表");
          }
          setTopicPostsSnapshot(posts);
          const styleText = await runTopicStyleAnalysisWithPosts(posts, run);
          if (!isTopicRunActive(run)) return;
          if (styleText) {
            await runTopicIdeasWithPosts(posts, "refresh", styleText, run);
          }
        } catch (e) {
          if (!isTopicRunActive(run)) return;
          console.error("刷新选题分析失败:", e);
          setTopicError(
            formatDouyinProfileError(e?.message, ipBrain?.homepage) ||
              "刷新选题分析失败",
          );
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
    await runTopicIdeasWithPosts(topicPostsSnapshot, "refresh", topicStyleText, run);
  };
  const handleGenerateScriptsForTopic = async (topic, reason = "initial") => {
    if (!topic) return;
    const run = beginTopicRun();
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
1. 输出一个标题为【基于选题的推荐文案】的部分；\n2. 下面严格给出 3 条文案，按「1、2、3」编号，每条为一整段可直接用于口播配音的${currentLangName}文案；\n3. 语言口语化、有代入感和节奏感；
4. 不要再解释风格或选题，只输出编号+文案内容即可；\n5. 不要输出与平台规则明显冲突的内容。\n6. 不要输出任何emoji和特殊标点符号。\n7. 每条文案整体控制在约 ${ipBrainSafeLength} 字左右，可略多一点但不要明显超出。`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      const content = await requestTopicLlmContent(
        messages,
        {
          temperature: reason === "initial" ? 0.85 : 0.95,
          max_tokens: 1600,
        },
        "选题文案暂未生成有效内容，请稍后重试",
        run,
      );
      if (!isTopicRunActive(run)) return;
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
      if (!isTopicRunActive(run)) return;
      console.error("生成选题文案失败:", e);
      setTopicError(e?.message || "生成基于选题的文案失败");
    } finally {
      if (isTopicRunActive(run)) setIsTopicScriptsLoading(false);
    }
  };
  const isHourCard =
    userInfo?.validityUnit === 1 || userInfo?.validityUnit === 2;
  const lengthMax = isHourCard ? 150 : 1e3;
  const [learnLength, setLearnLength] = useState("100");
  const [ipBrainLength, setIpBrainLength] = useState("100");
  const [originalPurpose, setOriginalPurpose] =
    useState("短视频口播");
  const [originalProductInfo, setOriginalProductInfo] =
    useState("");
  const [originalAudience, setOriginalAudience] = useState("");
  const [originalLength, setOriginalLength] = useState("100");
  const [originalGoal, setOriginalGoal] = useState("引流");
  const [isGeneratingOriginal, setIsGeneratingOriginal] =
    useState(false);
  const downloadVideoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [previewVideoFilePath, setPreviewVideoFilePath] =
    useState("");
  const [isUploadMode, setIsUploadMode] = useState(false);
  const [uploadFileName, setUploadFileName] = useState("");
  const [inputVideoUrl, setInputVideoUrl] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteProgress, setRewriteProgress] = useState(0);
  const [showTranslateModal, setShowTranslateModal] =
    useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(0);
  const [showAiLegalModal, setShowAiLegalModal] = useState(false);
  const [isAiLegalReviewing, setIsAiLegalReviewing] =
    useState(false);
  const [aiLegalProgress, setAiLegalProgress] = useState(0);
  const [aiLegalReviewedText, setAiLegalReviewedText] =
    useState("");
  const [aiLegalSuggestions, setAiLegalSuggestions] = useState("");
  const [aiLegalEdits, setAiLegalEdits] = useState([]);
  const downloadIntervalRef = useRef(null);
  const extractIntervalRef = useRef(null);
  const rewriteIntervalRef = useRef(null);
  const aiLegalIntervalRef = useRef(null);
  const extractHasBackendProgressRef = useRef(false);
  useEffect(() => {
    if (typeof window.api.onPluginProxyProgress !== "function") return;
    const off = window.api.onPluginProxyProgress((data) => {
      if (data.pluginName !== "plugin-proxy-whisper") return;
      if (data.type === "job_progress") {
        const pg = Math.max(0, Math.min(100, Number(data.progress || 0)));
        const state = String(data.state || "");
        if (pg > 0) {
          if (state === "running" || state === "succeeded") {
            extractHasBackendProgressRef.current = true;
          }
          setExtractProgress((prev) => Math.max(prev, pg));
        }
      } else if (data.type === "queue_done") {
        extractHasBackendProgressRef.current = false;
      }
    });
    return off;
  }, []);
  useEffect(() => {
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
        setIsDownloading(false);
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
  const handleLocalVideoPath = async (sourcePath, fileName, file) => {
    window.api.logToMain?.("[ReferenceVideo] handleLocalVideoPath", {
      sourcePath,
      fileName,
      hasFile: Boolean(file),
    });
    if (!sourcePath && !file) {
      showToast("无法获取本地视频路径，请通过客户端选择本地文件上传", "error");
      return;
    }
    setUploadFileName(fileName);
    const ext = fileName.toLowerCase().split(".").pop();
    if (ext !== "mp4") {
      showToast("只支持上传MP4格式的视频文案", "info");
      return;
    }
    const immediatePreviewUrl = getImmediatePreviewUrl(sourcePath, file);
    if (immediatePreviewUrl) {
      setVideoUrl(immediatePreviewUrl);
      if (sourcePath) setPreviewVideoFilePath(sourcePath);
      showToast("参考视频已选择，正在提取内容...", "success");
    }
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      const saveResult = await copyReferenceVideoToUserData(sourcePath, fileName, file);
      if (saveResult.success && saveResult.file_path) {
        try {
          const refreshedVideos = await window.api.loadUploadedVideosConfig?.();
          const videos = refreshedVideos?.videos ?? [];
          const store = useVideoPageStore.getState();
          store.setUploadedVideos?.(videos);
          store.setSelectedVideoMaterialId?.("");
        } catch (refreshError) {
          console.warn("Refresh uploaded videos after reference upload failed:", refreshError);
        }
        const result = await window.api.getLocalFileUrl(saveResult.file_path);
        setVideoUrl(
          result.success && result.url
            ? result.url
            : toFilePreviewUrl(saveResult.file_path || sourcePath),
        );
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
  };
  const handleChooseVideoFile = async () => {
    if (isDownloading || isExtracting) return;
    try {
      window.api.logToMain?.("[ReferenceVideo] open select dialog");
      const selected = await window.api.selectFile({
        title: "选择本地参考视频",
        filters: [{ name: "MP4视频", extensions: ["mp4"] }],
      });
      window.api.logToMain?.("[ReferenceVideo] select dialog result", selected);
      const sourcePath =
        typeof selected === "string"
          ? selected
          : Array.isArray(selected)
            ? selected[0]
            : selected?.filePaths?.[0] || selected?.filePath || selected?.path;
      if (!sourcePath) return;
      const fileName = sourcePath.split(/[\\/]/).pop() || "uploaded.mp4";
      await handleLocalVideoPath(sourcePath, fileName);
    } catch (error) {
      console.error("选择视频失败", error);
      const err = error;
      showToast(`选择视频失败: ${err.message || "未知错误"}`, "error");
    }
  };
  const handleVideoFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleLocalVideoPath(file.path, file.name, file);
    event.target.value = "";
  };
  const runExtractScriptForFile = async (filePath) => {
    if (isExtracting) return;
    if (!filePath) return;
    setIsExtracting(true);
    setExtractProgress(0);
    setOriginalScript("");
    extractHasBackendProgressRef.current = false;
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (extractHasBackendProgressRef.current) return;
      progress += Math.random() * 5;
      if (progress < 90) setExtractProgress((prev) => Math.max(prev, Math.round(progress)));
    }, 500);
    extractIntervalRef.current = progressInterval;
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
      await refreshTokenOnce();

      let transcribeInputPath = filePath;
      const enhancedAudioResult =
        await window.api.extractVideoAudioForTranscribe(filePath);
      if (enhancedAudioResult.success && enhancedAudioResult.file_path) {
        transcribeInputPath = enhancedAudioResult.file_path;
      } else {
        console.warn(
          "[Whisper] extractVideoAudioForTranscribe failed, fallback to original file:",
          enhancedAudioResult.error,
        );
      }

      const text = await window.api.pluginProxyWhisperTranscribeRun({
        audioPath: transcribeInputPath,
      });
      console.log("提取音频结果:", text);
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
        showToast("已取消", "success");
        return;
      }
      console.error("Extract script failed:", error);
      const err = error;
      showToast(
        err.message?.includes("fetch failed")
          ? "连接试用节点失败，请检查网络后重试"
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
          const rewrittenText = extractModelStringField(
            content,
            "rewrittenText",
          );
          if (rewrittenText) setRewrittenScript(rewrittenText);
          else throw new Error("无法解析仿写结果");
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
      const audience = originalAudience.trim() || "泛用户";
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
      showToast("已应用合规审查后的文案", "success");
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
      const parsed = await templateService.getParsedTemplate("legal_review", {
        scriptContent,
      });
      const systemPrompt = parsed.systemPrompt;
      const userPrompts = [
        ...parsed.userPrompts,
        "补充约束：reviewedText 必须体现所有 edits 的替换结果；如无违禁词，edits 为空数组（reviewedText 与原文完全一致）",
      ];
      const messages = [
        { role: "system", content: systemPrompt || "你是一名专业法务审核员。" },
        ...userPrompts.map((p) => ({ role: "user", content: p })),
      ];
      const data = await llmService.legalReviewCompletion(messages, {
        temperature: 0.1,
        max_tokens: 6000,
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
        const aiWordLevelEdits = filterWordLevelLegalEdits(
          normalized,
          scriptContent,
        );
        const localReview = buildLocalLegalReviewResult(scriptContent);
        const wordLevelEdits = mergeLegalEdits(
          aiWordLevelEdits,
          localReview.edits,
        );
        if (wordLevelEdits.length > 0) {
          nextReviewed = applyEditsToSourceText(scriptContent, wordLevelEdits);
          const localOnly = localReview.edits.filter(
            (localEdit) =>
              !aiWordLevelEdits.some(
                (aiEdit) =>
                  aiEdit.original.toLowerCase() ===
                  localEdit.original.toLowerCase(),
              ),
          );
          if (localOnly.length > 0) {
            const note = [
              `本地词库补充 ${localOnly.length} 处风险词，避免 AI 漏报。`,
              ...localOnly.map(
                (edit) =>
                  `${edit.original} → ${edit.replacement}：${edit.reason}`,
              ),
            ].join("\n");
            nextSuggestions = nextSuggestions
              ? `${nextSuggestions}

${note}`
              : note;
          }
          if (isReviewedTextOverwritten(scriptContent, reviewed)) {
            const note = "已自动约束为词级合规替换，避免整句改写。";
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
        const fallback = buildLocalLegalReviewResult(scriptContent);
        setAiLegalReviewedText(fallback.reviewedText);
        setAiLegalSuggestions(
          `${fallback.suggestions}\nAI 返回内容无法解析，已使用本地基础合规词库兜底。`,
        );
        setAiLegalEdits(fallback.edits);
      }
    } catch (error) {
      console.error("AI legal review failed:", error);
      const err = error;
      if (aiLegalIntervalRef.current) {
        clearInterval(aiLegalIntervalRef.current);
        aiLegalIntervalRef.current = null;
      }
      if (shouldUseLocalLegalFallback(err)) {
        const fallback = buildLocalLegalReviewResult(scriptContent);
        setAiLegalProgress(100);
        setAiLegalReviewedText(fallback.reviewedText);
        setAiLegalSuggestions(fallback.suggestions);
        setAiLegalEdits(fallback.edits);
        showToast("法务模型接口异常，已使用本地词库完成基础审查", "info");
        return;
      }
      showToast(`合规审查失败: ${err.message || "未知错误"}`, "error");
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
  return jsxRuntimeExports.jsxs("div", {
    className: "video-column",
    children: [
      jsxRuntimeExports.jsxs("div", {
        className: `video-card ${autoLoading ? "video-card-auto-loading" : ""}`,
        children: [
          jsxRuntimeExports.jsxs("div", {
            className: "video-card-header",
            children: [
              jsxRuntimeExports.jsx("span", {
                className: "video-card-number",
                children: "01",
              }),
              jsxRuntimeExports.jsx("span", {
                className: "video-card-title",
                children: "内容构思",
              }),
            ],
          }),
          jsxRuntimeExports.jsxs("div", {
            className: "video-card-body",
            children: [
              jsxRuntimeExports.jsx("div", {
                className: "video-form-group",
                children: jsxRuntimeExports.jsx("div", {
                  style: { display: "flex", justifyContent: "center" },
                  children: jsxRuntimeExports.jsxs("div", {
                    className: "script-mode-tabs",
                    role: "tablist",
                    "aria-label": "内容模式切换",
                    children: [
                      jsxRuntimeExports.jsx("button", {
                        type: "button",
                        role: "tab",
                        "aria-selected": scriptMode === "learn",
                        className: `script-mode-tab ${scriptMode === "learn" ? "active" : ""}`,
                        onClick: () => setScriptMode("learn"),
                        children: "解析视频",
                      }),
                      jsxRuntimeExports.jsx("button", {
                        type: "button",
                        role: "tab",
                        "aria-selected": scriptMode === "ipBrain",
                        className: `script-mode-tab ${scriptMode === "ipBrain" ? "active" : ""}`,
                        onClick: () => setScriptMode("ipBrain"),
                        children: "学灵感",
                      }),
                      jsxRuntimeExports.jsx("button", {
                        type: "button",
                        role: "tab",
                        "aria-selected": scriptMode === "original",
                        className: `script-mode-tab ${scriptMode === "original" ? "active" : ""}`,
                        onClick: () => setScriptMode("original"),
                        children: "从零策划",
                      }),
                    ],
                  }),
                }),
              }),
              scriptMode === "learn" &&
                jsxRuntimeExports.jsxs(
                  React.Fragment,
                  {
                    children: [
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
                                style: { flex: 1 },
                                children: isUploadMode
                                  ? "本地参考视频"
                                  : "参考视频链接",
                              }),
                              jsxRuntimeExports.jsx("button", {
                                onClick: toggleMode,
                                title: isUploadMode
                                  ? "切换为链接输入"
                                  : "切换为本地上传",
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
                                  jsxRuntimeExports.jsxs(
                                    "svg",
                                    {
                                      width: "14",
                                      height: "14",
                                      viewBox: "0 0 24 24",
                                      fill: "none",
                                      stroke: "currentColor",
                                      strokeWidth: "2",
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "line",
                                          {
                                            x1: "5",
                                            y1: "8",
                                            x2: "19",
                                            y2: "8",
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "polyline",
                                          { points: "15 5 19 8 15 11" },
                                        ),
                                        jsxRuntimeExports.jsx(
                                          "line",
                                          {
                                            x1: "19",
                                            y1: "16",
                                            x2: "5",
                                            y2: "16",
                                          },
                                        ),
                                        jsxRuntimeExports.jsx(
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
                            ? jsxRuntimeExports.jsx("div", {
                                style: { width: "100%" },
                                children:
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      className: `video-file-input video-file-input-wrap ${isDownloading || isExtracting ? "disabled" : ""}`,
                                      title:
                                        uploadFileName || "上传视频提取参考内容",
                                      onClick: handleChooseVideoFile,
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "span",
                                          {
                                            className: "video-file-input-text",
                                            children:
                                              uploadFileName ||
                                              "上传视频提取参考内容",
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                              })
                            : jsxRuntimeExports.jsxs("div", {
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                },
                                children: [
                                  jsxRuntimeExports.jsxs(
                                    "div",
                                    {
                                      style: {
                                        position: "relative",
                                        flex: 1,
                                        minWidth: 0,
                                      },
                                      children: [
                                        jsxRuntimeExports.jsx(
                                          "input",
                                          {
                                            type: "text",
                                            value: inputVideoUrl,
                                            onChange: (e) =>
                                              setInputVideoUrl(e.target.value),
                                            placeholder: "粘贴参考视频链接",
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
                                          jsxRuntimeExports.jsx(
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
                                                jsxRuntimeExports.jsxs(
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
                                                      jsxRuntimeExports.jsx(
                                                        "line",
                                                        {
                                                          x1: "18",
                                                          y1: "6",
                                                          x2: "6",
                                                          y2: "18",
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
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
                                  jsxRuntimeExports.jsxs(
                                    "button",
                                    {
                                      onClick: handleDownloadVideo,
                                      disabled: isDownloading || isExtracting,
                                      className:
                                        `video-button video-button-primary ${isDownloading || isExtracting ? "video-button-progress-active" : ""}`,
                                      style: {
                                        whiteSpace: "nowrap",
                                        width: "auto",
                                      },
                                      children: [
                                        jsxRuntimeExports.jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [jsxRuntimeExports.jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), jsxRuntimeExports.jsx("polyline", { points: "14 2 14 8 20 8" }), jsxRuntimeExports.jsx("line", { x1: "16", y1: "13", x2: "8", y2: "13" })] }),
                                        isExtracting
                                          ? `整理中${extractProgress}%`
                                          : isDownloading
                                            ? `整理中${downloadProgress}%`
                                            : "提取内容",
                                      ],
                                    },
                                  ),
                                ],
                              }),
                          (isDownloading || isExtracting) &&
                            jsxRuntimeExports.jsx("div", {
                              className: `video-progress ${(isDownloading || isExtracting) ? "video-progress--active" : ""}`,
                              children: jsxRuntimeExports.jsx(
                                "div",
                                {
                                  className: `video-progress-bar ${(isDownloading || isExtracting) ? "video-progress-bar--active" : ""}`,
                                  style: {
                                    width: `${isExtracting ? extractProgress : downloadProgress}%`,
                                  },
                                },
                              ),
                            }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "视频预览",
                          }),
                          jsxRuntimeExports.jsx("div", {
                            className:
                              "video-preview-box video-preview-box-with-play",
                            children: videoUrl
                              ? jsxRuntimeExports.jsxs(
                                  React.Fragment,
                                  {
                                    children: [
                                      " ",
                                      jsxRuntimeExports.jsx(
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
                                            jsxRuntimeExports.jsx(
                                              "source",
                                              { src: videoUrl },
                                            ),
                                        },
                                        videoUrl,
                                      ),
                                      shouldShowPreviewDownload &&
                                        jsxRuntimeExports.jsx(
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
                                                      {
                                                        points:
                                                          "7 10 12 15 17 10",
                                                      },
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
                                          },
                                        ),
                                      jsxRuntimeExports.jsx(
                                        "button",
                                        {
                                          className: "video-play-button",
                                          onClick: openPreview,
                                          children:
                                            jsxRuntimeExports.jsx(
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
                                        },
                                      ),
                                    ],
                                  },
                                )
                              : jsxRuntimeExports.jsx("div", {
                                  className: "video-preview-placeholder",
                                  children: "暂无视频",
                                }),
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "参考内容",
                          }),
                          jsxRuntimeExports.jsx("textarea", {
                            value: originalScript,
                            onChange: (e) => setOriginalScript(e.target.value),
                            placeholder: "整理出的参考内容会显示在这里..",
                            rows: 5,
                            className: "video-textarea",
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-row",
                        children: [
                          jsxRuntimeExports.jsxs("div", {
                            className: "video-form-group",
                            children: [
                              jsxRuntimeExports.jsx("label", {
                                className: "video-label",
                                children: "语言",
                              }),
                              jsxRuntimeExports.jsx("select", {
                                value: sourceLanguage,
                                onChange: (e) =>
                                  setSourceLanguage(e.target.value),
                                className: "video-select",
                                children: LANG_OPTIONS.map((o) =>
                                  jsxRuntimeExports.jsx(
                                    "option",
                                    { value: o.value, children: o.label },
                                    o.value,
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
                                children: "字数",
                              }),
                              jsxRuntimeExports.jsx("input", {
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
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsxs("button", {
                            onClick: handleRewriteScript,
                            disabled: isRewriting,
                            className: "video-button video-button-primary",
                            children: [
                              jsxRuntimeExports.jsx("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: jsxRuntimeExports.jsx("path", { d: "M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" }) }),
                              isRewriting
                                ? `改写中${rewriteProgress}%`
                                : "生成改写稿",
                            ],
                          }),
                          isRewriting &&
                            jsxRuntimeExports.jsx("div", {
                              className: "video-progress",
                              children: jsxRuntimeExports.jsx(
                                "div",
                                {
                                  className: "video-progress-bar",
                                  style: { width: `${rewriteProgress}%` },
                                },
                              ),
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
                              jsxRuntimeExports.jsxs("label", {
                                className: "video-label",
                                style: { flex: 1 },
                                children: [
                                  "改写结果",
                                  jsxRuntimeExports.jsxs(
                                    "span",
                                    {
                                      style: {
                                        color: "#666",
                                        fontWeight: "normal",
                                      },
                                      children: [
                                        "（",
                                        getLanguageName(sourceLanguage),
                                        "）",
                                      ],
                                    },
                                  ),
                                ],
                              }),
                              translatedText &&
                                jsxRuntimeExports.jsx(
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
                                      jsxRuntimeExports.jsxs(
                                        "svg",
                                        {
                                          width: "14",
                                          height: "14",
                                          viewBox: "0 0 24 24",
                                          fill: "none",
                                          stroke: "currentColor",
                                          strokeWidth: "2",
                                          children: [
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M8 3L4 7l4 4" },
                                            ),
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M4 7h16" },
                                            ),
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M16 21l4-4-4-4" },
                                            ),
                                            jsxRuntimeExports.jsx(
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
                          jsxRuntimeExports.jsx("textarea", {
                            value:
                              showTranslatedInTextarea && translatedText
                                ? translatedText
                                : rewrittenScript,
                            onChange: (e) => {
                              if (showTranslatedInTextarea && translatedText)
                                setTranslatedText(e.target.value);
                              else setRewrittenScript(e.target.value);
                            },
                            placeholder: "生成后的改写内容将显示在这里...",
                            rows: 5,
                            className: "video-textarea",
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: jsxRuntimeExports.jsxs(
                          "div",
                          {
                            style: { display: "flex", gap: "8px" },
                            children: [
                              jsxRuntimeExports.jsxs("button", {
                                onClick: handleOpenAiLegalModal,
                                className: "video-button video-button-warning",
                                style: { flex: 1 },
                                children: [
                                  jsxRuntimeExports.jsx("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: jsxRuntimeExports.jsx("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }) }),
                                  "合规审查",
                                ],
                              }),
                              jsxRuntimeExports.jsxs("button", {
                                onClick: handleOpenTranslateModal,
                                className: "video-button video-button-primary",
                                style: { flex: 1 },
                                children: [
                                  jsxRuntimeExports.jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "10" }), jsxRuntimeExports.jsx("line", { x1: "2", y1: "12", x2: "22", y2: "12" }), jsxRuntimeExports.jsx("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })] }),
                                  "语种翻译",
                                ],
                              }),
                            ],
                          },
                        ),
                      }),
                    ],
                  },
                ),
              scriptMode === "ipBrain" &&
                jsxRuntimeExports.jsxs(
                  React.Fragment,
                  {
                    children: [
                      jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: !ipBrain
                          ? jsxRuntimeExports.jsx("div", {
                              className: "ipbrain-placeholder",
                              children: jsxRuntimeExports.jsxs(
                                "div",
                                {
                                  className: "ipbrain-placeholder-inner",
                                  children: [
                                    jsxRuntimeExports.jsx("p", {
                                      className: "ipbrain-placeholder-title",
                                      children: "还没有配置学灵感",
                                    }),
                                    jsxRuntimeExports.jsx("p", {
                                      className: "ipbrain-placeholder-desc",
                                      children:
                                        "先沉淀一个灵感来源，方便后续做方向分析和内容延展。",
                                    }),
                                    jsxRuntimeExports.jsx(
                                      "button",
                                      {
                                        type: "button",
                                        className:
                                          "video-button video-button-primary",
                                        onClick: () =>
                                          setShowIpBrainModal(true),
                                        children: [jsxRuntimeExports.jsx("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [jsxRuntimeExports.jsx("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), jsxRuntimeExports.jsx("line", { x1: "5", y1: "12", x2: "19", y2: "12" })] }), "添加灵感来源"],
                                      },
                                    ),
                                  ],
                                },
                              ),
                            })
                          : jsxRuntimeExports.jsxs("div", {
                              className: "ipbrain-card",
                              children: [
                                jsxRuntimeExports.jsxs("div", {
                                  className: "ipbrain-card-header",
                                  children: [
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "div",
                                            {
                                              className: "ipbrain-title",
                                              children:
                                                ipBrain.name || "未命名灵感来源",
                                            },
                                          ),
                                          jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              className: "ipbrain-meta-row",
                                              children: [
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "ipbrain-meta-label",
                                                    children: "来源主页",
                                                  },
                                                ),
                                                jsxRuntimeExports.jsx(
                                                  "span",
                                                  {
                                                    className:
                                                      "ipbrain-meta-value",
                                                    children: ipBrain.homepage
                                                      ? jsxRuntimeExports.jsx(
                                                          "span",
                                                          {
                                                            children:
                                                              ipBrain.homepage,
                                                          },
                                                        )
                                                      : "暂未填写",
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
                                        style: {
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 6,
                                        },
                                        children:
                                          jsxRuntimeExports.jsx(
                                            "button",
                                            {
                                              type: "button",
                                              "aria-label": "删除灵感来源",
                                              title: "删除灵感来源",
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
                                              onClick: handleRemoveIpBrain,
                                              children:
                                                jsxRuntimeExports.jsxs(
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
                                                      jsxRuntimeExports.jsx(
                                                        "line",
                                                        {
                                                          x1: "18",
                                                          y1: "6",
                                                          x2: "6",
                                                          y2: "18",
                                                        },
                                                      ),
                                                      jsxRuntimeExports.jsx(
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
                                jsxRuntimeExports.jsxs("div", {
                                  className: "ipbrain-card-footer",
                                  children: [
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "ipbrain-card-footer-left",
                                        children: [
                                          jsxRuntimeExports.jsxs(
                                            "span",
                                            {
                                              className: "ipbrain-meta-small",
                                              children: [
                                                "创建时间：",
                                                ipBrain.createdAt,
                                              ],
                                            },
                                          ),
                                          jsxRuntimeExports.jsxs(
                                            "span",
                                            {
                                              className: "ipbrain-meta-small",
                                              children: [
                                                "深度分析：",
                                                ipBrain.deepLearn ? "已开启" : "未开启",
                                              ],
                                            },
                                          ),
                                        ],
                                      },
                                    ),
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        className: "ipbrain-card-footer-bottom",
                                        style: {
                                          display: "flex",
                                          gap: 8,
                                          width: "100%",
                                        },
                                        children: [
                                          jsxRuntimeExports.jsx("button", {
                                            type: "button",
                                            className:
                                              "video-button video-button-outline",
                                            style: {
                                              flex: 1,
                                              whiteSpace: "nowrap",
                                            },
                                            onClick: handleRemoveIpBrain,
                                            children: "取消",
                                          }),
                                          jsxRuntimeExports.jsx("button", {
                                            type: "button",
                                            className:
                                              "video-button video-button-primary",
                                            style: {
                                              flex: 1,
                                              whiteSpace: "nowrap",
                                            },
                                            onClick: handleOpenTopicAnalysis,
                                            children: "方向分析",
                                          }),
                                        ],
                                      },
                                    ),
                                  ],
                                }),
                              ],
                            }),
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-row ipbrain-language-row",
                        children: [
                          jsxRuntimeExports.jsxs("div", {
                            className: "video-form-group",
                            children: [
                              jsxRuntimeExports.jsx("label", {
                                className: "video-label",
                                children: "语言",
                              }),
                              jsxRuntimeExports.jsx("select", {
                                value: sourceLanguage,
                                onChange: (e) =>
                                  setSourceLanguage(e.target.value),
                                className: "video-select",
                                children: LANG_OPTIONS.map((o) =>
                                  jsxRuntimeExports.jsx(
                                    "option",
                                    { value: o.value, children: o.label },
                                    o.value,
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
                                children: "字数",
                              }),
                              jsxRuntimeExports.jsx("input", {
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
                              jsxRuntimeExports.jsxs("label", {
                                className: "video-label",
                                style: { flex: 1 },
                                children: [
                                  "灵感草稿",
                                  jsxRuntimeExports.jsxs(
                                    "span",
                                    {
                                      style: {
                                        color: "#666",
                                        fontWeight: "normal",
                                      },
                                      children: [
                                        "（",
                                        getLanguageName(sourceLanguage),
                                        "）",
                                      ],
                                    },
                                  ),
                                ],
                              }),
                              translatedText &&
                                jsxRuntimeExports.jsx(
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
                                      jsxRuntimeExports.jsxs(
                                        "svg",
                                        {
                                          width: "14",
                                          height: "14",
                                          viewBox: "0 0 24 24",
                                          fill: "none",
                                          stroke: "currentColor",
                                          strokeWidth: "2",
                                          children: [
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M8 3L4 7l4 4" },
                                            ),
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M4 7h16" },
                                            ),
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M16 21l4-4-4-4" },
                                            ),
                                            jsxRuntimeExports.jsx(
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
                          jsxRuntimeExports.jsx("textarea", {
                            value:
                              showTranslatedInTextarea && translatedText
                                ? translatedText
                                : rewrittenScript,
                            onChange: (e) => {
                              if (showTranslatedInTextarea && translatedText)
                                setTranslatedText(e.target.value);
                              else setRewrittenScript(e.target.value);
                            },
                            placeholder: "输入灵感来源相关的描述、介绍或参考内容...",
                            rows: 5,
                            className: "video-textarea",
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: jsxRuntimeExports.jsxs(
                          "div",
                          {
                            style: { display: "flex", gap: "8px" },
                            children: [
                              jsxRuntimeExports.jsxs("button", {
                                onClick: handleOpenAiLegalModal,
                                className: "video-button video-button-warning",
                                style: { flex: 1 },
                                children: [
                                  jsxRuntimeExports.jsx("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: jsxRuntimeExports.jsx("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }) }),
                                  "合规审查",
                                ],
                              }),
                              jsxRuntimeExports.jsxs("button", {
                                onClick: handleOpenTranslateModal,
                                className: "video-button video-button-primary",
                                style: { flex: 1 },
                                children: [
                                  jsxRuntimeExports.jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "10" }), jsxRuntimeExports.jsx("line", { x1: "2", y1: "12", x2: "22", y2: "12" }), jsxRuntimeExports.jsx("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })] }),
                                  "语种翻译",
                                ],
                              }),
                            ],
                          },
                        ),
                      }),
                    ],
                  },
                ),
              scriptMode === "original" &&
                jsxRuntimeExports.jsxs(
                  React.Fragment,
                  {
                    children: [
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "内容用途",
                          }),
                          jsxRuntimeExports.jsxs("select", {
                            value: originalPurpose,
                            onChange: (e) => setOriginalPurpose(e.target.value),
                            className: "video-select",
                            children: [
                              jsxRuntimeExports.jsx("option", {
                                value: "朋友圈",
                                children: "朋友圈",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "短视频口播",
                                children: "短视频口播",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "海报",
                                children: "海报",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "店铺宣传",
                                children: "店铺宣传",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "带货",
                                children: "带货",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "活动通知",
                                children: "活动通知",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "产品介绍",
                                children: "产品介绍",
                              }),
                            ],
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "核心信息（名称、卖点、优势）",
                          }),
                          jsxRuntimeExports.jsx("textarea", {
                            value: originalProductInfo,
                            onChange: (e) =>
                              setOriginalProductInfo(e.target.value),
                            placeholder:
                              "请输入名称、核心卖点、差异化优势等信息...",
                            rows: 4,
                            className: "video-textarea",
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "受众人群",
                          }),
                          jsxRuntimeExports.jsx("input", {
                            type: "text",
                            value: originalAudience,
                            onChange: (e) =>
                              setOriginalAudience(e.target.value),
                            placeholder: "如：商家、博主、家长、学生、泛用户等",
                            className: "video-input",
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "内容目标",
                          }),
                          jsxRuntimeExports.jsxs("select", {
                            value: originalGoal,
                            onChange: (e) => setOriginalGoal(e.target.value),
                            className: "video-select",
                            children: [
                              jsxRuntimeExports.jsx("option", {
                                value: "引流",
                                children: "引流",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "涨粉",
                                children: "涨粉",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "带货",
                                children: "带货",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "通知",
                                children: "通知",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "同城",
                                children: "同城",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "宣传",
                                children: "宣传",
                              }),
                              jsxRuntimeExports.jsx("option", {
                                value: "其他",
                                children: "其他",
                              }),
                            ],
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "语言",
                          }),
                          jsxRuntimeExports.jsx("select", {
                            value: sourceLanguage,
                            onChange: (e) => setSourceLanguage(e.target.value),
                            className: "video-select",
                            children: LANG_OPTIONS.map((o) =>
                              jsxRuntimeExports.jsx(
                                "option",
                                { value: o.value, children: o.label },
                                o.value,
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
                            children: "字数",
                          }),
                          jsxRuntimeExports.jsx("input", {
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
                      jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: jsxRuntimeExports.jsx(
                          "button",
                          {
                            onClick: handleGenerateOriginalScript,
                            disabled: isGeneratingOriginal,
                            className: "video-button video-button-primary",
                            children: isGeneratingOriginal
                              ? "生成中…"
                              : [jsxRuntimeExports.jsx("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [jsxRuntimeExports.jsx("path", { d: "M12 20h9" }), jsxRuntimeExports.jsx("path", { d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" })] }), "生成初稿内容"],
                          },
                        ),
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
                              jsxRuntimeExports.jsxs("label", {
                                className: "video-label",
                                style: { flex: 1 },
                                children: [
                                  "初稿内容",
                                  jsxRuntimeExports.jsxs(
                                    "span",
                                    {
                                      style: {
                                        color: "#666",
                                        fontWeight: "normal",
                                      },
                                      children: [
                                        "（",
                                        getLanguageName(sourceLanguage),
                                        "）",
                                      ],
                                    },
                                  ),
                                ],
                              }),
                              translatedText &&
                                jsxRuntimeExports.jsx(
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
                                      jsxRuntimeExports.jsxs(
                                        "svg",
                                        {
                                          width: "14",
                                          height: "14",
                                          viewBox: "0 0 24 24",
                                          fill: "none",
                                          stroke: "currentColor",
                                          strokeWidth: "2",
                                          children: [
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M8 3L4 7l4 4" },
                                            ),
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M4 7h16" },
                                            ),
                                            jsxRuntimeExports.jsx(
                                              "path",
                                              { d: "M16 21l4-4-4-4" },
                                            ),
                                            jsxRuntimeExports.jsx(
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
                          jsxRuntimeExports.jsx("textarea", {
                            value:
                              showTranslatedInTextarea && translatedText
                                ? translatedText
                                : rewrittenScript,
                            onChange: (e) => {
                              if (showTranslatedInTextarea && translatedText)
                                setTranslatedText(e.target.value);
                              else setRewrittenScript(e.target.value);
                            },
                            placeholder: "生成的初稿内容将显示在这里..",
                            rows: 5,
                            className: "video-textarea",
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsx("div", {
                        className: "video-form-group",
                        children: jsxRuntimeExports.jsxs(
                          "div",
                          {
                            style: { display: "flex", gap: "8px" },
                            children: [
                              jsxRuntimeExports.jsxs("button", {
                                onClick: handleOpenAiLegalModal,
                                className: "video-button video-button-warning",
                                style: { flex: 1 },
                                children: [
                                  jsxRuntimeExports.jsx("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: jsxRuntimeExports.jsx("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }) }),
                                  "合规审查",
                                ],
                              }),
                              jsxRuntimeExports.jsxs("button", {
                                onClick: handleOpenTranslateModal,
                                className: "video-button video-button-primary",
                                style: { flex: 1 },
                                children: [
                                  jsxRuntimeExports.jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "10" }), jsxRuntimeExports.jsx("line", { x1: "2", y1: "12", x2: "22", y2: "12" }), jsxRuntimeExports.jsx("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })] }),
                                  "语种翻译",
                                ],
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
        jsxRuntimeExports.jsx(TranslateModal, {
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
        jsxRuntimeExports.jsx(AiLegalModal, {
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
        jsxRuntimeExports.jsx("div", {
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
          children: jsxRuntimeExports.jsxs("div", {
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
              jsxRuntimeExports.jsx("button", {
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
                children: jsxRuntimeExports.jsxs("svg", {
                  width: "14",
                  height: "14",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: "2",
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  children: [
                    <line x1="18" y1="6" x2="6" y2="18" />,
                    <line x1="6" y1="6" x2="18" y2="18" />,
                  ],
                }),
              }),
              jsxRuntimeExports.jsx("div", {
                style: {
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--ly-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                },
                children: jsxRuntimeExports.jsx("h2", {
                  style: {
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--ly-text)",
                  },
                  children: "学灵感",
                }),
              }),
              jsxRuntimeExports.jsx("div", {
                style: { marginBottom: 12 },
                children: jsxRuntimeExports.jsxs("div", {
                  style: {
                    display: "inline-flex",
                    padding: 2,
                    borderRadius: 999,
                    border: "1px solid var(--ly-border)",
                    background: "rgba(148, 163, 184, 0.12)",
                  },
                  children: [
                    jsxRuntimeExports.jsx("button", {
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
                    jsxRuntimeExports.jsx("button", {
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
                ? jsxRuntimeExports.jsxs("div", {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      marginBottom: 12,
                    },
                    children: [
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "档案名称",
                          }),
                          jsxRuntimeExports.jsx("input", {
                            type: "text",
                            value: ipBrainName,
                            onChange: (e) => setIpBrainName(e.target.value),
                            placeholder:
                              "请输入IP 档案名称，例如：个人账号 / 品牌名..",
                            className: "video-input",
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "主页地址",
                          }),
                          jsxRuntimeExports.jsx("input", {
                            type: "text",
                            value: ipBrainHomepage,
                            onChange: (e) => setIpBrainHomepage(e.target.value),
                            placeholder: "请输入抖音主页或其他主要阵地链接...",
                            className: "video-input",
                          }),
                          jsxRuntimeExports.jsxs("p", {
                            style: {
                              margin: "4px 0 0",
                              fontSize: 11,
                              color: "var(--ly-text-3)",
                              lineHeight: 1.4,
                            },
                            children: [
                              "格式示例：",
                              jsxRuntimeExports.jsx("code", {
                                style: { fontFamily: "monospace" },
                                children:
                                  "https://www.douyin.com/user/MS4wLjABAAAA...",
                              }),
                              "请粘贴博主主页链接（分享主页）。若只有视频链接也可保存，系统会在选题分析时自动识别博主。单条视频请用「解析视频」。",
                            ],
                          }),
                        ],
                      }),
                      jsxRuntimeExports.jsxs("div", {
                        className: "video-form-group",
                        children: [
                          jsxRuntimeExports.jsx("label", {
                            className: "video-label",
                            children: "深度学习模式",
                          }),
                          jsxRuntimeExports.jsxs("div", {
                            className: "ipbrain-deep-learn-stack",
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            },
                            children: [
                              jsxRuntimeExports.jsxs("button", {
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
                                  jsxRuntimeExports.jsx(
                                    "span",
                                    {
                                      className: "ipbrain-deep-learn-title",
                                      style: {
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: "var(--ly-text)",
                                      },
                                      children: "学习选题和浅度分析写作分割",
                                    },
                                  ),
                                  jsxRuntimeExports.jsx(
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
                              jsxRuntimeExports.jsxs("button", {
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
                                  jsxRuntimeExports.jsx(
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
                                  jsxRuntimeExports.jsx(
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
                : jsxRuntimeExports.jsx("div", {
                    style: { marginBottom: 12 },
                    children:
                      ipBrainProfiles.length === 0
                        ? jsxRuntimeExports.jsx("div", {
                            style: {
                              padding: "24px 12px",
                              textAlign: "center",
                              fontSize: 13,
                              color: "var(--ly-text-3)",
                            },
                            children:
                              "暂无已保存的 IP 档案，请先在「新增档案」中创建。",
                          })
                        : jsxRuntimeExports.jsx("div", {
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              maxHeight: "40vh",
                              overflowY: "auto",
                            },
                            children: ipBrainProfiles.map((p) =>
                              jsxRuntimeExports.jsxs(
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
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        style: {
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          gap: 8,
                                        },
                                        children: [
                                          jsxRuntimeExports.jsx(
                                            "div",
                                            {
                                              style: {
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: "var(--ly-text)",
                                              },
                                              children:
                                                p.name || "未命名 学灵感",
                                            },
                                          ),
                                          jsxRuntimeExports.jsxs(
                                            "div",
                                            {
                                              style: {
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                              },
                                              children: [
                                                jsxRuntimeExports.jsx(
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
                                                jsxRuntimeExports.jsx(
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
                                                      jsxRuntimeExports.jsxs(
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
                                                            jsxRuntimeExports.jsx(
                                                              "line",
                                                              {
                                                                x1: "18",
                                                                y1: "6",
                                                                x2: "6",
                                                                y2: "18",
                                                              },
                                                            ),
                                                            jsxRuntimeExports.jsx(
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
                                    jsxRuntimeExports.jsx(
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
                                    jsxRuntimeExports.jsxs(
                                      "div",
                                      {
                                        style: {
                                          fontSize: 11,
                                          color: "var(--ly-text-3)",
                                          display: "flex",
                                          gap: 8,
                                        },
                                        children: [
                                          jsxRuntimeExports.jsxs(
                                            "span",
                                            {
                                              children: [
                                                "创建时间：",
                                                p.createdAt,
                                              ],
                                            },
                                          ),
                                          jsxRuntimeExports.jsxs(
                                            "span",
                                            {
                                              children: [
                                                "深度学习：",
                                                p.deepLearn ? "是" : "否",
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
              jsxRuntimeExports.jsxs("div", {
                style: {
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 8,
                },
                children: [
                  jsxRuntimeExports.jsx("button", {
                    type: "button",
                    className: "video-button video-button-outline",
                    style: { width: "auto", paddingInline: 14 },
                    onClick: () => setShowIpBrainModal(false),
                    children: "取消",
                  }),
                  ipBrainModalTab === "create" &&
                    jsxRuntimeExports.jsx("button", {
                      type: "button",
                      className: "video-button video-button-primary",
                      style: { width: "auto", paddingInline: 14 },
                      onClick: () => {
                        const name = ipBrainName.trim() || "未命名 学灵感";
                        const homepage = normalizeDouyinUrlForDownloader(
                          ipBrainHomepage.trim(),
                        ) || ipBrainHomepage.trim();
                        if (!homepage) {
                          showToast("请填写主页地址", "info");
                          return;
                        }
                        const check = validateHomepageForTopicAnalysis(homepage);
                        if (!check.ok) {
                          showToast(check.hint || DOUYIN_HOMEPAGE_HINT, "info");
                          return;
                        }
                        if (check.isVideoLink) {
                          showToast(
                            "已保存视频链接，选题分析时将自动识别博主主页",
                            "info",
                          );
                        }
                        const now = new Date();
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
        jsxRuntimeExports.jsx("div", {
          className: "video-modal-overlay",
          onClick: (e) => {
            if (e.target === e.currentTarget) handleCancelTopicAnalysis();
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
              jsxRuntimeExports.jsx("button", {
                onClick: handleCancelTopicAnalysis,
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
                children: jsxRuntimeExports.jsxs("svg", {
                  width: "14",
                  height: "14",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: "2",
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  children: [
                    <line x1="18" y1="6" x2="6" y2="18" />,
                    <line x1="6" y1="6" x2="18" y2="18" />,
                  ],
                }),
              }),
              jsxRuntimeExports.jsx("div", {
                style: {
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--ly-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                },
                children: jsxRuntimeExports.jsx("h2", {
                  style: {
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--ly-text)",
                  },
                  children: "学灵感选题分析",
                }),
              }),
              isTopicAnalyzing || isTopicScriptsLoading
                ? jsxRuntimeExports.jsx("div", {
                    className: "ipbrain-topic-loading",
                    children: jsxRuntimeExports.jsxs("div", {
                      className: "ipbrain-topic-loading-inner",
                      children: [
                        jsxRuntimeExports.jsx("div", {
                          className: "ipbrain-topic-orbit",
                          children: jsxRuntimeExports.jsx(
                            "div",
                            { className: "ipbrain-topic-orbit-dot" },
                          ),
                        }),
                        jsxRuntimeExports.jsx("div", {
                          children: isTopicAnalyzing
                            ? topicStage === "style"
                              ? "AI 正在解析该账号的整体风格与选题脉络…"
                              : "AI 正在为该账号生成一批新的推荐选题"
                            : "AI 正在围绕当前选题打磨多种文案表达…",
                        }),
                        jsxRuntimeExports.jsx("div", {
                          className: "ipbrain-topic-loading-text-sub",
                          children: "这可能需要几秒钟，请稍候",
                        }),
                        jsxRuntimeExports.jsx("button", {
                          type: "button",
                          className: "video-button video-button-outline",
                          style: {
                            marginTop: 12,
                            width: "auto",
                            paddingInline: 16,
                          },
                          onClick: handleCancelTopicAnalysis,
                          children: "取消",
                        }),
                      ],
                    }),
                  })
                : selectedTopic && (topicScripts.length > 0 || topicError)
                  ? // 推荐文案视图
                    jsxRuntimeExports.jsxs("div", {
                      children: [
                        topicError &&
                          jsxRuntimeExports.jsx("div", {
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
                        jsxRuntimeExports.jsxs("div", {
                          style: {
                            marginBottom: 6,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 8,
                          },
                          children: [
                            jsxRuntimeExports.jsx("div", {
                              style: {
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--ly-text-2)",
                              },
                              children: "基于选题的推荐文案",
                            }),
                            jsxRuntimeExports.jsx("button", {
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
                        jsxRuntimeExports.jsxs("div", {
                          style: {
                            marginBottom: 8,
                            fontSize: 12,
                            color: "var(--ly-text-3)",
                          },
                          children: ["当前选题：", selectedTopic],
                        }),
                        jsxRuntimeExports.jsx("div", {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          },
                          children: topicScripts.map((script, idx) =>
                            jsxRuntimeExports.jsxs(
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
                                  jsxRuntimeExports.jsxs(
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
                                  jsxRuntimeExports.jsx("div", {
                                    className: "ipbrain-topic-script-body",
                                    style: {
                                      fontSize: 13,
                                      color: "var(--ly-text)",
                                      whiteSpace: "pre-wrap",
                                      lineHeight: 1.7,
                                    },
                                    children: script,
                                  }),
                                  jsxRuntimeExports.jsx("div", {
                                    style: {
                                      display: "flex",
                                      justifyContent: "flex-end",
                                      marginTop: 4,
                                    },
                                    children:
                                      jsxRuntimeExports.jsx(
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
                                              "已将文案写入学灵感文案区域",
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
                    jsxRuntimeExports.jsxs(
                      React.Fragment,
                      {
                        children: [
                          topicError &&
                            jsxRuntimeExports.jsx("div", {
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
                          jsxRuntimeExports.jsxs("div", {
                            style: { marginBottom: 12 },
                            children: [
                              jsxRuntimeExports.jsx("div", {
                                style: {
                                  marginBottom: 6,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--ly-text-2)",
                                },
                                children: "风格与定位分析",
                              }),
                              jsxRuntimeExports.jsx(
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
                          jsxRuntimeExports.jsxs("div", {
                            style: {
                              marginBottom: 8,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            },
                            children: [
                              jsxRuntimeExports.jsx("div", {
                                style: {
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--ly-text-2)",
                                },
                                children: "推荐选题",
                              }),
                              jsxRuntimeExports.jsx("button", {
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
                          jsxRuntimeExports.jsxs("div", {
                            style: {
                              marginBottom: 12,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            },
                            children: [
                              topicIdeas.length === 0 &&
                                !topicError &&
                                jsxRuntimeExports.jsx("div", {
                                  style: {
                                    fontSize: 12,
                                    color: "var(--ly-text-3)",
                                  },
                                  children:
                                    "尚未生成推荐选题，请先执行一次选题分析。",
                                }),
                              topicIdeas.map((idea, idx) =>
                                jsxRuntimeExports.jsxs(
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
                                      jsxRuntimeExports.jsxs(
                                        "div",
                                        {
                                          className: "ipbrain-topic-idea-main",
                                          style: {
                                            fontSize: 13,
                                            color: "var(--ly-text)",
                                            flex: 1,
                                          },
                                          children: [
                                            jsxRuntimeExports.jsxs(
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
                                      jsxRuntimeExports.jsx(
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
                                          children: "去创作",
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
        jsxRuntimeExports.jsx(PhoneModal, {
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
const reactDomExports = { createPortal: ReactDOM.createPortal };
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
  const selected = useMemo(
    () => options.find((o) => o.id === value) || null,
    [options, value],
  );
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
  useEffect(() => {
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
                            <rect x="4" y="3" width="3" height="10" rx="1" />,
                            <rect x="9" y="3" width="3" height="10" rx="1" />,
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
              children: options.length
                ? options.map((opt) => {
                    const isSelected = opt.id === value;
                    const isOptPlaying = previewingId === opt.id && isPlaying;
                    return jsxRuntimeExports.jsxs(
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
                          jsxRuntimeExports.jsx("button", {
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
                              ? jsxRuntimeExports.jsxs("svg", {
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
                                })
                              : jsxRuntimeExports.jsx("svg", {
                                  width: "16",
                                  height: "16",
                                  viewBox: "0 0 16 16",
                                  fill: "currentColor",
                                  children:
                                    jsxRuntimeExports.jsx(
                                      "path",
                                      { d: "M6 4.2V11.8L12 8L6 4.2Z" },
                                    ),
                                }),
                          }),
                          jsxRuntimeExports.jsx("span", {
                            className: "audio-preview-select-item-name",
                            children: opt.name,
                          }),
                        ],
                      },
                      opt.id,
                    );
                  })
                : jsxRuntimeExports.jsx("div", {
                    className: "audio-preview-select-empty",
                    children: placeholder,
                  }),
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
export function RangeValueTooltip({
  min,
  max,
  step,
  value,
  disabled = false,
  className = "",
  onChange,
  format,
}) {
  const inputRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({
    left: 0,
    top: 0,
    direction: "up",
  });
  const displayText = useMemo(() => {
    if (format) return format(value);
    return String(value);
  }, [format, value]);
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
    const direction =
      spaceAbove >= 28 || spaceAbove >= spaceBelow ? "up" : "down";
    const top = direction === "up" ? rect.top - 8 : rect.bottom + 8;
    setPos({ left: x, top, direction });
  };
  useEffect(() => {
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
  return jsxRuntimeExports.jsxs(React.Fragment, {
    children: [
      jsxRuntimeExports.jsx("input", {
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
        ? ReactDOM.createPortal(
            jsxRuntimeExports.jsx("div", {
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
