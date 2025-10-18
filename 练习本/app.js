/*
  练习本 - 本地可运行版
  - 功能：每日练习、错题本、复习模式、统计、TTS朗读、语音识别发音
  - 存储：localStorage（profile, progress, wrongBook, logs）
*/

// ------------- 工具 & 数据存储 -------------
const Storage = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const todayKey = () => new Date().toISOString().slice(0,10);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// 简单编辑距离（用于语音识别粗评）
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

// ------------- 题库（示例）-------------
// type: choice | fill | listen | speak
// 每题可含 level (1=入门, 2=基础, 3=进阶, 4=挑战)
const QUESTION_BANK = {
  EN: [
    { id: 'en1', level: 1, type: 'choice', prompt: '选择 "apple" 的中文意思', options: ['苹果','香蕉','梨'], answer: '苹果', tts: 'apple', translation: '苹果' },
    { id: 'en2', level: 1, type: 'fill', prompt: '填空：I ____ to school.', answer: 'go', tts: 'I go to school', translation: '我去上学' },
    { id: 'en3', level: 2, type: 'listen', prompt: '听音，输入你听到的单词', answer: 'hello', tts: 'hello', translation: '你好' },
    { id: 'en4', level: 2, type: 'speak', prompt: '请跟读：good morning', answer: 'good morning', tts: 'good morning', translation: '早上好' },
    { id: 'en5', level: 2, type: 'choice', prompt: '选择 "book" 的中文意思', options: ['桌子','书','椅子'], answer: '书', tts: 'book', translation: '书' },
    { id: 'en6', level: 3, type: 'fill', prompt: '填空：She ____ reading books.', answer: 'likes', tts: 'She likes reading books', translation: '她喜欢读书' },
    { id: 'en7', level: 3, type: 'listen', prompt: '听音，输入句子', answer: 'how are you', tts: 'how are you', translation: '你好吗' },
    { id: 'en8', level: 4, type: 'speak', prompt: '请跟读：I will keep practicing every day', answer: 'i will keep practicing every day', tts: 'I will keep practicing every day', translation: '我会每天坚持练习' },
  ],
  JA: [
    { id: 'ja1', level: 1, type: 'choice', prompt: '「水」对应的假名？', options: ['みず','みち','むら'], answer: 'みず', tts: 'みず', translation: '水' },
    { id: 'ja2', level: 1, type: 'fill', prompt: '填空：おはよう_____', answer: 'ございます', tts: 'おはようございます', translation: '早上好（尊敬）' },
    { id: 'ja3', level: 2, type: 'listen', prompt: '听音，输入平假名', answer: 'ありがとう', tts: 'ありがとう', translation: '谢谢' },
    { id: 'ja4', level: 2, type: 'speak', prompt: '请跟读：こんにちは', answer: 'こんにちは', tts: 'こんにちは', translation: '你好' },
  ],
  KR: [
    { id: 'kr1', level: 1, type: 'choice', prompt: '"사랑" 的中文意思？', options: ['爱','雨','家'], answer: '爱', tts: '사랑', translation: '爱' },
    { id: 'kr2', level: 1, type: 'fill', prompt: '填空：안녕_____', answer: '하세요', tts: '안녕하세요', translation: '你好（敬语）' },
    { id: 'kr3', level: 2, type: 'listen', prompt: '听音，输入韩文', answer: '감사합니다', tts: '감사합니다', translation: '谢谢' },
    { id: 'kr4', level: 2, type: 'speak', prompt: '请跟读：좋은 아침', answer: '좋은 아침', tts: '좋은 아침', translation: '早上好' },
  ]
};

// ------------- 关卡配置（1000+关，按主题分类）-------------
const LEVEL_CONFIG = {
  themes: [
    { id: 'basic', name: '基础入门', icon: '🌱', color: '#10b981', startLevel: 1, endLevel: 50 },
    { id: 'daily', name: '日常生活', icon: '🏠', color: '#3b82f6', startLevel: 51, endLevel: 150 },
    { id: 'food', name: '美食料理', icon: '🍜', color: '#f59e0b', startLevel: 151, endLevel: 250 },
    { id: 'travel', name: '旅行出行', icon: '✈️', color: '#8b5cf6', startLevel: 251, endLevel: 350 },
    { id: 'work', name: '职场工作', icon: '💼', color: '#ef4444', startLevel: 351, endLevel: 450 },
    { id: 'study', name: '学习教育', icon: '📚', color: '#06b6d4', startLevel: 451, endLevel: 550 },
    { id: 'health', name: '健康医疗', icon: '🏥', color: '#84cc16', startLevel: 551, endLevel: 650 },
    { id: 'tech', name: '科技数码', icon: '💻', color: '#6366f1', startLevel: 651, endLevel: 750 },
    { id: 'culture', name: '文化娱乐', icon: '🎭', color: '#ec4899', startLevel: 751, endLevel: 850 },
    { id: 'nature', name: '自然环境', icon: '🌿', color: '#22c55e', startLevel: 851, endLevel: 950 },
    { id: 'advanced', name: '高级挑战', icon: '🏆', color: '#f97316', startLevel: 951, endLevel: 1000 }
  ],
  getThemeByLevel(level) {
    return this.themes.find(t => level >= t.startLevel && level <= t.endLevel) || this.themes[0];
  },
  getLevelsInTheme(themeId) {
    const theme = this.themes.find(t => t.id === themeId);
    return theme ? Array.from({length: theme.endLevel - theme.startLevel + 1}, (_,i) => theme.startLevel + i) : [];
  }
};

