
// ===== CONFIG =====
// 部署 Worker 后，把下面的 URL 替换为你的 Worker 地址
const CONFIG = {
  workerUrl: 'https://reading-shelf-api.esther-sjw.workers.dev'
};

// ===== CATEGORY SYSTEM =====
const CATEGORY_MAP = {
  'psychology': '心理学',
  'growth': '个人成长',
  'business': '商业',
  'design': '设计',
  'feminism': '女性',
  'literature': '文学'
};
const CATEGORY_COLORS = {
  '全部': '#1a1a2e',
  '心理学': '#2B7FD8',
  '个人成长': '#F4D758',
  '认知科学': '#5b9ed6',
  '哲学': '#7ab0d4',
  '情绪管理': '#e8c84a',
  '关系沟通': '#4a9fd8',
  '自我认知': '#3690d0',
  '正念冥想': '#6db8b0',
  '商业': '#4A9FD8',
  '设计': '#7AB8E8',
  '女性': '#E8C84A',
  '文学': '#5BAFD0',
  '其他': '#8a9bae'
};
const CATEGORY_TEXT_COLORS = {
  '个人成长': '#5a4a00',
  '情绪管理': '#5a4a00',
  '商业': '#fff',
  '设计': '#1a4a70',
  '女性': '#5a4a00',
  '文学': '#fff'
};

// ===== DATA =====
let DATA = { books: [], insights: [], edges: [] };
const bookMap = {};
let ORIGINAL_BOOK_IDS = new Set();
let activeFilter = '全部';

// ===== ADMIN STATE =====
let isAdmin = false;
let adminToken = '';

// ===== CHAT STATE =====
let chatMessages = [];
let chatInit = false;

// ===== LOCALSTORAGE MERGE =====
function loadCustomData() {
  try {
    const customBooks = JSON.parse(localStorage.getItem('reading-shelf-custom-books') || '[]');
    const customEdges = JSON.parse(localStorage.getItem('reading-shelf-custom-edges') || '[]');
    customBooks.forEach(cb => {
      if (!DATA.books.find(b => b.bookId === cb.bookId)) {
        DATA.books.push(cb);
      }
    });
    customEdges.forEach(ce => {
      DATA.edges.push(ce);
    });
    customBooks.forEach(cb => {
      if (cb.chapters) {
        cb.chapters.forEach(ch => {
          (ch.insights || []).forEach(ins => {
            if (!DATA.insights.find(i => i.id === ins.id)) {
              DATA.insights.push(ins);
            }
          });
        });
      }
    });
  } catch(e) {}
}

// ===== TITLE FORMATTING =====
function formatTitle(title) {
  if (!title) return '';
  const stripped = title.replace(/^[《]|[》]$/g, '');
  return '《' + stripped + '》';
}

// ===== CATEGORY HELPER =====
function getCategoryLabel(cat) {
  return cat || '其他';
}

// ===== ADMIN AUTH =====
function checkAdminMode() {
  const savedToken = sessionStorage.getItem('reading-shelf-admin-token');
  if (savedToken) {
    adminToken = savedToken;
    isAdmin = true;
    showAdminFeatures();
    return;
  }
  if (window.location.hash === '#admin') {
    document.getElementById('adminLoginModal').classList.add('open');
    setTimeout(() => document.getElementById('adminPasswordInput')?.focus(), 300);
  }
}

function showAdminFeatures() {
  document.getElementById('addBookBtn').style.display = '';
  const chatTab = document.getElementById('chatTabBtn');
  if (chatTab) chatTab.style.display = '';
}

