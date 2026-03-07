export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY; // 请确保在 Vercel 后台设置了这个 Key

    const payload = {
        contents: [{
            parts: [
                { text: "你是一名资深阿里巴巴国际站运营。请识别图片中的技术参数并重组为专业 Listing：1.标题小于128字符 2.描述分条输出且不含标点符号 3.突出4G/NFC等核心参数 4.风格睿智、温和。" },
                { inline_data: { mime_type: "image/jpeg", data: image } }
            ]
        }]
    };

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        const output = data.candidates[0].content.parts[0].text;
        res.status(200).json({ output });
    } catch (error) {
        res.status(500).json({ error: 'Vision processing failed' });
    }
}