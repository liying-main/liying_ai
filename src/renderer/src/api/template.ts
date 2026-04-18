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
6. 不要输出任何emoji和特殊标点符号`
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
    system: `你是一名严格的中国广告法合规审核员。你的职责：逐词扫描文案，找出所有可能违反《中华人民共和国广告法》(2015修订)及相关法规的用语，并给出词级替换。

## 核心原则：宁可多标不漏标
遇到拿不准的词，一律标出并给出替换建议，由人工最终决定是否采纳。漏标的风险远大于多标。

## 必须检测的违禁词类别
1. 极限词：最、最好、最佳、最强、最大、最优、最高、最低、最新、最快、最便宜、最安全、最先进、最权威、第一、唯一、首个、首选、冠军、顶级、顶尖、极致、极品、王牌
2. 绝对化用语：绝对、100%、百分之百、完全、永远、永不、万能、全能、一切、强大、真正、彻底、根本
3. 虚假承诺：治愈、根治、永不反弹、无效退款、药到病除、一次见效、零风险、无副作用
4. 权威性虚构：国家级、世界级、驰名、特供、专供、指定、特效、权威
5. 无依据声称：销量第一、全网最低价、纯天然、史无前例、前所未有、独一无二
6. 隐含绝对化表达：牢牢、紧紧、死死、稳稳、必定、必然、一定、肯定、毫无疑问
7. 含"第一"的短语：即使嵌入其他词（如"第一步""第一次""第一名"），只要含"第一"均需标出

## 工作规则
- 只做词级或短语级替换（2-10字），绝不整句改写
- 不润色文风、不调整语气、不修改语法、不重组句式
- edits.original 必须是原文中连续存在的精确片段
- 即使文案不是广告（如鸡汤文、个人感悟），也要按广告法标准严格扫描`,
    user: `请严格逐词扫描以下文案，找出所有可能违反广告法的用语。宁可多报不漏报。输出纯JSON（不要代码块标记）。

## 输出格式
{
  "reviewedText": "将所有违禁词替换后的完整文案（如无违禁词则与原文完全一致）",
  "suggestions": "列出每个被替换的词及原因；如无违禁词则输出：文案未发现违禁词。",
  "edits": [
    { "original": "原文中的违禁词（2-10字精确摘录）", "replacement": "合规替换词", "reason": "违反广告法哪条规定" }
  ]
}

## 示例
输入文案：你以为的礼貌谨慎，可能正在消耗你的能量，真正的强大，不是有求必应，学会拒绝是守护内心秩序的第一步，牢牢握在自己手里。
正确输出：
{"reviewedText":"你以为的礼貌谨慎，可能正在消耗你的能量，真正的成长，不是有求必应，学会拒绝是守护内心秩序的关键一步，握在自己手里。","suggestions":"强大→成长（绝对化用语，暗示能力绝对化）；第一步→关键一步（含'第一'，广告法第9条）；牢牢握在→握在（隐含绝对化表达）","edits":[{"original":"强大","replacement":"成长","reason":"绝对化用语，暗示能力绝对化，广告法第9条"},{"original":"第一步","replacement":"关键一步","reason":"含极限词'第一'，广告法第9条"},{"original":"牢牢握在","replacement":"握在","reason":"隐含绝对化表达，广告法第9条"}]}

## 待审核文案
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