document.getElementById('adminLoginBtn').addEventListener('click', async () => {
  const password = document.getElementById('adminPasswordInput').value;
  const errorEl = document.getElementById('adminLoginError');
  const btn = document.getElementById('adminLoginBtn');

  if (!password) {
    errorEl.textContent = '请输入密码';
    errorEl.style.display = 'block';
    return;
  }

  if (!CONFIG.workerUrl) {
    errorEl.textContent = '请先配置 Worker URL（在 app.js 顶部的 CONFIG 中）';
    errorEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = '验证中…';

  try {
    const res = await fetch(CONFIG.workerUrl + '/api/verify', {
      method: 'POST',
      headers: { 'X-Admin-Token': password }
    });

    if (res.ok) {
      adminToken = password;
      isAdmin = true;
      sessionStorage.setItem('reading-shelf-admin-token', password);
      showAdminFeatures();
      document.getElementById('adminLoginModal').classList.remove('open');
      document.getElementById('adminPasswordInput').value = '';
    } else {
      errorEl.textContent = '密码错误';
      errorEl.style.display = 'block';
    }
  } catch (e) {
    errorEl.textContent = '连接失败，请检查 Worker URL';
    errorEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = '登录';
});

document.getElementById('adminLoginModal').addEventListener('click', e => {
  if (e.target === document.getElementById('adminLoginModal')) {
    document.getElementById('adminLoginModal').classList.remove('open');
  }
});

document.getElementById('closeAdminLogin').addEventListener('click', () => {
  document.getElementById('adminLoginModal').classList.remove('open');
});

document.getElementById('adminPasswordInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('adminLoginBtn').click();
});

// ===== FILTER STATE & RENDER SHELF =====
function renderShelf() {
  const container = document.getElementById('tab-shelf');
  container.innerHTML = '';

  // Filter bar
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  const categories = ['全部', ...new Set(DATA.books.map(b => getCategoryLabel(b.category)))];
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-tag' + (cat === activeFilter ? ' active' : '');
    btn.textContent = cat;
    const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS['其他'];
    if (cat === activeFilter) {
      btn.style.background = color;
      btn.style.color = CATEGORY_TEXT_COLORS[cat] || '#fff';
    }
    btn.addEventListener('click', () => {
      activeFilter = cat;
      renderShelf();
    });
    filterBar.appendChild(btn);
  });
  container.appendChild(filterBar);

  // Book grid
  const grid = document.createElement('div');
  grid.className = 'book-grid';
  const filteredBooks = activeFilter === '全部'
    ? DATA.books
    : DATA.books.filter(b => getCategoryLabel(b.category) === activeFilter);

  filteredBooks.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';
    const catLabel = getCategoryLabel(book.category);
    card.dataset.cat = catLabel;
    const catColor = CATEGORY_COLORS[catLabel] || CATEGORY_COLORS['其他'];

    card.innerHTML = `
      <button class="delete-btn" data-book-id="${book.bookId}" title="删除">&times;</button>
      <div class="card-inner">
        <h3>${formatTitle(book.title)}</h3>
        <div class="author">${book.author || '未知'}</div>
        <div class="verdict">${book.verdict || ''}</div>
      </div>
      <div class="card-bottom">
        <span class="category-badge">${catLabel}</span>
        <div class="tags">
          ${(book.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
      </div>
    `;

    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBook(book.bookId);
    });

    card.addEventListener('click', () => openBook(book));
    grid.appendChild(card);
  });
  container.appendChild(grid);
}

// ===== DELETE BOOK =====
function deleteBook(bookId) {
  if (!confirm('确定要删除这本书吗？')) return;

  const isCustom = !ORIGINAL_BOOK_IDS.has(bookId);

  const idx = DATA.books.findIndex(b => b.bookId === bookId);
  if (idx > -1) DATA.books.splice(idx, 1);
  delete bookMap[bookId];

  DATA.insights = DATA.insights.filter(i => i.bookId !== bookId);

  DATA.edges = DATA.edges.filter(e => {
    const srcIns = DATA.insights.find(i => i.id === e.source);
    const tgtIns = DATA.insights.find(i => i.id === e.target);
    return srcIns && tgtIns;
  });

  if (isCustom) {
    let customBooks = JSON.parse(localStorage.getItem('reading-shelf-custom-books') || '[]');
    customBooks = customBooks.filter(b => b.bookId !== bookId);
    localStorage.setItem('reading-shelf-custom-books', JSON.stringify(customBooks));

    let customEdges = JSON.parse(localStorage.getItem('reading-shelf-custom-edges') || '[]');
    customEdges = customEdges.filter(e => {
      const srcOk = DATA.insights.find(i => i.id === e.source);
      const tgtOk = DATA.insights.find(i => i.id === e.target);
      return srcOk && tgtOk;
    });
    localStorage.setItem('reading-shelf-custom-edges', JSON.stringify(customEdges));
  }

  renderShelf();
  networkInit = false;
}

