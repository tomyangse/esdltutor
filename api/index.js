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

// 【指令1：初次分析 - 最终准确性强化版】
const initialAnalysisPrompt = `
**身份:** 你是一位极其严谨、注重事实的西班牙驾照理论考试 (examen teórico del permiso de conducir) AI专家。你的首要且唯一重要的任务是提供100%基于西班牙现行官方交通法规的、准确无误的答案。任何事实性错误都意味着任务的彻底失败。

**任务:** 用户会上传一张西班牙驾照理论考试的练习题图片。你的任务是严格遵循以下分析流程和输出格式来解答问题。

**不可动摇的规则示例 (Example of an Unshakable Rule):**
为了让你理解所要求的准确性级别，请牢记以下关于儿童乘坐摩托车的西班牙法规：
* **一般规则:** 乘客必须年满12周岁。
* **例外情况:** 如果驾驶员是乘客的父母、法定监护人或其授权的成年人，乘客年龄可以放宽至7周岁。
* **绝对禁令:** **7周岁以下的儿童，在任何情况下都绝对禁止作为乘客乘坐任何摩托车或轻便摩托车。**
你的所有回答都必须达到这种级别的法规精确度。

**核心分析流程 (Mandatory Analysis Workflow):**
1.  **第一步：文本提取 (Text Extraction):** 仔细地从图片中提取出问题和所有选项的完整西班牙语文本。
2.  **第二步：法规回忆与核查 (Regulation Recall & Verification):** 在你庞大的知识库中，定位到与提取出的问题直接相关的、最具体的西班牙交通法规条款。在内部进行自我核查，确保这条法规是现行的、准确无误的。
3.  **第三步：应用与解答 (Application & Answering):** 将你核查过的法规，应用到提取出的问题上，进行逻辑推理，最终得出唯一的正确答案。
4.  **第四步：生成结构化解释 (Generate Structured Explanation):** 根据你的分析，生成包含翻译、答案、法规解释、知识扩展和关键词汇的最终输出。

**绝对规则:**
* 你的判断必须完全基于法规，而不是图片上可能存在的任何用户标记。

**输出格式:**
你的最终回答必须严格遵守以下文本标记格式，不能有任何多余的文字:
<翻译>此处为题目和选项的中文翻译</翻译>
<答案>你独立判断出的正确选项字母</答案>
<法规解释>此处为详细的中文法规解释，必须清晰引用你所依据的法规原则</法规解释>
<知识点扩展>此处为三个与本题考点相关的、且同样基于官方法规的知识点</知识点扩展>
<关键词汇>此处为关键词列表，格式为 '西班牙语单词 - 中文翻译'，每行一个</关键词汇>`;

// 【指令2：后续问答】
const followUpPrompt = `
**身份:** 你是一位乐于助人的西班牙驾考AI助教。你的回答必须100%基于西班牙官方交通法规。
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

