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
  return '你是一名精通阿里巴巴国际站运营的翻译专家。你的任务是将用户输入的中文翻译成地道的商务' + langName + '。要求：严格遵守阿里国际站 B 端规范；亲切、友好；保留 4G、NFC、Android 等技术规格词不意译；语境要专业、睿智、温和。只输出翻译后的内容，不要额外解释。';
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

  const targetLangCode = (body && body.targetLang) ? String(body.targetLang).trim() : 'en';
  const langName = LANG_MAP[targetLangCode] || LANG_MAP.en;
  const systemPrompt = buildSystemPrompt(langName);
  const userPrompt = '请将以下中文翻译成地道的商务' + langName + '：\n\n' + text;

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

    res.status(200).json({ success: true, content: (content + '').trim() });
  } catch (err) {
    const message = err.message || String(err);
    res.status(500).json({ success: false, error: '网络或服务异常：' + message });
  }
}