// ===== BOOK MODAL =====
function openBook(book) {
  const catLabel = getCategoryLabel(book.category);
  const catEmoji = catLabel === '心理学' ? '🧠' : catLabel === '个人成长' ? '🌱' : '📖';
  let html = '';

  html += `<section class="book-section cover-section">
    <div class="section-label">${catEmoji} ${catLabel}</div>
    <h1 class="book-title">${formatTitle(book.title)}</h1>
    <div class="book-author">${book.author || '未知'}</div>
    <div class="book-verdict">${book.verdict || ''}</div>
    <div class="book-tags">${(book.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')}</div>
  </section>`;

  if (book.highlights) {
    html += `<section class="book-section highlights-section">
      <div class="b-section-label">全书高光 HIGHLIGHTS</div>
      <div class="highlights-content">${book.highlights}</div>
    </section>`;
  }

  (book.chapters||[]).forEach(ch => {
    html += `<section class="book-section chapter-section">
      <div class="chapter-name">${ch.chapterName}</div>`;
    (ch.insights||[]).forEach(ins => {
      const kwHtml = (ins.keywords||[]).map(k=>`<span class="kw">${k}</span>`).join('');
      html += `<div class="insight-block">
        <div class="insight-point">${ins.point}</div>
        <div class="insight-explanation">${ins.explanation}</div>
        ${ins.example ? `<div class="insight-example">🌰 ${ins.example}</div>` : ''}
        <div class="insight-keywords">${kwHtml}</div>
      </div>`;
    });
    html += '</section>';
  });

  html += `<section class="book-section end-section"><div class="end-emoji">📖</div><button class="back-to-shelf-btn">← 返回书架</button></section>`;

  document.getElementById('bookScrollContent').innerHTML = html;
  document.getElementById('bookModal').classList.add('open');
  document.getElementById('bookScrollContent').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  const backBtn = document.querySelector('.back-to-shelf-btn');
  if (backBtn) backBtn.addEventListener('click', closeBook);
}

