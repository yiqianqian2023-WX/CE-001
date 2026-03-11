// 1. 增加 Vercel 接口配置，允许接收最大 10MB 的图片数据，防止 500 错误
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
    // 仅允许 POST 请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. 从环境变量获取 API Key
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("CRITICAL_ERROR: GEMINI_API_KEY is missing in Vercel environment.");
        return res.status(200).json({ output: "错误：Vercel 后台未检测到 GEMINI_API_KEY，请检查环境变量设置。" });
    }

    const { image } = req.body;
    if (!image) {
        return res.status(200).json({ output: "错误：前端未传回图片数据，请检查 spec-reader.html 的变量名是否为 image。" });
    }

    // 3. 构建 Gemini 1.5 Flash 的请求体
    const payload = {
        contents: [{
            parts: [
                { text: "你是一名资深阿里巴巴国际站运营专家。请阅读图片中的技术参数，并按照以下要求输出：\n1. 标题：组合核心参数（如型号、关键规格），严格限制在 128 字符以内。\n2. 产品介绍：分条展示核心参数（如 CPU, RAM, NFC, Android 版本, 屏幕尺寸等），每条首字母大写，严禁包含标点符号，每条内容不要太长。\n3. 语气：专业、睿智、温和，直接输出内容，不要带‘好的，这是解析结果’之类的废话。" },
                { inline_data: { mime_type: "image/jpeg", data: image } }
            ]
        }]
    };

    try {
        // 4. 发起请求
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // 5. 睿智的提取逻辑：确保能拿到 text
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            const output = data.candidates[0].content.parts[0].text;
            res.status(200).json({ output });
        } else if (data.error) {
            // 如果是 Google API 报错（如 Key 无效或区域限制）
            console.error("GEMINI_API_ERROR:", data.error);
            res.status(200).json({ output: `Google API 报错: ${data.error.message}` });
        } else {
            // 兜底逻辑：如果返回了空结果
            console.log("UNKNOWN_RESPONSE_DATA:", JSON.stringify(data));
            res.status(200).json({ output: "解析失败：AI 没能从图片中提取到有效文字，请确保图片参数清晰可见。" });
        }
    } catch (error) {
        // 6. 捕获严重的运行错误
        console.error("SERVER_CRITICAL_ERROR:", error);
        res.status(500).json({ error: `后端运行崩溃: ${error.message}` });
    }
}