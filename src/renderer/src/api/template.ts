import { apiClient } from './client'

interface ParsedTemplate {
  systemPrompt: string
  userPrompts: string[]
}

const TEMPLATES: Record<string, { system: string; user: string }> = {
  title: {
    system: `你是一个专业的短视频标题和标签生成专家。
根据用户提供的视频文案，使用{langName}生成吸引人的标题和标签。
请以JSON格式返回结果，包含以下字段：
mainTitle（封面主标题，10-15字）；
subTitle（副标题，8-12字）；
viralTitle（爆款视频标题，15-25字，要吸引眼球）；
videoTags（视频标签，用逗号分隔，3-5个标签）。
只返回JSON，不要其他文字，结果中也不需要任何emoji表情。`,
    user: `请根据以下视频文案，使用{langName}生成封面主标题、副标题、爆款视频标题和视频标签。要求：
1. 封面主标题：10-15字，简洁有力，突出核心主题
2. 副标题：8-12字，补充说明或强化主标题
3. 爆款视频标题：15-25字，要吸引眼球，适合短视频平台
4. 视频标签：3-5个标签，用逗号分隔，要相关且热门

请以JSON格式返回，格式如下：
{
    "mainTitle": "主标题",
    "subTitle": "副标题",
    "viralTitle": "爆款标题",
    "videoTags": "标签1,标签2,标签3"
}

视频文案：
{scriptContent}`
  },
  rewrite: {
    system: '你是一名资深短视频文案撰写专家，擅长根据原始文案进行仿写改编，保持风格的同时避免重复。',
    user: `请根据以下原始文案进行仿写改编：

原始文案：
{originalScript}

要求：
1. 保持原文案的核心主题和情感基调
2. 用全新的表达方式重新组织语言
3. 输出语言为{langName}
4. 控制在约{targetLength}字左右
5. 输出纯JSON格式：{"rewrittenText": "改写后的文案内容"}
6. 尽量避免在 rewrittenText 里出现未转义的英文双引号
7. 不要输出任何emoji和特殊标点符号`
  },
  translate: {
    system: '你是一名专业的多语言翻译专家，擅长将文案翻译成目标语言，同时保持原文的语气和风格。',
    user: `请将以下{sourceLangName}文案翻译成{targetLangName}：

{scriptContent}

要求：
1. 保持原文的语气和情感
2. 翻译要自然流畅，适合口播
3. 只输出翻译结果，不要加任何解释`
  },
  legal_review: {
    system: `你是一名中国广告法合规审核员。直接输出最终 JSON，不要展示分析过程、不要 Markdown。
重点检查：极限词（最、第一、唯一、顶级、冠军等）、绝对化用语（绝对、100%、永远、万能、全能、真正、彻底等）、虚假承诺（治愈、根治、一次见效、零风险等）、权威背书（国家级、世界级、特供、指定等）、无依据声称（销量第一、全网最低价、独一无二等）和隐含绝对化表达（牢牢、必定、一定、肯定等）。
只做词级或短语级替换，不整句改写；edits.original 必须是原文中连续存在的精确片段。`,
    user: `逐词审核以下文案，宁可多报不漏报。

输出纯 JSON，格式必须是：
{
  "reviewedText": "按 edits 替换后的完整文案；无风险则与原文完全一致",
  "suggestions": "每个替换的原因；无风险则为：文案未发现违禁词。",
  "edits": [
    { "original": "原文中的风险词或短语", "replacement": "合规替换词", "reason": "风险原因" }
  ]
}

要求：
1. 如无风险，edits 必须是空数组。
2. replacement 不能继续包含同类风险词。
3. reviewedText 必须体现所有 edits 的替换结果。

待审核文案：
{scriptContent}`
  },
  viral_title: {
    system: '你是一名短视频运营专家，擅长根据视频文案生成吸引眼球的爆款标题和精准标签。',
    user: `请根据以下{langName}文案，生成一个爆款视频标题和视频标签：

文案内容：
{scriptContent}

要求：
1. 爆款标题要有吸引力，能引发好奇心，适合在抖音、快手等平台发布，不超过30个字
2. 视频标签用逗号分隔，3-5个关键词，便于平台推荐
3. 只输出纯JSON格式：{"viralTitle": "爆款标题", "videoTags": "标签1,标签2,标签3"}`
  }
}

export const templateService = {
  async getParsedTemplate(
    templateName: string,
    variables: Record<string, string>
  ): Promise<ParsedTemplate> {
    const template = TEMPLATES[templateName]
    if (!template) {
      throw new Error(`Template "${templateName}" not found`)
    }

    let systemPrompt = template.system
    let userPrompt = template.user

    // Replace variables in templates
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`
      systemPrompt = systemPrompt.split(placeholder).join(value)
      userPrompt = userPrompt.split(placeholder).join(value)
    }

    return {
      systemPrompt,
      userPrompts: [userPrompt]
    }
  }
}
