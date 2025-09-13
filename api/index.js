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

// 定义系统指令（Prompt），并强化JSON输出要求
const systemPrompt = `你是一位精通西班牙交通法规的资深驾校教练。你的任务是分析用户上传的西班牙驾照理论考试练习题图片。
请遵循以下步骤和格式，用中文进行回复：
1.  **确定正确答案**：识别题目中的正确选项 (A, B, 或 C)。
2.  **详细解释原因**：清晰、详细地解释为什么这个选项是正确的。如果适用，请引用相关的西班牙交通法规或原则。
3.  **扩展知识点**：基于题目内容，提供两个相关且实用的交通知识点，帮助用户举一反三。

你的回答必须是结构化的JSON格式。JSON结构如下:
{
  "correctAnswer": "一个字母，例如 'B'",
  "explanation": "对正确答案的详细中文解释。",
  "relatedPoints": [
    {
      "title": "知识点1的中文标题",
      "content": "知识点1的详细中文内容。"
    },
    {
      "title": "知识点2的中文标题",
      "content": "知识点2的详细中文内容。"
    }
  ]
}

重要提示：你的整个回复必须且只能是一个原始的、有效的JSON对象。不要包含任何额外的文字、解释或者Markdown代码块标记 (例如 \`\`\`json)。`;

// 定义 POST API 端点
app.post('/api', async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: '请求体中未找到图片数据 (image data not found in body)' });
        }

        // 【最终修复】使用通用性更强的 gemini-1.5-flash 模型
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

        const result = await model.generateContent(["请根据系统指令分析这张图片里的题目。", imagePart]);
        const response = result.response;
        // 增加一个replace来清理模型可能意外添加的代码块标记
        const cleanedText = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const analysis = JSON.parse(cleanedText);
        
        res.json(analysis);

    } catch (error) {
        console.error('Error calling Gemini API:', error);
        res.status(500).json({ error: '调用 Gemini API 时发生内部错误 (Internal server error while calling Gemini API)' });
    }
});

// Vercel 会处理路由，本地开发时可以监听一个端口
// 注意：Vercel 环境下这个 `listen` 调用不会被执行
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// 默认导出 app 实例，供 Vercel 使用
export default app;

