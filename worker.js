/**
 * Reading Shelf API — Cloudflare Worker
 * 
 * Endpoints:
 *   POST /api/verify        — 验证管理员密码
 *   POST /api/analyze-book  — AI分析新书 + commit到GitHub
 *   POST /api/chat          — 多轮知识问答对话
 * 
 * Environment variables (set via wrangler or dashboard):
 *   GLM_API_KEY      — 智谱API Key
 *   ADMIN_PASSWORD   — 管理员密码
 *   GITHUB_TOKEN     — GitHub Personal Access Token (repo权限)
 *   GITHUB_OWNER     — 仓库owner (如 esthersjw)
 *   GITHUB_REPO      — 仓库名 (如 reading-shelf)
 *   GITHUB_PATH      — data.json路径 (如 data.json)
 *   GITHUB_BRANCH    — 分支名 (如 main)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/verify' && request.method === 'POST') {
        return handleVerify(request, env);
      }
      if (path === '/api/analyze-book' && request.method === 'POST') {
        return handleAnalyzeBook(request, env);
      }
      if (path === '/api/chat' && request.method === 'POST') {
        return handleChat(request, env);
      }
      return jsonResponse({ error: 'Not found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }
};

// ===== Helpers =====
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function checkAuth(request, env) {
  const token = request.headers.get('X-Admin-Token');
  return token && token === env.ADMIN_PASSWORD;
}

// ===== Verify =====
async function handleVerify(request, env) {
  if (!checkAuth(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  return jsonResponse({ ok: true });
}

// ===== Analyze Book =====
async function handleAnalyzeBook(request, env) {
  if (!checkAuth(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { title, author } = await request.json();
  if (!title) return jsonResponse({ error: '书名不能为空' }, 400);

  // 1. Fetch current data.json from GitHub to get existing context
  const currentData = await fetchGitHubData(env);
  const existingKeywords = [...new Set(
    (currentData.insights || []).flatMap(i => i.keywords || [])
  )].slice(0, 80);
  const existingTitles = (currentData.books || [])
    .map(b => b.title.replace(/[《》]/g, ''))
    .slice(0, 60);

  // 2. Call GLM to analyze the book
  const systemPrompt = `你是一个读书分析助手。用户会给你一本书的书名（和可能的作者），请返回JSON格式的分析结果。

分类选项（选一个最合适的中文分类名）：心理学、个人成长、认知科学、哲学、情绪管理、关系沟通、自我认知、正念冥想、其他

已有书架的关键词：${existingKeywords.join('、')}
已有书架的书名：${existingTitles.join('、')}

请严格返回以下JSON格式（不要有其他文字）：
{
  "author": "作者名",
  "category": "分类名",
  "verdict": "一句话书评（50-80字，说清这本书适合谁、解决什么问题）",
  "highlights": "全书高光（3个核心要点，用（1）（2）（3）格式）",
  "tags": ["标签1", "标签2", "标签3"],
  "chapters": [
    {
      "chapterName": "主题章节名",
      "insights": [
        {
          "point": "核心观点（一句话）",
          "explanation": "解释（2-3句话）",
          "example": "生活中的例子",
          "keywords": ["关键词1", "关键词2"]
        }
      ]
    }
  ],
  "edges": [
    {
      "targetBookTitle": "已有书架中相关书的书名",
      "relation": "两本书的关联描述"
    }
  ]
}

注意：
- chapters至少2个，每个chapter至少2个insights
- keywords尽量复用已有关键词列表中的词
- edges找1-3本已有书架中的书建立关联
- 所有内容用中文`;

  const glmResult = await callGLM(env, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `书名：${title}${author ? '\n作者：' + author : ''}` }
  ], 0.7);

  let parsed;
  try {
    let jsonStr = glmResult;
    const jsonMatch = glmResult.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    parsed = JSON.parse(jsonStr.trim());
  } catch (e) {
    return jsonResponse({ error: 'AI返回格式解析失败', raw: glmResult }, 500);
  }

  // 3. Build the new book object
  const bookId = 'custom-' + Date.now();
  const cleanTitle = title.replace(/[《》]/g, '');
  const finalAuthor = author || parsed.author || '未知';

  const newBook = {
    bookId,
    title: cleanTitle,
    author: finalAuthor,
    category: parsed.category || '其他',
    verdict: parsed.verdict || '',
    highlights: parsed.highlights || '',
    tags: parsed.tags || [],
    chapters: (parsed.chapters || []).map((ch, ci) => ({
      chapterName: ch.chapterName,
      insights: (ch.insights || []).map((ins, ii) => ({
        id: `${bookId}-ch${ci}-ins${ii}`,
        bookId,
        point: ins.point,
        explanation: ins.explanation,
        example: ins.example || '',
        keywords: ins.keywords || []
      }))
    }))
  };

  // 4. Build new edges
  const newEdges = [];
  (parsed.edges || []).forEach(edge => {
    const targetTitle = (edge.targetBookTitle || '').replace(/[《》]/g, '');
    const targetBook = (currentData.books || []).find(
      b => b.title.replace(/[《》]/g, '') === targetTitle
    );
    if (targetBook && targetBook.chapters && targetBook.chapters.length > 0) {
      const srcIns = newBook.chapters[0]?.insights[0];
      const tgtIns = targetBook.chapters[0]?.insights[0];
      if (srcIns && tgtIns) {
        newEdges.push({
          source: srcIns.id,
          target: tgtIns.id,
          relation: edge.relation
        });
      }
    }
  });

  // 5. Commit to GitHub
  const updatedData = {
    books: [...(currentData.books || []), newBook],
    insights: [
      ...(currentData.insights || []),
      ...newBook.chapters.flatMap(ch => ch.insights)
    ],
    edges: [...(currentData.edges || []), ...newEdges]
  };

  try {
    await commitToGitHub(env, updatedData, `Add book: ${cleanTitle}`);
  } catch (e) {
    // Commit failed, but still return the book data for localStorage
    console.error('GitHub commit failed:', e);
  }

  return jsonResponse({ book: newBook, edges: newEdges });
}

// ===== Chat =====
// Cache data.json in memory (Workers keep state per isolate)
let cachedData = null;
let cachedDataTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedData(env) {
  const now = Date.now();
  if (cachedData && (now - cachedDataTime) < CACHE_TTL) {
    return cachedData;
  }
  cachedData = await fetchGitHubData(env);
  cachedDataTime = now;
  return cachedData;
}

async function handleChat(request, env) {
  if (!checkAuth(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { messages } = await request.json();
  if (!messages || !messages.length) {
    return jsonResponse({ error: '消息不能为空' }, 400);
  }

  // 1. Fetch data.json (cached for 5 min)
  let data;
  try {
    data = await getCachedData(env);
  } catch (e) {
    return jsonResponse({ error: '数据加载失败: ' + e.message }, 500);
  }

  // 2. Build system prompt with all book knowledge
  const systemPrompt = buildChatSystemPrompt(data);

  // 3. Call GLM with full conversation history
  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const reply = await callGLM(env, allMessages, 0.7);

  return jsonResponse({ reply });
}

function buildChatSystemPrompt(data) {
  const books = data.books || [];
  const insights = data.insights || [];

  const insightsByBook = {};
  insights.forEach(ins => {
    if (!insightsByBook[ins.bookId]) insightsByBook[ins.bookId] = [];
    insightsByBook[ins.bookId].push(ins);
  });

  let knowledge = '';
  books.forEach(book => {
    const bookInsights = insightsByBook[book.bookId] || [];
    if (bookInsights.length === 0) return;
    knowledge += `\n《${book.title}》(${book.category})：`;
    if (book.verdict) knowledge += `${book.verdict}\n`;
    bookInsights.forEach(ins => {
      knowledge += `- ${ins.point}`;
      if (ins.explanation) knowledge += ` — ${ins.explanation.slice(0, 60)}`;
      if (ins.keywords && ins.keywords.length) {
        knowledge += ` [${ins.keywords.join('、')}]`;
      }
      knowledge += '\n';
    });
  });

  return `你是「不二的书架」AI 知识助手。基于书架中的书籍和核心观点回答问题。

${knowledge}

回答规则：
1. 优先基于上述书架中的知识点回答，引用时标注 📖《书名》
2. 可以串联多本书的观点综合分析
3. 如书架无相关内容，可给一般建议但需说明
4. 中文回答，简洁有洞察力`;
}

// ===== GLM API =====
async function callGLM(env, messages, temperature = 0.7) {
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.GLM_API_KEY}`
    },
    body: JSON.stringify({
      model: 'glm-4-flash',
      messages,
      temperature
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GLM API错误 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ===== GitHub API =====
async function fetchGitHubData(env) {
  const branch = env.GITHUB_BRANCH || 'main';
  const rawUrl = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${branch}/${env.GITHUB_PATH}`;
  const response = await fetch(rawUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch data.json: ${response.status}`);
  }
  return response.json();
}

async function commitToGitHub(env, data, message) {
  const path = env.GITHUB_PATH || 'data.json';
  const branch = env.GITHUB_BRANCH || 'main';
  const apiBase = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  // 1. Get current file SHA
  const getResponse = await fetch(`${apiBase}?ref=${branch}`, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'reading-shelf-worker'
    }
  });

  if (!getResponse.ok) {
    throw new Error(`GitHub API GET failed: ${getResponse.status}`);
  }

  const fileData = await getResponse.json();
  const sha = fileData.sha;

  // 2. Update file
  const jsonStr = JSON.stringify(data, null, 2);
  const bytes = new TextEncoder().encode(jsonStr);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const content = btoa(binary);

  const putResponse = await fetch(apiBase, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'reading-shelf-worker'
    },
    body: JSON.stringify({
      message,
      content,
      sha,
      branch
    })
  });

  if (!putResponse.ok) {
    const errText = await putResponse.text();
    throw new Error(`GitHub API PUT failed: ${putResponse.status} ${errText}`);
  }

  return await putResponse.json();
}
