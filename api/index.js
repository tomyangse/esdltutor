// 使用 ES 模块导入
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
// 我们不再需要导入 '@google/generative-ai'，将使用原生的 fetch

// 初始化 Express 应用
const app = express();

// 使用 CORS 中间件，允许所有来源的跨域请求
app.use(cors()); 

// 使用 Express 内置的 JSON 解析中间件
// 增加请求体大小限制，例如50MB，以处理高分辨率图片
app.use(express.json({ limit: '50mb' }));

// 【指令1：初次分析】
const initialAnalysisPrompt = `
**身份:** 你是一位专门解答西班牙驾考理论考试 (examen teórico del permiso de conducir) 的AI专家。
**任务:** 用户会上传一张西班牙驾照理论考试的练习题图片。你的任务是严格遵循以下分析流程和输出格式来解答问题。
**分析流程 (Methodology):**
1.  **翻译:** 将图片中的西班牙语问题和所有选项准确地翻译成中文。
2.  **分析与解答:** 严格根据你脑中的西班牙官方交通法规知识库，独立判断出哪个选项是唯一正确的答案。
3.  **解释依据:** 详细解释你的判断所依据的交通法规。
4.  **知识扩展:** 基于本题的核心考点，再引申出三个相关的法规知识点。
5.  **关键词汇:** 从题目中提取3-5个核心的西班牙语交通词汇，并提供其中文翻译。
**绝对规则 (Absolute Rule):**
* 你的判断必须完全基于法规，而不是图片上可能存在的任何用户标记。
**输出格式:**
你的最终回答必须严格遵守以下文本标记格式，不能有任何多余的文字:
<翻译>此处为题目和选项的中文翻译</翻译>
<答案>你独立判断出的正确选项字母</答案>
<法规解释>此处为详细的中文法规解释</法规解释>
<知识点扩展>此处为三个相关的中文知识点扩展，请用项目符号分开</知识点扩展>
<关键词汇>此处为关键词列表，格式为 '西班牙语单词 - 中文翻译'，每行一个</关键词汇>`;

// 【指令2：后续问答】
const followUpPrompt = `
**身份:** 你是一位乐于助人的西班牙驾考AI助教。
**任务:** 用户对你之前的分析提出了一个后续问题。你需要根据之前提供的分析内容（上下文）和你的交通法规知识，用友好、清晰的中文来回答用户的问题。
**规则:**
* 直接回答问题，不要重复上下文内容。
* 保持回答简洁、切题。
* 如果问题超出了驾考范围，请礼貌地说明。`;


// 辅助函数：解析初次分析的响应
function parseInitialResponse(text) {
    const translationMatch = text.match(/<翻译>([\s\S]*?)<\/翻译>/);
    const answerMatch = text.match(/<答案>(.*?)<\/答案>/);
    const explanationMatch = text.match(/<法规解释>([\s\S]*?)<\/法规解释>/);
    const relatedPointsMatch = text.match(/<知识点扩展>([\s\S]*?)<\/知识点扩展>/);
    const keywordsMatch = text.match(/<关键词汇>([\s\S]*?)<\/关键词汇>/);

    if (translationMatch && answerMatch && explanationMatch && relatedPointsMatch && keywordsMatch) {
        return {
            translation: translationMatch[1].trim(),
            correctAnswer: answerMatch[1].trim(),
            explanation: explanationMatch[1].trim(),
            relatedPoints: relatedPointsMatch[1].trim(),
            keywords: keywordsMatch[1].trim()
        };
    }
    return null;
}

// 定义 POST API 端点
app.post('/api', async (req, res) => {
    try {
        const { image, context, question } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        const modelName = "gemini-1.5-pro-latest";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        let systemInstructionText;
        let userParts = [];

        if (image) {
            // --- 模式1：初次图片分析 ---
            systemInstructionText = initialAnalysisPrompt;
            userParts.push({ text: "请严格按照你的分析流程和输出格式进行操作。" });
            userParts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });

        } else if (context && question) {
            // --- 模式2：后续问答 ---
            systemInstructionText = followUpPrompt;
            const contextString = `这是之前的分析上下文：\n${JSON.stringify(context, null, 2)}`;
            userParts.push({ text: contextString });
            userParts.push({ text: `现在，请回答用户基于以上内容提出的问题：\n"${question}"` });

        } else {
            return res.status(400).json({ error: '无效的请求。请提供图片或上下文和问题。' });
        }
        
        const payload = {
            systemInstruction: { parts: [{ text: systemInstructionText }] },
            contents: [{ parts: userParts }]
        };

        const apiResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!apiResponse.ok) {
            const errorData = await apiResponse.json();
            throw new Error(`Google API Error: ${apiResponse.status} - ${JSON.stringify(errorData)}`);
        }

        const result = await apiResponse.json();
        const textFromAI = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textFromAI) {
            throw new Error("AI没有返回任何文本内容。");
        }

        // 根据模式返回不同格式的响应
        if (image) {
            const analysis = parseInitialResponse(textFromAI);
            if (analysis) {
                res.json(analysis);
            } else {
                res.json({
                    translation: "解析失败",
                    correctAnswer: "无法确定",
                    explanation: `AI未能按预期的文本标记格式返回结果。其原始回复如下：\n\n"${textFromAI}"`,
                    relatedPoints: "无",
                    keywords: "无"
                });
            }
        } else { // Follow-up question
            res.json({ answer: textFromAI });
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