// ------------- 单词库（示例）-------------
// 每条：{ id, word, explain: { CN, EN, JA, KR }, langPronounce }
const WORD_BANK = {
  EN: [
    { id: 'w_en_1', word: 'apple', explain: { CN: '苹果', EN: 'a round fruit', JA: 'りんご', KR: '사과' }, langPronounce: 'en-US' },
    { id: 'w_en_2', word: 'book', explain: { CN: '书', EN: 'a set of pages', JA: '本', KR: '책' }, langPronounce: 'en-US' },
    { id: 'w_en_3', word: 'morning', explain: { CN: '早晨', EN: 'early part of the day', JA: '朝', KR: '아침' }, langPronounce: 'en-US' },
    { id: 'w_en_4', word: 'water', explain: { CN: '水', EN: 'H2O', JA: '水', KR: '물' }, langPronounce: 'en-US' },
    { id: 'w_en_5', word: 'thank', explain: { CN: '感谢', EN: 'to express gratitude', JA: '感謝する', KR: '감사하다' }, langPronounce: 'en-US' },
    { id: 'w_en_6', word: 'school', explain: { CN: '学校', EN: 'educational institution', JA: '学校', KR: '학교' }, langPronounce: 'en-US' },
    { id: 'w_en_7', word: 'friend', explain: { CN: '朋友', EN: 'a person you like', JA: '友達', KR: '친구' }, langPronounce: 'en-US' },
    { id: 'w_en_8', word: 'practice', explain: { CN: '练习', EN: 'to do repeatedly', JA: '練習', KR: '연습' }, langPronounce: 'en-US' },
    { id: 'w_en_9', word: 'language', explain: { CN: '语言', EN: 'system of communication', JA: '言語', KR: '언어' }, langPronounce: 'en-US' },
    { id: 'w_en_10', word: 'hello', explain: { CN: '你好', EN: 'a greeting', JA: 'こんにちは', KR: '안녕하세요' }, langPronounce: 'en-US' },
    { id: 'w_en_11', word: 'study', explain: { CN: '学习', EN: 'to learn', JA: '勉強する', KR: '공부하다' }, langPronounce: 'en-US' }
  ],
  JA: [
    { id: 'w_ja_1', word: 'みず', explain: { CN: '水', EN: 'water', JA: '水のこと', KR: '물' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_2', word: 'ありがとう', explain: { CN: '谢谢', EN: 'thanks', JA: '感謝の言葉', KR: '감사합니다' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_3', word: 'こんにちは', explain: { CN: '你好', EN: 'hello', JA: '挨拶', KR: '안녕하세요' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_4', word: 'さようなら', explain: { CN: '再见', EN: 'goodbye', JA: '別れの挨拶', KR: '안녕히 가세요' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_5', word: 'おはよう', explain: { CN: '早上好', EN: 'good morning', JA: '朝の挨拶', KR: '좋은 아침' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_6', word: 'こんばんは', explain: { CN: '晚上好', EN: 'good evening', JA: '夜の挨拶', KR: '안녕하세요(저녁)' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_7', word: 'すみません', explain: { CN: '不好意思/对不起', EN: 'excuse me/sorry', JA: '謝罪・依頼', KR: '실례합니다/죄송합니다' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_8', word: 'お願いします', explain: { CN: '拜托了', EN: 'please', JA: '依頼', KR: '부탁합니다' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_9', word: '大丈夫', explain: { CN: '没问题', EN: 'all right/okay', JA: '問題ない', KR: '괜찮다' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_10', word: '友達', explain: { CN: '朋友', EN: 'friend', JA: '友人', KR: '친구' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_11', word: '勉強', explain: { CN: '学习', EN: 'study', JA: '学ぶこと', KR: '공부' }, langPronounce: 'ja-JP' },
    { id: 'w_ja_12', word: '言語', explain: { CN: '语言', EN: 'language', JA: 'ことば', KR: '언어' }, langPronounce: 'ja-JP' }
  ],
  KR: [
    { id: 'w_kr_1', word: '사랑', explain: { CN: '爱', EN: 'love', JA: '愛', KR: '사랑' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_2', word: '감사합니다', explain: { CN: '谢谢', EN: 'thank you', JA: 'ありがとうございます', KR: '감사합니다' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_3', word: '안녕하세요', explain: { CN: '你好', EN: 'hello', JA: 'こんにちは', KR: '안녕하세요' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_4', word: '안녕히 가세요', explain: { CN: '再见（请慢走）', EN: 'goodbye', JA: 'さようなら', KR: '안녕히 가세요' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_5', word: '좋은 아침', explain: { CN: '早上好', EN: 'good morning', JA: 'おはよう', KR: '좋은 아침' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_6', word: '죄송합니다', explain: { CN: '对不起', EN: 'sorry', JA: 'ごめんなさい', KR: '죄송합니다' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_7', word: '부탁합니다', explain: { CN: '拜托了', EN: 'please', JA: 'お願いします', KR: '부탁합니다' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_8', word: '괜찮아요', explain: { CN: '没关系/还好', EN: 'it’s okay', JA: '大丈夫', KR: '괜찮아요' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_9', word: '친구', explain: { CN: '朋友', EN: 'friend', JA: '友達', KR: '친구' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_10', word: '공부', explain: { CN: '学习', EN: 'study', JA: '勉強', KR: '공부' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_11', word: '언어', explain: { CN: '语言', EN: 'language', JA: '言語', KR: '언어' }, langPronounce: 'ko-KR' },
    { id: 'w_kr_12', word: '물', explain: { CN: '水', EN: 'water', JA: '水', KR: '물' }, langPronounce: 'ko-KR' }
  ]
};

function seededShuffle(array, seed) {
  let s = 0;
  for (let i=0;i<seed.length;i++) s = (s * 131 + seed.charCodeAt(i)) >>> 0;
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    s = (1103515245 * s + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildChoiceOptions(correct, candidates, seed) {
  const pool = seededShuffle(candidates || [], seed);
  const wrongs = [];
  const used = new Set([String(correct)]);
  for (let i = 0; i < pool.length && wrongs.length < 3; i++) {
    const v = String(pool[i]);
    if (!used.has(v) && v.trim()) { wrongs.push(v); used.add(v); }
  }
  while (wrongs.length < 3) {
    wrongs.push(`错误选项${wrongs.length+1}`);
  }
  return seededShuffle([correct, ...wrongs], seed + ':opts');
}

// ------------- 应用状态 -------------
const AppState = {
  profile: Storage.get('profile', { lang: 'EN', streak: 0, lastActive: null, points: 0, badges: [], level: 1, levelCleared: { EN: 1, JA: 1, KR: 1 }, wordsExplainLang: 'CN', wordsHistory: { EN: [], JA: [], KR: [] }, wordsToday: null, levelProgress: { EN: 1, JA: 1, KR: 1 } }),
  progress: Storage.get('progress', {}), // per-day: { done, correct }
  wrongBook: Storage.get('wrongBook', {}), // id -> { item, timesWrong, nextReviewAt, note }
  logs: Storage.get('logs', {}), // by day
  session: { queue: [], cursor: 0, correctToday: 0, totalToday: 0, current: null, mode: 'learn', levelMode: false, levelId: null, wordsMode: false, wordsAnswers: [], wordsFav: {} },
};

function saveAll() {
  Storage.set('profile', AppState.profile);
  Storage.set('progress', AppState.progress);
  Storage.set('wrongBook', AppState.wrongBook);
  Storage.set('logs', AppState.logs);
}

// ------------- UI helpers -------------
const $ = sel => document.querySelector(sel);
const viewEls = {
  home: $('#view-home'),
  learn: $('#view-learn'),
  review: $('#view-review'),
  wrong: $('#view-wrong'),
  stats: $('#view-stats'),
  wordsStudy: $('#view-words-study'),
  wordsSummary: $('#view-words-summary'),
  levelSelect: $('#view-level-select'),
  themeLevels: $('#view-theme-levels'),
};

function switchView(name) {
  Object.values(viewEls).forEach(v => v.classList.remove('active'));
  viewEls[name].classList.add('active');
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tab[data-view="${name}"]`);
  if (btn) btn.classList.add('active');
}

function toastFeedback(ok, text) {
  const el = $('#quiz-feedback');
  el.className = 'quiz-feedback ' + (ok ? 'ok' : 'bad');
  el.textContent = text;
}

function encouragement(ok) {
  if (ok) {
    const texts = ['太棒了！','继续保持！','赞！','干得好！'];
    return texts[Math.floor(Math.random()*texts.length)];
  } else {
    const texts = ['别灰心，再试一次','加油！','慢慢来，会更好'];
    return texts[Math.floor(Math.random()*texts.length)];
  }
}

// ------------- TTS & 语音识别 -------------
function speak(text, langTag) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95; u.pitch = 1;
  u.lang = langTag || ({ EN: 'en-US', JA: 'ja-JP', KR: 'ko-KR' }[AppState.profile.lang] || 'en-US');
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function createSpeechRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = ({ EN: 'en-US', JA: 'ja-JP', KR: 'ko-KR' }[AppState.profile.lang] || 'en-US');
  rec.interimResults = false; rec.continuous = false;
  return rec;
}

// ------------- 题目选择与会话 -------------
function pickDailyQueue() {
  const bank = QUESTION_BANK[AppState.profile.lang] || [];
  const currentLang = AppState.profile.lang;
  // 基于错题加权：优先取需要复习的错题，然后随机补齐
  const now = Date.now();
  const reviewIds = Object.values(AppState.wrongBook)
    .filter(w => (w.nextReviewAt || 0) <= now && w.item.lang === currentLang)
    .map(w => w.item.id);

  const preferred = bank.filter(q => reviewIds.includes(q.id));
  const others = bank.filter(q => !reviewIds.includes(q.id));
  const size = 7; // 每日题量：可调整 5~10
  const queue = [...preferred];
  while (queue.length < size && others.length) {
    const idx = Math.floor(Math.random() * others.length);
    queue.push(others.splice(idx,1)[0]);
  }
  return queue;
}

function getTodayProgress() {
  const key = todayKey();
  const currentLang = AppState.profile.lang;
  if (!AppState.progress[key]) AppState.progress[key] = { done: 0, correct: 0 };
  
  // 按当前语言计算今日进度
  const todayLogs = AppState.logs[key] || [];
  const langLogs = todayLogs.filter(l => l.lang === currentLang);
  const done = langLogs.length;
  const correct = langLogs.filter(l => l.ok).length;
  
  return { done, correct };
}

function updateStreakOnActive() {
  const last = AppState.profile.lastActive; // yyyy-mm-dd
  const today = todayKey();
  if (!last) { AppState.profile.streak = 1; AppState.profile.lastActive = today; return; }
  if (last === today) return;
  const d1 = new Date(last), d2 = new Date(today);
  const delta = Math.round((d2 - d1) / 86400000);
  if (delta === 1) AppState.profile.streak += 1; else AppState.profile.streak = 1;
  AppState.profile.lastActive = today;
}

function awardBadges() {
  const { streak, badges } = AppState.profile;
  const toAdd = [];
  if (streak >= 3 && !badges.includes('打卡3天')) toAdd.push('打卡3天');
  if (streak >= 7 && !badges.includes('打卡7天')) toAdd.push('打卡7天');
  if (streak >= 14 && !badges.includes('打卡14天')) toAdd.push('打卡14天');
  AppState.profile.badges = [...badges, ...toAdd];
}

function scheduleNextReview(wrongEntry, ok) {
  // 间隔：1,2,4,7,15 天，答对升一档，答错退一档
  const stages = [1,2,4,7,15];
  const now = Date.now();
  const prevStage = wrongEntry.stage ?? 0;
  let stage = ok ? clamp(prevStage + 1, 0, stages.length - 1) : clamp(prevStage - 1, 0, stages.length - 1);
  wrongEntry.stage = stage;
  wrongEntry.nextReviewAt = now + stages[stage] * 86400000;
}

function recordAnswer(item, ok) {
  const prog = getTodayProgress();
  AppState.session.totalToday = prog.done; AppState.session.correctToday = prog.correct;

  // 打分/积分
  if (ok) AppState.profile.points += 10; else AppState.profile.points += 2;

  // 错题本
  const exist = AppState.wrongBook[item.id];
  if (!ok) {
    if (!exist) {
      const itemWithLang = { ...item, lang: AppState.profile.lang };
      AppState.wrongBook[item.id] = { item: itemWithLang, timesWrong: 1, stage: 0, nextReviewAt: Date.now() + 86400000, note: '' };
    } else { 
      exist.timesWrong += 1; 
      scheduleNextReview(exist, false); 
    }
  } else if (exist) {
    scheduleNextReview(exist, true);
    // 如果阶段达到最高并多次正确，可视为"掌握"移出错题本
    if (exist.stage >= 4) delete AppState.wrongBook[item.id];
  }

  // 日志
  const day = todayKey();
  if (!AppState.logs[day]) AppState.logs[day] = [];
  AppState.logs[day].push({ id: item.id, ok, ts: Date.now(), lang: AppState.profile.lang });

  saveAll();
}

// ------------- 渲染：首页 -------------
function renderHome() {
  updateStreakOnActive();
  awardBadges();
  const prog = getTodayProgress();
  const langNames = { EN: 'English', JA: '日本語', KR: '한국어' };
  $('#selected-lang').textContent = langNames[AppState.profile.lang] || AppState.profile.lang;
  $('#stat-streak').textContent = AppState.profile.streak;
  $('#stat-points').textContent = AppState.profile.points;
  // 按当前语言计算掌握的词汇数量
  const currentLang = AppState.profile.lang;
  const mastered = Object.keys(AppState.logs).reduce((acc, day) => {
    const dayLogs = AppState.logs[day] || [];
    return acc + dayLogs.filter(l => l.ok && l.lang === currentLang).length;
  }, 0);
  $('#stat-mastered').textContent = mastered;
  $('#stat-mastered-label').textContent = `${langNames[currentLang]}掌握词汇`;
  const ratio = Math.min(100, Math.round((prog.done / 7) * 100));
  $('#progress-bar').style.width = ratio + '%';
  const badgeList = $('#badge-list');
  badgeList.innerHTML = '';
  (AppState.profile.badges.length ? AppState.profile.badges : ['快来领取第一枚徽章！']).forEach(b => {
    const el = document.createElement('div'); el.className = 'badge'; el.textContent = b; badgeList.appendChild(el);
  });

  // 关卡进度显示
  const levelProgress = document.getElementById('level-progress');
  if (levelProgress) {
    const currentLevel = AppState.profile.levelProgress?.[AppState.profile.lang] || 1;
    const theme = LEVEL_CONFIG.getThemeByLevel(currentLevel);
    levelProgress.textContent = `L${currentLevel} ${theme.name}`;
  }

  // 每日10词：解释语言回填
  const explainSel = document.getElementById('words-explain-lang');
  if (explainSel) explainSel.value = AppState.profile.wordsExplainLang || 'CN';
}

function selectTodayWords(lang) {
  const today = todayKey();
  const cached = AppState.profile.wordsToday;
  if (cached && cached.date === today && cached.lang === lang && Array.isArray(cached.ids) && cached.ids.length) {
    const bank = WORD_BANK[lang] || [];
    const map = new Map(bank.map(w => [w.id, w]));
    return cached.ids.map(id => map.get(id)).filter(Boolean);
  }
  const bank = WORD_BANK[lang] || [];
  if (!bank.length) return [];
  const history = AppState.profile.wordsHistory?.[lang] || [];
  const remaining = bank.filter(w => !history.includes(w.id));
  let picked = remaining.slice(0, 10);
  if (picked.length < 10) {
    // 池耗尽后从头补齐，再次避免重复
    const need = 10 - picked.length;
    const restartPool = bank.filter(w => !picked.some(p => p.id === w.id));
    picked = picked.concat(restartPool.slice(0, need));
    AppState.profile.wordsHistory[lang] = []; // 重置历史
  }
  const ids = picked.map(w => w.id);
  // 更新缓存与历史
  AppState.profile.wordsToday = { date: today, lang, ids };
  const newHistory = (AppState.profile.wordsHistory?.[lang] || []).concat(ids);
  // 去重，限制历史长度不超过词库大小
  const uniq = Array.from(new Set(newHistory)).slice(-((WORD_BANK[lang]||[]).length));
  AppState.profile.wordsHistory[lang] = uniq;
  saveAll();
  return picked;
}

function getTodayWordsSet(lang) {
  const list = selectTodayWords(lang);
  const set = new Set(list.map(w => (w.word || '').toLowerCase()));
  return set;
}

// ------------- 渲染：错题本 -------------
function renderWrongBook() {
  const wrap = $('#wrong-list');
  wrap.innerHTML = '';
  const currentLang = AppState.profile.lang;
  const arr = Object.values(AppState.wrongBook)
    .filter(w => w.item.lang === currentLang)
    .sort((a,b)=> (a.nextReviewAt||0)-(b.nextReviewAt||0));
  if (!arr.length) {
    const el = document.createElement('div'); el.className='muted'; el.textContent='目前还没有错题，继续加油！'; wrap.appendChild(el); return;
  }
  arr.forEach(w => {
    const next = w.nextReviewAt ? new Date(w.nextReviewAt).toLocaleDateString() : '—';
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div><strong>${w.item.prompt}</strong></div>
      <div class="muted">正确答案：${w.item.answer} · 下次复习：${next}</div>
      <textarea placeholder="添加笔记或例句" rows="2" style="width:100%; border-radius:10px; border:1px solid #e5e7eb; padding:8px;">${w.note||''}</textarea>
      <div class="list-item-actions">
        <button class="btn" data-act="tts">🔊 朗读</button>
        <button class="btn" data-act="reviewOne">再练一次</button>
        <button class="btn" data-act="save">保存笔记</button>
        <button class="btn" data-act="remove">移除</button>
      </div>
    `;
    const [ta, bTts, bReview, bSave, bRemove] = [
      div.querySelector('textarea'),
      ...div.querySelectorAll('button')
    ];
    bTts.onclick = () => speak(w.item.tts || w.item.answer);
    bReview.onclick = () => { AppState.session.mode='review'; startSession([w.item]); switchView('learn'); };
    bSave.onclick = () => { w.note = ta.value.trim(); saveAll(); };
    bRemove.onclick = () => { delete AppState.wrongBook[w.item.id]; saveAll(); renderWrongBook(); };
    wrap.appendChild(div);
  });
}

// ------------- 渲染：统计 -------------
function renderStats() {
  const days = Object.keys(AppState.logs).sort();
  const currentLang = AppState.profile.lang;
  const langNames = { EN: 'English', JA: '日本語', KR: '한국어' };
  
  // 按当前语言统计
  let total = 0, correct = 0, minutes = 0;
  days.forEach(d => {
    const arr = (AppState.logs[d] || []).filter(x => x.lang === currentLang);
    total += arr.length; 
    correct += arr.filter(x=>x.ok).length; 
    minutes += Math.ceil(arr.length * 0.6);
  });
  
  // 全语言统计
  let totalAll = 0, correctAll = 0;
  days.forEach(d => {
    const arr = AppState.logs[d] || [];
    totalAll += arr.length; 
    correctAll += arr.filter(x=>x.ok).length;
  });
  
  const rate = total ? Math.round((correct/total)*100) : 0;
  const rateAll = totalAll ? Math.round((correctAll/totalAll)*100) : 0;
  
  const wrap = $('#stats-summary');
  wrap.innerHTML = '';
  const chips = [
    { k:'学习天数', v: days.length },
    { k:`${langNames[currentLang]}题量`, v: total },
    { k:`${langNames[currentLang]}正确率`, v: rate + '%' },
    { k:'学习时长', v: minutes + ' 分钟' },
    { k:'全语言题量', v: totalAll },
    { k:'全语言正确率', v: rateAll + '%' },
  ];
  chips.forEach(c=>{
    const div = document.createElement('div'); div.className='stat-chip'; div.innerHTML = `<div class="muted">${c.k}</div><div style="font-weight:800; font-size:18px;">${c.v}</div>`; wrap.appendChild(div);
  });

  // 简易曲线图：近14天错误率
  const canvas = $('#chart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width, canvas.height);
  const last14 = Array.from({length:14}, (_,i)=>{
    const d = new Date(); d.setDate(d.getDate() - (13-i));
    const k = d.toISOString().slice(0,10);
    const arr = (AppState.logs[k] || []).filter(x => x.lang === currentLang); 
    const t=arr.length; const c=arr.filter(x=>x.ok).length; const err = t? (1 - c/t) : 0;
    return err;
  });
  const w = canvas.width, h = canvas.height, pad=20;
  ctx.strokeStyle = '#e5e7eb'; ctx.beginPath(); ctx.moveTo(pad,h-pad); ctx.lineTo(w-pad,h-pad); ctx.stroke();
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath();
  last14.forEach((v,i)=>{
    const x = pad + (w-2*pad) * (i/13);
    const y = pad + (h-2*pad) * (1 - v);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

// ------------- 会话：渲染题目与判定 -------------
function startSession(queue) {
  AppState.session.queue = queue;
  AppState.session.cursor = 0;
  AppState.session.current = queue[0] || null;
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const q = AppState.session.current;
  if (!q) { finishSession(); return; }
  $('#quiz-progress').textContent = `${AppState.session.cursor+1}/${AppState.session.queue.length}`;
  $('#quiz-type').textContent = ({choice:'选择题', fill:'填空题', listen:'听力', speak:'发音练习'})[q.type] || '题目';
  const isLevelMode = !!AppState.session.levelMode && !AppState.session.wordsMode;
  const showTranslation = !isLevelMode; // 关卡模式隐藏翻译，避免提前泄露
  $('#quiz-prompt').textContent = showTranslation && q.translation ? `${q.prompt} （${q.translation}）` : q.prompt;
  $('#quiz-feedback').textContent = '';
  $('#btn-next').disabled = true;
  const favBtn = document.getElementById('btn-fav');
  if (favBtn) {
    const isWordsQuiz = !!AppState.session.wordsMode && String(q.id).startsWith('wd_');
    favBtn.style.display = isWordsQuiz ? 'inline-block' : 'none';
    if (isWordsQuiz) {
      const wid = String(q.id).replace(/^wd_/,'');
      const fav = !!AppState.session.wordsFav[wid];
      favBtn.classList.toggle('active', fav);
      favBtn.textContent = fav ? '★ 已收藏' : '☆ 收藏';
      favBtn.onclick = () => {
        if (AppState.session.wordsFav[wid]) delete AppState.session.wordsFav[wid]; else AppState.session.wordsFav[wid] = true;
        saveAll();
        renderCurrentQuestion();
      };
    }
  }

  const optWrap = $('#quiz-options');
  const inputWrap = $('#quiz-input');
  const speakWrap = $('#quiz-pronounce');
  optWrap.innerHTML = ''; inputWrap.innerHTML = ''; speakWrap.style.display = 'none';

  if (q.type === 'choice') {
    (q.options || []).forEach(opt => {
      const d = document.createElement('div'); d.className='choice'; d.innerHTML = `<input type="radio" name="opt"> <div>${opt}</div>`;
      d.onclick = () => {
        optWrap.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected'));
        d.classList.add('selected'); d.querySelector('input').checked = true;
      };
      optWrap.appendChild(d);
    });
  } else if (q.type === 'fill' || q.type === 'listen') {
    inputWrap.innerHTML = `<input id="answer-input" placeholder="请输入答案">`;
  } else if (q.type === 'speak') {
    speakWrap.style.display = 'block';
  }
}

function submitAnswer() {
  const q = AppState.session.current; if (!q) return;
  let userAns = '';
  if (q.type === 'choice') {
    const sel = document.querySelector('.choice.selected');
    if (!sel) { toastFeedback(false, '请选择一个选项'); return; }
    userAns = sel.innerText.trim();
  } else if (q.type === 'fill' || q.type === 'listen') {
    const inp = $('#answer-input'); userAns = (inp?.value || '').trim(); if (!userAns) { toastFeedback(false,'请输入答案'); return; }
  } else if (q.type === 'speak') {
    toastFeedback(true, '请点击“下一题”继续');
    $('#btn-next').disabled = false;
    // speak题目在语音回调中判定，这里直接返回
    return;
  }
  const ok = userAns.toLowerCase() === String(q.answer).toLowerCase();
  toastFeedback(ok, ok ? `${encouragement(true)} +10分` : `正确答案：${q.answer}  ${encouragement(false)} +2分`);
  recordAnswer(q, ok);
  if (AppState.session.wordsMode && String(q.id).startsWith('wd_')) {
    const explainLang = AppState.profile.wordsExplainLang || 'CN';
    AppState.session.wordsAnswers.push({ id: String(q.id).replace(/^wd_/,''), ok, userAns, correct: q.answer, word: q.tts, explain: q.translation || q.answer, explainLang });
  }
  $('#btn-next').disabled = false;
}

function nextQuestion() {
  AppState.session.cursor += 1;
  if (AppState.session.cursor >= AppState.session.queue.length) { 
    // 关卡模式下，先显示成功信息，然后完成会话
    if (AppState.session.levelMode && !AppState.session.wordsMode) {
      // 先完成关卡，然后显示成功信息
      completeCurrentLevel();
      showLevelCompleteMessage();
    } else {
      finishSession(); 
    }
    return; 
  }
  AppState.session.current = AppState.session.queue[AppState.session.cursor];
  renderCurrentQuestion();
}

// 完成当前关卡（不进入下一关）
function completeCurrentLevel() {
  const lang = AppState.profile.lang;
  const currentLevel = parseInt(AppState.session.levelId || 1, 10);
  
  // 更新关卡进度
  AppState.profile.points += 100;
  const prev = AppState.profile.levelCleared?.[lang] || 1;
  if (currentLevel >= prev) AppState.profile.levelCleared[lang] = currentLevel;
  
  // 徽章奖励
  if (!AppState.profile.badges.includes(`通关L${currentLevel}`)) AppState.profile.badges.push(`通关L${currentLevel}`);
  if (currentLevel === 1 && !AppState.profile.badges.includes('入门达成')) AppState.profile.badges.push('入门达成');
  if (currentLevel === 100 && !AppState.profile.badges.includes('百关达人')) AppState.profile.badges.push('百关达人');
  if (currentLevel === 500 && !AppState.profile.badges.includes('五百关王')) AppState.profile.badges.push('五百关王');
  if (currentLevel === 1000 && !AppState.profile.badges.includes('千关至尊')) AppState.profile.badges.push('千关至尊');
  
  saveAll();
  
  // 更新关卡界面
  updateLevelInterface();
  
  console.log(`关卡完成：L${currentLevel}，已通关关卡: ${AppState.profile.levelCleared[lang]}`);
}

// 完成关卡并直接进入下一关
function completeLevelAndStartNext(currentLevel, nextLevel, rate) {
  console.log(`开始进入下一关：L${currentLevel} -> L${nextLevel}，正确率: ${rate}%`);
  
  // 更新进度到下一关
  const lang = AppState.profile.lang;
  AppState.profile.levelProgress[lang] = nextLevel;
  saveAll();
  
  console.log(`进度已更新，开始启动L${nextLevel}`);
  
  // 直接进入下一关
  startLevel(nextLevel);
}

// 显示关卡完成信息
function showLevelCompleteMessage() {
  console.log('显示关卡完成信息');
  const currentLevel = parseInt(AppState.session.levelId || 1, 10);
  const nextLevel = currentLevel + 1;
  const theme = LEVEL_CONFIG.getThemeByLevel(currentLevel);
  const nextTheme = LEVEL_CONFIG.getThemeByLevel(nextLevel);
  const currentLang = AppState.profile.lang;
  const langNames = { EN: 'English', JA: '日本語', KR: '한국어' };
  
  console.log(`当前关卡: L${currentLevel}, 下一关: L${nextLevel}`);
  
  // 计算正确率
  const total = AppState.session.queue.length;
  const day = todayKey();
  const arr = (AppState.logs[day] || []).filter(x => x.lang === currentLang).slice(-total);
  const correct = arr.filter(x=>x.ok).length;
  const rate = total ? Math.round((correct/total)*100) : 0;
  
  // 更新UI显示成功信息
  const feedbackEl = $('#quiz-feedback');
  const nextBtn = $('#btn-next');
  const submitBtn = $('#btn-submit');
  
  if (feedbackEl) {
    feedbackEl.innerHTML = `
      <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #10b981, #059669); color: white; border-radius: 12px; margin: 10px 0;">
        <div style="font-size: 24px; margin-bottom: 8px;">🎉</div>
        <div style="font-size: 20px; font-weight: 800; margin-bottom: 8px;">成功闯关！</div>
        <div style="font-size: 16px; margin-bottom: 4px;">L${currentLevel} ${theme.name} 完成</div>
        <div style="font-size: 14px; opacity: 0.9;">正确率: ${rate}% | 下一关: L${nextLevel} ${nextTheme.name}</div>
      </div>
    `;
  }
  
  if (nextBtn) {
    nextBtn.innerHTML = '进入下一关';
    nextBtn.style.background = 'linear-gradient(135deg, #3b82f6, #1d4ed8)';
    nextBtn.style.color = 'white';
    nextBtn.style.border = 'none';
    
    // 移除原有的事件监听器，添加新的事件监听器
    nextBtn.onclick = null;
    nextBtn.addEventListener('click', () => {
      console.log(`直接进入下一关 L${nextLevel}`);
      // 直接完成当前关卡并进入下一关，不显示弹窗
      completeLevelAndStartNext(currentLevel, nextLevel, rate);
    });
  }
  
  if (submitBtn) {
    submitBtn.style.display = 'none';
  }
}

function finishSession() {
  if (AppState.session.levelMode) {
    const total = AppState.session.queue.length;
    const day = todayKey();
    const currentLang = AppState.profile.lang;
    const arr = (AppState.logs[day] || []).filter(x => x.lang === currentLang).slice(-total);
    const correct = arr.filter(x=>x.ok).length;
    const rate = total ? Math.round((correct/total)*100) : 0;
    const passed = rate >= 80;
    
    if (passed) {
      AppState.profile.points += 100;
      const lang = AppState.profile.lang;
      const current = parseInt(AppState.session.levelId || AppState.profile.level || 1, 10);
      const prev = AppState.profile.levelCleared?.[lang] || 1;
      if (current >= prev) AppState.profile.levelCleared[lang] = current;
      
      // 更新进度到下一关
      const nextLevel = current + 1;
      AppState.profile.levelProgress[lang] = nextLevel;
      
      console.log(`关卡通关：L${current} -> L${nextLevel}，已通关关卡: ${AppState.profile.levelCleared[lang]}`);
      
      // 徽章奖励
      if (!AppState.profile.badges.includes(`通关L${current}`)) AppState.profile.badges.push(`通关L${current}`);
      if (current === 1 && !AppState.profile.badges.includes('入门达成')) AppState.profile.badges.push('入门达成');
      if (current === 100 && !AppState.profile.badges.includes('百关达人')) AppState.profile.badges.push('百关达人');
      if (current === 500 && !AppState.profile.badges.includes('五百关王')) AppState.profile.badges.push('五百关王');
      if (current === 1000 && !AppState.profile.badges.includes('千关至尊')) AppState.profile.badges.push('千关至尊');
      
      saveAll();
      const nextTheme = LEVEL_CONFIG.getThemeByLevel(nextLevel);
      console.log(`关卡通关成功！L${current} -> L${nextLevel}，正确率: ${rate}%`);
      
      // 更新关卡界面
      updateLevelInterface();
      
      showLevelCompleteModal(rate, nextLevel, nextTheme);
      return; // 关卡模式通关成功，直接返回，不执行后面的代码
    } else {
      showLevelFailModal(rate);
      return; // 关卡模式通关失败，直接返回，不执行后面的代码
    }
  } else {
    if (AppState.session.wordsMode) {
      AppState.profile.points += 50; saveAll();
      renderWordsSummary();
      switchView('wordsSummary');
      return;
    } else {
      const prog = getTodayProgress();
      const langNames = { EN: 'English', JA: '日本語', KR: '한국어' };
      const currentLang = AppState.profile.lang;
      alert(`完成！今日${langNames[currentLang]}完成 ${prog.done} 题，正确 ${prog.correct} 题。继续加油！`);
    }
  }
  switchView('home');
  renderHome();
}

// ------------- 关卡完成弹窗 -------------
function showLevelCompleteModal(rate, nextLevel, theme) {
  console.log(`显示通关弹窗：L${nextLevel} ${theme.name}`);
  const currentLang = AppState.profile.lang;
  const langNames = { EN: 'English', JA: '日本語', KR: '한국어' };
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;';
  modal.innerHTML = `
    <div class="modal-content level-complete">
      <div class="modal-header">
        <div class="success-icon">🎉</div>
        <h2>${langNames[currentLang]}通关成功！</h2>
      </div>
      <div class="modal-body">
        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-value">${rate}%</div>
            <div class="stat-label">正确率</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">+100</div>
            <div class="stat-label">积分奖励</div>
          </div>
        </div>
        <div class="next-level-info">
          <div class="next-level-title">解锁下一关</div>
          <div class="next-level-name">L${nextLevel} ${theme.name}</div>
        </div>
      </div>
      <div class="modal-actions">
        <button id="btn-next-level" class="btn primary" style="flex: 1; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">继续下一关</button>
        <button id="btn-level-home" class="btn" style="flex: 1; padding: 12px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">返回首页</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 绑定事件
  const nextBtn = document.getElementById('btn-next-level');
  const homeBtn = document.getElementById('btn-level-home');
  
  if (nextBtn) {
    nextBtn.onclick = () => {
      console.log(`进入下一关 L${nextLevel}`);
      document.body.removeChild(modal);
      // 确保下一关的题目是新的
      AppState.session = {
        mode: 'learn',
        queue: [],
        cursor: 0,
        current: null,
        levelMode: false,
        wordsMode: false,
        levelId: null,
        totalToday: 0,
        correctToday: 0,
        wordsPage: 0,
        wordsFav: new Set()
      };
      startLevel(nextLevel);
    };
  }
  
  if (homeBtn) {
    homeBtn.onclick = () => {
      document.body.removeChild(modal);
      switchView('home');
      renderHome();
      // 更新关卡界面
      updateLevelInterface();
    };
  }
}

function showLevelFailModal(rate) {
  const currentLang = AppState.profile.lang;
  const langNames = { EN: 'English', JA: '日本語', KR: '한국어' };
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content level-fail">
      <div class="modal-header">
        <div class="fail-icon">💪</div>
        <h2>${langNames[currentLang]}未通关</h2>
      </div>
      <div class="modal-body">
        <div class="fail-stats">
          <div class="stat-value">${rate}%</div>
          <div class="stat-label">正确率（需要≥80%）</div>
        </div>
        <div class="encourage-text">再接再厉！多练习几次就能通关了</div>
      </div>
      <div class="modal-actions">
        <button id="btn-retry-level" class="btn primary">重新挑战</button>
        <button id="btn-fail-home" class="btn">返回首页</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 绑定事件
  document.getElementById('btn-retry-level').onclick = () => {
    document.body.removeChild(modal);
    const currentLevel = AppState.profile.levelProgress?.[AppState.profile.lang] || 1;
    startLevel(currentLevel);
  };
  
  document.getElementById('btn-fail-home').onclick = () => {
    document.body.removeChild(modal);
    switchView('home');
    renderHome();
    // 更新关卡界面
    updateLevelInterface();
  };
}

// ------------- 事件绑定 -------------
function bindEvents() {
  // 底部导航
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-view');
      switchView(v === 'home' ? 'home' : v);
      if (v === 'wrong') renderWrongBook();
      if (v === 'stats') renderStats();
    });
  });

  // 首页按钮
  $('#btn-start').onclick = () => {
    AppState.session.mode='learn';
    const queue = pickDailyQueue();
    if (!queue.length) { alert('题库为空'); return; }
    switchView('learn');
    startSession(queue);
  };

  // 关卡通关
  const levelSelectBtn = document.getElementById('btn-level-select');
  if (levelSelectBtn) levelSelectBtn.onclick = () => { renderThemeGrid(); switchView('levelSelect'); };
  
  const continueLevelBtn = document.getElementById('btn-continue-level');
  if (continueLevelBtn) continueLevelBtn.onclick = () => {
    const currentLevel = AppState.profile.levelProgress?.[AppState.profile.lang] || 1;
    startLevel(currentLevel);
  };

  // 复习页
  $('#btn-start-review').onclick = () => {
    AppState.session.mode='review';
    const now = Date.now();
    const currentLang = AppState.profile.lang;
    const list = Object.values(AppState.wrongBook)
      .filter(w => (w.nextReviewAt||0) <= now && w.item.lang === currentLang)
      .map(w=>w.item);
    if (!list.length) { alert('暂无到期复习题目'); return; }
    switchView('learn');
    startSession(list);
  };

  // 题目内交互
  $('#btn-tts').onclick = () => {
    const q = AppState.session.current; if (q) speak(q.tts || q.answer);
  };
  $('#btn-submit').onclick = submitAnswer;
  $('#btn-next').onclick = nextQuestion;

  // 语音
  const rec = createSpeechRecognizer();
  const speakBtn = $('#btn-speak');
  const speakStatus = $('#speak-status');
  if (rec) {
    speakBtn.onclick = () => {
      const q = AppState.session.current; if (!q) return;
      speakStatus.textContent = '正在聆听…';
      rec.onresult = (e) => {
        const txt = e.results[0][0].transcript.trim();
        speakStatus.textContent = `你说：${txt}`;
        const target = String(q.answer).toLowerCase();
        const heard = txt.toLowerCase();
        const dist = levenshtein(target, heard);
        const ok = dist <= Math.max(1, Math.round(target.length*0.3));
        toastFeedback(ok, ok ? `${encouragement(true)} 发音不错！+10分` : `目标：${q.answer} 再试试口型~ +2分`);
        recordAnswer(q, ok);
        $('#btn-next').disabled = false;
      };
      rec.onerror = () => { speakStatus.textContent = '语音识别失败，请重试'; };
      rec.onend = () => {};
      try { rec.start(); } catch {}
    };
  } else {
    speakBtn.onclick = () => alert('此浏览器不支持语音识别，可继续完成其它题型');
  }

  // 顶部：语言切换 & 周报
  const homeBtn = document.getElementById('btn-home');
  if (homeBtn) homeBtn.onclick = () => { switchView('home'); renderHome(); };
  
  // 测试弹窗功能（开发调试用）
  window.testModal = () => {
    console.log('测试弹窗功能');
    showLevelCompleteModal(85, 2, { name: '基础入门' });
  };
  $('#btn-lang').onclick = async () => {
    const next = { EN:'JA', JA:'KR', KR:'EN' }[AppState.profile.lang] || 'EN';
    const langNames = { EN: 'English', JA: '日本語', KR: '한국어' };
    AppState.profile.lang = next; saveAll();
    alert(`已切换到：${langNames[next]}`);
    renderHome();
    // 更新关卡界面
    updateLevelInterface();
  };
  $('#btn-report').onclick = () => {
    const report = buildWeeklyReport();
    alert(report);
  };

  // 每日10词
  const explainSel = document.getElementById('words-explain-lang');
  if (explainSel) explainSel.onchange = () => { AppState.profile.wordsExplainLang = explainSel.value; saveAll(); };
  const startWordsBtn = document.getElementById('btn-start-words');
  if (startWordsBtn) startWordsBtn.onclick = () => {
    const lang = AppState.profile.lang;
    const bank = WORD_BANK[lang] || [];
    if (bank.length < 1) { alert('词库暂少，稍后再试'); return; }
    if (bank.length < 1) { alert('词库暂少，稍后再试'); return; }
    const ten = selectTodayWords(lang);
    AppState.session.wordsToday = ten;
    AppState.session.wordsPage = 1;
    renderWordsStudy(ten);
    switchView('wordsStudy');
  };

  const startWordsQuizBtn = document.getElementById('btn-start-words-quiz');
  if (startWordsQuizBtn) startWordsQuizBtn.onclick = () => {
    const lang = AppState.profile.lang;
    const seed = todayKey() + ':' + lang;
    const list = AppState.session.wordsToday && AppState.session.wordsToday.length ? AppState.session.wordsToday : selectTodayWords(lang);
    if (!list.length) { alert('请先学习今日10词'); return; }
    const pool = seededShuffle(list, seed);
    const explainLang = AppState.profile.wordsExplainLang || 'CN';
    const queue = pool.map(item => {
      const correct = item.explain[explainLang] || item.explain.CN;
      const distractPool = (WORD_BANK[lang]||[]).filter(x => x.id !== item.id).map(x => x.explain[explainLang] || x.explain.CN);
      const options = buildChoiceOptions(correct, distractPool, seed + ':' + item.id);
      return {
        id: 'wd_' + item.id,
        type: 'choice',
        prompt: `选择解释：${item.word}`,
        options,
        answer: correct,
        tts: item.word,
        translation: correct
      };
    });
    AppState.session.wordsMode = true; AppState.session.levelMode = false;
    AppState.session.wordsAnswers = [];
    switchView('learn');
    startSession(queue);
  };

  const summaryHome = document.getElementById('btn-summary-home');
  if (summaryHome) summaryHome.onclick = () => { switchView('home'); renderHome(); };

  // 关卡系统事件
  const backThemes = document.getElementById('btn-back-themes');
  if (backThemes) backThemes.onclick = () => { renderThemeGrid(); switchView('levelSelect'); };

  const prevBtn = document.getElementById('btn-words-prev');
  const nextBtn = document.getElementById('btn-words-next');
  if (prevBtn) prevBtn.onclick = () => {
    const list = AppState.session.wordsToday || [];
    AppState.session.wordsPage = Math.max(1, (AppState.session.wordsPage||1) - 1);
    renderWordsStudy(list);
  };
  if (nextBtn) nextBtn.onclick = () => {
    const list = AppState.session.wordsToday || [];
    const total = list.length || 1;
    AppState.session.wordsPage = Math.min(total, (AppState.session.wordsPage||1) + 1);
    renderWordsStudy(list);
  };
}

function renderWordsStudy(list) {
  const wrap = document.getElementById('words-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  const explainLang = AppState.profile.wordsExplainLang || 'CN';
  const page = AppState.session.wordsPage || 1;
  const total = Math.max(1, list.length);
  const idx = Math.min(total, Math.max(1, page)) - 1;
  const item = list[idx];
  if (item) {
    const div = document.createElement('div');
    div.className = 'list-item words';
    const explain = item.explain[explainLang] || item.explain.CN;
    div.innerHTML = `
      <div class="word-row">
        <div>
          <div class="word-title">${item.word} <span class="pill small">${AppState.profile.lang}</span></div>
          <div class="word-explain">${explain}</div>
        </div>
        <button class="btn circle" data-act="tts">🔊</button>
      </div>
    `;
    const b = div.querySelector('button');
    b.onclick = () => speak(item.word, item.langPronounce);
    wrap.appendChild(div);
  }
  const ind = document.getElementById('words-page-indicator');
  if (ind) ind.textContent = `${Math.min(total, Math.max(1, page))}/${total}`;
  const prev = document.getElementById('btn-words-prev');
  const next = document.getElementById('btn-words-next');
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= total;
}

function renderWordsSummary() {
  const wrap = document.getElementById('words-summary-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  const answers = AppState.session.wordsAnswers || [];
  const favs = AppState.session.wordsFav || {};
  answers.forEach(a => {
    const div = document.createElement('div');
    div.className = 'list-item';
    const fav = !!favs[a.id];
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:800;">${a.word}</div>
          <div class="muted">${a.explain}</div>
          <div class="muted">${a.ok ? '答对' : `答错（你答：${a.userAns}）`}</div>
        </div>
        <button class="btn" data-act="fav">${fav ? '★ 已收藏' : '☆ 收藏'}</button>
      </div>
    `;
    const b = div.querySelector('button');
    b.onclick = () => {
      if (favs[a.id]) delete favs[a.id]; else favs[a.id] = true;
      AppState.session.wordsFav = favs; saveAll(); renderWordsSummary();
    };
    wrap.appendChild(div);
  });
}

// ------------- 关卡系统 -------------
// 更新关卡界面
function updateLevelInterface() {
  // 更新主题网格
  if (document.getElementById('theme-grid')) {
    renderThemeGrid();
  }
  
  // 更新关卡列表
  if (document.getElementById('levels-grid')) {
    const currentLevel = AppState.profile.levelProgress?.[AppState.profile.lang] || 1;
    const currentTheme = LEVEL_CONFIG.getThemeByLevel(currentLevel);
    renderThemeLevels(currentTheme);
  }
  
  // 更新首页
  if (document.getElementById('view-home') && document.getElementById('view-home').style.display !== 'none') {
    renderHome();
  }
}

function renderThemeGrid() {
  const wrap = document.getElementById('theme-grid');
  if (!wrap) return;
  wrap.innerHTML = '';
  const lang = AppState.profile.lang;
  const currentLevel = AppState.profile.levelProgress?.[lang] || 1;
  
  LEVEL_CONFIG.themes.forEach(theme => {
    const div = document.createElement('div');
    div.className = 'theme-card';
    div.style.borderColor = theme.color;
    
    const completed = Math.max(0, Math.min(theme.endLevel - theme.startLevel + 1, currentLevel - theme.startLevel + 1));
    const total = theme.endLevel - theme.startLevel + 1;
    const progress = total > 0 ? (completed / total) * 100 : 0;
    
    div.innerHTML = `
      <div class="theme-icon">${theme.icon}</div>
      <div class="theme-name">${theme.name}</div>
      <div class="theme-range">L${theme.startLevel}-${theme.endLevel}</div>
      <div class="theme-progress">
        <div class="theme-progress-bar" style="width: ${progress}%; background: ${theme.color};"></div>
      </div>
    `;
    
    div.onclick = () => {
      renderThemeLevels(theme);
      switchView('themeLevels');
    };
    
    wrap.appendChild(div);
  });
}

function renderThemeLevels(theme) {
  const title = document.getElementById('theme-title');
  const wrap = document.getElementById('levels-grid');
  if (!title || !wrap) return;
  
  title.textContent = `${theme.icon} ${theme.name} (L${theme.startLevel}-${theme.endLevel})`;
  wrap.innerHTML = '';
  
  const lang = AppState.profile.lang;
  const currentLevel = AppState.profile.levelProgress?.[lang] || 1;
  const clearedLevel = AppState.profile.levelCleared?.[lang] || 1;
  
  for (let level = theme.startLevel; level <= theme.endLevel; level++) {
    const div = document.createElement('div');
    div.className = 'level-item';
    
    let status = 'locked';
    let statusText = '锁定';
    
    if (level <= clearedLevel) {
      status = 'completed';
      statusText = '已完成';
    } else if (level === clearedLevel + 1) {
      status = 'available';
      statusText = '可挑战';
    }
    
    div.classList.add(status);
    div.innerHTML = `
      <div class="level-number">L${level}</div>
      <div class="level-status">${statusText}</div>
    `;
    
    if (status !== 'locked') {
      div.onclick = () => startLevel(level);
    }
    
    wrap.appendChild(div);
  }
}

function startLevel(level) {
  const lang = AppState.profile.lang;
  const theme = LEVEL_CONFIG.getThemeByLevel(level);
  
  console.log(`=== 开始关卡 L${level} ===`);
  console.log(`主题: ${theme.name} (${theme.id})`);
  console.log(`语言: ${lang}`);
  
  // 生成关卡题目（基于主题和难度）
  const bank = generateLevelQuestions(lang, level, theme);
  if (!bank.length) { 
    alert('该关题库暂缺，敬请期待'); 
    return; 
  }
  
  const size = Math.min(7, bank.length);
  const queue = [];
  const pool = [...bank];
  
  // 使用更复杂的种子随机数确保每次生成的题目顺序不同
  const seed = Date.now() + level * 1000 + lang.charCodeAt(0) * 100 + Math.random() * 1000;
  const seededRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  // 打乱题目顺序，确保每次都是不同的组合
  const shuffledPool = [...pool];
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
  }
  
  // 选择前size个题目
  queue.push(...shuffledPool.slice(0, size));
  
  console.log(`L${level} 选择了 ${queue.length} 道题目:`, queue.map(q => q.id));
  
  AppState.session.levelMode = true; 
  AppState.session.levelId = level;
  AppState.session.queue = queue;
  AppState.session.cursor = 0;
  AppState.session.current = queue[0];
  
  switchView('learn');
  renderCurrentQuestion();
}

// 获取已经做过的题目ID列表
function getPlayedQuestions(lang, level) {
  const playedQuestions = new Set();
  
  // 从日志中获取已做过的题目
  Object.keys(AppState.logs).forEach(day => {
    const dayLogs = AppState.logs[day] || [];
    const langLogs = dayLogs.filter(l => l.lang === lang);
    langLogs.forEach(log => {
      playedQuestions.add(log.id);
    });
  });
  
  // 从错题本中获取已做过的题目
  Object.values(AppState.wrongBook).forEach(wrong => {
    if (wrong.item.lang === lang) {
      playedQuestions.add(wrong.item.id);
    }
  });
  
  // 从当前会话中获取已做过的题目（避免同一关内重复）
  if (AppState.session && AppState.session.queue) {
    AppState.session.queue.forEach(q => {
      playedQuestions.add(q.id);
    });
  }
  
  console.log(`已做过的题目数量: ${playedQuestions.size}`);
  return Array.from(playedQuestions);
}

function generateLevelQuestions(lang, level, theme) {
  console.log(`生成L${level}题目，主题: ${theme.name}，语言: ${lang}`);
  
  // 基于现有题库，按主题和难度生成题目
  let bank = (QUESTION_BANK[lang]||[]).filter(q => (q.level||1) <= Math.ceil(level/250));
  
  // 排除与今日10词重复的词
  const wordsSet = getTodayWordsSet(lang);
  bank = bank.filter(q => {
    const candidates = [q.tts, q.answer, q.prompt].filter(Boolean).map(x => String(x).toLowerCase());
    return !candidates.some(t => Array.from(wordsSet).some(w => t.includes(w)));
  });
  
  // 排除已经做过的题目（基于关卡历史）
  const playedQuestions = getPlayedQuestions(lang, level);
  bank = bank.filter(q => !playedQuestions.includes(q.id));
  
  console.log(`过滤后题库数量: ${bank.length}`);
  
  // 如果题库不足，生成一些基础题目
  if (bank.length < 7) {
    console.log('题库不足，生成基础题目');
    const basicQuestions = generateBasicQuestions(lang, level, theme);
    // 过滤掉已经做过的生成题目
    const filteredBasic = basicQuestions.filter(q => !playedQuestions.includes(q.id));
    bank = bank.concat(filteredBasic);
    console.log(`添加基础题目后总数: ${bank.length}`);
  }
  
  // 按主题进一步筛选题目
  if (theme.id && theme.id !== 'basic') {
    const themeWords = getThemeWords(theme.id, lang);
    const themeWordSet = new Set(themeWords.map(w => w.word.toLowerCase()));
    
    // 优先选择与主题相关的题目
    const themeRelevant = bank.filter(q => {
      const candidates = [q.tts, q.answer, q.prompt].filter(Boolean).map(x => String(x).toLowerCase());
      return candidates.some(t => Array.from(themeWordSet).some(w => t.includes(w)));
    });
    
    if (themeRelevant.length > 0) {
      bank = themeRelevant;
      console.log(`主题相关题目数量: ${bank.length}`);
    }
  }
  
  return bank;
}

function generateBasicQuestions(lang, level, theme) {
  // 根据主题生成基础题目
  const questions = [];
  const themeWords = getThemeWords(theme.id, lang);
  
  // 根据语言选择对应的干扰项和提示文本
  const langConfig = {
    EN: {
      prompt: (word) => `请选择 "${word}" 的中文意思`,
      distractOptions: ['对不起', '是', '不是', '谢谢', '你好', '再见', '好的', '不行', '可以', '不可以', '请', '不客气', '没关系', '当然', '当然不'],
      getCorrect: (word) => word.explain.CN
    },
    JA: {
      prompt: (word) => `请选择 "${word}" 的中文意思`,
      distractOptions: ['对不起', '是', '不是', '谢谢', '你好', '再见', '好的', '不行', '可以', '不可以', '请', '不客气', '没关系', '当然', '当然不'],
      getCorrect: (word) => word.explain.CN
    },
    KR: {
      prompt: (word) => `请选择 "${word}" 的中文意思`,
      distractOptions: ['对不起', '是', '不是', '谢谢', '你好', '再见', '好的', '不行', '可以', '不可以', '请', '不客气', '没关系', '当然', '当然不'],
      getCorrect: (word) => word.explain.CN
    }
  };
  
  const config = langConfig[lang] || langConfig.EN;
  
  // 根据关卡难度调整题目数量
  const questionCount = Math.min(7, Math.max(3, themeWords.length));
  const selectedWords = themeWords.slice(0, questionCount);
  
  selectedWords.forEach((word, i) => {
    const correct = config.getCorrect(word);
    const distractPool = config.distractOptions.filter(opt => opt !== correct);
    const options = buildChoiceOptions(correct, distractPool, `${theme.id}:${level}:${i}:${Date.now()}`);
    const uniqueId = `gen_${theme.id}_${level}_${i}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    questions.push({
      id: uniqueId,
      level: Math.ceil(level/250),
      type: 'choice',
      prompt: config.prompt(word.word),
      options,
      answer: correct,
      tts: word.word,
      translation: correct
    });
  });
  
  console.log(`为主题 ${theme.name} 生成了 ${questions.length} 道基础题目`);
  
  return questions;
}

// 确保每关都有不同的主题分类
function ensureThemeVariety(level, theme) {
  // 根据关卡级别调整主题复杂度
  const complexity = Math.min(5, Math.ceil(level / 200));
  
  // 为不同主题添加更多词汇
  const additionalWords = {
    basic: {
      EN: [
        { word: 'good', explain: { CN: '好的', EN: 'positive', JA: '良い', KR: '좋은' } },
        { word: 'bad', explain: { CN: '坏的', EN: 'negative', JA: '悪い', KR: '나쁜' } },
        { word: 'big', explain: { CN: '大的', EN: 'large', JA: '大きい', KR: '큰' } },
        { word: 'small', explain: { CN: '小的', EN: 'little', JA: '小さい', KR: '작은' } },
        { word: 'hot', explain: { CN: '热的', EN: 'warm', JA: '熱い', KR: '뜨거운' } },
        { word: 'cold', explain: { CN: '冷的', EN: 'cool', JA: '冷たい', KR: '차가운' } }
      ],
      JA: [
        { word: '良い', explain: { CN: '好的', EN: 'good', JA: '良い', KR: '좋은' } },
        { word: '悪い', explain: { CN: '坏的', EN: 'bad', JA: '悪い', KR: '나쁜' } },
        { word: '大きい', explain: { CN: '大的', EN: 'big', JA: '大きい', KR: '큰' } },
        { word: '小さい', explain: { CN: '小的', EN: 'small', JA: '小さい', KR: '작은' } },
        { word: '熱い', explain: { CN: '热的', EN: 'hot', JA: '熱い', KR: '뜨거운' } },
        { word: '冷たい', explain: { CN: '冷的', EN: 'cold', JA: '冷たい', KR: '차가운' } }
      ],
      KR: [
        { word: '좋은', explain: { CN: '好的', EN: 'good', JA: '良い', KR: '좋은' } },
        { word: '나쁜', explain: { CN: '坏的', EN: 'bad', JA: '悪い', KR: '나쁜' } },
        { word: '큰', explain: { CN: '大的', EN: 'big', JA: '大きい', KR: '큰' } },
        { word: '작은', explain: { CN: '小的', EN: 'small', JA: '小さい', KR: '작은' } },
        { word: '뜨거운', explain: { CN: '热的', EN: 'hot', JA: '熱い', KR: '뜨거운' } },
        { word: '차가운', explain: { CN: '冷的', EN: 'cold', JA: '冷たい', KR: '차가운' } }
      ]
    }
  };
  
  return additionalWords[themeId] || {};
}

function getThemeWords(themeId, lang) {
  // 根据主题和语言返回对应的词汇
  const themeWordMap = {
    basic: {
      EN: [
        { word: 'hello', explain: { CN: '你好', EN: 'greeting', JA: 'こんにちは', KR: '안녕하세요' } },
        { word: 'thank', explain: { CN: '谢谢', EN: 'gratitude', JA: 'ありがとう', KR: '감사합니다' } },
        { word: 'please', explain: { CN: '请', EN: 'polite request', JA: 'お願いします', KR: '부탁합니다' } },
        { word: 'sorry', explain: { CN: '对不起', EN: 'apology', JA: 'ごめんなさい', KR: '죄송합니다' } },
        { word: 'yes', explain: { CN: '是', EN: 'affirmation', JA: 'はい', KR: '네' } },
        { word: 'no', explain: { CN: '不是', EN: 'negation', JA: 'いいえ', KR: '아니요' } },
        { word: 'good', explain: { CN: '好的', EN: 'positive', JA: '良い', KR: '좋은' } },
        { word: 'bad', explain: { CN: '坏的', EN: 'negative', JA: '悪い', KR: '나쁜' } },
        { word: 'big', explain: { CN: '大的', EN: 'large', JA: '大きい', KR: '큰' } },
        { word: 'small', explain: { CN: '小的', EN: 'little', JA: '小さい', KR: '작은' } },
        { word: 'hot', explain: { CN: '热的', EN: 'warm', JA: '熱い', KR: '뜨거운' } },
        { word: 'cold', explain: { CN: '冷的', EN: 'cool', JA: '冷たい', KR: '차가운' } }
      ],
      JA: [
        { word: 'こんにちは', explain: { CN: '你好', EN: 'hello', JA: 'こんにちは', KR: '안녕하세요' } },
        { word: 'ありがとう', explain: { CN: '谢谢', EN: 'thank you', JA: 'ありがとう', KR: '감사합니다' } },
        { word: 'お願いします', explain: { CN: '请', EN: 'please', JA: 'お願いします', KR: '부탁합니다' } },
        { word: 'ごめんなさい', explain: { CN: '对不起', EN: 'sorry', JA: 'ごめんなさい', KR: '죄송합니다' } },
        { word: 'はい', explain: { CN: '是', EN: 'yes', JA: 'はい', KR: '네' } },
        { word: 'いいえ', explain: { CN: '不是', EN: 'no', JA: 'いいえ', KR: '아니요' } }
      ],
      KR: [
        { word: '안녕하세요', explain: { CN: '你好', EN: 'hello', JA: 'こんにちは', KR: '안녕하세요' } },
        { word: '감사합니다', explain: { CN: '谢谢', EN: 'thank you', JA: 'ありがとう', KR: '감사합니다' } },
        { word: '부탁합니다', explain: { CN: '请', EN: 'please', JA: 'お願いします', KR: '부탁합니다' } },
        { word: '죄송합니다', explain: { CN: '对不起', EN: 'sorry', JA: 'ごめんなさい', KR: '죄송합니다' } },
        { word: '네', explain: { CN: '是', EN: 'yes', JA: 'はい', KR: '네' } },
        { word: '아니요', explain: { CN: '不是', EN: 'no', JA: 'いいえ', KR: '아니요' } }
      ]
    },
    daily: {
      EN: [
        { word: 'home', explain: { CN: '家', EN: 'dwelling', JA: '家', KR: '집' } },
        { word: 'family', explain: { CN: '家庭', EN: 'relatives', JA: '家族', KR: '가족' } },
        { word: 'friend', explain: { CN: '朋友', EN: 'companion', JA: '友達', KR: '친구' } },
        { word: 'work', explain: { CN: '工作', EN: 'job', JA: '仕事', KR: '일' } },
        { word: 'school', explain: { CN: '学校', EN: 'education', JA: '学校', KR: '학교' } },
        { word: 'food', explain: { CN: '食物', EN: 'nourishment', JA: '食べ物', KR: '음식' } }
      ],
      JA: [
        { word: '家', explain: { CN: '家', EN: 'home', JA: '家', KR: '집' } },
        { word: '家族', explain: { CN: '家庭', EN: 'family', JA: '家族', KR: '가족' } },
        { word: '友達', explain: { CN: '朋友', EN: 'friend', JA: '友達', KR: '친구' } },
        { word: '仕事', explain: { CN: '工作', EN: 'work', JA: '仕事', KR: '일' } },
        { word: '学校', explain: { CN: '学校', EN: 'school', JA: '学校', KR: '학교' } },
        { word: '食べ物', explain: { CN: '食物', EN: 'food', JA: '食べ物', KR: '음식' } }
      ],
      KR: [
        { word: '집', explain: { CN: '家', EN: 'home', JA: '家', KR: '집' } },
        { word: '가족', explain: { CN: '家庭', EN: 'family', JA: '家族', KR: '가족' } },
        { word: '친구', explain: { CN: '朋友', EN: 'friend', JA: '友達', KR: '친구' } },
        { word: '일', explain: { CN: '工作', EN: 'work', JA: '仕事', KR: '일' } },
        { word: '학교', explain: { CN: '学校', EN: 'school', JA: '学校', KR: '학교' } },
        { word: '음식', explain: { CN: '食物', EN: 'food', JA: '食べ物', KR: '음식' } }
      ]
    },
    food: {
      EN: [
        { word: 'apple', explain: { CN: '苹果', EN: 'fruit', JA: 'りんご', KR: '사과' } },
        { word: 'bread', explain: { CN: '面包', EN: 'baked good', JA: 'パン', KR: '빵' } },
        { word: 'rice', explain: { CN: '米饭', EN: 'grain', JA: 'ご飯', KR: '쌀' } },
        { word: 'meat', explain: { CN: '肉', EN: 'protein', JA: '肉', KR: '고기' } },
        { word: 'vegetable', explain: { CN: '蔬菜', EN: 'plant food', JA: '野菜', KR: '채소' } },
        { word: 'water', explain: { CN: '水', EN: 'liquid', JA: '水', KR: '물' } }
      ],
      JA: [
        { word: 'りんご', explain: { CN: '苹果', EN: 'apple', JA: 'りんご', KR: '사과' } },
        { word: 'パン', explain: { CN: '面包', EN: 'bread', JA: 'パン', KR: '빵' } },
        { word: 'ご飯', explain: { CN: '米饭', EN: 'rice', JA: 'ご飯', KR: '쌀' } },
        { word: '肉', explain: { CN: '肉', EN: 'meat', JA: '肉', KR: '고기' } },
        { word: '野菜', explain: { CN: '蔬菜', EN: 'vegetable', JA: '野菜', KR: '채소' } },
        { word: '水', explain: { CN: '水', EN: 'water', JA: '水', KR: '물' } }
      ],
      KR: [
        { word: '사과', explain: { CN: '苹果', EN: 'apple', JA: 'りんご', KR: '사과' } },
        { word: '빵', explain: { CN: '面包', EN: 'bread', JA: 'パン', KR: '빵' } },
        { word: '쌀', explain: { CN: '米饭', EN: 'rice', JA: 'ご飯', KR: '쌀' } },
        { word: '고기', explain: { CN: '肉', EN: 'meat', JA: '肉', KR: '고기' } },
        { word: '채소', explain: { CN: '蔬菜', EN: 'vegetable', JA: '野菜', KR: '채소' } },
        { word: '물', explain: { CN: '水', EN: 'water', JA: '水', KR: '물' } }
      ]
    },
    travel: {
      EN: [
        { word: 'airport', explain: { CN: '机场', EN: 'aviation hub', JA: '空港', KR: '공항' } },
        { word: 'hotel', explain: { CN: '酒店', EN: 'accommodation', JA: 'ホテル', KR: '호텔' } },
        { word: 'ticket', explain: { CN: '票', EN: 'pass', JA: '切符', KR: '표' } },
        { word: 'passport', explain: { CN: '护照', EN: 'ID document', JA: 'パスポート', KR: '여권' } },
        { word: 'luggage', explain: { CN: '行李', EN: 'baggage', JA: '荷物', KR: '짐' } },
        { word: 'map', explain: { CN: '地图', EN: 'guide', JA: '地図', KR: '지도' } }
      ],
      JA: [
        { word: '空港', explain: { CN: '机场', EN: 'airport', JA: '空港', KR: '공항' } },
        { word: 'ホテル', explain: { CN: '酒店', EN: 'hotel', JA: 'ホテル', KR: '호텔' } },
        { word: '切符', explain: { CN: '票', EN: 'ticket', JA: '切符', KR: '표' } },
        { word: 'パスポート', explain: { CN: '护照', EN: 'passport', JA: 'パスポート', KR: '여권' } },
        { word: '荷物', explain: { CN: '行李', EN: 'luggage', JA: '荷物', KR: '짐' } },
        { word: '地図', explain: { CN: '地图', EN: 'map', JA: '地図', KR: '지도' } }
      ],
      KR: [
        { word: '공항', explain: { CN: '机场', EN: 'airport', JA: '空港', KR: '공항' } },
        { word: '호텔', explain: { CN: '酒店', EN: 'hotel', JA: 'ホテル', KR: '호텔' } },
        { word: '표', explain: { CN: '票', EN: 'ticket', JA: '切符', KR: '표' } },
        { word: '여권', explain: { CN: '护照', EN: 'passport', JA: 'パスポート', KR: '여권' } },
        { word: '짐', explain: { CN: '行李', EN: 'luggage', JA: '荷物', KR: '짐' } },
        { word: '지도', explain: { CN: '地图', EN: 'map', JA: '地図', KR: '지도' } }
      ]
    },
    work: {
      EN: [
        { word: 'office', explain: { CN: '办公室', EN: 'workplace', JA: 'オフィス', KR: '사무실' } },
        { word: 'meeting', explain: { CN: '会议', EN: 'gathering', JA: '会議', KR: '회의' } },
        { word: 'project', explain: { CN: '项目', EN: 'task', JA: 'プロジェクト', KR: '프로젝트' } },
        { word: 'email', explain: { CN: '邮件', EN: 'message', JA: 'メール', KR: '이메일' } },
        { word: 'phone', explain: { CN: '电话', EN: 'device', JA: '電話', KR: '전화' } },
        { word: 'computer', explain: { CN: '电脑', EN: 'machine', JA: 'コンピューター', KR: '컴퓨터' } }
      ],
      JA: [
        { word: 'オフィス', explain: { CN: '办公室', EN: 'office', JA: 'オフィス', KR: '사무실' } },
        { word: '会議', explain: { CN: '会议', EN: 'meeting', JA: '会議', KR: '회의' } },
        { word: 'プロジェクト', explain: { CN: '项目', EN: 'project', JA: 'プロジェクト', KR: '프로젝트' } },
        { word: 'メール', explain: { CN: '邮件', EN: 'email', JA: 'メール', KR: '이메일' } },
        { word: '電話', explain: { CN: '电话', EN: 'phone', JA: '電話', KR: '전화' } },
        { word: 'コンピューター', explain: { CN: '电脑', EN: 'computer', JA: 'コンピューター', KR: '컴퓨터' } }
      ],
      KR: [
        { word: '사무실', explain: { CN: '办公室', EN: 'office', JA: 'オフィス', KR: '사무실' } },
        { word: '회의', explain: { CN: '会议', EN: 'meeting', JA: '会議', KR: '회의' } },
        { word: '프로젝트', explain: { CN: '项目', EN: 'project', JA: 'プロジェクト', KR: '프로젝트' } },
        { word: '이메일', explain: { CN: '邮件', EN: 'email', JA: 'メール', KR: '이메일' } },
        { word: '전화', explain: { CN: '电话', EN: 'phone', JA: '電話', KR: '전화' } },
        { word: '컴퓨터', explain: { CN: '电脑', EN: 'computer', JA: 'コンピューター', KR: '컴퓨터' } }
      ]
    },
    study: {
      EN: [
        { word: 'book', explain: { CN: '书', EN: 'text', JA: '本', KR: '책' } },
        { word: 'teacher', explain: { CN: '老师', EN: 'instructor', JA: '先生', KR: '선생님' } },
        { word: 'student', explain: { CN: '学生', EN: 'learner', JA: '学生', KR: '학생' } },
        { word: 'class', explain: { CN: '班级', EN: 'group', JA: 'クラス', KR: '반' } },
        { word: 'homework', explain: { CN: '作业', EN: 'assignment', JA: '宿題', KR: '숙제' } },
        { word: 'exam', explain: { CN: '考试', EN: 'test', JA: '試験', KR: '시험' } }
      ],
      JA: [
        { word: '本', explain: { CN: '书', EN: 'book', JA: '本', KR: '책' } },
        { word: '先生', explain: { CN: '老师', EN: 'teacher', JA: '先生', KR: '선생님' } },
        { word: '学生', explain: { CN: '学生', EN: 'student', JA: '学生', KR: '학생' } },
        { word: 'クラス', explain: { CN: '班级', EN: 'class', JA: 'クラス', KR: '반' } },
        { word: '宿題', explain: { CN: '作业', EN: 'homework', JA: '宿題', KR: '숙제' } },
        { word: '試験', explain: { CN: '考试', EN: 'exam', JA: '試験', KR: '시험' } }
      ],
      KR: [
        { word: '책', explain: { CN: '书', EN: 'book', JA: '本', KR: '책' } },
        { word: '선생님', explain: { CN: '老师', EN: 'teacher', JA: '先生', KR: '선생님' } },
        { word: '학생', explain: { CN: '学生', EN: 'student', JA: '学生', KR: '학생' } },
        { word: '반', explain: { CN: '班级', EN: 'class', JA: 'クラス', KR: '반' } },
        { word: '숙제', explain: { CN: '作业', EN: 'homework', JA: '宿題', KR: '숙제' } },
        { word: '시험', explain: { CN: '考试', EN: 'exam', JA: '試験', KR: '시험' } }
      ]
    },
    health: {
      EN: [
        { word: 'doctor', explain: { CN: '医生', EN: 'physician', JA: '医者', KR: '의사' } },
        { word: 'hospital', explain: { CN: '医院', EN: 'medical center', JA: '病院', KR: '병원' } },
        { word: 'medicine', explain: { CN: '药物', EN: 'treatment', JA: '薬', KR: '약' } },
        { word: 'exercise', explain: { CN: '运动', EN: 'activity', JA: '運動', KR: '운동' } },
        { word: 'sleep', explain: { CN: '睡觉', EN: 'rest', JA: '睡眠', KR: '잠' } },
        { word: 'healthy', explain: { CN: '健康的', EN: 'well-being', JA: '健康的', KR: '건강한' } }
      ],
      JA: [
        { word: '医者', explain: { CN: '医生', EN: 'doctor', JA: '医者', KR: '의사' } },
        { word: '病院', explain: { CN: '医院', EN: 'hospital', JA: '病院', KR: '병원' } },
        { word: '薬', explain: { CN: '药物', EN: 'medicine', JA: '薬', KR: '약' } },
        { word: '運動', explain: { CN: '运动', EN: 'exercise', JA: '運動', KR: '운동' } },
        { word: '睡眠', explain: { CN: '睡觉', EN: 'sleep', JA: '睡眠', KR: '잠' } },
        { word: '健康的', explain: { CN: '健康的', EN: 'healthy', JA: '健康的', KR: '건강한' } }
      ],
      KR: [
        { word: '의사', explain: { CN: '医生', EN: 'doctor', JA: '医者', KR: '의사' } },
        { word: '병원', explain: { CN: '医院', EN: 'hospital', JA: '病院', KR: '병원' } },
        { word: '약', explain: { CN: '药物', EN: 'medicine', JA: '薬', KR: '약' } },
        { word: '운동', explain: { CN: '运动', EN: 'exercise', JA: '運動', KR: '운동' } },
        { word: '잠', explain: { CN: '睡觉', EN: 'sleep', JA: '睡眠', KR: '잠' } },
        { word: '건강한', explain: { CN: '健康的', EN: 'healthy', JA: '健康的', KR: '건강한' } }
      ]
    },
    tech: {
      EN: [
        { word: 'computer', explain: { CN: '电脑', EN: 'machine', JA: 'コンピューター', KR: '컴퓨터' } },
        { word: 'internet', explain: { CN: '互联网', EN: 'network', JA: 'インターネット', KR: '인터넷' } },
        { word: 'phone', explain: { CN: '电话', EN: 'device', JA: '電話', KR: '전화' } },
        { word: 'email', explain: { CN: '邮件', EN: 'message', JA: 'メール', KR: '이메일' } },
        { word: 'software', explain: { CN: '软件', EN: 'program', JA: 'ソフトウェア', KR: '소프트웨어' } },
        { word: 'website', explain: { CN: '网站', EN: 'page', JA: 'ウェブサイト', KR: '웹사이트' } }
      ],
      JA: [
        { word: 'コンピューター', explain: { CN: '电脑', EN: 'computer', JA: 'コンピューター', KR: '컴퓨터' } },
        { word: 'インターネット', explain: { CN: '互联网', EN: 'internet', JA: 'インターネット', KR: '인터넷' } },
        { word: '電話', explain: { CN: '电话', EN: 'phone', JA: '電話', KR: '전화' } },
        { word: 'メール', explain: { CN: '邮件', EN: 'email', JA: 'メール', KR: '이메일' } },
        { word: 'ソフトウェア', explain: { CN: '软件', EN: 'software', JA: 'ソフトウェア', KR: '소프트웨어' } },
        { word: 'ウェブサイト', explain: { CN: '网站', EN: 'website', JA: 'ウェブサイト', KR: '웹사이트' } }
      ],
      KR: [
        { word: '컴퓨터', explain: { CN: '电脑', EN: 'computer', JA: 'コンピューター', KR: '컴퓨터' } },
        { word: '인터넷', explain: { CN: '互联网', EN: 'internet', JA: 'インターネット', KR: '인터넷' } },
        { word: '전화', explain: { CN: '电话', EN: 'phone', JA: '電話', KR: '전화' } },
        { word: '이메일', explain: { CN: '邮件', EN: 'email', JA: 'メール', KR: '이메일' } },
        { word: '소프트웨어', explain: { CN: '软件', EN: 'software', JA: 'ソフトウェア', KR: '소프트웨어' } },
        { word: '웹사이트', explain: { CN: '网站', EN: 'website', JA: 'ウェブサイト', KR: '웹사이트' } }
      ]
    },
    culture: [
      { word: 'music', explain: { CN: '音乐', EN: 'sound', JA: '音楽', KR: '음악' } },
      { word: 'movie', explain: { CN: '电影', EN: 'film', JA: '映画', KR: '영화' } },
      { word: 'art', explain: { CN: '艺术', EN: 'creativity', JA: '芸術', KR: '예술' } },
      { word: 'dance', explain: { CN: '舞蹈', EN: 'movement', JA: 'ダンス', KR: '춤' } },
      { word: 'festival', explain: { CN: '节日', EN: 'celebration', JA: '祭り', KR: '축제' } },
      { word: 'tradition', explain: { CN: '传统', EN: 'custom', JA: '伝統', KR: '전통' } }
    ],
    nature: [
      { word: 'tree', explain: { CN: '树', EN: 'plant', JA: '木', KR: '나무' } },
      { word: 'flower', explain: { CN: '花', EN: 'bloom', JA: '花', KR: '꽃' } },
      { word: 'mountain', explain: { CN: '山', EN: 'peak', JA: '山', KR: '산' } },
      { word: 'river', explain: { CN: '河', EN: 'stream', JA: '川', KR: '강' } },
      { word: 'ocean', explain: { CN: '海洋', EN: 'sea', JA: '海', KR: '바다' } },
      { word: 'sky', explain: { CN: '天空', EN: 'heaven', JA: '空', KR: '하늘' } }
    ],
    advanced: [
      { word: 'philosophy', explain: { CN: '哲学', EN: 'wisdom', JA: '哲学', KR: '철학' } },
      { word: 'psychology', explain: { CN: '心理学', EN: 'mind study', JA: '心理学', KR: '심리학' } },
      { word: 'economics', explain: { CN: '经济学', EN: 'money study', JA: '経済学', KR: '경제학' } },
      { word: 'politics', explain: { CN: '政治', EN: 'government', JA: '政治', KR: '정치' } },
      { word: 'science', explain: { CN: '科学', EN: 'knowledge', JA: '科学', KR: '과학' } },
      { word: 'technology', explain: { CN: '技术', EN: 'innovation', JA: '技術', KR: '기술' } }
    ]
  };
  
  const theme = themeWordMap[themeId] || themeWordMap.basic;
  
  // 如果主题是按语言分组的，返回对应语言的词汇
  if (theme[lang]) {
    return theme[lang];
  }
  
  // 对于旧格式的主题，根据语言生成对应的词汇
  if (Array.isArray(theme)) {
    return theme.map(item => ({
      word: item.word,
      explain: item.explain
    }));
  }
  
  // 默认返回基础主题的对应语言
  return themeWordMap.basic[lang] || themeWordMap.basic.EN || [];
}

// ------------- 周报 -------------
function buildWeeklyReport() {
  const now = new Date();
  const start = new Date(); start.setDate(now.getDate() - 6);
  const currentLang = AppState.profile.lang;
  const langNames = { EN: 'English', JA: '日本語', KR: '한국어' };
  
  let total=0, correct=0, totalAll=0, correctAll=0;
  for (let i=0;i<7;i++) {
    const d = new Date(start); d.setDate(start.getDate()+i);
    const k = d.toISOString().slice(0,10);
    const arr = AppState.logs[k] || [];
    
    // 当前语言统计
    const langArr = arr.filter(x => x.lang === currentLang);
    total += langArr.length; 
    correct += langArr.filter(x=>x.ok).length;
    
    // 全语言统计
    totalAll += arr.length; 
    correctAll += arr.filter(x=>x.ok).length;
  }
  
  const rate = total? Math.round((correct/total)*100) : 0;
  const rateAll = totalAll? Math.round((correctAll/totalAll)*100) : 0;
  const reward = rate>=80 ? '达成每周目标：+50积分 🎉' : '未达成目标：下周加油！';
  if (rate>=80) AppState.profile.points += 50, saveAll();
  
  return `近7天${langNames[currentLang]}完成 ${total} 题，正确率 ${rate}%\n全语言完成 ${totalAll} 题，正确率 ${rateAll}%\n${reward}`;
}

// ------------- 启动 -------------
function init() {
  bindEvents();
  renderHome();
}

document.addEventListener('DOMContentLoaded', init);