function closeBook() {
  document.getElementById('bookModal').classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('modalClose').onclick = closeBook;
document.getElementById('bookModal').addEventListener('click', e => {
  if (e.target === document.getElementById('bookModal')) closeBook();
});

document.addEventListener('keydown', e => {
  if (!document.getElementById('bookModal').classList.contains('open')) return;
  if (e.key === 'Escape') closeBook();
});

// ===== ADD BOOK MODAL =====
document.getElementById('addBookBtn').addEventListener('click', () => {
  document.getElementById('addBookModal').classList.add('open');
  document.getElementById('newBookTitle').value = '';
  document.getElementById('newBookAuthor').value = '';
  document.getElementById('addBookError').style.display = 'none';
  document.getElementById('newBookTitle').focus();
});

document.getElementById('closeAddModal').addEventListener('click', () => {
  document.getElementById('addBookModal').classList.remove('open');
});

document.getElementById('addBookModal').addEventListener('click', e => {
  if (e.target === document.getElementById('addBookModal')) {
    document.getElementById('addBookModal').classList.remove('open');
  }
});

// ===== AI ANALYSIS (via Worker) =====
document.getElementById('aiAnalyzeBtn').addEventListener('click', async () => {
  const title = document.getElementById('newBookTitle').value.trim();
  const author = document.getElementById('newBookAuthor').value.trim();
  const errorEl = document.getElementById('addBookError');
  const btn = document.getElementById('aiAnalyzeBtn');

  if (!title) {
    errorEl.textContent = '请输入书名';
    errorEl.style.display = 'block';
    return;
  }

  const cleanTitle = title.replace(/[《》]/g, '');
  if (DATA.books.find(b => b.title.replace(/[《》]/g, '') === cleanTitle)) {
    errorEl.textContent = '这本书已经在书架上了';
    errorEl.style.display = 'block';
    return;
  }

  if (!CONFIG.workerUrl) {
    errorEl.textContent = '请先配置 Worker URL';
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = '🤖 AI分析中…';

  try {
    const res = await fetch(CONFIG.workerUrl + '/api/analyze-book', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken
      },
      body: JSON.stringify({ title, author })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `请求失败 (${res.status})`);
    }

    const result = await res.json();
    processAIResult(result.book, result.edges);

    document.getElementById('addBookModal').classList.remove('open');
  } catch (e) {
    errorEl.textContent = e.message || 'AI分析失败，请重试';
    errorEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.classList.remove('loading');
  btn.textContent = '🤖 AI帮我分析';
});

function processAIResult(book, edges) {
  // Add to DATA
  DATA.books.push(book);
  bookMap[book.bookId] = book;

  book.chapters.forEach(ch => {
    ch.insights.forEach(ins => {
      DATA.insights.push(ins);
    });
  });

  (edges || []).forEach(edge => {
    DATA.edges.push(edge);
  });

  // Save to localStorage as backup
  let customBooks = JSON.parse(localStorage.getItem('reading-shelf-custom-books') || '[]');
  customBooks.push(book);
  localStorage.setItem('reading-shelf-custom-books', JSON.stringify(customBooks));

  let customEdges = JSON.parse(localStorage.getItem('reading-shelf-custom-edges') || '[]');
  customEdges.push(...(edges || []));
  localStorage.setItem('reading-shelf-custom-edges', JSON.stringify(customEdges));

  renderShelf();
  networkInit = false;
}

// ===== CHAT =====
function initChat() {
  if (chatInit) return;
  chatInit = true;

  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');

  chatSendBtn.addEventListener('click', sendChatMessage);

  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  document.getElementById('chatClearBtn').addEventListener('click', () => {
    chatMessages = [];
    document.getElementById('chatMessages').innerHTML = '';
    showChatWelcome();
  });

  showChatWelcome();
}

function showChatWelcome() {
  const welcome = document.getElementById('chatMessages');
  if (chatMessages.length === 0) {
    welcome.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon">🤖</div>
        <div class="chat-welcome-title">知识问答助手</div>
        <div class="chat-welcome-desc">基于书架中 ${DATA.books.length} 本书、${DATA.insights.length} 个核心观点，帮你分析问题和寻找答案</div>
        <div class="chat-suggestions">
          <button class="chat-suggestion" data-q="我总是害怕别人不喜欢我，怎么办？">我总是害怕别人不喜欢我，怎么办？</button>
          <button class="chat-suggestion" data-q="如何培养一个好习惯？">如何培养一个好习惯？</button>
          <button class="chat-suggestion" data-q="亲密关系中经常吵架正常吗？">亲密关系中经常吵架正常吗？</button>
          <button class="chat-suggestion" data-q="书架里有哪些关于自我认知的观点？">书架里有哪些关于自我认知的观点？</button>
        </div>
      </div>
    `;
    welcome.querySelectorAll('.chat-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('chatInput').value = btn.dataset.q;
        sendChatMessage();
      });
    });
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  if (!CONFIG.workerUrl) {
    appendChatMessage('assistant', '请先配置 Worker URL');
    return;
  }

  // Clear welcome
  if (chatMessages.length === 0) {
    document.getElementById('chatMessages').innerHTML = '';
  }

  // Add user message
  chatMessages.push({ role: 'user', content: text });
  appendChatMessage('user', text);

  // Clear input
  input.value = '';
  input.style.height = 'auto';

  // Show typing indicator
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-message assistant';
  typingEl.innerHTML = '<div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>';
  document.getElementById('chatMessages').appendChild(typingEl);
  scrollToChatBottom();

  try {
    // Keep last 20 messages to avoid context overflow
    const history = chatMessages.slice(-20);

    const res = await fetch(CONFIG.workerUrl + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken
      },
      body: JSON.stringify({ messages: history })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `请求失败 (${res.status})`);
    }

    const data = await res.json();
    const reply = data.reply;

    // Remove typing indicator
    typingEl.remove();

    // Add assistant message
    chatMessages.push({ role: 'assistant', content: reply });
    appendChatMessage('assistant', reply);
  } catch (e) {
    typingEl.remove();
    let errMsg = e.message || '未知错误';
    if (errMsg === 'Failed to fetch') {
      errMsg = '网络连接失败，可能是 Worker 不可用或请求超时，请稍后重试';
    }
    appendChatMessage('assistant', '抱歉，出了点问题：' + errMsg);
  }
}

function appendChatMessage(role, content) {
  const container = document.getElementById('chatMessages');
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-message ' + role;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  if (role === 'assistant') {
    // Make 📖《书名》 clickable
    let html = escapeHtml(content);
    html = html.replace(/📖《([^》]+)》/g, (match, bookTitle) => {
      const book = DATA.books.find(b =>
        b.title.replace(/[《》]/g, '') === bookTitle ||
        b.title === bookTitle
      );
      if (book) {
        return `<a href="#" class="chat-book-link" data-book-id="${book.bookId}">📖《${bookTitle}》</a>`;
      }
      return match;
    });
    // Basic markdown: **bold** and line breaks
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    bubble.innerHTML = html;

    // Add click handlers for book links
    bubble.querySelectorAll('.chat-book-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const book = bookMap[link.dataset.bookId];
        if (book) openBook(book);
      });
    });

    // Copy button
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble-wrapper';
    wrapper.appendChild(bubble);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'chat-copy-btn';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(() => {
        copyBtn.textContent = '已复制';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '复制';
          copyBtn.classList.remove('copied');
        }, 2000);
      });
    });
    wrapper.appendChild(copyBtn);

    msgEl.appendChild(wrapper);
  } else {
    bubble.textContent = content;
    msgEl.appendChild(bubble);
  }

  container.appendChild(msgEl);
  scrollToChatBottom();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToChatBottom() {
  const container = document.getElementById('chatMessages');
  container.scrollTop = container.scrollHeight;
}

// Auto-resize textarea
document.getElementById('chatInput').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// ===== TAB SWITCHING =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'network' && !networkInit) initNetwork();
    if (btn.dataset.tab === 'chat') initChat();
  });
});

// ===== NETWORK =====
let networkInit = false;
let currentNetworkFilter = ['全部'];

function initNetwork() {
  networkInit = true;
  buildNetworkFilterBar();
  renderNetwork();
}

function buildNetworkFilterBar() {
  const bar = document.getElementById('networkFilterBar');
  const cats = ['全部', ...new Set(DATA.books.map(b => getCategoryLabel(b.category)))];
  bar.innerHTML = cats.map(c =>
    `<button class="nf-tag${c === '全部' ? ' active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  bar.querySelectorAll('.nf-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      if (cat === '全部') {
        bar.querySelectorAll('.nf-tag').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else {
        bar.querySelector('[data-cat="全部"]').classList.remove('active');
        btn.classList.toggle('active');
        if (!bar.querySelector('.nf-tag.active')) {
          bar.querySelector('[data-cat="全部"]').classList.add('active');
        }
      }
      const activeBtns = bar.querySelectorAll('.nf-tag.active');
      const selected = [...activeBtns].map(b => b.dataset.cat);
      currentNetworkFilter = selected.includes('全部') ? ['全部'] : selected;
      renderNetwork();
    });
  });
}

