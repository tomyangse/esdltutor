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

// 【最终版指令 - 遵循您的两步逻辑】
const systemPrompt = `
**身份:** 你是一位专门解答西班牙驾照理论考试 (examen teórico del permiso de conducir) 的AI专家。

**任务:** 用户会上传一张西班牙驾照理论考试的练习题图片。你的任务是严格遵循以下分析流程来解答问题。

**分析流程 (Methodology):**
1.  **第一步：提取文本** - 首先，仔细地从图片中提取出问题和所有选项的完整西班牙语文本。这是你的思考基础。
2.  **第二步：分析与解答** - 接下来，严格根据你脑中的西班牙官方交通法规知识库，分析你刚刚提取出的问题，独立判断出哪个选项是唯一正确的答案，并准备好理论依据。

**绝对规则 (Absolute Rule):**
* 在你的整个分析过程中，必须完全忽略图片上可能存在的任何对勾(✓)、叉(✗)或其他用户标记。你的判断必须完全基于法规，而不是图片上的提示。

**结构化解释要求:**
你的解释必须包含以下几个部分，并使用换行分隔：
* **法规依据:** 清晰说明与题目相关的核心交通法规。
* **特殊情况:** (如果存在)说明该法规的任何例外情况。
* **本题解析:** 结合题目，总结并解释为什么该法规适用于本题，从而清晰地推导出正确答案。

**输出格式:**
你的最终回答必须严格遵守以下文本标记格式，不能有任何多余的文字:
<答案>你独立判断出的正确选项字母</答案><解释>包含了'法规依据', '特殊情况', 和 '本题解析'三个部分的详细中文解释。</解释>`;

// 定义一个辅助函数来解析AI返回的带标记的文本
function parseAIResponse(text) {
    const answerMatch = text.match(/<答案>(.*?)<\/答案>/);
    const explanationMatch = text.match(/<解释>([\s\S]*?)<\/解释>/);

    if (answerMatch && answerMatch[1] && explanationMatch && explanationMatch[1]) {
        return {
            correctAnswer: answerMatch[1].trim(),
            explanation: explanationMatch[1].trim(),
        };
    }
    return null; // 如果格式不匹配，返回null
}


// 定义 POST API 端点
app.post('/api', async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: '请求体中未找到图片数据 (image data not found in body)' });
        }

        const model = genAI.getGenerativeModel({
            // 【核心修复】使用最稳定、最适合图文理解的 gemini-pro-vision 模型
            model: "gemini-pro",
            systemInstruction: systemPrompt,
        });

        const imagePart = {
            inlineData: {
                data: image,
                mimeType: 'image/jpeg', // 假设是jpeg，也可以是png等
            },
        };

        const result = await model.generateContent(["请严格按照你的分析流程和输出格式进行操作。", imagePart]);
        const response = result.response;
        const textFromAI = response.text();
        
        // 使用解析函数来处理AI返回的文本
        const analysis = parseAIResponse(textFromAI);

        if (analysis) {
            // 如果成功解析，返回JSON
            res.json(analysis);
        } else {
            // 如果解析失败，说明AI返回了非结构化文本
            console.warn('AI response parsing failed, returning raw text as fallback explanation.');
            res.json({
                correctAnswer: "无法确定",
                explanation: `AI未能按预期的文本标记格式返回结果。其原始回复如下：\n\n"${textFromAI}"`
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


