# 部署指南

本文档指导你完成 Reading Shelf AI 功能的部署。分两部分：**后端（Cloudflare Worker）** 和 **前端（GitHub Pages）**。

---

## 第一部分：部署 Cloudflare Worker

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

安装后登录你的 Cloudflare 账号：

```bash
wrangler login
```

浏览器会弹出授权页面，点击允许。

### 2. 进入项目目录

```bash
cd /你的路径/reading-shelf
```

### 3. 设置环境变量

**不要**在 `wrangler.toml` 中写真实密钥。用命令行设置（加密存储在 Cloudflare）：

```bash
wrangler secret put GLM_API_KEY
# 粘贴你的智谱 API Key，回车

wrangler secret put ADMIN_PASSWORD
# 输入你的管理员密码（你自己定一个，比如 mySecret123）

wrangler secret put GITHUB_TOKEN
# 粘贴你的 GitHub Personal Access Token（下一步教你获取）

wrangler secret put GITHUB_OWNER
# 输入你的 GitHub 用户名，如 esthersjw

wrangler secret put GITHUB_REPO
# 输入仓库名，如 reading-shelf

wrangler secret put GITHUB_PATH
# 输入 data.json

wrangler secret put GITHUB_BRANCH
# 输入 main（或你的默认分支名）
```

### 4. 部署

```bash
wrangler deploy
```

部署成功后会输出一个 URL，类似：
```
https://reading-shelf-api.your-name.workers.dev
```

**记下这个 URL**，下一步要用。

---

## 第二部分：获取 GitHub Token

Worker 需要通过 GitHub API 自动把新书写入 `data.json`。

1. 打开 https://github.com/settings/tokens?type=beta
2. 点击 **Generate new token**
3. 设置：
   - Token name: `reading-shelf-worker`
   - Expiration: 选你喜欢的时长（建议 90 天）
   - Repository access: 选 **Only select repositories** → 选你的 `reading-shelf` 仓库
   - Permissions → **Repository permissions** → **Contents** → 设为 **Read and write**
4. 点击 **Generate token**
5. 复制 token（只显示一次！）
6. 粘贴到上面的 `wrangler secret put GITHUB_TOKEN` 步骤

---

## 第三部分：配置前端

### 1. 填写 Worker URL

打开 `app.js`，找到第 4 行：

```javascript
const CONFIG = {
  workerUrl: '' // ← 填入你的 Worker URL
};
```

替换为你的 Worker 地址：

```javascript
const CONFIG = {
  workerUrl: 'https://reading-shelf-api.your-name.workers.dev'
};
```

### 2. 提交到 GitHub

```bash
git add app.js index.html worker.js wrangler.toml deploy-guide.md
git commit -m "feat: add AI book analysis and knowledge chat"
git push
```

GitHub Pages 会自动重建，几分钟后生效。

---

## 第四部分：使用

### 管理员入口

在浏览器地址栏的 URL 后面加 `#admin`：

```
https://hiesther.me/reading-shelf/#admin
```

会弹出密码输入框，输入你设置的 `ADMIN_PASSWORD`。

登录后：
- 头部出现 **🤖 知识问答** 和 **+ 添加新书** 按钮
- 刷新页面（同一标签页内）不需要重新登录
- 关闭浏览器标签页后需要重新登录

### 添加新书

1. 点击 **+ 添加新书**
2. 输入书名（必填）和作者（选填）
3. 点击 **🤖 AI帮我分析**
4. 等待 10-20 秒，AI 会自动分析并：
   - 提取分类、核心观点、关键词
   - 建立与已有书籍的关联
   - 自动写入 `data.json` 并 commit 到 GitHub
   - 新书立即出现在书架和网络图中
5. GitHub Pages 会在几分钟内自动重建，所有访客都能看到新书

### 知识问答

1. 点击 **🤖 知识问答** 标签
2. 在输入框中提问，比如：
   - "我总是害怕别人不喜欢我，怎么办？"
   - "如何培养一个好习惯？"
   - "书架里有哪些关于自我认知的观点？"
3. AI 会基于书架中 55 本书、295 个核心观点来回答
4. 回答中提到的书名（📖《书名》）可以点击直接打开书籍详情
5. 支持多轮连续对话，AI 会记住上下文
6. 点击 **清空对话** 可以重新开始

---

## 常见问题

### Q: 访客能看到添加新书和知识问答功能吗？
不能。这两个按钮默认隐藏，只有通过 `#admin` 入口登录后才会显示。

### Q: 新书添加后多久访客能看到？
Worker 会立即 commit 到 GitHub repo。GitHub Pages 通常 1-5 分钟内自动重建。

### Q: 如果 GitHub commit 失败怎么办？
新书数据仍会保存在你的浏览器 localStorage 中，你自己立即可见。你可以手动把数据贴入 `data.json` 提交。

### Q: 智谱 API 用什么模型？
Worker 中使用 `glm-4-plus`。如果需要换成其他模型，修改 `worker.js` 中的 `model` 字段即可。

### Q: 对话历史会保存吗？
对话历史仅保存在当前页面的内存中，刷新页面后会清空。这保证了隐私性。