function renderNetwork() {
  const filterCats = currentNetworkFilter;
  const isAll = filterCats.includes('全部');

  const filteredInsights = isAll
    ? DATA.insights
    : DATA.insights.filter(ins => {
        const book = bookMap[ins.bookId];
        return book && filterCats.includes(getCategoryLabel(book.category));
      });

  const filteredEdges = isAll
    ? DATA.edges
    : DATA.edges.filter(e => {
        const srcIns = DATA.insights.find(i => i.id === e.source);
        const tgtIns = DATA.insights.find(i => i.id === e.target);
        if (!srcIns || !tgtIns) return false;
        const srcBook = bookMap[srcIns.bookId];
        const tgtBook = bookMap[tgtIns.bookId];
        return (srcBook && filterCats.includes(getCategoryLabel(srcBook.category))) ||
               (tgtBook && filterCats.includes(getCategoryLabel(tgtBook.category)));
      });

  const kwMap = {};
  filteredInsights.forEach(ins => {
    const book = bookMap[ins.bookId];
    if (!book) return;
    (ins.keywords || []).forEach(kw => {
      if (!kwMap[kw]) kwMap[kw] = { keyword: kw, books: new Set(), insights: [], categories: [] };
      kwMap[kw].books.add(ins.bookId);
      kwMap[kw].insights.push(ins);
      kwMap[kw].categories.push(book.category);
    });
  });

  const nodes = Object.values(kwMap).map(n => {
    const catCounts = {};
    n.categories.forEach(c => { catCounts[c] = (catCounts[c]||0) + 1; });
    const topCat = Object.entries(catCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || '其他';
    const color = CATEGORY_COLORS[topCat] || CATEGORY_COLORS['其他'];

    const bookArr = [...n.books];
    let sourceLabel = bookArr.slice(0, 2).map(id => {
      const bk = bookMap[id];
      return bk ? bk.title.replace(/[《》]/g, '') : id;
    }).join('、');
    if (bookArr.length > 2) sourceLabel += ` +${bookArr.length - 2}`;
    return {
      id: n.keyword,
      radius: window.innerWidth <= 480 ? Math.max(8, Math.min(18, 5 + n.insights.length * 1.5)) : Math.max(12, Math.min(30, 8 + n.insights.length * 3)),
      color,
      sourceLabel,
      insights: n.insights,
      books: bookArr
    };
  });

  const nodeIds = new Set(nodes.map(n => n.id));
  const linkSet = new Set();
  const links = [];

  filteredInsights.forEach(ins => {
    const kws = (ins.keywords || []).filter(k => nodeIds.has(k));
    for (let i = 0; i < kws.length; i++) {
      for (let j = i + 1; j < kws.length; j++) {
        const key = [kws[i], kws[j]].sort().join('||');
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: kws[i], target: kws[j], relation: `共现于: ${bookMap[ins.bookId]?.title || ins.bookId}` });
        }
      }
    }
  });

  filteredEdges.forEach(e => {
    const srcIns = DATA.insights.find(i => i.id === e.source);
    const tgtIns = DATA.insights.find(i => i.id === e.target);
    if (srcIns && tgtIns) {
      const srcKws = (srcIns.keywords || []).filter(k => nodeIds.has(k));
      const tgtKws = (tgtIns.keywords || []).filter(k => nodeIds.has(k));
      srcKws.forEach(sk => {
        tgtKws.forEach(tk => {
          if (sk !== tk) {
            const key = [sk, tk].sort().join('||');
            if (!linkSet.has(key)) {
              linkSet.add(key);
              links.push({ source: sk, target: tk, relation: e.relation });
            }
          }
        });
      });
    }
  });

  const container = document.querySelector('.network-container');
  const width = container.clientWidth;
  const height = Math.max(window.innerWidth <= 480 ? 420 : 600, window.innerHeight - 140);

  const svg = d3.select('.network-svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  svg.selectAll('*').remove();

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(window.innerWidth <= 480 ? -150 : -300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => d.radius + (window.innerWidth <= 480 ? 6 : 12)))
    .force('x', d3.forceX(width / 2).strength(0.02))
    .force('y', d3.forceY(height / 2).strength(0.02));

  const linkG = svg.append('g');
  const nodeG = svg.append('g');

  const linkEls = linkG.selectAll('line')
    .data(links).join('line')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,4')
    .attr('opacity', 0.5);

  const nodeGroups = nodeG.selectAll('g')
    .data(nodes).join('g')
    .attr('cursor', 'pointer')
    .call(d3.drag()
      .on('start', dragStart)
      .on('drag', dragged)
      .on('end', dragEnd));

  nodeGroups.append('circle')
    .attr('r', d => d.radius)
    .attr('fill', d => d.color)
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .attr('opacity', 0.85);

  nodeGroups.append('text')
    .text(d => d.id)
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.radius + (window.innerWidth <= 480 ? 10 : 16))
    .attr('font-size', window.innerWidth <= 480 ? 10 : 13)
    .attr('font-weight', 500)
    .attr('fill', '#333')
    .attr('font-family', "'PingFang SC', 'Noto Sans SC', sans-serif");

  const tooltip = document.getElementById('edgeTooltip');
  linkEls
    .on('mouseover', (event, d) => {
      tooltip.style.display = 'block';
      tooltip.textContent = d.relation;
      tooltip.style.left = event.clientX + 12 + 'px';
      tooltip.style.top = event.clientY - 10 + 'px';
    })
    .on('mousemove', event => {
      tooltip.style.left = event.clientX + 12 + 'px';
      tooltip.style.top = event.clientY - 10 + 'px';
    })
    .on('mouseout', () => {
      tooltip.style.display = 'none';
    });

  nodeGroups.on('click', (event, d) => {
    event.stopPropagation();
    const popup = document.getElementById('kwPopup');
    document.getElementById('kwPopupTitle').textContent = '🔑 ' + d.id;
    let html = '';
    d.insights.forEach(ins => {
      const bk = bookMap[ins.bookId];
      const bookTitle = bk ? formatTitle(bk.title) : ins.bookId;
      html += `<div class="kw-insight">
        <div class="kw-point">${ins.point}</div>
        <div class="kw-source"><a href="#" class="book-link" data-book-id="${ins.bookId}" style="color:var(--blue);text-decoration:none;cursor:pointer">📚 ${bookTitle} →</a></div>
      </div>`;
    });
    document.getElementById('kwPopupBody').innerHTML = html;
    document.querySelectorAll('#kwPopupBody .book-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const bookId = e.currentTarget.dataset.bookId;
        const book = DATA.books.find(b => b.bookId === bookId);
        if (book) {
          document.getElementById('kwPopup').classList.remove('open');
          document.getElementById('kwPopupOverlay').classList.remove('open');
          openBook(book);
        }
      });
    });
    popup.classList.add('open');
    document.getElementById('kwPopupOverlay').classList.add('open');
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  });

  function closeKwPopup() {
    document.getElementById('kwPopup').classList.remove('open');
    document.getElementById('kwPopupOverlay').classList.remove('open');
  }
  document.getElementById('kwPopupClose').onclick = closeKwPopup;
  document.getElementById('kwPopupOverlay').onclick = closeKwPopup;

  nodeGroups
    .on('mouseover', function(event, d) {
      nodeGroups.attr('opacity', n => {
        if (n.id === d.id) return 1;
        const connected = links.some(l =>
          (l.source.id === d.id && l.target.id === n.id) ||
          (l.target.id === d.id && l.source.id === n.id)
        );
        return connected ? 1 : 0.2;
      });
      linkEls
        .attr('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 0.8 : 0.08)
        .attr('stroke', l => (l.source.id === d.id || l.target.id === d.id) ? '#F4D758' : '#ccc')
        .attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? 2 : 1);
    })
    .on('mouseout', function() {
      nodeGroups.attr('opacity', 1);
      linkEls.attr('opacity', 0.5).attr('stroke', '#ccc').attr('stroke-width', 1);
    });

  simulation.on('tick', () => {
    const pad = 40;
    nodes.forEach(d => {
      d.x = Math.max(pad, Math.min(width - pad, d.x));
      d.y = Math.max(pad, Math.min(height - pad, d.y));
    });
    linkEls
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  function dragStart(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
  function dragEnd(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
  }

  window.addEventListener('resize', () => {
    if (!document.getElementById('tab-network').classList.contains('active')) return;
    const w = container.clientWidth;
    const h = Math.max(600, window.innerHeight - 140);
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
    simulation.force('center', d3.forceCenter(w / 2, h / 2));
    simulation.force('x', d3.forceX(w / 2).strength(0.02));
    simulation.force('y', d3.forceY(h / 2).strength(0.02));
    simulation.alpha(0.3).restart();
  });
}

// ===== INIT =====
// Check admin mode immediately (don't wait for data load)
checkAdminMode();

async function init() {
  try {
    const res = await fetch('./data.json');
    DATA = await res.json();
  } catch (e) {
    console.error('Failed to load data.json:', e);
    document.getElementById('tab-shelf').innerHTML = '<div style="padding:40px;text-align:center;color:#999">数据加载失败，请刷新重试</div>';
    return;
  }

  // Migrate old category codes to Chinese names
  DATA.books.forEach(b => {
    if (CATEGORY_MAP[b.category]) {
      b.category = CATEGORY_MAP[b.category];
    }
  });

  // Merge localStorage custom data
  loadCustomData();

  // Build book index
  DATA.books.forEach(b => bookMap[b.bookId] = b);

  // Track original book IDs for delete behavior
  ORIGINAL_BOOK_IDS = new Set(DATA.books.filter(b => {
    const customBooks = JSON.parse(localStorage.getItem('reading-shelf-custom-books') || '[]');
    return !customBooks.find(cb => cb.bookId === b.bookId);
  }).map(b => b.bookId));

  // Render
  renderShelf();
}

init();
