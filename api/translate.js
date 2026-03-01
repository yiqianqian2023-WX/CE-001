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

function buildSystemPrompt(langName) {
  return '你是一名精通阿里巴巴国际站运营的翻译专家。你的任务是将用户输入的中文翻译成地道的商务' + langName + '。要求：严格遵守阿里国际站 B 端规范；语气温和、专业、睿智；保留 4G、NFC、Android 等技术规格词不意译。\n\n你必须以纯 JSON 格式输出，且仅输出 JSON，不要任何其他文字。格式如下：\n{"chinese_review":"...","target_translation":"..."}\n\nchinese_review：中文校对稿，必须严格还原你在翻译中包含的所有关键要素（如具体参数、交期、物流方式、规格型号等），确保用户能一眼看出翻译是否完整。\n\ntarget_translation：目标语种（' + langName + '）的最终翻译稿。';
}

function buildInquirySystemPrompt(langName) {
  return '你是一名精通阿里巴巴国际站运营的询盘分析专家。\n\n分析任务：从客户询盘中识别 1）产品的地道称呼 2）关注的技术参数（如 4G、NFC、Android 版本等）3）交易倾向（样机、大货、定制等）。\n\n输出格式（严格分条、不带标点、遵守 B 端沟通规范）：\n\n【客户需求核心提炼】\n先给出客户意图的简短分析，分条列出：地道称呼、技术参数、交易倾向，每条独立成行无标点\n\n【专业回复建议】\n根据睿智风格生成商务' + langName + '回复文案，分条输出无标点，可直接用于回复客户，保留 4G、NFC、Android 等技术规格词，语气专业睿智温和';
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

  const inquiryAnalysis = !!(body && body.inquiryAnalysis);
  const targetLangCode = (body && body.targetLang) ? String(body.targetLang).trim() : 'en';
  const langName = LANG_MAP[targetLangCode] || LANG_MAP.en;

  let systemPrompt, userPrompt;
  if (inquiryAnalysis) {
    systemPrompt = buildInquirySystemPrompt(langName);
    userPrompt = '请分析以下客户询盘：识别产品地道称呼、技术参数（4G/NFC/Android 等）、交易倾向（样机/大货/定制），先输出客户意图分析，再生成睿智风格的多语种回复建议。\n\n' + text;
  } else {
    systemPrompt = buildSystemPrompt(langName);
    userPrompt = '请将以下中文翻译成地道的商务' + langName + '：\n\n' + text;
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
    if (inquiryAnalysis) {
      const parts = rawContent.split(/【专业回复建议】/);
      const keyReq = parts[0] ? parts[0].replace(/^【客户需求核心提炼】\s*/, '').trim() : '';
      const reply = parts[1] ? parts[1].trim() : '';
      res.status(200).json({ success: true, content: rawContent, keyRequirements: keyReq, replySuggestion: reply });
    } else {
      let chineseReview = '';
      let targetTranslation = rawContent;
      try {
        let jsonStr = rawContent;
        const codeBlock = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlock) jsonStr = codeBlock[1].trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed.chinese_review != null) chineseReview = String(parsed.chinese_review).trim();
        if (parsed.target_translation != null) targetTranslation = String(parsed.target_translation).trim();
      } catch (e) {
        chineseReview = text;
      }
      res.status(200).json({
        success: true,
        content: targetTranslation,
        chinese_review: chineseReview || text,
        target_translation: targetTranslation
      });
    }
  } catch (err) {
    const message = err.message || String(err);
    res.status(500).json({ success: false, error: '网络或服务异常：' + message });
  }
}
