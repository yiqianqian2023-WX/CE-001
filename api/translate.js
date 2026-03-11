const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

const LANG_MAP = {
  en: '英语',
  de: '德语',
  fr: '法语',
  es: '西班牙语',
  ja: '日语',
  ar: '阿拉伯语'
};

function buildTranslationSystemPrompt(langName) {
  return '你是一名精通阿里巴巴国际站运营的翻译专家。你的任务是将用户输入的中文翻译成地道的商务' + langName + '。\n\n严格遵守阿里国际站 B 端规范：1）若有标题，必须控制在 128 字符以内；2）描述分条输出；3）不含标点符号；4）保留 4G、NFC、Android 等技术规格词不意译；5）语气温和、专业、睿智。\n\n你必须以纯 JSON 格式输出，且仅输出 JSON，不要任何其他文字。格式如下：\n{"chinese_review":"...","target_translation":"..."}\n\nchinese_review：中文校对稿，严格还原翻译中的所有关键要素（参数、交期、物流、规格等）。\n\ntarget_translation：目标语种（' + langName + '）的最终翻译稿，分条无标点。';
}

function buildAnalysisSystemPrompt() {
  return '你是一名精通阿里巴巴国际站运营的询盘分析专家。你的任务是从客户原始询盘中提取核心关键词。\n\n提取范围：产品地道称呼、技术参数（4G、NFC、Android 版本等）、交易倾向（样机、大货、定制等）。\n\n输出要求：提取 5-8 个核心词，使用客户询盘的原语种，每行一个，不要标点、不要编号、不要解释。';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(500).json({ success: false, error: '服务端未配置 DEEPSEEK_API_KEY 环境变量' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ success: false, error: '请求体格式错误' });
    return;
  }

  const text = (body && body.text) ? String(body.text).trim() : '';
  if (!text) {
    res.status(400).json({ success: false, error: '请提供要翻译的文本' });
    return;
  }

  const isAnalysisMode = !!(body && (body.isAnalysisMode || body.inquiryAnalysis));
  const targetLangCode = (body && body.targetLang) ? String(body.targetLang).trim() : 'en';
  const langName = LANG_MAP[targetLangCode] || LANG_MAP.en;

  let systemPrompt, userPrompt;
  if (isAnalysisMode) {
    systemPrompt = buildAnalysisSystemPrompt();
    userPrompt = '请从以下客户询盘中提取 5-8 个核心关键词，每行一个，使用原语种：\n\n' + text;
  } else {
    systemPrompt = buildTranslationSystemPrompt(langName);
    userPrompt = '请将以下中文翻译成地道的商务' + langName + '，标题限 128 字符，描述分条无标点：\n\n' + text;
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = (data.error && data.error.message) ? data.error.message : ('HTTP ' + response.status);
      res.status(response.status).json({ success: false, error: msg });
      return;
    }

    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      res.status(502).json({ success: false, error: '接口返回格式异常，未获取到翻译内容' });
      return;
    }

    const rawContent = (content + '').trim();
    let result = rawContent;

    if (isAnalysisMode) {
      result = rawContent;
    } else {
      try {
        let jsonStr = rawContent;
        const codeBlock = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlock) jsonStr = codeBlock[1].trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed.target_translation != null) result = String(parsed.target_translation).trim();
      } catch (e) {
        result = rawContent;
      }
    }

    res.status(200).json({ success: true, result: result });
  } catch (err) {
    const message = err.message || String(err);
    res.status(500).json({ success: false, error: '网络或服务异常：' + message });
  }
}
