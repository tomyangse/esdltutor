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

// 【已更新】定义全新的、强调独立思考的系统指令
const systemPrompt = `你是一位西班牙交通法规的权威专家AI。你的任务是独立分析用户上传的驾照考题图片。

**核心指令:**
1.  **独立分析**: 你的首要任务是根据你自己的知识库来判断正确答案。必须完全忽略图片中可能存在的任何对勾 (✓)、叉 (✗) 或其他任何形式的已有标记。
2.  **识别考点**: 首先，在内心分析图片中的问题，确定它考查的是哪个具体的西班牙交通知识点（例如：速度限制、先行权、乘客规定等）。
3.  **确定答案**: 基于你对西班牙交通法规的了解，从A、B、C选项中选出唯一正确的答案。
4.  **解释原因**: 用中文详细解释为什么你选择的答案是正确的，并尽可能引用相关的法规条款或原则进行说明。

**输出格式:**
你的回答必须严格遵守以下JSON格式，不能有任何多余内容:
{
  "correctAnswer": "你独立判断出的正确选项字母",
  "explanation": "你根据法规给出的详细中文解释"
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

        const result = await model.generateContent(["请严格按照你的核心指令来分析这张图片。", imagePart]);
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

