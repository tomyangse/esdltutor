// 使用 ES 模块导入
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cors from 'cors';
import 'dotenv/config';

// 初始化 Express 应用
const app = express();

// 使用 CORS 中间件，允许所有来源的跨域请求
app.use(cors()); 

// 使用 Express 内置的 JSON 解析中间件
// 增加请求体大小限制，例如50MB，以处理高分辨率图片
app.use(express.json({ limit: '50mb' }));

// 从环境变量中获取 API 密钥
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 【已更新】根据您的要求，定义最终版的、最精确的系统指令
const systemPrompt = `
**身份:** 你是一位专门解答西班牙驾照理论考试 (examen teórico del permiso de conducir) 的AI专家。

**任务:** 用户会上传一张西班牙驾照理论考试的练习题图片。你的任务是严格根据西班牙驾照考试的官方知识库来分析并解答这道题。

**核心指令:**
1.  **分析题目**: 首先，仔细分析图片中的问题和选项。
2.  **独立判断**: 根据西班牙驾照考试的官方规定，独立判断出哪个选项是唯一正确的答案。你必须完全忽略图片上可能存在的任何已有标记。
3.  **提供理论依据**: 在解释原因时，必须清晰地说明你判断的“理论依据”，即这个答案是基于哪一条或哪几条具体的西班牙交通法规。

**输出格式:**
你的回答必须严格遵守以下JSON格式，不能有任何多余的文字或标记:
{
  "correctAnswer": "你独立判断出的正确选项字母",
  "explanation": "详细的中文解释，其中必须包含该判断的理论依据。"
}`;

// 定义 POST API 端点
app.post('/api', async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: '请求体中未找到图片数据 (image data not found in body)' });
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemPrompt,
        });

        const imagePart = {
            inlineData: {
                data: image,
                mimeType: 'image/jpeg', // 假设是jpeg，也可以是png等
            },
        };

        const result = await model.generateContent(["请严格按照你的指令进行分析。", imagePart]);
        const response = result.response;
        const textFromAI = response.text();
        
        try {
            // 尝试直接解析AI返回的文本为JSON
            const analysis = JSON.parse(textFromAI);
            res.json(analysis);

        } catch (parseError) {
            // 如果解析失败，说明AI返回了非JSON文本
            console.warn('JSON parsing failed, returning raw text from AI as fallback explanation.');
            res.json({
                correctAnswer: "无法确定",
                explanation: `AI未能按格式要求返回结果，可能是因为它无法分析图片。其原始回复如下：\n\n"${textFromAI}"`
            });
        }

    } catch (apiError) {
        console.error('An unexpected error occurred in the API route:', apiError);
        res.status(500).json({ error: `调用 API 时发生意外错误: ${apiError.message}` });
    }
});

// Vercel 会处理路由，本地开发时可以监听一个端口
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// 默认导出 app 实例，供 Vercel 使用
export default app;

