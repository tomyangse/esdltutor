// 使用 ES 模块导入
import express from 'express';
import cors from 'cors';
import 'dotenv/config';

// 初始化 Express 应用
const app = express();
app.use(cors()); 
app.use(express.json({ limit: '50mb' }));

// --- 指令 ---

// 指令1：初次分析
const initialAnalysisPrompt = `
**身份:** 你是一位极其严谨、注重事实的西班牙驾照理论考试AI专家。你的首要任务是提供100%基于西班牙现行官方交通法规的、准确无误的答案。
**任务:** 用户上传了一张练习题图片，图片中可能包含一道或多道题目。你的任务是识别出图片中的每一道独立题目，并对它们分别进行分析。
**核心分析流程:**
1.  **识别所有题目:** 遍历图片，找出所有的问题区域。
2.  **逐一分析:** 对你识别出的每一道题，都独立执行以下操作：
    a. **文本提取:** 从该题目区域提取问题和所有选项的西班牙语文本。
    b. **法规回忆与核查:** 在你的知识库中，定位到与该问题相关的、最具体的西班牙交通法规，并完成内部核查。
    c. **应用与解答:** 将核查过的法规应用到该问题上，得出唯一的正确答案。
    d. **生成结构化解释:** 根据分析，生成包含翻译、答案、法规解释、知识扩展和关键词汇的输出。
**绝对规则:**
* 你的判断必须完全基于法规，而不是图片上可能存在的任何用户标记。
* **忽略不完整题目:** 如果图片中的某道题目明显被截断或不完整（例如，问题文本或部分选项缺失），你必须忽略该题，不要将其包含在你的分析结果中。
**输出格式 (必须是严格的JSON数组):**
你的最终回答必须是一个包含所有题目分析结果的JSON数组。即使只有一道题，也必须放在数组中。每个分析对象都必须包含以下键：
[
  {
    "knowledgePoint": "...",
    "translation": "...",
    "correctAnswer": "...",
    "explanation": "...",
    "relatedPoints": "...",
    "keywords": "..."
  }
]`;

// 指令2：后续问答... (保持不变)
const followUpPrompt = `
**身份:** 你是一位乐于助人的西班牙驾考AI助教。你的回答必须100%基于西班牙官方交通法规。
**任务:** 用户对你之前的分析提出了一个后续问题。你需要根据之前提供的分析内容（上下文）和你的交通法规知识，用友好、清晰的中文来回答用户的问题。`;

// 指令3：生成测试题... (保持不变)
const testGenerationPrompt = `
**身份:** 你是一位西班牙驾考理论出题专家。
**任务:** 根据用户提供的一系列学习过的“考点标签”，为他们量身定制一套包含3道题的复习测试。
**输出格式 (必须是严格的JSON数组):**
[
  {
    "question_es": "...",
    "question_zh": "...",
    "options": ["A. ...", "B. ...", "C. ..."],
    "correct_answer": "A",
    "explanation": "..."
  }
]`;

// --- API 端点 ---
app.post('/api', async (req, res) => {
    try {
        const { image, context, question, testTopics } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        const modelName = "gemini-1.5-pro-latest";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        let systemInstructionText;
        let userParts = [];
        let generationConfig = {};
        
        if (image) {
            // --- 模式1：初次图片分析 ---
            systemInstructionText = initialAnalysisPrompt;
            userParts.push({ text: "请严格按照你的分析流程和输出格式进行操作。" });
            userParts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
            generationConfig = { response_mime_type: "application/json" };
        } else if (context && question) {
            // ... (后续问答逻辑不变)
            systemInstructionText = followUpPrompt;
            const contextString = `这是之前的分析上下文：\n${JSON.stringify(context, null, 2)}`;
            userParts.push({ text: contextString });
            userParts.push({ text: `现在，请回答用户基于以上内容提出的问题：\n"${question}"` });
        } else if (testTopics) {
            // ... (测试题生成逻辑不变)
            systemInstructionText = testGenerationPrompt;
            userParts.push({ text: `请根据以下考点出题: ${testTopics.join(', ')}` });
            generationConfig = { response_mime_type: "application/json" };
        } else {
            return res.status(400).json({ error: '无效的请求。' });
        }
        
        const payload = {
            systemInstruction: { parts: [{ text: systemInstructionText }] },
            contents: [{ parts: userParts }],
            ...(Object.keys(generationConfig).length > 0 && { generationConfig })
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
        if (!textFromAI) throw new Error("AI没有返回任何文本内容。");

        // 根据请求类型返回不同格式的响应
        if (image) {
            try {
                const analysisArray = JSON.parse(textFromAI);
                res.json({ analysis: analysisArray });
            } catch (e) {
                 res.status(500).json({ error: `AI未能按预期的JSON数组格式返回结果。原始回复：${textFromAI}` });
            }
        } else if (testTopics) {
            res.json({ testQuestions: JSON.parse(textFromAI) });
        } else {
            res.json({ answer: textFromAI });
        }

    } catch (apiError) {
        console.error('An unexpected error occurred in the API route:', apiError);
        res.status(500).json({ error: `调用 API 时发生意外错误: ${apiError.message}` });
    }
});

// Vercel 会处理路由
export default app;

