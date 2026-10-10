(function(){
'use strict';

const G = {
  players: [], deck: [], community: [], pot: 0, currentBet: 0,
  lastRaiseAmount: 20, stage: 'preflop', dealerIndex: 0, currentPlayerIndex: 0,
  smallBlind: 1, bigBlind: 2, tableMode: 'nano', tableLabel: 'Nano',
  gameMode: 'ai',
  handNumber: 0, totalPlayers: 6, aiSeats: 6,
  gameOver: false, busy: false, soundOn: true,
  playerHandStartChips: 0, sessionBuyIn: 0, sessionHands: 0,
  raiseMin: 0, raiseMax: 0, seatPositions: [],
  _renderedCards: new WeakSet(), turnTimer: null, turnTimeLeft: 30,
  online: { active:false, isHost:false, roomId:'', mySeat:-1, started:false, broadcastTimer:null },
  _lastStateSig:'', _lastActionSig:'', _lastBoardSig:'', _lastHandSig:'',
  _timerKey:null, _hostTimeout:null, _nextHandTimer:null,
  _nextHandEndsAt:0, _turnEndsAt:0, _nextHandToastTimer:null,
  _turnTickTimer:null, _lastTickSecond:0, _currentHandMyCards:[],
  _busySince: 0,
  _aiActionTimer: null,
  _busyWatchdogTimer: null,
  isMobile: false, orientation: 'landscape',
  _showCardsTimer: null,
  _showCardsEndsAt: 0,
  _chatMessages: [],
  _chatOpen: false,
  _rebuyMultiplier: 0,
  _onlineLv: null,
  _spectatorMode: false,
  _pendingSeat: false,
  _waitingSeats: {},
  _pendingHoleCards: {},   // ★ 新增：临时缓存解密的底牌，等玩家就位后填入
  /* ★ 新增：本轮加注次数，用于 3-bet / 4-bet 显示 */
  raiseCount: 0
};

const STAGE_KEYS = {
  preflop:"stagePreflop", flop:"stageFlop", turn:"stageTurn",
  river:"stageRiver", showdown:"stageShowdown"
};

const LEVELS = [
  { key:"nano",  name:"Nano",  sb:1,     bb:2,     buyMin:100,    buyMax:500 },
  { key:"micro", name:"Micro", sb:100,   bb:200,   buyMin:4000,   buyMax:20000 },
  { key:"low",   name:"Low",   sb:500,   bb:1000,  buyMin:20000,  buyMax:100000 },
  { key:"mid",   name:"Mid",   sb:2500,  bb:5000,  buyMin:100000, buyMax:500000 },
  { key:"high",  name:"High",  sb:10000, bb:20000, buyMin:400000, buyMax:2000000 }
];

const ONLINE_MAX_SEATS = 7;
const ONLINE_MIN_SEATS = 2;
const CHIP_TO_BEM = 0.0001;
const NEXT_HAND_DELAY = 8;
const BUSY_TIMEOUT = 8000;
const AI_ACTION_TIMEOUT = 5000;
const PLAYER_ACTION_TIMEOUT = 30000;
const SHOW_CARDS_WINDOW = 8000;
const BUSY_WATCHDOG_INTERVAL = 1500;
const MIN_DEPOSIT_BEM = 0.001;
const MIN_WITHDRAW_BEM = 0.0001;

const CHIP_DENOMS = [100000, 50000, 20000, 10000, 5000, 1000, 500, 100, 25, 5, 1];
const SUPABASE_URL_DEALER = 'https://olmlqguftnmnpyefrokk.supabase.co';
const SUPABASE_KEY_DEALER = 'sb_publishable_QSRZnWEj0nJ1QdxmqBgPcA_0n9fP4oK';

/* ================= 设备 & 方向 ================= */
function detectDevice(){
  const ua = navigator.userAgent || '';
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isSmall = Math.min(window.innerWidth, window.innerHeight) < 900;
  const isMobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return (isMobileUA && isSmall) || (isTouch && isSmall);
}
function detectOrientation(){
  if(!G.isMobile) return 'landscape';
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}
function applyDeviceClass(){
  const mobile = detectDevice();
  G.isMobile = mobile;
  document.body.classList.toggle('is-mobile', mobile);
  document.body.classList.toggle('is-desktop', !mobile);
  const ori = detectOrientation();
  const changed = (G.orientation !== ori);
  G.orientation = ori;
  document.body.classList.toggle('orientation-portrait',  ori === 'portrait');
  document.body.classList.toggle('orientation-landscape', ori === 'landscape');
  const hint = document.getElementById('portraitHint');
  if(hint){
    if(mobile && ori === 'portrait') hint.classList.remove('hidden');
    else hint.classList.add('hidden');
  }
  if(changed && G.players.length){
    G.seatPositions = computeSeatPositions(G.players.length);
    render();
  }
}

/* ================= 牌对象缓存 ================= */
const _cardCache = new Map();
function normalizeCard(c){
  if(!c || !c.rank || !c.suit) return c;
  const key = c.suit + c.rank;
  let card = _cardCache.get(key);
  if(card) return card;
  card = { rank:c.rank, suit:c.suit, value:c.value, display:c.display || (c.rank+' '+c.suit), red:!!c.red };
  _cardCache.set(key, card);
  return card;
}
function normalizeCards(arr){ return arr && arr.length ? arr.map(normalizeCard) : []; }

/* ================= 状态指纹 ================= */
function cardKey(c){ return c ? String(c.suit||'')+String(c.rank||'') : ''; }
function cardsSig(arr){ return arr && arr.length ? arr.map(cardKey).join(',') : ''; }
function buildStateSig(state){
  if(!state) return '';
  const players = (state.players || []).map(function(p){
    return [p.peerId || p.id, p.chips, p.folded?1:0, p.allIn?1:0,
      p.seated === false ? 0 : 1, p.currentBet||0, p.lastAction||'',
      p.position||'', p.revealCards?1:0, p._spectator?1:0, p._waitNextHand?1:0, cardsSig(p.holeCards)].join(':');
  }).join('|');
  return [state.handNumber, state.stage, state.currentPlayerIndex,
    state.pot, state.currentBet, state.dealerIndex, state.gameOver?1:0,
    state.phase||'', state.nextHandEndsAt||0, cardsSig(state.community), players].join('/');
}
function buildActionSig(){
  const me = G.players[myIndex()];
  if(!me) return '';
  const toCall = Math.max(0, G.currentBet - (me.currentBet || 0));
  return [G.handNumber, G.stage, G.currentPlayerIndex, myIndex(),
    me.folded?1:0, me.allIn?1:0, me.chips, toCall, G.currentBet].join(':');
}

/* ================= 工具 ================= */
function $(id){ return document.getElementById(id); }
function t(k,v){ return window.PokerI18n.t(k,v); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function fmtNum(n){ return (Math.floor(n)||0).toLocaleString('en-US'); }
function toBem(chips){ return (chips * CHIP_TO_BEM).toFixed(4); }
function isEn(){ return PokerI18n.getLang() === 'en'; }
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}
function appToast(msg, type){
  let el = document.getElementById('appToast');
  if(!el){
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'app-toast show' + (type ? ' ' + type : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(function(){
    el.classList.remove('show');
  }, 2600);
}

/* ================= 筹码面额拆分 ================= */
function amountToChips(amount, denoms){
  denoms = denoms || CHIP_DENOMS;
  const result = [];
  let remain = Math.floor(amount || 0);
  for(let i = 0; i < denoms.length; i++){
    const d = denoms[i];
    const count = Math.floor(remain / d);
    if(count > 0){
      result.push({ value: d, count: count });
      remain -= count * d;
    }
  }
  return result;
}
function buildVisualStacks(chipGroups, maxPerColumn, maxColumns){
  maxPerColumn = maxPerColumn || 8;
  maxColumns = maxColumns || 4;
  const columns = [];
  for(let i = 0; i < chipGroups.length && columns.length < maxColumns; i++){
    const g = chipGroups[i];
    let left = g.count;
    while(left > 0 && columns.length < maxColumns){
      const n = Math.min(left, maxPerColumn);
      columns.push({ value: g.value, count: n });
      left -= n;
    }
  }
  return columns;
}
function chipLabel(v){
  if(v >= 1000000) return (v/1000000) + 'M';
  if(v >= 1000) return (v/1000) + 'k';
  return String(v);
}
function renderChipStackHtml(amount, opts){
  opts = opts || {};
  const maxPerColumn = opts.maxPerColumn || 8;
  const maxColumns = opts.maxColumns || 4;
  const wrapClass = opts.wrapClass || 'chip-stack-wrap';
  const showLabels = opts.showLabels !== false;
  const groups = amountToChips(amount);
  if(!groups.length) return '<div class="' + wrapClass + ' empty"></div>';
  const cols = buildVisualStacks(groups, maxPerColumn, maxColumns);
  let html = '<div class="' + wrapClass + '">';
  for(let i = 0; i < cols.length; i++){
    const col = cols[i];
    html += '<div class="chip-column">';
    for(let j = 0; j < col.count; j++){
      html += '<div class="chip-piece chip-' + col.value + '"></div>';
    }
    if(showLabels) html += '<div class="chip-label">' + chipLabel(col.value) + '</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

/* ★ 根据座位在牌桌上的位置，决定筹码堆浮出的方向 */
function computeChipSideForIndex(i){
  const pos = G.seatPositions[i];
  if(!pos) return 'bottom';
  /* 座位相对于牌桌中心 (50,50) 的方向 → 筹码朝外（远离中心）浮出 */
  const dx = pos.x - 50;
  const dy = pos.y - 50;
  if(Math.abs(dx) > Math.abs(dy)){
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'bottom' : 'top';
}

function playActionSound(action){
  if(!window.PokerAudio || !action) return;
  if(action.type === 'fold'){ PokerAudio.play('fold'); return; }
  if(action.type === 'check'){ PokerAudio.play('check'); return; }
  if(action.type === 'call'){ PokerAudio.play('call'); return; }
  /* raise 的音效由 executeAction 内部选择（区分普通加注 / 3-bet+ / all-in） */
}

function log(msg, cls){
  const areas = [$("logArea"), $("mobileLogArea")].filter(Boolean);
  areas.forEach(function(el){
    const div = document.createElement("div");
    div.className = "log-line" + (cls ? " " + cls : "");
    div.textContent = msg;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
    while(el.childNodes.length > 200) el.removeChild(el.firstChild);
  });
  updateHandInfo();
}
function clearLog(){
  const areas = [$("logArea"), $("mobileLogArea")].filter(Boolean);
  areas.forEach(function(el){ el.innerHTML = ""; });
}

function showScreen(name){
  ["lobbyScreen","rulesScreen","myNumbersScreen","gameScreen"].forEach(function(id){
    const el = $(id); if(el) el.classList.add("hidden");
  });
  const target = $(name + "Screen");
  if(target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach(function(a){
    a.classList.toggle("active", a.getAttribute("data-nav") === name);
  });
  if(name === "lobby") refreshBalanceUI();
  if(name === "myNumbers") renderNumbers();
}

/* ================= 大厅数据 ================= */
function refreshBalanceUI(){
const rBem = (window.PokerWallet && PokerWallet.isConnected()) ? PokerWallet.getContractBalance() : 0;
  const r = Math.floor(rBem / CHIP_TO_BEM); // ★ 将链上 BEM 余额换算成筹码数
  const pts = PokerStorage.getPoints();
  const ai = PokerStorage.getAiChips();
  const rEl = $("realBalance"); if(rEl) rEl.textContent = fmtNum(r);
  const pEl = $("pointsBalance"); if(pEl) pEl.textContent = fmtNum(pts);
  const aiEl = $("aiTotalChips"); if(aiEl) aiEl.textContent = fmtNum(ai);

  const s = PokerStorage.getStats();
  const pwEl = $("pointsTotalWon");
  if(pwEl){
    pwEl.textContent = (s.netGain >= 0 ? "+" : "") + fmtNum(s.netGain);
    pwEl.style.color = s.netGain >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const aiWon = $("aiTotalWon");
  if(aiWon){
    aiWon.textContent = (s.netGain >= 0 ? "+" : "") + fmtNum(s.netGain);
    aiWon.style.color = s.netGain >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if(window.PokerWallet && PokerWallet.isConnected()) PokerWallet.updateUI();
}

function renderNumbers(){
  const s = PokerStorage.getStats();
  const th = $("numTotalHands"); if(th) th.textContent = s.hands;
  const twr = $("numWinRate");
  if(twr) twr.textContent = s.hands > 0 ? Math.round(s.wins / s.hands * 100) + "%" : "0%";
  const tb = $("numBiggest"); if(tb) tb.textContent = fmtNum(s.biggestPot);
  const tn = $("numNet");
  if(tn){
    tn.textContent = (s.netGain >= 0 ? "+" : "") + fmtNum(s.netGain);
    tn.classList.toggle('positive', s.netGain >= 0);
    tn.classList.toggle('negative', s.netGain < 0);
  }
  const sessions = s.sessions || [];
  let totalBuyIn = 0, totalCashout = 0;
  sessions.forEach(function(r){ totalBuyIn += (r.buyIn || 0); totalCashout += (r.buyIn || 0) + (r.pnl || 0); });
  const tt = $("numTables"); if(tt) tt.textContent = sessions.length;
  const tbi = $("numTotalBuyIn"); if(tbi) tbi.textContent = fmtNum(totalBuyIn);
  const tco = $("numTotalCashout"); if(tco) tco.textContent = fmtNum(totalCashout);
  const wa = $("numbersWallet");
  if(wa){
    if(window.PokerWallet && PokerWallet.isConnected()){
      const a = PokerWallet.getAddress();
      wa.textContent = a.slice(0,6) + '...' + a.slice(-4);
    } else { wa.textContent = isEn() ? "Not connected" : "未连接"; }
  }
  renderHandHistory();
  const body = $("sessionsBody");
  if(!body) return;
  body.innerHTML = "";
  if(sessions.length === 0){
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.textContent = isEn() ? "No sessions yet" : "还没坐过桌";
    body.appendChild(empty);
    return;
  }
  sessions.forEach(function(rec){
    const row = document.createElement("div");
    row.className = "session-row";
    const pnlCls = rec.pnl >= 0 ? "pos" : "neg";
    const pnlText = (rec.pnl >= 0 ? "+" : "") + fmtNum(rec.pnl);
    const cashout = (rec.buyIn || 0) + (rec.pnl || 0);
    const modeTag = rec.mode === 'real' ? (isEn() ? ' · Chain' : ' · 链上')
                    : (rec.mode === 'points' ? (isEn() ? ' · Points' : ' · 积分') : ' · AI');
    row.innerHTML =
      '<span>' + rec.table + modeTag + '</span>' +
      '<span>' + rec.blinds + '</span>' +
      '<span>' + fmtNum(rec.buyIn) + '</span>' +
      '<span>' + fmtNum(cashout) + '</span>' +
      '<span class="' + pnlCls + '">' + pnlText + '</span>' +
      '<span>' + (rec.hands || 0) + '</span>' +
      '<span>' + (rec.pnl > 0 ? '✓' : '—') + '</span>' +
      '<span>' + (isEn() ? 'Left' : '已离桌') + '</span>';
    body.appendChild(row);
  });
}

function renderHandHistory(){
  const body = document.getElementById('handHistoryBody');
  if(!body) return;
  const list = PokerStorage.getHandHistory ? PokerStorage.getHandHistory() : [];
  body.innerHTML = "";
  if(!list.length){
    const empty = document.createElement('div');
    empty.className = 'hand-history-empty';
    empty.textContent = isEn() ? 'No hands recorded yet' : '还没有记录（打一手后自动出现）';
    body.appendChild(empty);
    return;
  }
  list.forEach(function(rec){
    const item = document.createElement('div');
    item.className = 'hand-history-item';
    const myCardsHtml = (rec.myCards || []).map(function(s){
      const red = s.indexOf('♥') >= 0 || s.indexOf('♦') >= 0;
      return '<div class="mini-card face ' + (red ? 'red' : 'black') + '">' +
        '<div class="v">' + s.slice(0, -1) + '</div>' +
        '<div class="s">' + s.slice(-1) + '</div></div>';
    }).join('');
    const commHtml = (rec.community || []).map(function(s){
      const red = s.indexOf('♥') >= 0 || s.indexOf('♦') >= 0;
      return '<div class="mini-card face ' + (red ? 'red' : 'black') + '">' +
        '<div class="v">' + s.slice(0, -1) + '</div>' +
        '<div class="s">' + s.slice(-1) + '</div></div>';
    }).join('');
    const deltaCls = rec.delta >= 0 ? 'pos' : 'neg';
    const deltaText = (rec.delta >= 0 ? '+' : '') + fmtNum(rec.delta);
    item.innerHTML =
      '<span class="hh-hand">#' + rec.handNumber + '</span>' +
      '<span class="hh-cards">' + myCardsHtml + '</span>' +
      '<span class="hh-community">' + commHtml + '</span>' +
      '<span class="hh-result ' + deltaCls + '">' + deltaText + '</span>';
    body.appendChild(item);
  });
}

/* ================= 定时器清理工具 ================= */
function clearAiActionTimer(){
  if(G._aiActionTimer){ clearTimeout(G._aiActionTimer); G._aiActionTimer = null; }
}
function clearHostTimeout(){
  if(G._hostTimeout){ clearTimeout(G._hostTimeout); G._hostTimeout = null; }
}
function clearBusyWatchdog(){
  if(G._busyWatchdogTimer){ clearTimeout(G._busyWatchdogTimer); G._busyWatchdogTimer = null; }
}
function clearShowCardsTimer(){
  if(G._showCardsTimer){ clearTimeout(G._showCardsTimer); G._showCardsTimer = null; }
}
function clearAllGameTimers(){
  clearAiActionTimer();
  clearHostTimeout();
  clearBusyWatchdog();
}

/* ================= 会话重置 ================= */
function resetSessionState(){
  if(G.turnTimer){ clearInterval(G.turnTimer); G.turnTimer = null; }
  clearAllGameTimers();
  clearShowCardsTimer();
  if(G._nextHandTimer){ clearInterval(G._nextHandTimer); G._nextHandTimer = null; }
  if(G._nextHandToastTimer){ clearInterval(G._nextHandToastTimer); G._nextHandToastTimer = null; }
  if(G._turnTickTimer){ clearInterval(G._turnTickTimer); G._turnTickTimer = null; }
  if(G.online.broadcastTimer){ clearInterval(G.online.broadcastTimer); G.online.broadcastTimer = null; }
  G.players = []; G.community = []; G.deck = [];
  G.pot = 0; G.currentBet = 0; G.lastRaiseAmount = G.bigBlind;
  G.stage = 'preflop'; G.handNumber = 0; G.dealerIndex = 0; G.currentPlayerIndex = 0;
  G.gameOver = false; G.busy = false; G._busySince = 0;
  G.seatPositions = []; G.raiseMin = 0; G.raiseMax = 0;
  G.sessionBuyIn = 0; G.sessionHands = 0; G.playerHandStartChips = 0;
  G._renderedCards = new WeakSet();
  G._lastStateSig = ''; G._lastActionSig = ''; G._lastBoardSig = ''; G._lastHandSig = '';
  G._timerKey = null; G._nextHandEndsAt = 0; G._turnEndsAt = 0;
  G._lastTickSecond = 0; G._currentHandMyCards = [];
  G._showCardsEndsAt = 0;
  G._spectatorMode = false;
  G._pendingSeat = false;
  G.raiseCount = 0;
}

function resetTableDom(){
  ['seatsLayer','boardCards','handCardsLarge','logArea','humanActions'].forEach(function(id){
    const el = document.getElementById(id); if(el) el.innerHTML = '';
  });
  const pot = document.getElementById('potMain'); if(pot) pot.textContent = '0';
  const psw = document.getElementById('potSideWrap'); if(psw) psw.classList.add('hidden');
  const ps = document.getElementById('potSide'); if(ps) ps.textContent = '0';
  const potChips = document.getElementById('potChips'); if(potChips) potChips.innerHTML = '';
  const panel = document.getElementById('raisePanel'); if(panel) panel.classList.add('hidden');
  const nextBtn = document.getElementById('nextHandBtn'); if(nextBtn) nextBtn.classList.add('hidden');
  const showBtn = document.getElementById('showCardsBtn'); if(showBtn) showBtn.classList.add('hidden');
  const timer = document.getElementById('turnTimer'); if(timer) timer.classList.add('hidden');
  const stage = document.getElementById('stageLabel'); if(stage) stage.textContent = '';
  const hand = document.getElementById('gameHandLabel'); if(hand) hand.textContent = '';
  const handInfo = document.getElementById('handInfo'); if(handInfo) handInfo.innerHTML = '';
  const toast = document.getElementById('nextHandToast'); if(toast) toast.remove();
  const tng = document.getElementById('turnRing'); if(tng) tng.remove();
  const tie = document.getElementById('tieDisplay'); if(tie) tie.classList.add('hidden');
  const chat = document.getElementById('chatMessages'); if(chat) chat.innerHTML = '';
  const chatPanel = document.getElementById('chatPanel'); if(chatPanel) chatPanel.classList.add('hidden');
  const fab = document.getElementById('chatFab'); if(fab) fab.classList.add('hidden');
  const ih = document.getElementById('inGameHistory'); if(ih) ih.classList.add('hidden');
  const mlogArea = document.getElementById('mobileLogArea'); if(mlogArea) mlogArea.innerHTML = '';
  const mlogHist = document.getElementById('mobileLogHistoryBody'); if(mlogHist) mlogHist.innerHTML = '';
  const mlogPanel = document.getElementById('mobileLogPanel'); if(mlogPanel) mlogPanel.classList.add('hidden');
  const sp = document.getElementById('spectatorPanel'); if(sp) sp.classList.add('hidden');
  const hc = document.getElementById('hostControlPanel'); if(hc) hc.classList.add('hidden');
  closeBubbleBetPanel();
  const topReady = document.getElementById('topReadyBtn'); if(topReady) topReady.classList.add('hidden');
}

function hideHumanActions(){
  const box = $("humanActions"); if(box) box.innerHTML = "";
  const panel = $("raisePanel"); if(panel) panel.classList.add("hidden");
  closeBubbleBetPanel();
  G._lastActionSig = "";
  if(G.turnTimer) stopTurnTimer();
}

function awardUncontestedPot(){
  const alive = G.players.filter(function(p){ return p.seated !== false && !p.folded; });
  const pot = G.pot;
  if(alive.length === 1 && pot > 0){
    const w = alive[0];
    w.chips += pot;
    log(t("winsPot", { name: w.name, pot: fmtNum(pot) }), "win");
    PokerAudio.play("win");
  } else if(alive.length === 0 && pot > 0){
    // ★ 新增：全场弃牌（理论不该发生）→ 退还给贡献者
    console.warn('[awardUncontestedPot] all folded, refunding contributors, pot:', pot);
    const contributors = G.players.filter(function(p){ return (p.totalContributed || 0) > 0; });
    const total = contributors.reduce(function(s, p){ return s + p.totalContributed; }, 0);
    if(total > 0){
      contributors.forEach(function(p){
        const refund = Math.floor(pot * (p.totalContributed / total));
        p.chips += refund;
      });
    }
  }
  G.pot = 0;
  G.stage = "showdown";
  G.busy = false; G._busySince = 0;
  clearAllGameTimers();
}
/* ================= 等待栏 ================= */
function ensureWaitingBar(){
  let bar = document.getElementById('waitingBar');
  if(bar) return bar;
  bar = document.createElement('div');
  bar.id = 'waitingBar';
  bar.className = 'waiting-bar hidden';
  const tableArea = document.querySelector('.table-area');
  if(tableArea) tableArea.appendChild(bar);
  return bar;
}
function showWaitingBar(){
  const bar = ensureWaitingBar();
  if(!bar) return;
  const code = G.online.roomId
    || ((window.PokerOnline && PokerOnline.getRoomId) ? PokerOnline.getRoomId() : '');
  bar.innerHTML =
    '<div class="waiting-room">' + (isEn() ? 'Room ' : '房间号 ') + '<b>' + (code || '—') + '</b></div>' +
    '<div class="waiting-info" id="waitingInfo">0 / 7</div>' +
    '<button class="mini-btn ghost" id="waitingLeaveBtn" type="button">' + (isEn() ? 'Leave' : '离桌') + '</button>';
  bar.classList.remove('hidden');

  const topReady = document.getElementById('topReadyBtn');
  if(topReady){
    topReady.classList.remove('hidden');
    const me = (window.PokerOnline && PokerOnline.getRoomPlayers) ? PokerOnline.getRoomPlayers()[PokerOnline.getMyId()] : null;
    const isReady = me && me.ready;
    topReady.textContent = isReady ? (isEn() ? 'Cancel' : '取消准备') : (isEn() ? 'Ready' : '准备好了');
    topReady.classList.toggle('cancel', !!isReady);
    topReady.onclick = function(){
      if(window.PokerAudio) PokerAudio.play('click');
      const nowReady = PokerOnline.toggleReady();
      topReady.textContent = nowReady ? (isEn() ? 'Cancel' : '取消准备') : (isEn() ? 'Ready' : '准备好了');
      topReady.classList.toggle('cancel', !!nowReady);
      updateWaitingBar();
    };
  }

  const leaveBtn = document.getElementById('waitingLeaveBtn');
  if(leaveBtn) leaveBtn.onclick = function(){
    if(window.PokerAudio) PokerAudio.play('click');
    backToLobby();
  };
  updateWaitingBar();
}
function updateWaitingBar(){
  const info = document.getElementById('waitingInfo');
  if(!info) return;
  const players = (window.PokerOnline && PokerOnline.getRoomPlayers) ? PokerOnline.getRoomPlayers() : {};
  const seated = Object.keys(players).filter(function(pid){ return players[pid].role === 'seated'; });
  const ready = seated.filter(function(pid){ return players[pid].ready; }).length;
  info.textContent = seated.length + ' / ' + ONLINE_MAX_SEATS + ' · ' + ready + (isEn() ? ' ready' : ' 已准备');
}
function hideWaitingBar(){
  const bar = document.getElementById('waitingBar');
  if(bar) bar.classList.add('hidden');
  const topReady = document.getElementById('topReadyBtn');
  if(topReady) topReady.classList.add('hidden');
}

function syncWaitingSeatsFromRoom(){
  if(!G.online.active) return;
  if(G.online.started && G.stage !== 'waiting') return;
  const players = (window.PokerOnline && PokerOnline.getRoomPlayers) ? PokerOnline.getRoomPlayers() : {};
  const myId = window.PokerOnline ? PokerOnline.getMyId() : null;
  const ids = Object.keys(players);
  ids.sort(function(a, b){ return (players[a].seat || 0) - (players[b].seat || 0); });
  const existing = {};
  G.players.forEach(function(p){ p._isWinner = false;if(p.peerId) existing[p.peerId] = p; });
  G.players = ids.map(function(pid){
    const info = players[pid];
    const isSelf = pid === myId;
    const old = existing[pid];
    if(old){
      old.id = info.seat; old.name = info.name; old.isHuman = isSelf;
      old.ready = !!info.ready;
      old.seated = true;
      old.holeCards = []; old.folded = false; old.allIn = false;
      old.currentBet = 0; old.lastAction = ''; old.revealCards = false; old._highlight = null;
      old._spectator = false;
      return old;
    }
    // ★ 和局外筹码统一：优先取房间 level 的 buyMax
    const lv = G._onlineLv || LEVELS.find(function(l){ return l.key === G.tableMode; }) || LEVELS[0];
    const initialChips = lv.buyMax;
    return {
      id: info.seat, peerId: pid, name: info.name,
      emoji: isSelf ? PokerAvatars.HUMAN.emoji : '🎮',
      bg: isSelf ? PokerAvatars.HUMAN.bg : 'linear-gradient(135deg,#a855f7,#6d28d9)',
      isHuman: isSelf, chips: initialChips, seated: true,
      holeCards: [], folded: false, allIn: false,
      currentBet: 0, totalContributed: 0, needsToAct: false,
      position:'', positionKey:'', lastAction:'', styleKey:null,
      revealCards:false, _highlight:null, preflopOrder:0, postflopOrder:0,
      ready: !!info.ready,
      _spectator: false
    };
  });
  G.online.mySeat = G.players.findIndex(function(p){ return p.peerId === myId; });
  G._spectatorMode = (G.online.mySeat < 0);
  G.seatPositions = computeSeatPositions(G.players.length);
  render();
  updateSpectatorUI();
}

function returnToWaiting(){
  clearAllGameTimers();
    // ★ 清掉所有玩家的准备状态
  if(window.PokerOnline && PokerOnline.clearAllReady) PokerOnline.clearAllReady();
  G._rebuyShownFor = 0;
  G._recordedHandKey = null;
  clearShowCardsTimer();
  if(G._nextHandTimer){ clearInterval(G._nextHandTimer); G._nextHandTimer = null; }
  if(G._nextHandToastTimer){ clearInterval(G._nextHandToastTimer); G._nextHandToastTimer = null; }
  stopTurnTimer();
  hideNextHandToast();
  G.online.started = false; G.stage = 'waiting';
  G.pot = 0; G.currentBet = 0; G.community = []; G.handNumber = 0;
  G.gameOver = false; G.busy = false; G._busySince = 0;
  G.dealerIndex = 0; G.currentPlayerIndex = 0;
  G._nextHandEndsAt = 0; G._turnEndsAt = 0;
  G.raiseCount = 0;
  G.players.forEach(function(p){
    p.holeCards = []; p.folded = false; p.allIn = false;
    p.currentBet = 0; p.totalContributed = 0; p.lastAction = '';
    p.revealCards = false; p._highlight = null; p.needsToAct = false;
  });
  syncWaitingSeatsFromRoom();
  showWaitingBar();
  hideHumanActions();
  const bc = document.getElementById('boardCards'); if(bc) bc.innerHTML = '';
  const pm = document.getElementById('potMain'); if(pm) pm.textContent = '0';
  const pc = document.getElementById('potChips'); if(pc) pc.innerHTML = '';
  const handArea = document.getElementById('handCardsLarge'); if(handArea) handArea.innerHTML = '';
  render();
  if(G.online.active && G.online.isHost) broadcastFullState();
}

/* ================= 8 秒下一手 ================= */
function beginNextHandCountdown(startFn){
  if(G._nextHandTimer){ clearInterval(G._nextHandTimer); G._nextHandTimer = null; }
  const seated = G.players.filter(function(p){ return p.seated !== false; });
  if(seated.length < 2){
    if(G.online.active && G.online.isHost){
      log(isEn() ? "Not enough players — waiting" : "人数不足，等待更多玩家", "hl");
    }
    returnToWaiting();
    return;
  }
  const duration = NEXT_HAND_DELAY * 1000;
  G._nextHandEndsAt = Date.now() + duration;
  showNextHandToast(G._nextHandEndsAt);
  if(G.online.active && G.online.isHost) broadcastFullState();
  const btn = $("nextHandBtn");
  if(btn){ btn.classList.remove('hidden'); btn.disabled = false; btn.onclick = fire; }
  function fire(){
    if(G._nextHandTimer){ clearInterval(G._nextHandTimer); G._nextHandTimer = null; }
    G._nextHandEndsAt = 0;
    if(btn) btn.classList.add('hidden');
    hideNextHandToast();
    if(window.PokerAudio) PokerAudio.play('click');
    const still = G.players.filter(function(p){ return p.seated !== false && p.chips > 0; });
    if(still.length < 2){ returnToWaiting(); return; }
    rotateDealerAndStart(startFn);
  }
  function tick(){
    const left = Math.max(0, Math.ceil((G._nextHandEndsAt - Date.now()) / 1000));
    if(btn) btn.textContent = '▶ ' + (isEn() ? ('Next (' + left + 's)') : ('下一手（' + left + 's）'));
    if(left > 0 && left <= 3 && left !== G._lastTickSecond){
      G._lastTickSecond = left;
      if(window.PokerAudio) PokerAudio.play('tick');
    }
    if(left <= 0){ fire(); }
  }
  tick();
  G._nextHandTimer = setInterval(tick, 500);
}
function rotateDealerAndStart(startFn){
  if(!G.players.length) return;
  let tries = 0;
  do {
    G.dealerIndex = (G.dealerIndex + 1) % G.players.length;
    tries++;
  } while(
    (G.players[G.dealerIndex].seated === false || G.players[G.dealerIndex].chips <= 0) &&
    tries < G.players.length
  );
  startFn();
}
function showNextHandToast(endsAt){
  let toast = document.getElementById('nextHandToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'nextHandToast';
    toast.className = 'next-hand-toast';
    const center = document.querySelector('.table-center');
    if(center) center.appendChild(toast); else document.body.appendChild(toast);
  }
  toast.classList.remove('hidden');
  if(G._nextHandToastTimer){ clearInterval(G._nextHandToastTimer); }
  const update = function(){
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    toast.textContent = (isEn() ? 'Next hand ' : '下一手 ') + left;
    if(left <= 0){
      clearInterval(G._nextHandToastTimer);
      G._nextHandToastTimer = null;
      toast.classList.add('hidden');
    }
  };
  update();
  G._nextHandToastTimer = setInterval(update, 200);
}
function hideNextHandToast(){
  const toast = document.getElementById('nextHandToast');
  if(toast) toast.classList.add('hidden');
  if(G._nextHandToastTimer){ clearInterval(G._nextHandToastTimer); G._nextHandToastTimer = null; }
}

/* ================= 兜底同步 ================= */
function checkRosterSync(){
  if(!G.online.active || !G.online.isHost) return false;
  if(!window.PokerOnline || !PokerOnline.getRoomPlayers) return false;
  if(!G.online.started && G.stage === 'waiting') return false;
  const players = PokerOnline.getRoomPlayers();
  const leftPeers = [];
  G.players.forEach(function(p){
    if(!p.peerId) return;
    if(p.seated === false) return;
    const rp = players[p.peerId];
    if(!rp || rp.role !== 'seated') leftPeers.push(p.peerId);
  });
  if(!leftPeers.length) return false;
  let currentLeft = false;
  leftPeers.forEach(function(peerId){
    const idx = G.players.findIndex(function(p){ return p.peerId === peerId; });
    if(idx < 0) return;
    const p = G.players[idx];
    if(p.seated === false) return;
    p.seated = false; p.folded = true; p.needsToAct = false;
    p.holeCards = []; p._highlight = null; p.revealCards = false;
    p.lastAction = isEn() ? 'Left' : '已离桌';
    log((p.name || 'Player') + (isEn() ? " left the table" : " 离桌了"), "action");
    if(G.currentPlayerIndex === idx){
      stopTurnTimer();
      clearHostTimeout();
      currentLeft = true;
    }
  });
  render();
  if(currentLeft){
    setTimeout(function(){
      if(G.online.isHost && !G.gameOver && G.stage !== 'showdown' && G.stage !== 'waiting'){
        try { runHostTurn(); } catch(e){ console.error('[checkRosterSync] runHostTurn', e); }
      }
    }, 100);
  }
  return true;
}
function handlePlayerLeave(peerId){
  const idx = G.players.findIndex(function(p){ return p.peerId === peerId; });
  if(idx < 0) return;
  const p = G.players[idx];
  if(p.seated === false) return;
  p.seated = false; p.folded = true; p.needsToAct = false;
  p.holeCards = []; p._highlight = null; p.revealCards = false;
  p.lastAction = isEn() ? 'Left' : '已离桌';
  log((p.name || 'Player') + (isEn() ? " left the table" : " 离桌了"), "action");
  if(G.currentPlayerIndex === idx){
    stopTurnTimer();
    clearHostTimeout();
  }
  render();
}

/* ================= 观战 & 房主 UI ================= */
function updateSpectatorPanel(isSpectator){
  const panel = document.getElementById('spectatorPanel');
  if(!panel) return;
  if(isSpectator) panel.classList.remove('hidden');
  else panel.classList.add('hidden');
}

function updateSpectatorUI(){
  const takeBtn = document.getElementById('takeSeatBtn');
  const leaveBtn = document.getElementById('leaveSeatBtn');
  const hc = document.getElementById('hostControlPanel');
  const playersBtn = document.getElementById('playersOpenBtn');
  const players = (window.PokerOnline && PokerOnline.getRoomPlayers) ? PokerOnline.getRoomPlayers() : {};
  const myId = window.PokerOnline ? PokerOnline.getMyId() : null;
  const me = players[myId];

  const myGamePlayer = (G.online.mySeat >= 0) ? G.players[G.online.mySeat] : null;
  const gameSpectator = !!(myGamePlayer && myGamePlayer._spectator);
  const roomSpectator = !me || (me.role && me.role !== 'seated');
  const isSpectator = G._spectatorMode || roomSpectator || gameSpectator;
  updateSpectatorPanel(isSpectator);

  if(takeBtn){
    if(me && me.wantsSeat){
      takeBtn.classList.add('hidden');
      if(leaveBtn) leaveBtn.classList.remove('hidden');
    } else {
      takeBtn.classList.remove('hidden');
      if(leaveBtn) leaveBtn.classList.add('hidden');
    }
  }
  if(hc){
    if(G.online.isHost) hc.classList.remove('hidden');
    else hc.classList.add('hidden');
  }
  if(playersBtn){
    if(G.online.active) playersBtn.style.display = 'block';
    else playersBtn.style.display = 'none';
  }
  renderSpectatorList();
}

function renderSpectatorList(){
  const el = document.getElementById('spectatorList');
  if(!el) return;
  const players = (window.PokerOnline && PokerOnline.getRoomPlayers) ? PokerOnline.getRoomPlayers() : {};
  const myId = window.PokerOnline ? PokerOnline.getMyId() : null;
  const spectators = Object.keys(players).filter(function(pid){
    return players[pid].role !== 'seated';
  });
  el.innerHTML = '';
  if(!spectators.length){
    el.innerHTML = '<div class="spectator-empty">—</div>';
    return;
  }
  spectators.forEach(function(pid){
    const p = players[pid];
    const div = document.createElement('div');
    div.className = 'spectator-item';
    div.textContent = (p.name || 'Player') + (pid === myId ? (isEn() ? ' (you)' : ' (你)') : '');
    el.appendChild(div);
  });
}

function renderPlayersList(){
  const body = document.getElementById('playersListBody');
  if(!body) return;
  const players = (window.PokerOnline && PokerOnline.getRoomPlayers) ? PokerOnline.getRoomPlayers() : {};
  const myId = window.PokerOnline ? PokerOnline.getMyId() : null;
  const hostPeerId = window.PokerOnline ? PokerOnline.getHostPeerId() : null;
  body.innerHTML = '';
  const ids = Object.keys(players);
  if(!ids.length){
    body.innerHTML = '<div class="spectator-empty">—</div>';
    return;
  }
  ids.forEach(function(pid){
    const p = players[pid];
    const row = document.createElement('div');
    row.className = 'player-row';
    const isSelf = pid === myId;
    const isHost = pid === hostPeerId;
    const roleTag = p.role === 'seated' 
      ? '<span class="player-row-role">' + t('seatLabel') + '</span>'
      : '<span class="player-row-role spectator">' + t('spectatorLabel') + '</span>';
    const hostTag = isHost ? '<span class="player-row-role">' + t('hostLabel') + '</span>' : '';
    row.innerHTML =
      '<span class="player-row-name">' + escapeHtml(p.name || 'Player') + (isSelf ? (isEn()?' (you)':' (你)') : '') + '</span>' +
      roleTag + hostTag;
    if(G.online.isHost && !isSelf){
      const kickBtn = document.createElement('button');
      kickBtn.className = 'player-row-btn kick';
      kickBtn.textContent = t('kickBtn');
      kickBtn.onclick = function(){
        if(confirm(t('confirmKick'))){
          PokerOnline.sendKick(pid);
          setTimeout(renderPlayersList, 300);
        }
      };
      row.appendChild(kickBtn);
      if(!isHost){
        const hostBtn = document.createElement('button');
        hostBtn.className = 'player-row-btn host';
        hostBtn.textContent = t('transferHostBtn');
        hostBtn.onclick = function(){
          if(confirm(t('confirmTransfer'))){
            PokerOnline.sendTransferHost(pid);
            setTimeout(renderPlayersList, 300);
          }
        };
        row.appendChild(hostBtn);
      }
    }
    body.appendChild(row);
  });
}

/* ================= 大厅渲染 ================= */
function renderLobby(){
  renderTableGrid("aiTableGrid", "ai");
  renderTableGrid("pointsTableGrid", "points");
  renderTableGrid("realTableGrid", "real");
  renderRoomLists();
  refreshBalanceUI();
}
function renderRoomLists(){
  if(!window.PokerOnline || !PokerOnline.getKnownRooms) return;
  const currentId = PokerOnline.getRoomId();
  const rooms = PokerOnline.getKnownRooms().filter(function(r){ return r.roomId !== currentId; });
  const pointsRooms = rooms.filter(function(r){ return r.mode === 'points'; });
  const realRooms   = rooms.filter(function(r){ return r.mode === 'real'; });
  fillRoomList('pointsRoomList', pointsRooms);
  fillRoomList('realRoomList',   realRooms);
  updateRoomCount('pointsRoomCount', pointsRooms.length);
  updateRoomCount('realRoomCount',   realRooms.length);
  const total = pointsRooms.length + realRooms.length;
  const sl = document.getElementById('statusLabel');
  if(sl) sl.textContent = isEn() ? (total + (total === 1 ? ' table' : ' tables')) : (total + ' 桌开放');
}
function updateRoomCount(id, n){
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = '<span class="pulse"></span><span>' + n + (isEn() ? (n === 1 ? ' table' : ' tables') : ' 桌') + '</span>';
  if(n > 0) el.classList.remove('zero'); else el.classList.add('zero');
}
function fillRoomList(containerId, rooms){
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = "";
  if(!rooms.length) return;
  rooms.forEach(function(r){
    const lv = LEVELS.find(function(l){ return l.key === r.level; }) || LEVELS[0];
    const item = document.createElement('div');
    item.className = 'room-item';
    const initial = (r.hostName || 'R').charAt(0).toUpperCase();
    const isFull = (r.count || 0) >= (r.maxSeats || 7);
    const seatedText = (r.count || 0) + ' / ' + (r.maxSeats || 7);
    const totalText = r.totalPlayers ? ((r.totalPlayers - (r.count||0)) > 0 ? ' · 👁 ' + (r.totalPlayers - (r.count||0)) : '') : '';
    const statusTag = r.gameStarted ? '<span class="room-item-live">' + (isEn()?'LIVE':'进行中') + '</span>' : '';
    const privateTag = r.isPrivate ? '<span class="room-item-lock">🔒</span>' : '';
    item.innerHTML =
      '<div class="room-item-avatar">' + initial + '</div>' +
      '<div class="room-item-info">' +
        '<div class="room-item-name">' + privateTag + (r.hostName || 'Host') + (isEn() ? "'s room" : ' 的房间') + ' ' + statusTag + '</div>' +
        '<div class="room-item-meta">' + lv.name + ' · ' + lv.sb + '/' + lv.bb + ' · ' + r.roomId + '</div>' +
      '</div>' +
      '<div class="room-item-players">' + seatedText + totalText + '</div>' +
      '<button class="room-item-join">' +
        (isEn() ? 'Join' : '加入') +
      '</button>';
    const handler = function(e){
      if(e && e.stopPropagation) e.stopPropagation();
      if(window.PokerAudio) PokerAudio.play('click');
      if(r.isPrivate){
        const pw = window.prompt(isEn() ? 'Enter room password:' : '请输入房间密码：');
        if(pw === null) return;
        if(!pw.trim()){ appToast(isEn() ? 'Password required' : '密码不能为空', 'error'); return; }
        doJoinRoom(lv, r.mode, r.roomId, pw.trim());
      } else {
        doJoinRoom(lv, r.mode, r.roomId, '');
      }
    };
    item.querySelector('.room-item-join').onclick = handler;
    item.onclick = handler;
    el.appendChild(item);
  });
}
function renderTableGrid(containerId, mode){
  const grid = $(containerId);
  if(!grid) return;
  grid.innerHTML = "";
  LEVELS.forEach(function(lv){
    const card = document.createElement("div");
    card.className = "table-card";
    let totalSeats = mode === 'ai' ? G.aiSeats : ONLINE_MAX_SEATS;
    let seatDots = "";
    for(let i = 0; i < totalSeats; i++){
      const angle = -90 + (360 / totalSeats) * i;
      const rad = angle * Math.PI / 180;
      const x = 50 + 40 * Math.cos(rad);
      const y = 50 + 40 * Math.sin(rad);
      const isEmpty = mode === 'ai' ? (i >= totalSeats - 1) : true;
      seatDots += '<div class="dot-seat' + (isEmpty ? ' empty' : '') + '" style="left:' + x + '%;top:' + y + '%;transform:translate(-50%,-50%);"></div>';
    }
    const preview =
      '<div class="table-card-preview">' +
        '<div class="seats">' + seatDots + '</div>' +
        '<div class="card-row">' +
          '<div class="mini-blank"></div><div class="mini-blank"></div>' +
          '<div class="mini-blank"></div><div class="mini-blank"></div>' +
          '<div class="mini-blank"></div>' +
        '</div>' +
      '</div>';
    const nameText = lv.name + (isEn() ? ' Table' : ' 桌');
    const blindsLabel = isEn() ? ('Blinds ' + lv.sb + '/' + lv.bb) : ('盲注 ' + lv.sb + '/' + lv.bb);
    const buyInLabel = isEn() ? 'Buy-in' : '买入';
    const buyInText = fmtNum(lv.buyMin) + '–' + fmtNum(lv.buyMax);
    const rightText = mode === 'real' ? ('≈ ' + toBem(lv.buyMin) + ' BEM') : (mode === 'points' ? (isEn() ? 'Points' : '积分') : (isEn() ? 'Free' : '免费'));
    let actionsHtml;
    if(mode === 'ai'){
      actionsHtml = '<button class="btn-seat">' + (isEn() ? 'Take a seat' : '立即入座') + '</button>';
    } else {
      actionsHtml =
        '<button class="btn-create">' + (isEn() ? 'Create room' : '创建房间') + '</button>' +
        '<button class="btn-join">' + (isEn() ? 'Join room' : '加入房间') + '</button>';
    }
    card.innerHTML =
      '<div class="table-card-head">' +
        '<div class="table-card-avatar">' + lv.name.charAt(0) + '</div>' +
        '<div class="table-card-title">' +
          '<div class="table-card-name">' + nameText + '</div>' +
          '<div class="table-card-blinds">' + blindsLabel + '</div>' +
        '</div>' +
      '</div>' + preview +
      '<div class="table-card-meta">' +
        '<span>' + buyInLabel + ' <strong>' + buyInText + '</strong></span>' +
        '<span>' + rightText + '</span>' +
      '</div>' +
      '<div class="table-card-actions">' + actionsHtml + '</div>';

    function bindTap(el, fn){
      if(!el) return;
      let lastFire = 0;
      function fire(e){
        const now = Date.now();
        if(now - lastFire < 400) return;
        lastFire = now;
        if(e && e.preventDefault) e.preventDefault();
        if(window.PokerAudio) PokerAudio.play('click');
        fn();
      }
      el.addEventListener('touchend', fire, { passive: false });
      el.addEventListener('click', fire);
    }
    if(mode === 'ai'){
      bindTap(card.querySelector(".btn-seat"), function(){ openAiLevel(lv); });
    } else {
      bindTap(card.querySelector(".btn-create"), function(){ openCreateRoomDialog(lv, mode); });
      bindTap(card.querySelector(".btn-join"), function(){ joinRoomByCode(lv, mode); });
    }
    grid.appendChild(card);
  });
}

/* ================= AI 场 ================= */
function openAiLevel(lv){
  resetSessionState();
  resetTableDom();
  hideWaitingBar();
  G.gameMode = 'ai';
  let ai = PokerStorage.getAiChips();
  if(ai < lv.buyMin){ PokerStorage.addAiChips(10000); ai = PokerStorage.getAiChips(); }
  const buyIn = Math.min(lv.buyMax, ai);
  PokerStorage.setAiChips(ai - buyIn);
  G.sessionBuyIn = buyIn;
  G.totalPlayers = G.aiSeats;
  G.tableMode = lv.key; G.tableLabel = lv.name;
  G.smallBlind = lv.sb; G.bigBlind = lv.bb;
  G.lastRaiseAmount = lv.bb;
  G.sessionHands = 0;
  G.online.active = false;
  G._onlineLv = lv;
  const human = PokerAvatars.HUMAN;
  G.players = [{
    id:0, name:PokerStorage.getNickname() || human.name, emoji:human.emoji, bg:human.bg,
    isHuman:true, chips:G.sessionBuyIn, seated:true,
    holeCards:[], folded:false, allIn:false, currentBet:0,
    totalContributed:0, needsToAct:false,
    position:"", positionKey:"", lastAction:"", styleKey:null,
    revealCards:false, _highlight:null, preflopOrder:0, postflopOrder:0
  }];
  const profiles = PokerAvatars.pickProfiles(G.totalPlayers - 1);
  const styleKeys = Object.keys(PokerAI.STYLES);
  const shuffled = styleKeys.slice().sort(function(){ return Math.random() - 0.5; });
  for(let i = 1; i < G.totalPlayers; i++){
    const aiBuy = Math.floor(lv.buyMin + Math.random() * (lv.buyMax - lv.buyMin));
    G.players.push({
      id:i, name:profiles[i-1].name, emoji:profiles[i-1].emoji, bg:profiles[i-1].bg,
      isHuman:false, chips:aiBuy, seated:true,
      holeCards:[], folded:false, allIn:false, currentBet:0,
      totalContributed:0, needsToAct:false,
      position:"", positionKey:"", lastAction:"", styleKey:shuffled[(i-1) % shuffled.length],
      revealCards:false, _highlight:null, preflopOrder:0, postflopOrder:0
    });
  }
  G.seatPositions = computeSeatPositions(G.players.length);
  G.dealerIndex = Math.floor(Math.random() * G.players.length);
  G.handNumber = 0; G.gameOver = false;
  $("lobbyScreen").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  document.body.classList.add('game-active');
  if(PokerStorage.clearHandHistory) PokerStorage.clearHandHistory();
  $("onlineLobby").classList.add("hidden");
  if($("gameLevelLabel")) $("gameLevelLabel").textContent = lv.name + " " + lv.sb + "/" + lv.bb + " · " + G.players.length + (isEn() ? "P" : "人");
  if($("gameModeLabel")){ $("gameModeLabel").textContent = isEn() ? "AI" : "AI 练习"; $("gameModeLabel").classList.remove('real'); }
  if($("gameWalletPill")) $("gameWalletPill").innerHTML = '<span class="dot"></span><span>' + (isEn() ? "AI practice" : "AI 练习模式") + '</span>';
  const fab = document.getElementById('chatFab');
  if(fab) fab.classList.remove('hidden');
  const mlogFab = document.getElementById('mobileLogFab');
  if(mlogFab) mlogFab.classList.remove('hidden');
  const sp = document.getElementById('spectatorPanel');
  if(sp) sp.classList.add('hidden');
  const hc = document.getElementById('hostControlPanel');
  if(hc) hc.classList.add('hidden');
  const pb = document.getElementById('playersOpenBtn');
  if(pb) pb.style.display = 'none';
  const topReady = document.getElementById('topReadyBtn');
  if(topReady) topReady.classList.add('hidden');
  startNewHandAi();
}

/* ================= 联机 ================= */
function checkOnlinePreconditions(lv, mode){
  if(mode === 'real'){
    if(!window.PokerWallet || !PokerWallet.isConnected()){
      appToast(isEn() ? "Connect wallet first" : "请先连接钱包", "error");
      $("walletOverlay").classList.remove("hidden");
      return false;
    }
    const chainChips = Math.floor((window.PokerWallet ? PokerWallet.getContractBalance() : 0) / CHIP_TO_BEM);
    if(chainChips < lv.buyMax){
      appToast(isEn() ? ("Not enough chips. Need " + lv.buyMax.toLocaleString())
                      : ("对战场筹码不足，需要 " + lv.buyMax.toLocaleString() + " 筹码"), "error");
      return false;
    }
  } else {
    if(PokerStorage.getPoints() < lv.buyMax){
      appToast(isEn() ? ("Not enough points. Need " + lv.buyMax.toLocaleString())
                      : ("积分不足，需要 " + lv.buyMax.toLocaleString() + " 积分"), "error");
      return false;
    }
  }
  return true;
}
function generateRoomId(lv, mode){
  const rand = Math.random().toString(36).slice(2, 7);
  return lv.key + '-' + (mode === 'real' ? 'ch' : 'pt') + '-' + rand;
}

let _pendingCreateLv = null;
let _pendingCreateMode = null;

function openCreateRoomDialog(lv, mode){
  if(!checkOnlinePreconditions(lv, mode)) return;
  _pendingCreateLv = lv;
  _pendingCreateMode = mode;
  const overlay = $("createRoomOverlay");
  overlay.classList.remove("hidden");
  const pwInput = $("createRoomPassword");
  pwInput.value = '';
  pwInput.classList.add('hidden');
  document.querySelectorAll('.room-type-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-type') === 'public');
    b.onclick = function(){
      document.querySelectorAll('.room-type-btn').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      pwInput.classList.toggle('hidden', b.getAttribute('data-type') !== 'private');
      if(window.PokerAudio) PokerAudio.play('click');
    };
  });
  $("createRoomConfirmBtn").onclick = function(){
    const type = document.querySelector('.room-type-btn.active').getAttribute('data-type');
    const isPrivate = type === 'private';
    const password = isPrivate ? pwInput.value.trim() : '';
    if(isPrivate && !password){ appToast(isEn() ? "Enter password" : "请输入密码", "error"); return; }
    overlay.classList.add('hidden');
    doCreateRoom(_pendingCreateLv, _pendingCreateMode, isPrivate, password);
  };
  $("createRoomCancelBtn").onclick = function(){ overlay.classList.add('hidden'); };
}

function doCreateRoom(lv, mode, isPrivate, password){
  const roomId = generateRoomId(lv, mode);
  appToast(isEn() ? "Creating room..." : "正在创建房间...", "");
  PokerOnline.createRoom(roomId, { level: lv.key, mode: mode, isPrivate: isPrivate, password: password }).then(function(){
    enterOnlineRoom(lv, mode, roomId, true, isPrivate, password);
  }).catch(function(err){
    console.error('[createRoom]', err);
    appToast((isEn() ? "Connection failed: " : "连接失败：") + (err && err.message ? err.message : err), "error");
  });
}

let _pendingJoinLv = null;
let _pendingJoinMode = null;

function joinRoomByCode(lv, mode){
  if(!checkOnlinePreconditions(lv, mode)) return;
  _pendingJoinLv = lv;
  _pendingJoinMode = mode;
  const overlay = $("joinRoomOverlay");
  overlay.classList.remove("hidden");
  const input = $("joinRoomInput");
  const pwInput = $("joinRoomPasswordInput");
  input.value = '';
  pwInput.value = '';
  pwInput.classList.remove('hidden');   // ★ 默认显示密码框，让用户自己决定填不填

  // ★ 用户输完房间号后，检查已知房间列表，看是不是私人房
  input.addEventListener('blur', function(){
    const code = input.value.trim();
    if(!code) return;
    let known = null;
    try {
      known = (PokerOnline.getKnownRooms() || []).find(function(r){ return r.roomId === code; });
    } catch(e){}
    if(known && !known.isPrivate){
      pwInput.classList.add('hidden');
    } else {
      pwInput.classList.remove('hidden');
    }
  });

  $("joinRoomConfirmBtn").onclick = function(){
    const code = input.value.trim();
    if(!code){ appToast(isEn() ? "Enter a room code" : "请输入房间号", "error"); return; }
    overlay.classList.add('hidden');
    doJoinRoom(_pendingJoinLv, _pendingJoinMode, code, pwInput.value.trim());
  };
  $("joinRoomCancelBtn").onclick = function(){ overlay.classList.add('hidden'); };
  setTimeout(function(){ try { input.focus(); } catch(e){} }, 100);
}

function doJoinRoom(lv, mode, roomId, password){
  appToast(isEn() ? "Joining..." : "正在加入...", "");
  PokerOnline.joinRoom(roomId, password || '').then(function(){
    enterOnlineRoom(lv, mode, roomId, false, false, '');
  }).catch(function(err){
    console.error('[doJoinRoom]', err);
    appToast((isEn() ? "Join failed: " : "加入失败：") + (err && err.message ? err.message : err), "error");
  });
}

function enterOnlineRoom(lv, mode, roomId, isHost, isPrivate, password){
  resetSessionState();
  resetTableDom();
  G.gameMode = mode;
  G.tableMode = lv.key;
  G.tableLabel = lv.name;
  G.smallBlind = lv.sb;
  G.bigBlind = lv.bb;
  G.lastRaiseAmount = lv.bb;
  G.gameOver = false;
  G.stage = 'waiting';
  G.sessionBuyIn = lv.buyMax;
  G.sessionHands = 0;
  G._onlineLv = lv;
  G._spectatorMode = !isHost;
  G._pendingSeat = false;
  G.online = { active:true, isHost:isHost, roomId:roomId, mySeat:-1, started:false, broadcastTimer:null };
  G._lastStateSig = ''; G._lastActionSig = ''; G._lastBoardSig = ''; G._lastHandSig = '';
  G._timerKey = null; G._nextHandEndsAt = 0; G._turnEndsAt = 0;
  $("lobbyScreen").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  document.body.classList.add('game-active');
  if(PokerStorage.clearHandHistory) PokerStorage.clearHandHistory();
  $("onlineLobby").classList.add("hidden");
  if($("gameLevelLabel")) $("gameLevelLabel").textContent = lv.name + " " + lv.sb + "/" + lv.bb + " · " + (isEn() ? "Online" : "联机");
  if($("gameModeLabel")){
    if(mode === 'real'){ $("gameModeLabel").textContent = isEn() ? "On-chain" : "链上"; $("gameModeLabel").classList.add('real'); }
    else { $("gameModeLabel").textContent = isEn() ? "Points" : "积分"; $("gameModeLabel").classList.remove('real'); }
  }
  if($("gameWalletPill")) $("gameWalletPill").innerHTML = '<span class="dot" style="background:#a855f7;"></span><span>' + (isEn() ? "Waiting" : "等待中") + '</span>';
  clearLog();
  log((isEn() ? "Room: " : "房间号：") + roomId, "hl");
  log(isEn() ? "Waiting for players..." : "等待其他玩家加入...", "hl");
  showWaitingBar();
  syncWaitingSeatsFromRoom();
  hideHumanActions();
  updateSpectatorUI();
  const fab = document.getElementById('chatFab');
  if(fab) fab.classList.remove('hidden');
  const mlogFab = document.getElementById('mobileLogFab');
  if(mlogFab) mlogFab.classList.remove('hidden');
  const pb = document.getElementById('playersOpenBtn');
  if(pb) pb.style.display = 'block';
}
function updateOnlineLobbyUI(){ updateWaitingBar(); }

function hostStartGame(playerOrder, playersInfo){
  if(!G.online.isHost) return;
  if(G.online.started) return;
  const myId = PokerOnline.getMyId();
  const ordered = playerOrder.slice().sort(function(a, b){
    const ia = playersInfo.find(function(p){ return p.peerId === a; });
    const ib = playersInfo.find(function(p){ return p.peerId === b; });
    return (ia && ia.seat || 0) - (ib && ib.seat || 0);
  });
  const lv = G._onlineLv || LEVELS[0];
  // ★ 用玩家的实际余额，最多 = buyMax，最少 = buyMin
  const myBalance = (G.gameMode === 'real')
    ? Math.floor((window.PokerWallet ? PokerWallet.getContractBalance() : 0) / CHIP_TO_BEM)
    : PokerStorage.getPoints();
  const buyInChips = Math.min(lv.buyMax, Math.max(lv.buyMin, myBalance));

  G.players = ordered.map(function(pid){
    const info = playersInfo.find(function(p){ return p.peerId === pid; }) || { name:'Player', seat: 0 };
    const isSelf = pid === myId;
    if(isSelf){
      if(G.gameMode === 'points'){
        let have = PokerStorage.getPoints();
        if(have < buyInChips){
          // 只补到 buyInChips，不额外送
          PokerStorage.addPoints(buyInChips - have);
          have = PokerStorage.getPoints();
        }
        PokerStorage.setPoints(have - buyInChips);
      }
      // real 模式由链上结算，不在这里扣
    }
    return {
      id: info.seat || 0, peerId: pid, name: info.name,
      emoji: isSelf ? PokerAvatars.HUMAN.emoji : '🎮',
      bg: isSelf ? PokerAvatars.HUMAN.bg : 'linear-gradient(135deg,#a855f7,#6d28d9)',
      isHuman: isSelf,
      chips: buyInChips,
      seated: true,
      holeCards: [], folded:false, allIn:false, currentBet:0,
      totalContributed:0, needsToAct:false,
      position:"", positionKey:"", lastAction:"", styleKey:null,
      revealCards:false, _highlight:null, preflopOrder:0, postflopOrder:0,
      _spectator: false
    };
  });
  G.sessionBuyIn = buyInChips;
  G.online.mySeat = G.players.findIndex(function(p){ return p.peerId === myId; });
  G._spectatorMode = (G.online.mySeat < 0);
  G.totalPlayers = G.players.length;
G.seatPositions = computeSeatPositions(G.players.length);
  G.dealerIndex = Math.floor(Math.random() * G.players.length);
  G.handNumber = 0;
  G.gameOver = false;
  G.online.started = true;
  G.stage = 'preflop';
  G._lastStateSig = ''; G._lastActionSig = ''; G._lastBoardSig = ''; G._lastHandSig = '';
  hideWaitingBar();
  if($("gameWalletPill")) $("gameWalletPill").innerHTML = '<span class="dot" style="background:#a855f7;"></span><span>' + G.players.length + (isEn() ? " players" : " 人联机") + '</span>';
  const startPayload = {
    playerOrder: ordered,
    players: G.players.map(function(p){ return { id: p.id, peerId: p.peerId, name: p.name, seat: p.id }; })
  };
  PokerOnline.sendGameStart(startPayload);
  startNewHandHost();
}
/* ★ 阶段2b：调用 Edge Function 发牌 */
async function callDealerDeal(roomId, handNo){
  const res = await fetch(SUPABASE_URL_DEALER + '/functions/v1/dealer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY_DEALER,
      'Authorization': 'Bearer ' + SUPABASE_KEY_DEALER
    },
    body: JSON.stringify({ action: 'deal', room_id: roomId, hand_no: handNo })
  });
  const data = await res.json();
  if(!data.success) throw new Error(data.error || 'deal failed');
  return data;
}

/* ★ 阶段2b：解密自己的加密底牌 */
async function decryptMyHoles(myPeerId, holes){
  const myHole = holes[myPeerId];
  if(!myHole){
    console.warn('[decrypt] 没有我的密文');
    return [];
  }
  if(!window.PokerCrypto || !PokerCrypto.hasKeyPair()){
    console.warn('[decrypt] 密钥对未就绪');
    return [];
  }
  try {
    const cards = await PokerCrypto.decryptHoleCards(myHole);
    console.log('[decrypt] 我的底牌解密成功:', cards.map(function(c){return c.rank+c.suit;}).join(' '));
    return cards;
  } catch(e){
    console.error('[decrypt] 失败', e);
    return [];
  }
}

async function startNewHandHost(){
  if(G.online.isHost && window.PokerOnline && PokerOnline._promoteWantingSpectators){
    try { PokerOnline._promoteWantingSpectators(); } catch(e){}
  }
  clearAllGameTimers();
  clearShowCardsTimer();
  if(G._nextHandTimer){ clearInterval(G._nextHandTimer); G._nextHandTimer = null; }
  if(G._nextHandToastTimer){ clearInterval(G._nextHandToastTimer); G._nextHandToastTimer = null; }
  hideNextHandToast();
  const showBtn = document.getElementById('showCardsBtn');
  if(showBtn) showBtn.classList.add('hidden');

  if(G.online.isHost){
    syncWaitingSeatsFromRoom();
  }

  G.handNumber++; G.sessionHands++;
  G.pot = 0; G.community = [];
  G.currentBet = 0; G.lastRaiseAmount = G.bigBlind;
  G.stage = "preflop"; G.busy = false; G._busySince = 0;
  G._nextHandEndsAt = 0;
    G._deltaShown = false;
  /* ★ preflop 时 raiseCount 初始为 1（大盲算作第一次"下注"） */
  G.raiseCount = 1;
  // ★ 阶段2b：调 Edge Function 发牌
  let dealResult = null;
  if(G.online.active && G.online.isHost){
    try {
      log(isEn() ? 'Waiting for all pubkeys...' : '等待所有玩家公钥就绪...', 'hl');
      await PokerOnline.waitSeatedPubkeys(5000);
      log(isEn() ? 'Requesting deal from server...' : '正在向服务器请求发牌...', 'hl');
      dealResult = await callDealerDeal(G.online.roomId, G.handNumber);
      G._encryptedHoles = dealResult.holes;
      G._currentHandId = dealResult.hand_id;
      G._seedCommit = dealResult.seed_commit;
      log(isEn() ? 'Deal received (encrypted)' : '已收到加密牌堆', 'hl');
    } catch(e){
      console.error('[deal] Edge Function 调用失败', e);
      log(isEn() ? 'Server deal failed, fallback to local' : '服务器发牌失败，回退本地', 'hl');
      dealResult = null;
    }
  }

  // ★ 本地 fallback（服务器不通时用，会暴露底牌但至少能玩）
G.deck = PokerDeck.create();
PokerDeck.shuffle(G.deck);   // ★ 无论如何都洗（公共牌用）
  G._renderedCards = new WeakSet();
  G._lastBoardSig = ''; G._lastHandSig = ''; G._lastActionSig = '';
  stopTurnTimer();
    // ★ 记录本手起始筹码（玩家端结算 delta 用）
  const meStart = G.players[G.online.mySeat];
  if(meStart) G._handStartChips = meStart.chips;
    G.players.forEach(function(p){
    p.folded = p.chips <= 0 || p.seated === false;
    p.allIn = false; p.currentBet = 0; p.totalContributed = 0;
    p.needsToAct = false; p.lastAction = ""; p.holeCards = [];
    p.revealCards = false; p._highlight = null; p._score = null;
    p._intentReveal = false;
    p._isWinner = false;
    p._winnerType = null;
    p._winAmount = 0;
    p._winPots = [];
    p._lastDelta = 0;
    if(p._waitNextHand){
      p._waitNextHand = false;
      p._spectator = false;
      p.folded = false;
      p.chips = G.bigBlind * 100 || 1000;
    }
  });
  assignPositions();
  computeActionOrders();
  if(dealResult){
    // ★ 阶段2b：用 Edge Function 返回的密文
    // 本地 G.players[].holeCards 全部留空，等广播后每个人自己解密填自己那份
    G.players.forEach(function(p){ p.holeCards = []; });

    // 广播密文给所有人（包括房主自己）
    PokerOnline.sendDealHoles({
      hand_id: dealResult.hand_id,
      hand_no: dealResult.hand_no,
      seed_commit: dealResult.seed_commit,
      holes: dealResult.holes,
      dealer_seat: G.dealerIndex,
      current_player_seat: G.currentPlayerIndex
    });
    log(isEn() ? 'Deal broadcasted' : '发牌已广播，等待各方解密', 'hl');

    // 房主自己也解密一份
    try {
      const myPeerId = PokerOnline.getMyId();
      const cards = await decryptMyHoles(myPeerId, dealResult.holes);
      if(cards.length === 2){
        const mySeat = G.players.findIndex(function(p){ return p.peerId === myPeerId; });
        if(mySeat >= 0){
          G.players[mySeat].holeCards = normalizeCards(cards);
          if(G.players[G.online.mySeat]){
            G._currentHandMyCards = G.players[G.online.mySeat].holeCards.map(function(c){ return c.suit + c.rank; });
          }
        }
      }
    } catch(e){
      console.error('[deal] 房主自己解密失败', e);
    }
  } else {
    // 本地 fallback
    const n = G.players.length;
    for(let r = 0; r < 2; r++){
      for(let i = 1; i <= n; i++){
        const idx = (G.dealerIndex + i) % n;
        const p = G.players[idx];
        if(!p.folded) p.holeCards.push(G.deck.pop());
      }
    }
    if(G.players[G.online.mySeat]){
      G._currentHandMyCards = G.players[G.online.mySeat].holeCards.map(function(c){ return c.suit + c.rank; });
    }
  }
  if(G.players[G.online.mySeat]){
    G._currentHandMyCards = G.players[G.online.mySeat].holeCards.map(function(c){ return c.suit + c.rank; });
  }
  clearLog();
  log(t("handNum", { n:G.handNumber }) + " · " + t("dealerIs", { name:G.players[G.dealerIndex].name }), "hl");
  log(t("blindsAre", { sb:G.smallBlind, bb:G.bigBlind }), "hl");
  const gh = $("gameHandLabel");
  if(gh) gh.textContent = t("handShortLabel", { n:G.handNumber });
  render();
  await playDealAnimation();
  postBlinds();
  render();
  startPreflopHost();
  broadcastFullState();
  runHostTurn();
}
function startPreflopHost(){
  const n = G.players.length;
  G.players.forEach(function(p){
    p.needsToAct = p.seated !== false && !p.folded && !p.allIn && p.chips > 0;
  });
  let idx = n === 2 ? G.dealerIndex : (G.dealerIndex + 3) % n;
  let tries = 0;
  while((G.players[idx].folded || G.players[idx].allIn || G.players[idx].seated === false) && tries < n){
    idx = (idx + 1) % n; tries++;
  }
  G.currentPlayerIndex = idx;
  render();
}

function runHostTurn(){
  if(G.gameOver) return;
  checkRosterSync();
  if(countActive() <= 1){
    const pot = G.pot;
    awardUncontestedPot();
    if(G.online.isHost) broadcastFullState();
    endHandHost(pot);
    return;
  }
  const notAllIn = G.players.filter(function(p){ return p.seated !== false && !p.folded && !p.allIn; });
  /* ★ 修正：短筹码 all-in 后，如果只剩 ≤1 个可行动玩家且无需再跟注，直接跑马 */
  const actionable = G.players.filter(function(p){
    return p.seated !== false && !p.folded && !p.allIn && p.chips > 0;
  });
  if(notAllIn.length === 0){ advanceStageHost(); return; }
  if(actionable.length <= 1 && notAllIn.every(function(p){ return !p.needsToAct; })){
    advanceStageHost(); return;
  }
  if(!findNextToAct()){ advanceStageHost(); return; }
  const p = G.players[G.currentPlayerIndex];
  G._turnEndsAt = Date.now() + 30000;
  render();
  broadcastFullState();
  if(p.isHuman){
    showHumanControls();
    startTurnTimer(p);
    clearHostTimeout();
  } else {
    stopTurnTimer();
    clearHostTimeout();
    const curIdx = G.currentPlayerIndex;
    G._hostTimeout = setTimeout(function(){
      G._hostTimeout = null;
      if(G.gameOver) return;
      if(G.currentPlayerIndex !== curIdx) return;
      const cur = G.players[curIdx];
      if(!cur || cur.folded || cur.allIn || !cur.needsToAct) return;
      const toCall = Math.max(0, G.currentBet - cur.currentBet);
      const fallback = toCall > 0 ? { type: 'fold' } : { type: 'check' };
      log(cur.name + (isEn() ? " timed out, auto-act" : " 超时自动行动"), "action");
      try { executeAction(cur, fallback); } catch(e){ console.error(e); }
      render();
      broadcastFullState();
      runHostTurn();
    }, PLAYER_ACTION_TIMEOUT);
  }
}

function advanceStageHost(){
  stopTurnTimer();
  clearAllGameTimers();
  checkRosterSync();

  if(countActive() <= 1){
    const pot = G.pot;
    awardUncontestedPot();
    render();
    if(G.online.isHost) broadcastFullState();
    endHandHost(pot);
    return;
  }

  const boardLen = G.community.length;

  if(boardLen >= 5){
    showdownHost();
    return;
  }

  G.players.forEach(function(p){ p.currentBet = 0; p.lastAction = ""; });
  G.currentBet = 0; G.lastRaiseAmount = G.bigBlind;
  /* ★ 新一条街：raiseCount 归零 */
  G.raiseCount = 0;

  if(boardLen === 0){
    G.stage = "flop";
    G.community.push(G.deck.pop(), G.deck.pop(), G.deck.pop());
    log(t("flopIs",{cards:G.community.map(function(c){return c.display;}).join("  ")}), "hl");
  } else if(boardLen === 3){
    G.stage = "turn";
    G.community.push(G.deck.pop());
    log(t("turnIs",{card:G.community[G.community.length-1].display}), "hl");
  } else if(boardLen === 4){
    G.stage = "river";
    G.community.push(G.deck.pop());
    log(t("riverIs",{card:G.community[G.community.length-1].display}), "hl");
  } else {
    showdownHost();
    return;
  }

  PokerAudio.play('deal');
  G.players.forEach(function(p){
    p.currentBet = 0; p.lastAction = "";
    p.needsToAct = p.seated !== false && !p.folded && !p.allIn && p.chips > 0;
  });
  /* ★ 关键修正：如果可行动的玩家 ≤1（其他人都 all-in 或弃牌），直接跑马 */
  const actionable = G.players.filter(function(p){
    return p.seated !== false && !p.folded && !p.allIn && p.chips > 0;
  });
  if(actionable.length <= 1){
    G.players.forEach(function(p){ p.needsToAct = false; });
  }
  G.currentBet = 0; G.lastRaiseAmount = G.bigBlind;
  const n = G.players.length;
  let idx = (G.dealerIndex + 1) % n;
  let tries = 0;
  while((G.players[idx].folded || G.players[idx].allIn || G.players[idx].seated === false) && tries < n){
    idx = (idx + 1) % n; tries++;
  }
  G.currentPlayerIndex = idx;
  render();
  broadcastFullState();
  runHostTurn();
}

function showdownHost(){
  stopTurnTimer();
  clearAllGameTimers();
  G.stage = "showdown";
  G._settled = false;
  G.busy = true;
  log(t("showdownHeader"), "hl");
  PokerAudio.play('showdown');
  const cont = G.players.filter(function(p){ return p.seated !== false && !p.folded; });
  cont.forEach(function(p){ p.revealCards = false; p._highlight = null; });
  render();
  broadcastFullState();
  let idx = 0;
  function next(){
    if(idx >= cont.length){ setTimeout(function(){ resolveHost(cont); }, 800); return; }
    const p = cont[idx];
    p.revealCards = true;
    render();
    broadcastFullState();
    PokerAudio.play('deal');
    log(t("reveals",{name:p.name,cards:p.holeCards.map(function(c){return c.display;}).join("  ")}), "showdown");
    idx++;
    setTimeout(next, 650);
  }
  next();
}

function resolveHost(cont){
  let totalPot = G.pot;
  try {
    cont.forEach(function(p){
      const r = PokerEval.bestHand(p.holeCards.concat(G.community));
      p._score = r.score; p._bestCards = r.cards;
      log(t("handResult",{
        name:p.name,
        cards:p.holeCards.map(function(c){return c.display;}).join(" "),
        hand:PokerEval.nameOf(r.score)
      }), "showdown");
    });
        const pots = calculateSidePots();
    const n = pots.length;
    let anyTie = false;

    // ★ 结算前彻底清空所有 winner 状态
    G.players.forEach(function(p){
      p._isWinner = false;
      p._winnerType = null;
      p._winAmount = 0;
      p._winPots = [];
    });

    pots.forEach(function(pot, i){
      if(!pot.eligible.length){
        console.warn('[resolveHost] Empty pot detected, amount:', pot.amount);
        return;
      }
      let best = null, ws = [];
      pot.eligible.forEach(function(p){
        if(best === null || PokerEval.compare(p._score, best) > 0){ best = p._score; ws = [p]; }
        else if(PokerEval.compare(p._score, best) === 0) ws.push(p);
      });
      if(ws.length > 1) anyTie = true;
      const each = Math.floor(pot.amount / ws.length);
      const rem = pot.amount - each * ws.length;
      const lbl = n === 1 ? t("pot") : (i === 0 ? t("mainPot") : t("sidePot") + " " + i);
      const isMain = (n === 1) || (i === 0);

ws.forEach(function(w, k){
  const gain = each + (k === 0 ? rem : 0);
  w.chips += gain;
  w._isWinner = true;
  w._winAmount = (w._winAmount || 0) + gain;
  w._winPots = w._winPots || [];

  // ★ 关键改动：区分"真赢"和"未跟注返还"
  const isRefund = (pot.eligible.length === 1);  // 单人池 = 未跟注返还
  w._winPots.push({
    label: lbl,
    amount: gain,
    isRefund: isRefund
  });

  if(isRefund){
    // 未跟注返还：不亮杯
    if(!w._winnerType) w._winnerType = 'refund';
  } else {
    // 真赢：主池 → main，其他 → side
    if(isMain){
      w._winnerType = 'main';
    } else if(w._winnerType !== 'main'){
      w._winnerType = 'side';
    }
  }
});

      console.log('[resolveHost] Pot', i, lbl,
        '| amount:', pot.amount,
        '| eligible:', pot.eligible.map(function(x){return x.name;}).join(','),
        '| winner:', ws.map(function(x){
          return x.name + '(' + PokerEval.nameOf(x._score) + ')';
        }).join(',')
      );

      log(t("winsPotSide",{
        name:ws.map(function(x){return x.name;}).join(", "),
        potLabel:lbl, amt:fmtNum(pot.amount), hand:PokerEval.nameOf(best)
      }), "win");
      if(!ws[0]._highlight && ws[0]._bestCards) ws[0]._highlight = new Set(ws[0]._bestCards);
    });

    if(anyTie) showTieDisplay();
    totalPot = pots.reduce(function(s,p){ return s + p.amount; }, 0);
  } catch(e){
    console.error('resolveHost error', e);
  } finally {
    G._settled = true; 
    G.pot = 0; G.busy = false; G._busySince = 0;
    PokerAudio.play('win');
    render();
    if(G.online.isHost) broadcastFullState();
    endHandHost(totalPot);
  }
}

function endHandHost(totalPot){
  clearAllGameTimers();
  const me = G.players[G.online.mySeat];
  if(me){
    const delta = me.chips - G.playerHandStartChips;
    PokerStorage.recordHand(delta, totalPot || 0);
    try {
      let result = '';
      if(me.holeCards && me.holeCards.length >= 2 && G.community && G.community.length >= 3){
        const r = PokerEval.bestHand(me.holeCards.concat(G.community));
        if(r && r.score) result = PokerEval.nameOf(r.score);
      }
      PokerStorage.addHandHistory({
        handNumber: G.handNumber,
        myCards: (G._currentHandMyCards || []).slice(),
        community: (G.community || []).map(function(c){ return c.suit + c.rank; }),
        result: result, delta: delta, pot: totalPot || 0
      });
    } catch(e){ console.warn('save hand history failed', e); }
  }
  refreshHistoryPanelsIfOpen();
  render();
  if(G.online.isHost) broadcastFullState();
  offerShowCards();

  // ★ 自己筹码见底 → 弹补码
  if(me && me.chips <= 0){
    setTimeout(showRebuy, 800);
    return;
  }

  // ★ 有人筹码见底 → 清准备 + 回等待室
  const broke = G.players.filter(function(p){
    return p.seated !== false && p.chips <= 0;
  });
  if(broke.length){
    log(isEn() ? "Someone out of chips — waiting for rebuy" : "有人筹码见底 —— 等待补码", "hl");
    if(window.PokerOnline && PokerOnline.clearAllReady) PokerOnline.clearAllReady();
    setTimeout(function(){
      if(G.online.isHost) returnToWaiting();
    }, 2500);
    return;
  }

  beginNextHandCountdown(startNewHandHost);
}

function broadcastFullState(){
  if(!G.online.isHost) return;
  const myId = PokerOnline.getMyId();
  const state = {
    players: G.players.map(function(p){
      // ★ 阶段2b：只有自己能看自己的牌，别人只有 reveal 时才可见
      const isSelf = (p.peerId === myId);
      const safeHoleCards = isSelf
        ? p.holeCards
        : (p.revealCards ? p.holeCards : []);
      return {
        id: p.id, peerId: p.peerId, name: p.name,
        chips: p.chips, folded: p.folded, allIn: p.allIn,
        seated: p.seated !== false,
        currentBet: p.currentBet,
        holeCards: safeHoleCards,          // ★ 改了
        holeCardCount: (p.holeCards && p.holeCards.length) || 0,   // ★ 新增：告诉客户端数量
        lastAction: p.lastAction,
        position: p.position, positionKey: p.positionKey,
        revealCards: p.revealCards,
        _intentReveal: p._intentReveal || false,
        _spectator: p._spectator || false,
        _waitNextHand: p._waitNextHand || false,
        preflopOrder: p.preflopOrder, postflopOrder: p.postflopOrder,
                _highlight: p._highlight ? Array.from(p._highlight) : null,
        // ★ 新增
        _isWinner: !!p._isWinner,
        _winAmount: p._winAmount || 0,
        _winnerType: p._winnerType || null,
        _winPots: p._winPots ? p._winPots.slice() : []
      };
    }),
    pot: G.pot, currentBet: G.currentBet, stage: G.stage,
    dealerIndex: G.dealerIndex, currentPlayerIndex: G.currentPlayerIndex,
    community: G.community, handNumber: G.handNumber,
    smallBlind: G.smallBlind, bigBlind: G.bigBlind,
    gameOver: G.gameOver,
    phase: G.online.started ? 'playing' : 'waiting',
    nextHandEndsAt: G._nextHandEndsAt || 0,
    turnEndsAt: G._turnEndsAt || 0,
    raiseCount: G.raiseCount || 0
  };
  PokerOnline.sendFullState(state);
}

function applyFullState(state){
  if(!state || !state.players) return;
  const sig = buildStateSig(state);
  if(sig && sig === G._lastStateSig && G.players.length === state.players.length){
    syncCountdownFromState(state);
    return;
  }
  G._lastStateSig = sig;

  if(state.phase === 'playing' || (state.handNumber && state.handNumber > 0)){
    hideWaitingBar();
    G.online.started = true;
  }

  if(state.phase === 'waiting' || (!G.online.started && !state.handNumber)){
    G.stage = 'waiting';
    G.online.started = false;
    showWaitingBar();
    syncCountdownFromState(state);
    return;
  }

  const myId = PokerOnline.getMyId();
  const sameRoster =
    G.players.length === state.players.length &&
    G.players.every(function(p, i){
      return state.players[i] && state.players[i].peerId === p.peerId;
    });
  if(!sameRoster){
    const existingByPeer = {};
    G.players.forEach(function(p){ if(p.peerId) existingByPeer[p.peerId] = p; });
    G.players = state.players.map(function(p){
      const isSelf = p.peerId === myId;
      const existing = existingByPeer[p.peerId];
      if(existing){ existing.id = p.id; existing.name = p.name; existing.isHuman = isSelf; return existing; }
      return {
        id: p.id, peerId: p.peerId, name: p.name,
        emoji: isSelf ? PokerAvatars.HUMAN.emoji : '🎮',
        bg: isSelf ? PokerAvatars.HUMAN.bg : 'linear-gradient(135deg,#a855f7,#6d28d9)',
        isHuman: isSelf,
        chips: p.chips, seated: p.seated !== false,
        holeCards: [], folded:false, allIn:false, currentBet:0,
        totalContributed:0, needsToAct:false,
        position:"", positionKey:"", lastAction:"", styleKey:null,
        revealCards:false, _highlight:null, preflopOrder:0, postflopOrder:0
      };
    });
    G.online.mySeat = G.players.findIndex(function(p){ return p.peerId === myId; });
    G._spectatorMode = (G.online.mySeat < 0);
    G.totalPlayers = G.players.length;
    GG.seatPositions = computeSeatPositions(G.players.length);
    G.online.started = true;
    hideWaitingBar();
    if($("gameWalletPill")) $("gameWalletPill").innerHTML = '<span class="dot" style="background:#a855f7;"></span><span>' + G.players.length + (isEn() ? " players" : " 人联机") + '</span>';
    G._lastBoardSig = ''; G._lastHandSig = ''; G._lastActionSig = '';
    updateSpectatorUI();
  }
  if(state.handNumber !== G.handNumber){
    G._renderedCards = new WeakSet();
    G._lastBoardSig = ''; G._lastHandSig = ''; G._lastActionSig = '';
  }
  state.players.forEach(function(sp, i){
    if(!G.players[i]) return;
    const p = G.players[i];
    p.chips = sp.chips; p.folded = sp.folded; p.allIn = sp.allIn;
    p.seated = sp.seated !== false;
    p.currentBet = sp.currentBet;
     // ★ 阶段2b：保护自己的牌
    // ★ 关键：按 peerId 判自己，不用座位下标（第一手 mySeat 可能是 -1）
    const myId0 = window.PokerOnline ? PokerOnline.getMyId() : null;
    const isSelf = (p.peerId === myId0);
    if(isSelf){
      G.online.mySeat = i;
      G._spectatorMode = false;
      const pending = myId0 && G._pendingHoleCards && G._pendingHoleCards[myId0];
      if(pending && pending.length === 2){
        p.holeCards = normalizeCards(pending);
        G._currentHandMyCards = pending.map(function(c){ return c.suit + c.rank; });
        G._lastHandSig = '';
      } else if(!(p.holeCards && p.holeCards.length === 2)){
        p.holeCards = normalizeCards(sp.holeCards);
      }
    } else {
      p.holeCards = normalizeCards(sp.holeCards);
    }
    // ★ 记录"别人有几张牌"（画背面用）
    p._holeCardCount = sp.holeCardCount || (sp.holeCards ? sp.holeCards.length : 0);
    p.lastAction = sp.lastAction;
    p.position = sp.position; p.positionKey = sp.positionKey;
    p.revealCards = sp.revealCards;
    p._intentReveal = sp._intentReveal || false;
    p._spectator = sp._spectator || false;
    p._waitNextHand = sp._waitNextHand || false;
        p._isWinner = !!sp._isWinner;
    p._winAmount = sp._winAmount || 0;
    p._winnerType = sp._winnerType || null;
    p._winPots = sp._winPots || [];
    p.preflopOrder = sp.preflopOrder; p.postflopOrder = sp.postflopOrder;
    if(sp._highlight) p._highlight = new Set(normalizeCards(sp._highlight));
    else p._highlight = null;
  });
  G.pot = state.pot; G.currentBet = state.currentBet; G.stage = state.stage;
  G.dealerIndex = state.dealerIndex; G.currentPlayerIndex = state.currentPlayerIndex;
  G.community = normalizeCards(state.community);
  G.handNumber = state.handNumber;
  G.smallBlind = state.smallBlind; G.bigBlind = state.bigBlind;
  G.gameOver = state.gameOver || false;
  G.raiseCount = state.raiseCount || 0;
  const gh = $("gameHandLabel");
  if(gh) gh.textContent = t("handShortLabel", { n:G.handNumber });
  syncCountdownFromState(state);

  const me = G.players[G.online.mySeat];
  if(me){
    G._spectatorMode = !!me._spectator;
  }
  updateSpectatorUI();

  // ★ 阶段2b：full_state 到了之后，尝试填入之前缓存的底牌
  tryApplyPendingHoles();

  render();
  const meNow = G.players[G.online.mySeat];
  const handOver = (state.stage === 'showdown' || state.stage === 'waiting' ||
                    (state.nextHandEndsAt && state.nextHandEndsAt > Date.now()));
  // ★ 关键：handKey 提到外层作用域
  const handKey = 'h' + G.handNumber;

  if(meNow && handOver){
    if(G._recordedHandKey !== handKey){
      G._recordedHandKey = handKey;
      const delta = meNow.chips - (G._handStartChips || meNow.chips);
      PokerStorage.recordHand(delta, state.pot || 0);
      try {
        let result = '';
        if(meNow.holeCards && meNow.holeCards.length >= 2 && G.community && G.community.length >= 3){
          const r = PokerEval.bestHand(meNow.holeCards.concat(G.community));
          if(r && r.score) result = PokerEval.nameOf(r.score);
        }
        PokerStorage.addHandHistory({
          handNumber: G.handNumber,
          myCards: (G._currentHandMyCards || []).slice(),
          community: (G.community || []).map(function(c){ return c.suit + c.rank; }),
          result: result, delta: delta, pot: state.pot || 0
        });
      } catch(e){ console.warn('player record failed', e); }
      refreshHistoryPanelsIfOpen();
    }
  }

  // ★ 玩家端：自己筹码 <= 0 → 弹补码
  if(meNow && meNow.chips <= 0 && meNow.seated !== false && handOver){
    if(G._rebuyShownFor !== handKey){
      G._rebuyShownFor = handKey;
      setTimeout(showRebuy, 500);
    }
  } else if(meNow && meNow.chips > 0){
    if(G._rebuyShownFor !== 'h' + G.handNumber) G._rebuyShownFor = 0;
  }

  const meIdx = G.online.mySeat; 
  if(meIdx >= 0 && G.currentPlayerIndex === meIdx && !G.gameOver && G.stage !== 'showdown'){
    const me2 = G.players[meIdx];
    if(me2 && me2.seated !== false && !me2.folded && !me2.allIn){
      G._lastActionSig = "";
      showHumanControls();
      const timerKey = G.handNumber + ':' + G.currentPlayerIndex + ':' + G.stage;
      if(!G.turnTimer || G._timerKey !== timerKey){
        G._timerKey = timerKey;
        startTurnTimer(me2);
      }
    } else { hideHumanActions(); }
  } else { hideHumanActions(); }
}

function syncCountdownFromState(state){
  if(state.nextHandEndsAt && state.nextHandEndsAt > Date.now()){
    G._nextHandEndsAt = state.nextHandEndsAt;
    showNextHandToast(state.nextHandEndsAt);
  } else {
    if(G._nextHandEndsAt){ G._nextHandEndsAt = 0; hideNextHandToast(); }
  }
  if(state.turnEndsAt && state.turnEndsAt > Date.now() && !G.turnTimer){
    const el = document.getElementById('turnTimer');
    if(el) el.classList.remove('hidden');
    if(G._turnTickTimer){ clearInterval(G._turnTickTimer); }
    const endAt = state.turnEndsAt;
    const update = function(){
      const left = Math.max(0, endAt - Date.now());
      const f = document.getElementById('timerFill');
      const txt = document.getElementById('timerText');
      if(f) f.style.width = (left / 30000 * 100) + '%';
      if(txt) txt.textContent = Math.ceil(left / 1000) + 's';
      if(left <= 0){
        clearInterval(G._turnTickTimer);
        G._turnTickTimer = null;
        const el2 = document.getElementById('turnTimer');
        if(el2) el2.classList.add('hidden');
      }
    };
    update();
    G._turnTickTimer = setInterval(update, 200);
  }
}
function dropPeer(peerId){
  if(!peerId) return;
  const before = G.players.length;
  G.players = G.players.filter(function(p){ return p.peerId !== peerId; });
  if(G.players.length === before) return;
  const myId = window.PokerOnline ? PokerOnline.getMyId() : null;
  G.online.mySeat = G.players.findIndex(function(p){ return p.peerId === myId; });
  G._spectatorMode = (G.online.mySeat < 0);
  G.seatPositions = computeSeatPositions(G.players.length);
  // ★ 若被删的是别人，清掉他们的桌位 DOM
  const stale = document.querySelector('.seat[data-pid="' + peerId + '"]');
  if(stale) stale.remove();
}
/* ================= 消息处理 ================= */
function handleOnlineMessage(msg){
  if(!msg || !msg.type) return;

  if(msg.type === 'chat'){
    const isSelf = msg.peerId === (window.PokerOnline ? PokerOnline.getMyId() : null);
    appendChat(msg.name || 'Player', msg.text || '', isSelf);
    showSeatBubble(msg.peerId, msg.text || '', true);
    return;
  }
  if(msg.type === 'show_cards'){
    const p = G.players.find(function(x){ return x.peerId === msg.peerId; });
    if(p){
      p.revealCards = true;
      if(msg.intent) p._intentReveal = true;
      render();
    }
    if(G.online.isHost) broadcastFullState();
    return;
  }
  // ★ 阶段2b：处理加密发牌广播
  if(msg.type === 'deal_holes'){
    const data = msg.data;
    if(!data || !data.holes) return;
    console.log('[deal_holes] 收到加密牌堆, hand:', data.hand_no);

    (async function(){
      const myPeerId = PokerOnline.getMyId();
      const myHole = data.holes[myPeerId];
      if(!myHole){
        console.warn('[deal_holes] 没有我的密文');
        return;
      }
      try {
        const cards = await PokerCrypto.decryptHoleCards(myHole);

        // ★ 关键：不管玩家有没有就位，先缓存
        if(!G._pendingHoleCards) G._pendingHoleCards = {};
        G._pendingHoleCards[myPeerId] = cards;

        // 尝试立即填入（如果 G.players 已就绪）
        if(tryApplyPendingHoles()){
          render();
        } else {
          console.log('[deal_holes] 玩家还未就位，已缓存，等待 full_state');
        }
      } catch(e){
        console.error('[deal_holes] 解密失败', e);
      }
    })();
    return;
  }
  if(G.online.isHost){
    switch(msg.type){
      case 'player_join': {
        if(!G.online.started) break;
        if(G.players.find(function(x){ return x.peerId === msg.peerId; })) break;
        G.players.push({
          id: msg.seat,
          peerId: msg.peerId,
          name: msg.name,
          emoji: '🎮',
          bg: 'linear-gradient(135deg,#a855f7,#6d28d9)',
          isHuman: false,
          chips: 0,
          seated: true,
          _spectator: true,
          holeCards: [], folded: true, allIn: false,
          currentBet: 0, totalContributed: 0, needsToAct: false,
          position:'', positionKey:'', lastAction:'',
          styleKey:null, revealCards:false, _highlight:null,
          preflopOrder:0, postflopOrder:0
        });
        G.totalPlayers = G.players.length;
        G.seatPositions = computeSeatPositions(G.players.length);
        broadcastFullState();
        render();
        break;
      }
      case 'request_seat': {
        const p = G.players.find(function(x){ return x.peerId === msg.peerId; });
        if(!p) break;
        const lv = G._onlineLv || LEVELS[0];
        p._spectator = false;
        p._waitNextHand = true;
        p.chips = lv.buyMax;
        p.folded = true;
        broadcastFullState();
        render();
        break;
      }
      case 'host_start_game': hostStartGame(msg.playerOrder, msg.players); break;
            case 'rebuy': {
        const p = G.players.find(function(x){ return x.peerId === msg.peerId; });
        if(p){
          p.chips = msg.amount || p.chips;
          p.seated = true;
          p.folded = false;
        }
        if(window.PokerOnline && PokerOnline.clearAllReady) PokerOnline.clearAllReady();
        broadcastFullState();
        // 如果现在 >= 2 个有筹码玩家，进入下一手
        const withChips = G.players.filter(function(x){
          return x.seated !== false && x.chips > 0;
        });
        if(withChips.length >= 2 && G.stage === 'waiting'){
          setTimeout(function(){ startNewHandHost(); }, 800);
        }
        break;
      }
      case 'player_action': {
        const player = G.players.find(function(p){ return p.peerId === msg.playerId; });
        if(!player) {
          console.warn('[host] player_action: unknown peer', msg.playerId);
          return;
        }
        if(G.players[G.currentPlayerIndex] !== player) {
          console.warn('[host] player_action: not current turn', msg.playerId);
          return;
        }

        // ★ 验签（真金房强制，积分场可选）
        const v = PokerOnline.verifyActionSignature(msg);
        if(!v.valid){
          console.warn('[host] 动作验签失败:', v.reason, msg.playerId);
          // 严重违规（伪造签名 / 地址不匹配）→ 踢出
          if(v.reason === 'bad_signature' ||
             v.reason === 'address_mismatch' ||
             v.reason === 'message_tampered'){
            log((player.name || 'Player') + (isEn() ? ' — invalid signature, kicked' : ' — 签名无效，已踢出'), 'hl');
            PokerOnline.sendKick(msg.playerId);
          }
          return;
        }

        clearHostTimeout();
        executeAction(player, msg.action);
        render();
        broadcastFullState();
        runHostTurn();
        break;
      }
      case 'sync_request':
        if(G.online.started) broadcastFullState();
        break;
      case 'state_request':
        if(G.online.started) broadcastFullState();
        break;
      case 'player_leave': {
        handlePlayerLeave(msg.peerId);
        if(G.online.started && G.stage !== 'showdown'){
          const alive = G.players.filter(function(x){ return x.seated !== false && !x.folded; });
          if(alive.length <= 1){
            const pot = G.pot;
            awardUncontestedPot();
            render();
            broadcastFullState();
            endHandHost(pot);
          } else {
            broadcastFullState();
            runHostTurn();
          }
        } else { broadcastFullState(); }
        break;
      }
      case 'player_joined':
      case 'spectator_joined': {
        if(G.online.started){
          setTimeout(function(){ broadcastFullState(); }, 400);
        }
        break;
      }
      case 'seat_changed': {
        if(G.online.started){
          syncWaitingSeatsFromRoom();
        }
        break;
      }
      case 'kicked_player':
        renderPlayersList();
        break;
      case 'host_changed_local':
        G.online.isHost = false;
        updateSpectatorUI();
        break;
      case 'became_host':
        break;
    }
    return;
  }

  switch(msg.type){
    case 'game_start': break;
    case 'full_state': applyFullState(msg.state); break;
    case 'player_leave': handlePlayerLeave(msg.peerId); break;
    case 'kicked': {
      const reasons = {
        bad_signature: isEn() ? 'Invalid signature — possible impersonation' : '签名无效（可能被冒充）',
        verify_error: isEn() ? 'Signature verification failed' : '签名验证失败',
        no_signature: isEn() ? 'Real-money room requires wallet signature' : '真金房必须连接钱包并签名',
        peer_conflict: isEn() ? 'This ID is already used by another wallet' : '该 ID 已被其他钱包占用'
      };
      const msg = reasons[msg.reason] || (isEn() ? "You have been kicked" : "你已被房主踢出房间");
      appToast(msg, "error");
      try { PokerOnline.leaveRoom(); } catch(e){}
      G.online.active = false;
      resetSessionState(); resetTableDom(); hideWaitingBar();
      document.body.classList.remove('game-active');
      $("gameScreen").classList.add("hidden");
      $("lobbyScreen").classList.remove("hidden");
      showScreen("lobby");
      renderRoomLists();
      break;
    }
    case 'wrong_password': {
      appToast(isEn() ? "Wrong password" : "房间密码错误", "error");
      G.online.active = false;
      try { PokerOnline.leaveRoom(); } catch(e){}
      resetSessionState(); resetTableDom(); hideWaitingBar();
      document.body.classList.remove('game-active');
      $("gameScreen").classList.add("hidden");
      $("lobbyScreen").classList.remove("hidden");
      showScreen("lobby");
      break;
    }
    case 'became_host': {
      G.online.isHost = true;
      dropPeer(msg.oldHostPeerId);
      if(window.PokerOnline && PokerOnline.becomeHost){
        try { PokerOnline.becomeHost(); } catch(e){}
      }
      appToast(isEn() ? "You are now the host" : "你已成为新房主", "success");
      updateSpectatorUI();
      syncWaitingSeatsFromRoom();
      render();

      // ★ 关键：如果局还在进行，直接接管（不强制回等待）
      if(G.online.started && G.stage !== 'waiting' && !G.gameOver){
        // 把离桌的人清掉、把需要行动的玩家推进
        setTimeout(function(){
          try { checkRosterSync(); } catch(e){ console.error(e); }
          broadcastFullState();
          setTimeout(function(){
            if(!G.gameOver && G.stage !== 'showdown' && G.stage !== 'waiting'){
              try { runHostTurn(); } catch(e){ console.error('[became_host] runHostTurn', e); }
            }
          }, 300);
        }, 200);
      } else {
        // 局没开或已结束，只广播等待状态
        setTimeout(function(){ if(G.online.started) broadcastFullState(); }, 300);
      }
      break;
    }
    case 'host_changed': {
      dropPeer(msg.oldHostPeerId);
      updateSpectatorUI();
      appToast(isEn() ? "Host changed" : "房主已变更", "info");
      // ★ 不强制回等待，等新房主广播 full_state 继续
      // 只需要把旧房主从座位表清掉、把当前行动者重算
      if(G.online.started && G.stage !== 'waiting' && !G.gameOver){
        checkRosterSync();
      }
      syncWaitingSeatsFromRoom();
      render();
      break;
    }
    case 'host_left': {
      const players = (window.PokerOnline && PokerOnline.getRoomPlayers) ? PokerOnline.getRoomPlayers() : {};
      const myId = PokerOnline.getMyId();
      const others = Object.keys(players).filter(function(pid){ return pid !== myId; });
      if(others.length === 0){
        appToast(isEn() ? "Room closed" : "房间已关闭", "error");
        try { PokerOnline.leaveRoom(); } catch(e){}
        G.online.active = false;
        resetSessionState(); resetTableDom(); hideWaitingBar();
        document.body.classList.remove('game-active');
        $("gameScreen").classList.add("hidden");
        $("lobbyScreen").classList.remove("hidden");
        showScreen("lobby");
        renderRoomLists();
      } else {
        appToast(isEn() ? "Host left, waiting for new host..." : "房主已离桌，等待新房主…", "error");
        G.stage = 'waiting';
        G.online.started = false;
        hideHumanActions();
        stopTurnTimer();
        showWaitingBar();
        syncWaitingSeatsFromRoom();
        render();
      }
      break;
    }
    case 'player_list_updated': {
      if(G.stage === 'waiting' || !G.online.started){
        syncWaitingSeatsFromRoom();
      }
      renderPlayersList();
      break;
    }
    case 'room_full':
      appToast(isEn() ? "Room is full (max 7)" : "房间已满（最多 7 人）", "error");
      try { PokerOnline.leaveRoom(); } catch(e){}
      G.online.active = false;
      resetSessionState(); resetTableDom(); hideWaitingBar();
      document.body.classList.remove('game-active');
      $("gameScreen").classList.add("hidden");
      $("lobbyScreen").classList.remove("hidden");
      showScreen("lobby");
      break;
  }
}

/* ================= 座位位置 ================= */
function computeSeatPositions(n){
  if(!n || n <= 0) return [];
  const base = (G.isMobile && G.orientation === 'portrait')
    ? computePortraitSeats(n)
    : computeLandscapeSeats(n);
  if(!base.length) return [];
  let mySeat = 0;
  if(G.online.active && typeof G.online.mySeat === 'number' && G.online.mySeat >= 0){
    mySeat = G.online.mySeat;
  }
  // ★ 关键：无论 mySeat 是多少，玩家都拿到 base[0] = 底部中央
  const rotated = new Array(n);
  for(let i = 0; i < n; i++){
    rotated[i] = base[(i - mySeat + n) % n];
  }
  return rotated;
}
function computeLandscapeSeats(n){
  const pos = [{ x:50, y:50 + 40 }];
  const ai = n - 1;
  if(ai === 0) return pos;
  const R = 40;
  const right = Math.ceil(ai / 2);
  const left = ai - right;
  if(right === 1){ pos.push({ x:50 + R, y:50 }); }
  else {
    for(let i = 0; i < right; i++){
      const tt = i / (right - 1);
      const d = -60 + tt * 120;
      const r = d * Math.PI / 180;
      pos.push({ x:50 + R*Math.cos(r), y:50 + R*Math.sin(r) });
    }
  }
  if(left === 1){ pos.push({ x:50 - R, y:50 }); }
  else if(left > 1){
    for(let i = 0; i < left; i++){
      const tt = i / (left - 1);
      const d = 120 + tt * 120;
      const r = d * Math.PI / 180;
      pos.push({ x:50 + R*Math.cos(r), y:50 + R*Math.sin(r) });
    }
  }
  return pos;
}
function computePortraitSeats(n){
  /* 自己固定在底部正中 */
  const pos = [{ x:50, y:86 }];
  if(n === 1) return pos;
  const others = n - 1;

  /* 整圆分布：自己占 90°（正下方），其他人从 90°+step 开始顺时针排一圈 */
  const cx = 50, cy = 48;
  const rx = 42, ry = 36;
  const myAngle = 90;            /* 屏幕坐标：0°右，90°下，180°左，270°上 */
  const step = 360 / n;

  for(let i = 0; i < others; i++){
    const angle = myAngle + step * (i + 1);
    const rad = angle * Math.PI / 180;
    const x = cx + rx * Math.cos(rad);
    const y = cy + ry * Math.sin(rad);
    pos.push({ x: x, y: y });
  }
  return pos;
}
function computeActionOrders(){
  const n = G.players.length; if(!n) return;
  let start = (n === 2) ? G.dealerIndex : (G.dealerIndex + 3) % n;
  for(let i = 0; i < n; i++) G.players[(start+i)%n].preflopOrder = i + 1;
  if(n === 2){
    G.players[(G.dealerIndex+1)%n].postflopOrder = 1;
    G.players[G.dealerIndex].postflopOrder = 2;
  } else {
    const s = (G.dealerIndex + 1) % n;
    for(let i = 0; i < n; i++) G.players[(s+i)%n].postflopOrder = i + 1;
  }
}

/* ================= 发牌动画 ================= */
function flyCard(from, to, delay){
  return new Promise(function(res){
    setTimeout(function(){
      if(!from || !to){ res(); return; }
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'flying-card';
      el.style.left = (a.left + a.width/2 - 12) + 'px';
      el.style.top = (a.top + a.height/2 - 17) + 'px';
      document.body.appendChild(el);
      void el.offsetWidth;
      const dx = (b.left + b.width/2) - (a.left + a.width/2);
      const dy = (b.top + b.height/2) - (a.top + a.height/2);
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.65)';
      el.style.opacity = '0';
      setTimeout(function(){ el.remove(); res(); }, 520);
    }, delay || 0);
  });
}
async function playDealAnimation(){
  const dealer = $("dealerSeat");
  const deck = $("shuffleDeck");
  if(!dealer) return;
  if(deck && !G.isMobile){
    deck.classList.add("shuffling");
    PokerAudio.play('deal');
    await sleep(560);
    deck.classList.remove("shuffling");
  } else if(G.isMobile){
    PokerAudio.play('deal');
    await sleep(200);
  }
  const proms = [];
  let idx = 0;
  for(let r = 0; r < 2; r++){
    for(let i = 0; i < G.players.length; i++){
      const p = G.players[i];
      if(p.folded) continue;
      const tgt = document.querySelector('.seat[data-pid="' + p.id + '"]');
      if(tgt) proms.push(flyCard(dealer, tgt, idx * (G.isMobile ? 40 : 60)));
      idx++;
    }
  }
  await Promise.all(proms);
  await sleep(100);
}

/* ================= AI 单机主流程 ================= */
async function startNewHandAi(){
  clearAllGameTimers();
  clearShowCardsTimer();
  if(G._nextHandTimer){ clearInterval(G._nextHandTimer); G._nextHandTimer = null; }
  if(G._nextHandToastTimer){ clearInterval(G._nextHandToastTimer); G._nextHandToastTimer = null; }
  hideNextHandToast();
  const showBtn = document.getElementById('showCardsBtn');
  if(showBtn) showBtn.classList.add('hidden');
  G.handNumber++; G.sessionHands++;
  G.pot = 0; G.community = [];
  G.currentBet = 0; G.lastRaiseAmount = G.bigBlind;
  G.stage = "preflop"; G.busy = false; G._busySince = 0;
  G._nextHandEndsAt = 0;
    G._deltaShown = false;
  /* ★ preflop 初始 raiseCount = 1（大盲算第一次） */
  G.raiseCount = 1;
  G.deck = PokerDeck.create();
  PokerDeck.shuffle(G.deck);
  G._renderedCards = new WeakSet();
  G._lastBoardSig = ''; G._lastHandSig = ''; G._lastActionSig = '';
  stopTurnTimer();
    G.players.forEach(function(p){
    p.folded = p.chips <= 0; p.allIn = false; p.currentBet = 0;
    p.totalContributed = 0; p.needsToAct = false; p.lastAction = "";
    p.holeCards = []; p.revealCards = false; p._highlight = null; p._score = null;
    p._intentReveal = false;
    p._isWinner = false;
    p._winnerType = null;
    p._winAmount = 0;
    p._winPots = [];
    p._lastDelta = 0;
  });
  G.playerHandStartChips = G.players[0].chips;
  assignPositions();
  computeActionOrders();
  const n = G.players.length;
  for(let r = 0; r < 2; r++){
    for(let i = 1; i <= n; i++){
      const idx = (G.dealerIndex + i) % n;
      const p = G.players[idx];
      if(!p.folded) p.holeCards.push(G.deck.pop());
    }
  }
  if(G.players[0]){
    G._currentHandMyCards = G.players[0].holeCards.map(function(c){ return c.suit + c.rank; });
  }
  clearLog();
  log(t("handNum", { n:G.handNumber }) + " · " + t("dealerIs", { name:G.players[G.dealerIndex].name }), "hl");
  log(t("blindsAre", { sb:G.smallBlind, bb:G.bigBlind }), "hl");
  const gh = $("gameHandLabel");
  if(gh) gh.textContent = t("handShortLabel", { n:G.handNumber });
  render();
  await playDealAnimation();
  postBlinds();
  render();
  startPreflopAi();
}
function startPreflopAi(){
  const n = G.players.length;
  G.players.forEach(function(p){ p.needsToAct = !p.folded && !p.allIn && p.chips > 0; });
  let idx = n === 2 ? G.dealerIndex : (G.dealerIndex + 3) % n;
  let tries = 0;
  while((G.players[idx].folded || G.players[idx].allIn) && tries < n){ idx = (idx + 1) % n; tries++; }
  G.currentPlayerIndex = idx;
  render();
  runTurnAi();
}
function assignPositions(){
  const n = G.players.length;
  const names = {
    2:["posBTNSB","posBB"], 3:["posBTN","posSB","posBB"],
    4:["posBTN","posSB","posBB","posUTG"],
    5:["posBTN","posSB","posBB","posUTG","posCO"],
    6:["posBTN","posSB","posBB","posUTG","posHJ","posCO"],
    7:["posBTN","posSB","posBB","posUTG","posUTG1","posHJ","posCO"]
  }[n] || ["posBTN","posSB","posBB","posUTG","posUTG1","posHJ","posCO"];
  for(let i = 0; i < n; i++){
    const idx = (G.dealerIndex + i) % n;
    G.players[idx].positionKey = names[i];
    G.players[idx].position = t(names[i]);
  }
}
function postBlinds(){
  const n = G.players.length;
  const sbIdx = n === 2 ? G.dealerIndex : (G.dealerIndex + 1) % n;
  const bbIdx = n === 2 ? (G.dealerIndex + 1) % n : (G.dealerIndex + 2) % n;
  const sbP = G.players[sbIdx], bbP = G.players[bbIdx];
  const sb = Math.min(G.smallBlind, sbP.chips);
  sbP.chips -= sb; sbP.currentBet = sb; sbP.totalContributed += sb; G.pot += sb;
  if(sbP.chips === 0) sbP.allIn = true;
  const bb = Math.min(G.bigBlind, bbP.chips);
  bbP.chips -= bb; bbP.currentBet = bb; bbP.totalContributed += bb; G.pot += bb;
  if(bbP.chips === 0) bbP.allIn = true;
  G.currentBet = bb; G.lastRaiseAmount = G.bigBlind;
  log(t("sbBet", { name:sbP.name, amt:sb, name2:bbP.name, amt2:bb }), "action");
}
function countActive(){
  return G.players.filter(function(p){ return p.seated !== false && !p.folded; }).length;
}
function findNextToAct(){
  const n = G.players.length;
  for(let k = 0; k < n; k++){
    const idx = (G.currentPlayerIndex + k) % n;
    const p = G.players[idx];
    if(p.seated !== false && !p.folded && !p.allIn && p.needsToAct && p.chips > 0){
      G.currentPlayerIndex = idx; return true;
    }
  }
  return false;
}
function myIndex(){
  if(G.online.active) return G.online.mySeat;
  return 0;
}

function runTurnAi(){
  if(G.gameOver) return;

  if(G.busy){
    const elapsed = G._busySince ? Date.now() - G._busySince : 0;
    if(elapsed > BUSY_TIMEOUT){
      G.busy = false; G._busySince = 0;
      clearAiActionTimer();
    } else {
      if(!G._busyWatchdogTimer){
        G._busyWatchdogTimer = setTimeout(function(){
          G._busyWatchdogTimer = null;
          if(G.gameOver) return;
          runTurnAi();
        }, BUSY_WATCHDOG_INTERVAL);
      }
      return;
    }
  } else {
    G._busySince = 0;
    clearBusyWatchdog();
  }

  if(countActive() <= 1){
    const pot = G.pot;
    awardUncontestedPot();
    render();
    endHandAi(pot);
    return;
  }
  const notAllIn = G.players.filter(function(p){ return !p.folded && !p.allIn; });
  /* ★ 修正：只剩 ≤1 个可行动玩家且无需再跟注，直接跑马 */
  const actionable = G.players.filter(function(p){ return !p.folded && !p.allIn && p.chips > 0; });
  if(notAllIn.length === 0){ advanceStageAi(); return; }
  if(actionable.length <= 1 && notAllIn.every(function(p){ return !p.needsToAct; })){
    advanceStageAi(); return;
  }
  if(!findNextToAct()){ advanceStageAi(); return; }
  const p = G.players[G.currentPlayerIndex];

  if(!p || p.folded || p.allIn || !p.needsToAct || p.chips <= 0){
    advanceStageAi();
    return;
  }

  render();
  if(p.isHuman){
    showHumanControls();
    PokerAudio.play('turn');
    startTurnTimer(p);
    clearAiActionTimer();
  } else {
    stopTurnTimer();
    clearAiActionTimer();
    G.busy = true;
    G._busySince = Date.now();
    const curIdx = G.currentPlayerIndex;

    G._aiActionTimer = setTimeout(function(){
      G._aiActionTimer = null;
      if(G.gameOver) return;
      if(G.currentPlayerIndex !== curIdx) return;
      const cur = G.players[curIdx];
      if(!cur || cur.folded || cur.allIn || !cur.needsToAct) return;
      const toCall = Math.max(0, G.currentBet - cur.currentBet);
      const fallback = toCall > 0 ? { type: 'fold' } : { type: 'check' };
      log(cur.name + (isEn() ? " timed out, auto-act" : " 超时自动行动"), "action");
      G.busy = false; G._busySince = 0;
      try { executeAction(cur, fallback); } catch(e){ console.error('[AI] fallback error', e); }
      render();
      runTurnAi();
    }, AI_ACTION_TIMEOUT);

    const ms = 800 + Math.random() * 2200;
    setTimeout(function(){
      if(G.currentPlayerIndex !== curIdx) return;
      if(G.gameOver) return;
      clearAiActionTimer();
      G.busy = false;
      G._busySince = 0;
      clearBusyWatchdog();

      let action = null;
      try {
        action = PokerAI.decide(p, G);
      } catch(e){
        console.warn('[AI] decide error', e);
      }
      if(!action || !action.type){
        const toCall = Math.max(0, G.currentBet - p.currentBet);
        action = toCall > 0 ? { type: 'fold' } : { type: 'check' };
      }
      try { executeAction(p, action); }
      catch(e){ console.error('[AI] execute error', e); }
      render();
      runTurnAi();
    }, ms);
  }
}

function advanceStageAi(){
  stopTurnTimer();
  clearAllGameTimers();
  G.busy = false; G._busySince = 0;

  if(countActive() <= 1){
    const pot = G.pot;
    awardUncontestedPot();
    render();
    endHandAi(pot);
    return;
  }

  const boardLen = G.community.length;

  if(boardLen >= 5){
    showdownAi();
    return;
  }

  G.players.forEach(function(p){ p.currentBet = 0; p.lastAction = ""; });
  G.currentBet = 0; G.lastRaiseAmount = G.bigBlind;
  /* ★ 新一条街：raiseCount 归零 */
  G.raiseCount = 0;

  if(boardLen === 0){
    G.stage = "flop";
    G.community.push(G.deck.pop(), G.deck.pop(), G.deck.pop());
    log(t("flopIs",{cards:G.community.map(function(c){return c.display;}).join("  ")}), "hl");
  } else if(boardLen === 3){
    G.stage = "turn";
    G.community.push(G.deck.pop());
    log(t("turnIs",{card:G.community[G.community.length-1].display}), "hl");
  } else if(boardLen === 4){
    G.stage = "river";
    G.community.push(G.deck.pop());
    log(t("riverIs",{card:G.community[G.community.length-1].display}), "hl");
  } else {
    showdownAi();
    return;
  }

  PokerAudio.play('deal');
  G.players.forEach(function(p){
    p.currentBet = 0; p.lastAction = "";
    p.needsToAct = !p.folded && !p.allIn && p.chips > 0;
  });
  /* ★ 关键修正：如果可行动玩家 ≤1，其他人 all-in → 直接跑马 */
  const actionable = G.players.filter(function(p){ return !p.folded && !p.allIn && p.chips > 0; });
  if(actionable.length <= 1){
    G.players.forEach(function(p){ p.needsToAct = false; });
  }
  G.currentBet = 0; G.lastRaiseAmount = G.bigBlind;
  const n = G.players.length;
  let idx = (G.dealerIndex + 1) % n;
  let tries = 0;
  while((G.players[idx].folded || G.players[idx].allIn || G.players[idx].seated === false) && tries < n){
    idx = (idx + 1) % n; tries++;
  }
  G.currentPlayerIndex = idx;
  render();
  runTurnAi();
}

/* ★ 根据当前 raiseCount 生成下注/加注/3-bet/4-bet 文案 */
function getBetLabel(raiseCount, target){
  /* raiseCount 追踪本轮的下注/加注次序：
     preflop 开场 = 1（大盲算第一次"下注"）
     第一个加注 = 2 → 显示"加注"，不叫 2-bet
     第二个加注 = 3 → 3-bet
     第三个加注 = 4 → 4-bet
     ... 以此类推 */
  if(raiseCount <= 1) return (isEn() ? 'Bet ' : '下注 ') + fmtNum(target);
  if(raiseCount === 2) return (isEn() ? 'Raise to ' : '加注到 ') + fmtNum(target);
  return raiseCount + '-bet ' + fmtNum(target);
}

function executeAction(player, action){
  if(!player || player.folded || player.allIn || player.seated === false) return;

  if(action.type === "fold"){
    player.folded = true;
    player.needsToAct = false;
    player.lastAction = t("actionFold");
    log(t("playerFolds", { name:player.name }), "action");
    PokerAudio.play('fold');
    return;
  }

  if(action.type === "check"){
    if(G.currentBet > player.currentBet){
      player.folded = true;
      player.needsToAct = false;
      player.lastAction = t("actionFold");
      log(t("playerFolds", { name:player.name }), "action");
      PokerAudio.play('fold');
      return;
    }
    player.needsToAct = false;
    player.lastAction = t("actionCheck");
    log(t("playerChecks", { name:player.name }), "action");
    PokerAudio.play('check');
    return;
  }

  if(action.type === "call"){
    const toCall = Math.min(player.chips, G.currentBet - player.currentBet);
    player.chips -= toCall;
    player.currentBet += toCall;
    player.totalContributed += toCall;
    G.pot += toCall;
    if(player.chips === 0) player.allIn = true;
    player.needsToAct = false;
    player.lastAction = toCall === 0 ? t("actionCheck") : (t("actionCall") + " " + fmtNum(toCall));
    log(toCall === 0 ? t("playerChecks",{name:player.name}) : t("playerCalls",{name:player.name,amt:fmtNum(toCall)}), "action");
    PokerAudio.play(toCall === 0 ? 'check' : 'call');
    return;
  }

  if(action.type === "raise"){
    const oldBet = G.currentBet;
    const max = player.chips + player.currentBet;
    const minTarget = oldBet === 0 ? G.bigBlind : oldBet * 2;
    let target;
    if(action.target != null && isFinite(action.target)){
      target = Math.min(action.target, max);
    } else if(G.currentBet === 0){
      target = Math.max(G.bigBlind, Math.floor(G.pot * 0.5));
    } else {
      const potT = G.currentBet + Math.floor(G.pot * 0.6);
      target = Math.min(max, Math.max(minTarget, potT));
    }

    if(target <= G.currentBet){
      const toCall = Math.min(player.chips, G.currentBet - player.currentBet);
      if(toCall > 0 && toCall <= player.chips){
        player.chips -= toCall;
        player.currentBet += toCall;
        player.totalContributed += toCall;
        G.pot += toCall;
        if(player.chips === 0) player.allIn = true;
        player.needsToAct = false;
        player.lastAction = t("actionCall") + " " + fmtNum(toCall);
        log(t("playerCalls",{name:player.name,amt:fmtNum(toCall)}), "action");
        PokerAudio.play('call');
      } else {
        player.folded = true;
        player.needsToAct = false;
        player.lastAction = t("actionFold");
        log(t("playerFolds", { name:player.name }), "action");
        PokerAudio.play('fold');
      }
      return;
    }

    const delta = target - player.currentBet;
    if(delta <= 0 || delta > player.chips){
      const toCall = Math.min(player.chips, G.currentBet - player.currentBet);
      if(toCall > 0){
        player.chips -= toCall;
        player.currentBet += toCall;
        player.totalContributed += toCall;
        G.pot += toCall;
        if(player.chips === 0) player.allIn = true;
        player.needsToAct = false;
        player.lastAction = t("actionCall") + " " + fmtNum(toCall);
        log(t("playerCalls",{name:player.name,amt:fmtNum(toCall)}), "action");
        PokerAudio.play('call');
      } else {
        player.needsToAct = false;
        player.lastAction = t("actionCheck");
        log(t("playerChecks", { name:player.name }), "action");
        PokerAudio.play('check');
      }
      return;
    }

    const wasAllIn = (player.chips === delta);
    player.chips -= delta;
    player.currentBet = target;
    player.totalContributed += delta;
    G.pot += delta;
    if(player.chips === 0) player.allIn = true;
    if(target - oldBet > G.lastRaiseAmount) G.lastRaiseAmount = target - oldBet;
    if(target > G.currentBet) G.currentBet = target;
    player.needsToAct = false;

    /* ★ 关键：递增 raiseCount，决定文案和音效 */
    if(!wasAllIn){
      G.raiseCount = (G.raiseCount || 0) + 1;
    }

    if(wasAllIn){
      player.lastAction = (isEn() ? 'ALL-IN ' : 'ALL-IN ') + fmtNum(target);
      log((isEn() ? 'ALL-IN ' : 'ALL-IN ') + player.name + ' → ' + fmtNum(target), "action");
      PokerAudio.play('allin');
    } else {
      const label = getBetLabel(G.raiseCount, target);
      player.lastAction = label;
      log(player.name + ' ' + label, "action");
      /* 3-bet 及以上 → 急促音效 */
      if(G.raiseCount >= 3){
        PokerAudio.play('raiseBig');
      } else if(oldBet === 0){
        PokerAudio.play('bet');
      } else {
        PokerAudio.play('raise');
      }
    }

    G.players.forEach(function(p){
      if(p !== player && !p.folded && !p.allIn && p.chips > 0 && p.seated !== false) p.needsToAct = true;
    });
  }
}

function endHandAi(totalPot){
  stopTurnTimer();
  clearAllGameTimers();
  const alive = G.players.filter(function(p){ return p.seated !== false && !p.folded; });
  const w = alive[0];
  if(!w) return;
  const pot = G.pot;
  if(pot > 0){
    w.chips += pot;
    log(t("winsPot",{name:w.name,pot:fmtNum(pot)}), "win");
    PokerAudio.play('win');
  }
  G.pot = 0; G.stage = "showdown";
  const me = G.players[0];
  const delta = me.chips - G.playerHandStartChips;
  PokerStorage.recordHand(delta, (totalPot || pot));
  try {
    let result = '';
    if(me.holeCards && me.holeCards.length >= 2 && G.community && G.community.length >= 3){
      const r = PokerEval.bestHand(me.holeCards.concat(G.community));
      if(r && r.score) result = PokerEval.nameOf(r.score);
    }
    PokerStorage.addHandHistory({
      handNumber: G.handNumber,
      myCards: (G._currentHandMyCards || []).slice(),
      community: (G.community || []).map(function(c){ return c.suit + c.rank; }),
      result: result, delta: delta, pot: (totalPot || pot)
    });
  } catch(e){ console.warn('save hand history failed', e); }
  refreshHistoryPanelsIfOpen();
  render();
  if(me.chips <= 0){ setTimeout(showRebuy, 800); return; }
  offerShowCards();
  beginNextHandCountdown(startNewHandAi);
}

function calculateSidePots(){
  const contributors = G.players
    .filter(function(p){ return (p.totalContributed || 0) > 0; })
    .map(function(p){ return { player: p, amount: p.totalContributed, folded: p.folded }; });

  const pots = [];
  let pendingDeadMoney = 0;   // ★ 新增：累积"全弃牌层"的筹码
  let guard = 0;

  while(contributors.some(function(x){ return x.amount > 0; }) && guard < 20){
    guard++;
    const active = contributors.filter(function(x){ return x.amount > 0; });
    if(!active.length) break;
    const minA = Math.min.apply(null, active.map(function(x){ return x.amount; }));
    let amt = 0;
    const eligible = [];
    active.forEach(function(x){
      amt += minA;
      x.amount -= minA;
      if(!x.folded) eligible.push(x.player);
    });

    if(eligible.length === 0){
      // ★ 修复：这一层全是弃牌玩家贡献的"死筹码"
      // 不丢，先累积，等下一个有合格玩家的层一起并入
      pendingDeadMoney += amt;
    } else {
      pots.push({
        amount: amt + pendingDeadMoney,
        eligible: eligible
      });
      pendingDeadMoney = 0;
    }
  }

  // ★ 兜底：循环结束还有死筹码（说明最高层也全弃牌）
  if(pendingDeadMoney > 0){
    if(pots.length > 0){
      // 加到最后一个非空池子
      pots[pots.length - 1].amount += pendingDeadMoney;
      console.warn('[sidePots] dead money merged into last pot:', pendingDeadMoney);
    } else {
      // 极端情况：所有玩家全弃牌，但仍有人下了筹码
      // 退还给所有"仍在场"的玩家，避免筹码消失
      const alive = G.players.filter(function(p){ return !p.folded && p.seated !== false; });
      if(alive.length > 0){
        pots.push({ amount: pendingDeadMoney, eligible: alive.slice() });
        console.warn('[sidePots] dead money refunded to alive players:', pendingDeadMoney);
      } else {
        console.error('[sidePots] CRITICAL: all players folded with dead money:', pendingDeadMoney);
      }
    }
  }

  return pots;
}

function showdownAi(){
  stopTurnTimer();
  clearAllGameTimers();
  G.stage = "showdown";
  G._settled = false;
  G.busy = true; G._busySince = Date.now();
  log(t("showdownHeader"), "hl");
  PokerAudio.play('showdown');
  const cont = G.players.filter(function(p){ return !p.folded; });
  cont.forEach(function(p){ p.revealCards = false; p._highlight = null; });
  render();
  let idx = 0;
  function next(){
    if(idx >= cont.length){ setTimeout(function(){ resolveAi(cont); }, 800); return; }
    const p = cont[idx];
    p.revealCards = true;
    render();
    PokerAudio.play('deal');
    log(t("reveals",{name:p.name,cards:p.holeCards.map(function(c){return c.display;}).join("  ")}), "showdown");
    idx++;
    setTimeout(next, 650);
  }
  next();
}

function resolveAi(cont){
  let totalPot = G.pot;
  try {
    cont.forEach(function(p){
      const r = PokerEval.bestHand(p.holeCards.concat(G.community));
      p._score = r.score; p._bestCards = r.cards;
      log(t("handResult",{
        name:p.name,
        cards:p.holeCards.map(function(c){return c.display;}).join(" "),
        hand:PokerEval.nameOf(r.score)
      }), "showdown");
    });
        const pots = calculateSidePots();
    const n = pots.length;
    let anyTie = false;

    // ★ 结算前彻底清空所有 winner 状态
    G.players.forEach(function(p){
      p._isWinner = false;
      p._winnerType = null;
      p._winAmount = 0;
      p._winPots = [];
    });

    pots.forEach(function(pot, i){
      if(!pot.eligible.length){
        console.warn('[resolveHost] Empty pot detected, amount:', pot.amount);
        return;
      }
      let best = null, ws = [];
      pot.eligible.forEach(function(p){
        if(best === null || PokerEval.compare(p._score, best) > 0){ best = p._score; ws = [p]; }
        else if(PokerEval.compare(p._score, best) === 0) ws.push(p);
      });
      if(ws.length > 1) anyTie = true;
      const each = Math.floor(pot.amount / ws.length);
      const rem = pot.amount - each * ws.length;
      const lbl = n === 1 ? t("pot") : (i === 0 ? t("mainPot") : t("sidePot") + " " + i);
      const isMain = (n === 1) || (i === 0);

ws.forEach(function(w, k){
  const gain = each + (k === 0 ? rem : 0);
  w.chips += gain;
  w._isWinner = true;
  w._winAmount = (w._winAmount || 0) + gain;
  w._winPots = w._winPots || [];

  // ★ 关键改动：区分"真赢"和"未跟注返还"
  const isRefund = (pot.eligible.length === 1);  // 单人池 = 未跟注返还
  w._winPots.push({
    label: lbl,
    amount: gain,
    isRefund: isRefund
  });

  if(isRefund){
    // 未跟注返还：不亮杯
    if(!w._winnerType) w._winnerType = 'refund';
  } else {
    // 真赢：主池 → main，其他 → side
    if(isMain){
      w._winnerType = 'main';
    } else if(w._winnerType !== 'main'){
      w._winnerType = 'side';
    }
  }
});

      console.log('[resolveHost] Pot', i, lbl,
        '| amount:', pot.amount,
        '| eligible:', pot.eligible.map(function(x){return x.name;}).join(','),
        '| winner:', ws.map(function(x){
          return x.name + '(' + PokerEval.nameOf(x._score) + ')';
        }).join(',')
      );

      log(t("winsPotSide",{
        name:ws.map(function(x){return x.name;}).join(", "),
        potLabel:lbl, amt:fmtNum(pot.amount), hand:PokerEval.nameOf(best)
      }), "win");
      if(!ws[0]._highlight && ws[0]._bestCards) ws[0]._highlight = new Set(ws[0]._bestCards);
    });

    if(anyTie) showTieDisplay();
    totalPot = pots.reduce(function(s,p){ return s + p.amount; }, 0);
  } catch(e){
    console.error('resolveAi error', e);
  } finally {
    G._settled = true; 
    G.pot = 0; G.busy = false; G._busySince = 0;
    PokerAudio.play('win');
    const me = G.players[0];
    const delta = me.chips - G.playerHandStartChips;
    PokerStorage.recordHand(delta, totalPot);
    try {
      let result = '';
      if(me.holeCards && me.holeCards.length >= 2 && G.community && G.community.length >= 3){
        const r = PokerEval.bestHand(me.holeCards.concat(G.community));
        if(r && r.score) result = PokerEval.nameOf(r.score);
      }
      PokerStorage.addHandHistory({
        handNumber: G.handNumber,
        myCards: (G._currentHandMyCards || []).slice(),
        community: (G.community || []).map(function(c){ return c.suit + c.rank; }),
        result: result, delta: delta, pot: totalPot
      });
    } catch(e){ console.warn('save hand history failed', e); }
    refreshHistoryPanelsIfOpen();
    render();
    if(me.chips <= 0){ setTimeout(showRebuy, 800); return; }
    offerShowCards();
    beginNextHandCountdown(startNewHandAi);
  }
}

function showTieDisplay(){
  const el = document.getElementById('tieDisplay');
  if(!el) return;
  el.textContent = isEn() ? "TIE" : "平局";
  el.classList.remove('hidden');
  setTimeout(function(){ el.classList.add('hidden'); }, 3500);
}

function offerShowCards(){
  const me = G.players[myIndex()];
  if(!me) return;
  if(!me.holeCards || me.holeCards.length < 2) return;
  if(!G.community || G.community.length === 0) return;
  const btn = document.getElementById('showCardsBtn');
  if(!btn) return;
  btn.classList.remove('hidden');
  btn.textContent = isEn() ? 'Show cards' : '秀牌';
  btn.onclick = function(){
    btn.classList.add('hidden');
    if(window.PokerAudio) PokerAudio.play('click');
    me.revealCards = true;
    me._intentReveal = true;
    render();
    if(G.online.active && window.PokerOnline){
      PokerOnline.sendShowCards({ peerId: PokerOnline.getMyId(), intent: true });
    }
  };
  if(G._showCardsTimer) clearTimeout(G._showCardsTimer);
  G._showCardsEndsAt = Date.now() + SHOW_CARDS_WINDOW;
  G._showCardsTimer = setTimeout(function(){
    btn.classList.add('hidden');
    G._showCardsTimer = null;
    G._showCardsEndsAt = 0;
  }, SHOW_CARDS_WINDOW);
}

function showRebuy(){
  stopTurnTimer();
  const lv = G._onlineLv || LEVELS.find(function(l){ return l.key === G.tableMode; }) || LEVELS[0];
  const minBuy = lv.buyMin;
  G._rebuyMultiplier = minBuy;

  const overlay = $("rebuyOverlay");
  overlay.classList.remove("hidden");
  updateRebuyMsg(lv);

  const row = document.querySelector('.rebuy-amount-row');
  if(row){
    row.innerHTML =
      '<button type="button" class="rebuy-amount-btn active" data-rebuy="' + minBuy + '">1×最低<br>(' + fmtNum(minBuy) + ')</button>' +
      '<button type="button" class="rebuy-amount-btn" data-rebuy="' + lv.buyMax + '">1×最高<br>(' + fmtNum(lv.buyMax) + ')</button>' +
      '<button type="button" class="rebuy-amount-btn" data-rebuy="' + (lv.buyMax * 2) + '">2×最高<br>(' + fmtNum(lv.buyMax * 2) + ')</button>';
    row.querySelectorAll('.rebuy-amount-btn').forEach(function(b){
      b.onclick = function(){
        G._rebuyMultiplier = parseInt(b.getAttribute('data-rebuy'), 10);
        row.querySelectorAll('.rebuy-amount-btn').forEach(function(x){
          x.classList.toggle('active', parseInt(x.getAttribute('data-rebuy'), 10) === G._rebuyMultiplier);
        });
        updateRebuyMsg(lv);
        if(window.PokerAudio) PokerAudio.play('click');
      };
    });
  }

  $("rebuyGameBtn").onclick = function(){
    let amount = G._rebuyMultiplier;
    if(amount < minBuy) amount = minBuy;
    $("rebuyOverlay").classList.add("hidden");
    const me = G.players[myIndex()];
    if(G.gameMode === 'ai'){
      let ai = PokerStorage.getAiChips();
      if(ai < amount){ PokerStorage.addAiChips(amount - ai + 5000); ai = PokerStorage.getAiChips(); }
      PokerStorage.setAiChips(ai - amount);
    } else if(G.gameMode === 'points'){
      let pts = PokerStorage.getPoints();
      if(pts < amount){ PokerStorage.addPoints(amount - pts + 10000); pts = PokerStorage.getPoints(); }
      PokerStorage.setPoints(pts - amount);
    } else if(G.gameMode === 'real'){
      const chainChips = Math.floor((window.PokerWallet ? PokerWallet.getContractBalance() : 0) / CHIP_TO_BEM);
      if(chainChips < amount){
        appToast(isEn() ? "Not enough chips. Please deposit BEM." : "对战场筹码不足，请充值 BEM", "error");
        return;
      }
      // ★ 注意：玩家补码不需要在前端扣除余额，因为在合约层面，余额是在玩家坐下/退出时才结算。
      // 这里只是把筹码发到游戏桌上。
    }
    me.chips = amount;
    G.sessionBuyIn += amount;
    PokerAudio.play('chip');

    // ★ 联机模式：不能自己开一局，必须通知房主
    if(G.online.active){
      $("rebuyOverlay").classList.add("hidden");
      if(G.online.isHost){
        me.seated = true;
        if(window.PokerOnline && PokerOnline.clearAllReady) PokerOnline.clearAllReady();
        broadcastFullState();
        returnToWaiting();
      } else if(window.PokerOnline && PokerOnline.send){
        PokerOnline.send('rebuy', { peerId: PokerOnline.getMyId(), amount: amount });
        appToast(isEn() ? "Rebuy request sent" : "补码请求已发送，等待房主确认", "success");
      }
      return;
    }

    rotateDealerAndStart(function(){
      if(G.gameMode === 'ai') startNewHandAi(); else startNewHandHost();
    });
  };
  $("leaveGameBtn").onclick = function(){
    $("rebuyOverlay").classList.add("hidden");
    backToLobby();
  };
}
function updateRebuyMsg(lv){
  const amt = G._rebuyMultiplier;
  const el = $("rebuyMsg");
  if(el) el.textContent = isEn()
    ? ("Out of chips. Rebuy " + fmtNum(amt) + " chips? (min " + fmtNum(lv.buyMin) + ")")
    : ("你的筹码用完了。补码 " + fmtNum(amt) + " 筹码？（最低 " + fmtNum(lv.buyMin) + "）");
}

async function backToLobby(){
  stopTurnTimer();
  clearAllGameTimers();
  clearShowCardsTimer();
  if(G.online.active && G.online.isHost && G.online.started && window.PokerOnline.sendHostLeft){
    try { PokerOnline.sendHostLeft(); } catch(e){}
  }

  const me = G.players[myIndex()];

  // ★ 真金模式：先进行链上结算，再返回大厅
  if(me && G.sessionBuyIn > 0 && G.gameMode === 'real' && me.chips !== G.sessionBuyIn){
    try {
  const playerAddress = PokerWallet.getAddress();

  // ★ 1. 读链上当前余额（wei 字符串）
  const chainBalanceWei = await PokerWallet.getContractBalanceWei();

  // ★ 2. 本局盈亏（筹码） = 离桌筹码 - 入桌筹码
  const deltaChips = me.chips - G.sessionBuyIn;

  // ★ 3. 换算成 wei：1 筹码 = 10^14 wei（= 0.0001 BEM）
  const deltaWei = BigInt(deltaChips) * 100000000000000n;

  // ★ 4. 新余额 = 旧余额 + 盈亏
  let newBalanceWei = BigInt(chainBalanceWei) + deltaWei;
  if (newBalanceWei < 0n) newBalanceWei = 0n;

  const workerUrl = 'https://texas-holdem-settle.2027499636.workers.dev';

  appToast('正在获取签名，请稍候...', '');

  const settleRes = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerAddress: playerAddress,
      newBalanceWei: newBalanceWei.toString()
    })
  });
  const settleData = await settleRes.json();
  if (!settleData.success) throw new Error(settleData.error || '签名失败');

  appToast('请在钱包中确认链上结算...', '');

  // ★ 用 Worker 返回的 nonce（链上读出来的那个）
  await PokerWallet.settleBalanceOnChain(
    playerAddress,
    newBalanceWei.toString(),
    settleData.nonce,
    settleData.signature
  );

  appToast('链上结算成功！', 'success');
} catch(err) {
  console.error('链上结算失败:', err);
  appToast('结算失败：' + (err.message || err), 'error');
}
  }

  if(me && G.sessionBuyIn > 0){
    const pnl = me.chips - G.sessionBuyIn;
    if(G.gameMode === 'ai') PokerStorage.addAiChips(me.chips);
    else if(G.gameMode === 'points') PokerStorage.addPoints(me.chips);
    // ★ 真金模式已经通过链上结算，这里不需要再加筹码到本地

    PokerStorage.addSession({
      table: G.tableLabel, blinds: G.smallBlind + "/" + G.bigBlind,
      buyIn: G.sessionBuyIn, pnl: pnl, hands: G.sessionHands,
      status: 'left', mode: G.gameMode
    });
  }

  if(G.online.active){
    try { PokerOnline.leaveRoom(); } catch(e){}
    G.online.active = false;
  }

  resetSessionState();
  resetTableDom();
  hideWaitingBar();
  hideNextHandToast();
  clearAllBubbles();
  G.gameOver = true;
  document.body.classList.remove('game-active');
  $("gameScreen").classList.add("hidden");
  $("lobbyScreen").classList.remove("hidden");
  $("onlineLobby").classList.add("hidden");
  $("nextHandBtn").classList.add("hidden");
  $("showCardsBtn").classList.add("hidden");
  $("humanActions").innerHTML = "";
  $("raisePanel").classList.add("hidden");
  $("handCardsLarge").innerHTML = "";
  const fab = document.getElementById('chatFab');
  if(fab) fab.classList.add('hidden');
  const chatPanel = document.getElementById('chatPanel');
  if(chatPanel) chatPanel.classList.add('hidden');
  const mlogFab = document.getElementById('mobileLogFab');
  if(mlogFab) mlogFab.classList.add('hidden');
  const mlogPanel = document.getElementById('mobileLogPanel');
  if(mlogPanel) mlogPanel.classList.add('hidden');
  showScreen("lobby");
  renderRoomLists();
}
/* ================= 渲染 ================= */
function renderCardEl(card, mini, hl){
  const d = document.createElement("div");
  const isNew = !G._renderedCards.has(card);
  if(isNew) G._renderedCards.add(card);
  const cls = "face " + (card.red ? "red" : "black") + (hl ? " highlight" : "") + (isNew ? " card-new" : "");
  if(mini){
    d.className = "mini-card " + cls;
    d.innerHTML = '<div class="v">' + card.rank + '</div><div class="s">' + card.suit + '</div>';
  } else {
    d.className = "card " + (card.red ? "red" : "black") + (hl ? " highlight" : "") + (isNew ? " card-new" : "");
    d.innerHTML = '<div class="v">' + card.rank + '</div><div class="s">' + card.suit + '</div>';
  }
  return d;
}
function renderCardBackMini(){ const d = document.createElement("div"); d.className = "mini-card"; return d; }
function posCls(k){
  if(!k) return "";
  if(k === "posBTNSB" || k === "posBTN") return "btn";
  if(k === "posSB") return "sb";
  if(k === "posBB") return "bb";
  return "";
}

function render(){
  const container = $("seatsLayer");
  if(!container) return;
  if(G.online.active && G.stage === 'waiting'){
    renderWaitingTable(container);
    const bc = document.getElementById('boardCards'); if(bc) bc.innerHTML = '';
    const pm = document.getElementById('potMain'); if(pm) pm.textContent = '0';
    const pc = document.getElementById('potChips'); if(pc) pc.innerHTML = '';
    const ps = document.getElementById('potSideWrap'); if(ps) ps.classList.add('hidden');
    const handArea = document.getElementById('handCardsLarge'); if(handArea) handArea.innerHTML = '';
    const sl = document.getElementById('stageLabel');
    if(sl) sl.textContent = isEn() ? 'Waiting' : '等待中';
    updateSpectatorUI();
    return;
  }
  if(!G.players.length) return;
  for(let i = 0; i < G.players.length; i++){
    const p = G.players[i];
    const style = p.isHuman ? null : PokerAI.STYLES[p.styleKey];
    let seat = container.querySelector('.seat[data-pid="' + p.id + '"]');
    const pos = G.seatPositions[i] || { x:50, y:50 };
    if(!seat){
      seat = document.createElement("div");
      seat.className = "seat";
      seat.setAttribute("data-pid", p.id);
      container.appendChild(seat);
    }
    seat.style.left = pos.x + "%";
    seat.style.top = pos.y + "%";
    seat.classList.toggle("folded", (!!p.folded || p.seated === false) && !p.revealCards);
    seat.classList.toggle("reveal", !!p.revealCards);
    seat.classList.toggle("empty", p.seated === false);
    seat.classList.toggle("intent-reveal", !!p._intentReveal);
seat.classList.toggle("winner", !!p._isWinner && G.stage === 'showdown' && p._winnerType !== 'refund');
seat.classList.toggle("winner-main", p._winnerType === 'main' && G.stage === 'showdown');
seat.classList.toggle("winner-side", p._winnerType === 'side' && G.stage === 'showdown');
// ★ refund 类型不亮任何杯
    seat.classList.toggle("spectating", !!p._spectator);
    /* ★ 新增：All-in 玩家红色高亮 */updateSpectatorUI();
    seat.classList.toggle("all-in", !!p.allIn && !p.folded && p.seated !== false);
    /* ★ 新增：告诉 CSS 筹码堆应该朝哪个方向浮出 */
    seat.setAttribute("data-chip-side", computeChipSideForIndex(i));

    const isCurrentTurn = (G.currentPlayerIndex === i)
      && !G.gameOver
      && !p.folded
      && G.stage !== "showdown"
      && G.stage !== "waiting"
      && p.seated !== false;
    const isMe = (i === myIndex());
    seat.classList.toggle("active", isCurrentTurn);
    seat.classList.toggle("me", isMe && !isCurrentTurn);

    let betInfo = "";
    if(p.seated === false){
      betInfo = isEn() ? "Left" : "已离桌";
    } else {
      if(p.currentBet > 0) betInfo = t("actionBet") + " " + fmtNum(p.currentBet);
      if(p.lastAction) betInfo += (betInfo ? " · " : "") + p.lastAction;
    }
    const posHtml = p.position ? '<span class="pos-badge ' + posCls(p.positionKey) + '">' + p.position + '</span>' : '';
    let styleHtml = '';
    if(G.online.active) styleHtml = '<span class="seat-style">P2P</span>';
    else if(style) styleHtml = '<span class="seat-style">' + t(style.name) + '</span>';
    else styleHtml = '<span class="seat-style">' + t("handShort") + '</span>';

    let avatarHtml;
    if(G.online.active){
      const initial = (p.name || 'P').charAt(0).toUpperCase();
      avatarHtml = '<div class="avatar-wrap" style="background:' + p.bg + '">' + initial + '</div>';
    } else {
      avatarHtml = '<div class="avatar-wrap" style="background:' + p.bg + '">' + p.emoji + '</div>';
    }

    const stackHtml = renderChipStackHtml(p.chips, {
      maxPerColumn: 6,
      maxColumns: 3,
      wrapClass: 'chip-stack-wrap seat-stack'
    });

    const metaSig = [p.name, p.chips, betInfo, p.position, styleHtml, avatarHtml, p.seated === false ? 1 : 0, p._spectator ? 1 : 0, p._isWinner ? 1 : 0, p.revealCards ? 1 : 0].join('|');
    if(seat.getAttribute('data-meta') !== metaSig){
      const oldBubble = seat.querySelector('.chat-bubble');
      const bubbleText = oldBubble ? oldBubble.textContent : null;
      const bubbleFade = oldBubble ? oldBubble.classList.contains('fade') : false;

      seat.setAttribute('data-meta', metaSig);
      seat.innerHTML =
        '<div class="seat-head">' + avatarHtml +
          '<div class="seat-meta">' +
            '<div class="seat-name">' + p.name + '</div>' +
            '<div>' + posHtml + styleHtml + '</div>' +
          '</div>' +
        '</div>' +
        stackHtml +
        '<div class="seat-chips">' + fmtNum(p.chips) + ' ' + t("chips") + '</div>' +
        '<div class="seat-bet">' + betInfo + '</div>' +
        '<div class="seat-cards"></div>' +
        (function(){
          if(!p.revealCards || p.holeCards.length < 2 || G.community.length < 3) return '';
          try {
            const r = PokerEval.bestHand(p.holeCards.concat(G.community));
            return (r && r.score) ? '<div class="seat-hand-type">' + PokerEval.nameOf(r.score) + '</div>' : '';
          } catch(e){ return ''; }
        })();
      seat.removeAttribute('data-card-sig');

      if(bubbleText != null){
        const nb = document.createElement('div');
        nb.className = 'chat-bubble' + (bubbleFade ? ' fade' : '');
        nb.textContent = bubbleText;
        seat.appendChild(nb);
      }
    }

    const cards = seat.querySelector(".seat-cards");
    let nextCards = [];
    let showFace = false;
    const cardCount = (p.holeCards && p.holeCards.length) || p._holeCardCount || 0;
    if(p.seated === false || cardCount < 2){
      nextCards = [null, null];
    } else if(p.revealCards || i === myIndex()){
      nextCards = p.holeCards;
      showFace = true;
    } else {
      nextCards = [null, null];   // 别人：画背面
    }
    const cardSig = (showFace ? 'F:' : 'B:') + cardsSig(nextCards);
    if(cards && seat.getAttribute('data-card-sig') !== cardSig){
      seat.setAttribute('data-card-sig', cardSig);
      cards.innerHTML = "";
      if(!showFace){
        const a = renderCardBackMini();
        const b = renderCardBackMini();
        if(p.seated === false || p.folded || cardCount < 2){
          a.style.opacity = ".2"; b.style.opacity = ".2";
        }
        cards.appendChild(a); cards.appendChild(b);
      } else {
        p.holeCards.forEach(function(c){
          cards.appendChild(renderCardEl(c, true, p._highlight && p._highlight.has(c)));
        });
      }
    }
  }
  Array.prototype.slice.call(container.querySelectorAll('.seat')).forEach(function(el){
    const pid = el.getAttribute('data-pid');
    const exists = G.players.some(function(p){ return String(p.id) === String(pid); });
    if(!exists) el.remove();
  });

  const bc = $("boardCards");
  if(bc){
    const hlSet = new Set();
    G.players.forEach(function(p){ if(p._highlight) p._highlight.forEach(function(c){ hlSet.add(c); }); });
    const boardSig = cardsSig(G.community) + '|' + G.community.map(function(c){ return hlSet.has(c) ? 1 : 0; }).join('');
    if(G._lastBoardSig !== boardSig){
      G._lastBoardSig = boardSig;
      bc.innerHTML = "";
      G.community.forEach(function(c){ bc.appendChild(renderCardEl(c, false, hlSet.has(c))); });
    }
  }

  renderHumanHand();

  const pots = calculateSidePots();
  const pm = $("potMain");
  if(pm) pm.textContent = fmtNum(G.pot);

  const psw = $("potSideWrap"), ps = $("potSide");
  if(psw && ps){
    if(pots.length > 1){
      const sideTotal = pots.slice(1).reduce(function(a, p){ return a + p.amount; }, 0);
      ps.textContent = fmtNum(sideTotal);
      psw.classList.remove("hidden");
    } else {
      psw.classList.add("hidden");
    }
  }

  const potChips = $("potChips");
  if(potChips){
    potChips.innerHTML = renderChipStackHtml(G.pot, {
      maxPerColumn: 8,
      maxColumns: 5,
      wrapClass: 'pot-chips-inner'
    });
  }

  const sl = $("stageLabel");
  if(sl) sl.textContent = t(STAGE_KEYS[G.stage] || "stagePreflop");
  updateHandInfo();
  updateSpectatorUI();
  // ★ 新增：Showdown 时显示结算面板
if(G.stage === 'showdown'){
  const totalWinners = G.players.filter(function(p){ return p._isWinner && p._winAmount > 0; });
  if(totalWinners.length > 0 && !G._settlementShown){
    G._settlementShown = true;
    showSettlementPanel(G.players);
  }
} else {
  G._settlementShown = false;
}

  const meIdx = myIndex();
  const meNow = (meIdx >= 0) ? G.players[meIdx] : null;
  const myTurn = (G.currentPlayerIndex === meIdx)
    && meNow && meNow.seated !== false && !meNow.folded && !meNow.allIn
    && G.stage !== 'showdown' && G.stage !== 'waiting' && !G.gameOver;
  if(!myTurn){
    hideHumanActions();
  } else {
    const box = $("humanActions");
    if(box && box.childNodes.length === 0) showHumanControls();
  }
  // ★ Showdown 时给每个座位飘 +N / −N 数字
if(G.stage === 'showdown' && G._settled && !G._deltaShown){
  G._deltaShown = true;
  G._deltaShown = true;
G.players.forEach(function(p){
  if(p.seated === false) return;
  let delta = 0;
  let isRefund = false;
  if(p._isWinner && p._winAmount > 0){
    // 判断是否全部都是返还
    const allRefund = p._winPots && p._winPots.length > 0 &&
                     p._winPots.every(function(wp){ return wp.isRefund; });
    if(allRefund){
      delta = p._winAmount;
      isRefund = true;
    } else {
      // 有真赢的部分，正常显示
      delta = p._winAmount;
    }
  } else if(!p.folded && p.totalContributed > 0){
    delta = -p.totalContributed;
  }
  if(delta === 0) return;
  showSeatDelta(p.id, delta, isRefund);
});
} else if(G.stage !== 'showdown'){
  G._deltaShown = false;
}
}

function renderWaitingTable(container){
  Array.prototype.slice.call(container.querySelectorAll('.seat')).forEach(function(el){ el.remove(); });
  Array.prototype.slice.call(container.querySelectorAll('.seat-empty-slot')).forEach(function(el){ el.remove(); });
  const myId = window.PokerOnline ? PokerOnline.getMyId() : null;
  const players = window.PokerOnline ? PokerOnline.getRoomPlayers() : {};
  const seatPositions = computeSeatPositions(ONLINE_MAX_SEATS);
  for(let seatIdx = 0; seatIdx < ONLINE_MAX_SEATS; seatIdx++){
    let p = null;
    for(const pid in players){
      if(players[pid].seat === seatIdx && players[pid].role === 'seated'){ p = { peerId: pid, info: players[pid] }; break; }
    }
    const pos = seatPositions[seatIdx] || { x:50, y:50 };
    if(!p){
      const empty = document.createElement("div");
      empty.className = "seat empty seat-empty-slot";
      empty.setAttribute("data-seat", seatIdx);
      empty.style.left = pos.x + "%";
      empty.style.top = pos.y + "%";
      empty.innerHTML = '<div class="empty-label">' + (isEn() ? 'Empty' : '空位') + '</div>';
      container.appendChild(empty);
      continue;
    }
    const isSelf = p.peerId === myId;
    const seat = document.createElement("div");
    seat.className = "seat";
    seat.setAttribute("data-seat", seatIdx);
    seat.style.left = pos.x + "%";
    seat.style.top = pos.y + "%";
    if(isSelf) seat.classList.add("active");
    const initial = (p.info.name || 'P').charAt(0).toUpperCase();
    const bg = isSelf ? PokerAvatars.HUMAN.bg : 'linear-gradient(135deg,#a855f7,#6d28d9)';
    const readyBadge = p.info.ready
      ? '<div class="ready-badge">✓ ' + (isEn() ? 'Ready' : '已准备') + '</div>'
      : '<div class="not-ready-badge">' + (isEn() ? 'Waiting' : '未准备') + '</div>';
    seat.innerHTML =
      readyBadge +
      '<div class="seat-head">' +
        '<div class="avatar-wrap" style="background:' + bg + '">' + initial + '</div>' +
        '<div class="seat-meta">' +
          '<div class="seat-name">' + p.info.name + (isSelf ? (isEn() ? ' (you)' : ' (你)') : '') + '</div>' +
          '<div><span class="seat-style">P2P</span></div>' +
        '</div>' +
      '</div>' +
            '<div class="seat-chips">' + fmtNum((G._onlineLv || { buyMax: 10000 }).buyMax) + ' ' + t("chips") + '</div>' +
      '<div class="seat-bet">' + (isEn() ? 'Seat ' : '座位 ') + (seatIdx + 1) + '</div>';
    container.appendChild(seat);
  }
}
/* ★ 阶段2b：把缓存的底牌填入玩家 */
function tryApplyPendingHoles(){
  if(!G._pendingHoleCards) return false;
  let applied = false;
  const myId = window.PokerOnline ? PokerOnline.getMyId() : null;
  for(const peerId in G._pendingHoleCards){
    const cards = G._pendingHoleCards[peerId];
    if(!cards || cards.length !== 2) continue;
    const idx = G.players.findIndex(function(p){ return p.peerId === peerId; });
    if(idx >= 0){
      const p = G.players[idx];
      const needWrite = !p.holeCards || p.holeCards.length < 2;
      if(needWrite){
        p.holeCards = normalizeCards(cards);
        applied = true;
        console.log('[pending] 已填入底牌:', peerId, cards.map(function(c){return c.rank+c.suit;}).join(' '));
      }
      if(peerId === myId){
        if(G.online.mySeat !== idx){
          G.online.mySeat = idx;
          G._spectatorMode = false;
          console.log('[pending] 强制设置 mySeat =', idx);
        }
        G._currentHandMyCards = cards.map(function(c){ return c.suit + c.rank; });
      }
      // ★ 不删缓存，等 handNumber 变化时统一清
    }
  }
  if(applied){
    G._lastHandSig = '';
    G._lastStateSig = '';
  }
  return applied;
}

function renderHumanHand(){
  const meIdx = myIndex();
  let me = (meIdx >= 0) ? G.players[meIdx] : null;
  // ★ 关键：如果 mySeat 无效，尝试用 peerId 找回自己
  const myId2 = window.PokerOnline ? PokerOnline.getMyId() : null;
  if(!me && myId2){
    const idx2 = G.players.findIndex(function(p){ return p.peerId === myId2; });
    if(idx2 >= 0){
      G.online.mySeat = idx2;
      G._spectatorMode = false;
      me = G.players[idx2];
    }
  }
  const c = $("handCardsLarge");
  if(!c) return;

  /* ★ 无论手牌是否变化，都要更新牌型标签 */
  updateHandTypeBadge(me);

  const bem = $("handBem");
  if(bem) bem.textContent = G.gameMode === 'real'
    ? "≈ " + toBem(me ? me.chips : 0) + " BEM"
    : fmtNum(me ? me.chips : 0) + (isEn() ? " chips" : " 筹码");

  if(!me){ c.innerHTML = ""; return; }
    // ★ 阶段2b：如果自己还没牌，尝试从 pending 填充
  if(me && (!me.holeCards || me.holeCards.length < 2)){
    const myPeerId = window.PokerOnline ? PokerOnline.getMyId() : null;
    if(myPeerId && G._pendingHoleCards && G._pendingHoleCards[myPeerId]){
      const cards = G._pendingHoleCards[myPeerId];
      if(cards && cards.length === 2){
        me.holeCards = normalizeCards(cards);
        G._lastHandSig = '';
      }
    }
  }
  let sig;
  if(me.folded || me._spectator || me.holeCards.length < 2 || G.stage === 'waiting') sig = 'empty';
  else sig = cardsSig(me.holeCards) + '|' + (me._highlight ? cardsSig(Array.from(me._highlight)) : '');
  if(G._lastHandSig === sig) return;
  G._lastHandSig = sig;
  c.innerHTML = "";
  if(sig === 'empty'){
    const a = document.createElement("div"); a.className = "card"; a.style.opacity = ".2";
    const b = document.createElement("div"); b.className = "card"; b.style.opacity = ".2";
    c.appendChild(a); c.appendChild(b);
    return;
  }
  me.holeCards.forEach(function(card){
    const d = document.createElement("div");
    d.className = "card " + (card.red ? "red" : "black") + (me._highlight && me._highlight.has(card) ? " highlight" : "");
    d.innerHTML = '<div class="v">' + card.rank + '</div><div class="s">' + card.suit + '</div>';
    c.appendChild(d);
  });
}

/* ★ 新增：更新手牌下方牌型标签 */
function updateHandTypeBadge(me){
  const typeEl = document.getElementById('handTypeBadge');
  if(!typeEl) return;
  if(!me || me.folded || me._spectator
     || G.stage === 'waiting'
     || G.community.length < 3
     || me.holeCards.length < 2){
    typeEl.classList.add('hidden');
    return;
  }
  try {
    const r = PokerEval.bestHand(me.holeCards.concat(G.community));
    if(r && r.score){
      typeEl.textContent = PokerEval.nameOf(r.score);
      typeEl.classList.remove('hidden');
    } else {
      typeEl.classList.add('hidden');
    }
  } catch(e){
    typeEl.classList.add('hidden');
  }
}

function updateHandInfo(){
  const el = $("handInfo");
  if(!el) return;
  if(!G.players.length){ el.innerHTML = ""; return; }
  const meIdx = myIndex();
  const me = (meIdx >= 0) ? G.players[meIdx] : null;
  if(!me){ el.innerHTML = ""; return; }
  const toCall = Math.max(0, G.currentBet - (me.currentBet || 0));
  el.innerHTML =
    '<div class="row"><span>' + t("infoHand") + '</span><strong>#' + G.handNumber + '</strong></div>' +
    '<div class="row"><span>' + t("infoStage") + '</span><strong>' + t(STAGE_KEYS[G.stage] || "stagePreflop") + '</strong></div>' +
    '<div class="row"><span>' + t("infoPot") + '</span><strong>' + fmtNum(G.pot) + '</strong></div>' +
    '<div class="row"><span>' + t("infoYourBet") + '</span><strong>' + fmtNum(me.currentBet || 0) + '</strong></div>' +
    '<div class="row"><span>' + t("infoToCall") + '</span><strong>' + fmtNum(toCall) + '</strong></div>';
}

function showHumanControls(){
  const meIdx = myIndex();
  const me = (meIdx >= 0) ? G.players[meIdx] : null;
  if(!me) return;
  const box = $("humanActions");
  const panel = $("raisePanel");
  if(!box || !panel) return;
  if(G.stage === 'waiting' || me.seated === false || me.folded || me.allIn || me.chips <= 0 || G.currentPlayerIndex !== myIndex()){
    hideHumanActions();
    return;
  }
  const sig = buildActionSig();
  const raiseOpen = !panel.classList.contains("hidden");
  if(raiseOpen) return;
  if(G._lastActionSig === sig && box.childNodes.length) return;
  G._lastActionSig = sig;
  box.innerHTML = "";
  const toCall = Math.max(0, G.currentBet - me.currentBet);
  const canCheck = toCall === 0;
  const foldBtn = document.createElement("button");
  foldBtn.className = "danger";
  foldBtn.textContent = t("actionFold");
  foldBtn.onclick = function(){ doHumanAction({ type:"fold" }); };
  box.appendChild(foldBtn);
  const callBtn = document.createElement("button");
  callBtn.textContent = canCheck ? t("actionCheck") : (t("actionCall") + " " + fmtNum(Math.min(me.chips, toCall)));
  callBtn.onclick = function(){ doHumanAction({ type:"call" }); };
  box.appendChild(callBtn);
  if(me.chips > toCall){
    const raiseBtn = document.createElement("button");
    raiseBtn.textContent = canCheck ? t("actionBetMenu") : t("actionRaise");
    raiseBtn.onclick = openBubbleBetPanel;
    box.appendChild(raiseBtn);
  }

  setTimeout(function(){
    const sr = document.querySelector('.side-right');
    if(sr && sr.scrollHeight > sr.clientHeight){
      try { sr.scrollTo({ top: sr.scrollHeight, behavior: 'smooth' }); }
      catch(e){ sr.scrollTop = sr.scrollHeight; }
    }
  }, 120);
}
/* ================= 气泡式下注面板 ================= */
function openBubbleBetPanel(){
  const me = G.players[myIndex()];
  if(!me) return;
  const oldBet = G.currentBet;
  const max = me.chips + me.currentBet;
  let minT;
  if(oldBet === 0) minT = G.bigBlind;
  else minT = oldBet * 2;
  if(minT > max) minT = max;
  if(max <= oldBet) return;

  closeBubbleBetPanel();

  const backdrop = document.createElement('div');
  backdrop.className = 'bubble-backdrop';
  backdrop.id = 'bubbleBackdrop';
  backdrop.onclick = closeBubbleBetPanel;
  document.body.appendChild(backdrop);
  requestAnimationFrame(function(){ backdrop.classList.add('show'); });

  const panel = document.createElement('div');
  panel.id = 'bubbleBetPanel';
  panel.className = 'bubble-bet-panel';

  const toCall = Math.max(0, oldBet - (me.currentBet || 0));
  const isFirstBettor = (oldBet === 0);

  /* ★ 根据场景切换预设 */
  let presets;
  if(isFirstBettor){
    /* 场景 A：第一个下注者 — 用"几分之几池" */
    presets = [
      { label: '1/3池', ratio: 1/3, mode: 'pot-bet' },
      { label: '1/2池', ratio: 0.5, mode: 'pot-bet' },
      { label: '2/3池', ratio: 2/3, mode: 'pot-bet' },
      { label: '1池',   ratio: 1.0, mode: 'pot-bet' },
      { label: '1.5池', ratio: 1.5, mode: 'pot-bet' },
      { label: '2池',   ratio: 2.0, mode: 'pot-bet' },
      { label: '3池',   ratio: 3.0, mode: 'pot-bet' }
    ];
  } else {
    /* 场景 B：面对前位下注 — 倍数 + 池倍加注 */
    presets = [
      { label: '2x',   ratio: 2.0, mode: 'mult' },
      { label: '3x',   ratio: 3.0, mode: 'mult' },
      { label: '4x',   ratio: 4.0, mode: 'mult' },
      { label: '满池',  ratio: 1.0, mode: 'pot-raise' },
      { label: '1.5池', ratio: 1.5, mode: 'pot-raise' },
      { label: '2池',   ratio: 2.0, mode: 'pot-raise' },
      { label: '3池',   ratio: 3.0, mode: 'pot-raise' }
    ];
  }

  /* 中心紫球：跳老版精确输入 */
  const center = document.createElement('div');
  center.className = 'bubble-center';
  center.innerHTML = '<div class="bc-label">' + (isEn() ? 'Custom' : '具体加注') + '</div>'
                   + '<div class="bc-amt">' + fmtNum(minT) + '</div>';
  center.onclick = function(ev){
    ev.stopPropagation();
    closeBubbleBetPanel();
    openRaisePanel();
  };
  panel.appendChild(center);

  const panelW = panel.offsetWidth || 380;
  const panelH = panel.offsetHeight || 380;
  const cx = panelW / 2;
  const cy = panelH;
  const isPortrait = G.isMobile && G.orientation === 'portrait';
  const r = isPortrait ? 120 : 140;

  /* ★ 三种模式分别计算 */
  function computeBubbleTarget(preset){
    let target;
    if(preset.mode === 'pot-bet'){
      /* 场景 A：直接下注 pot × ratio */
      target = Math.floor(G.pot * preset.ratio);
    } else if(preset.mode === 'mult'){
      /* 场景 B：当前下注 × 倍数 */
      target = Math.floor(oldBet * preset.ratio);
    } else if(preset.mode === 'pot-raise'){
      /* 场景 B：标准 pot-sized raise */
      /* target = currentBet + (pot + toCall) × ratio */
      target = oldBet + Math.floor((G.pot + toCall) * preset.ratio);
    } else {
      target = minT;
    }
    if(target < minT) target = minT;
    if(target > max) target = max;
    return target;
  }

  const n = presets.length;
  const angleStart = -75, angleEnd = 75;
  presets.forEach(function(p, i){
    const angle = n === 1 ? 0 : (angleStart + (angleEnd - angleStart) * (i / (n - 1)));
    const target = computeBubbleTarget(p);
    if(target <= 0) return;

    const rad = angle * Math.PI / 180;
    const x = cx + r * Math.sin(rad);
    const y = cy - r * Math.cos(rad);

    const item = document.createElement('div');
    item.className = 'bubble-item';
    item.style.left = x + 'px';
    item.style.top = y + 'px';
    item.style.transform = 'translate(-50%, -50%)';
    item.innerHTML = '<div class="bi-label">' + p.label + '</div>'
                   + '<div class="bi-amt">' + fmtNum(target) + '</div>';
    item.onclick = function(ev){
      ev.stopPropagation();
      closeBubbleBetPanel();
      if(window.PokerAudio) PokerAudio.play('click');
      doHumanAction({ type: 'raise', target: target });
    };
    panel.appendChild(item);
  });

  /* ALL IN 单独放最右侧 */
  const allinAngle = 96;
  const allinRad = allinAngle * Math.PI / 180;
  const allinX = cx + r * Math.sin(allinRad);
  const allinY = cy - r * Math.cos(allinRad);
  const allinItem = document.createElement('div');
  allinItem.className = 'bubble-item allin';
  allinItem.style.left = allinX + 'px';
  allinItem.style.top = allinY + 'px';
  allinItem.style.transform = 'translate(-50%, -50%)';
  allinItem.innerHTML = '<div class="bi-label">ALL IN</div>'
                      + '<div class="bi-amt">' + fmtNum(max) + '</div>';
  allinItem.onclick = function(ev){
    ev.stopPropagation();
    closeBubbleBetPanel();
    if(window.PokerAudio) PokerAudio.play('click');
    doHumanAction({ type: 'raise', target: max });
  };
  panel.appendChild(allinItem);

  document.body.appendChild(panel);
  requestAnimationFrame(function(){ panel.classList.add('show'); });

  if(window.PokerAudio) PokerAudio.play('click');
}

function closeBubbleBetPanel(){
  const panel = document.getElementById('bubbleBetPanel');
  const backdrop = document.getElementById('bubbleBackdrop');
  if(panel){
    panel.classList.remove('show');
    setTimeout(function(){ if(panel.parentNode) panel.remove(); }, 220);
  }
  if(backdrop){
    backdrop.classList.remove('show');
    setTimeout(function(){ if(backdrop.parentNode) backdrop.remove(); }, 220);
  }
}

function computePresetTarget(ratio, oldBet, potAfter, minT, max){
  const unit = oldBet === 0 ? G.bigBlind : oldBet;
  const extra = Math.max(unit, Math.floor(potAfter * ratio));
  let target = oldBet === 0 ? extra : (oldBet + extra);
  if(target < minT) target = minT;
  if(target > max) target = max;
  return target;
}

function openRaisePanel(){
  const me = G.players[myIndex()];
  const panel = $("raisePanel");
  const oldBet = G.currentBet;
  const max = me.chips + me.currentBet;
  let minT;
  if(oldBet === 0){ minT = G.bigBlind; }
  else { minT = oldBet * 2; }
  if(minT > max) minT = max;
  if(max <= oldBet) return;
  G.raiseMin = minT; G.raiseMax = max;
  const sl = $("raiseSlider"); if(sl) sl.value = 0;
  const inp = $("raiseInput");
  if(inp){ inp.min = minT; inp.max = max; inp.value = minT; }
  const a = $("raiseMinLabel"), b = $("raiseMaxLabel");
  if(a) a.textContent = fmtNum(minT);
  if(b) b.textContent = fmtNum(max);
  updateRaiseAmount();
  panel.classList.remove("hidden");
  if(window.PokerAudio) PokerAudio.play('click');

  setTimeout(function(){
    const panel2 = document.getElementById('raisePanel');
    if(panel2){
      try { panel2.scrollIntoView({ block: 'end', behavior: 'smooth' }); }
      catch(e){ panel2.scrollIntoView(false); }
    }
  }, 80);
}

function updateRaiseAmount(){
  const sl = $("raiseSlider"), d = $("raiseAmountValue"), inp = $("raiseInput");
  if(!sl || !d) return;
  const pct = parseInt(sl.value, 10) / 1000;
  const val = Math.round(G.raiseMin + (G.raiseMax - G.raiseMin) * pct);
  d.textContent = fmtNum(val);
  if(inp && document.activeElement !== inp) inp.value = val;
}

function bindRaiseInputEvents(){
  const inp = $("raiseInput"), sl = $("raiseSlider"), d = $("raiseAmountValue");
  if(inp){
    inp.addEventListener("input", function(){
      let v = parseInt(inp.value, 10);
      if(isNaN(v)) v = G.raiseMin;
      v = Math.max(G.raiseMin, Math.min(G.raiseMax, v));
      const range = G.raiseMax - G.raiseMin;
      const pct = range <= 0 ? 1000 : Math.round((v - G.raiseMin) / range * 1000);
      if(sl) sl.value = pct;
      if(d) d.textContent = fmtNum(v);
    });
    inp.addEventListener("blur", function(){
      let v = parseInt(inp.value, 10);
      if(isNaN(v)) v = G.raiseMin;
      v = Math.max(G.raiseMin, Math.min(G.raiseMax, v));
      inp.value = v;
    });
  }
  const minus = $("raiseMinusBtn"), plus = $("raisePlusBtn");
  if(minus) minus.onclick = function(){
    const cur = parseInt(inp.value, 10) || G.raiseMin;
    const step = Math.max(1, Math.round((G.raiseMax - G.raiseMin) / 20));
    const v = Math.max(G.raiseMin, cur - step);
    inp.value = v;
    inp.dispatchEvent(new Event('input'));
  };
  if(plus) plus.onclick = function(){
    const cur = parseInt(inp.value, 10) || G.raiseMin;
    const step = Math.max(1, Math.round((G.raiseMax - G.raiseMin) / 20));
    const v = Math.min(G.raiseMax, cur + step);
    inp.value = v;
    inp.dispatchEvent(new Event('input'));
  };
}

function applyRaisePreset(preset){
  const me = G.players[myIndex()];
  if(!me) return;
  const panel = $("raisePanel");
  if(panel && panel.classList.contains("hidden")){
    openRaisePanel();
    if(panel.classList.contains("hidden")) return;
  }
  const oldBet = G.currentBet;
  const toCall = Math.max(0, oldBet - (me.currentBet || 0));
  const potAfter = G.pot + toCall;
  const max = G.raiseMax;
  const minT = G.raiseMin;
  const unit = oldBet === 0 ? G.bigBlind : oldBet;
  let target;

  if(preset === 'allin'){
    target = max;
  } else if(preset === 'twoX' || preset === 'threeX' || preset === 'fourX'){
    const mult = preset === 'twoX' ? 2 : (preset === 'threeX' ? 3 : 4);
    if(oldBet === 0){
      target = G.bigBlind * mult;
    } else {
      target = oldBet * mult;
    }
    if(target < minT) target = minT;
    if(target > max) target = max;
  } else {
    let ratio;
    switch(preset){
      case 'quarter': ratio = 0.25; break;
      case 'third': ratio = 1/3; break;
      case 'half': ratio = 0.5; break;
      case 'twoThird': ratio = 2/3; break;
      case 'threeQuarter': ratio = 0.75; break;
      case 'pot': ratio = 1.0; break;
      default: ratio = 0.5;
    }
    const extra = Math.max(unit, Math.floor(potAfter * ratio));
    target = oldBet === 0 ? extra : (oldBet + extra);
    if(target < minT) target = minT;
    if(target > max) target = max;
  }
  const range = max - minT;
  const pct = range <= 0 ? 1 : (target - minT) / range;
  const sl = $("raiseSlider");
  if(sl){ sl.value = Math.round(pct * 1000); updateRaiseAmount(); }
  const d = $("raiseAmountValue");
  if(d) d.textContent = fmtNum(target);
  const inp = $("raiseInput");
  if(inp) inp.value = target;
  if(window.PokerAudio) PokerAudio.play('click');
}

function doHumanAction(action){
  const me = G.players[myIndex()];
  if(!me || me.folded || me.allIn || me.seated === false) return;
  if(G.stage === 'waiting') return;
  if(G.currentPlayerIndex !== myIndex()) return;
  stopTurnTimer();
  clearAllGameTimers();
  hideHumanActions();
  if(action.type === 'fold' || action.type === 'check' || action.type === 'call'){
    playActionSound(action);
  }
  /* raise 音效由 executeAction 内部选择 */
  if(G.online.active && !G.online.isHost){
    // ★ 显示"签名中"提示
    showSigningHint(true);
    const payload = {
      playerId: PokerOnline.getMyId(),
      action: action,
      handNumber: G.handNumber,
      stage: G.stage
    };
    PokerOnline.sendPlayerActionSigned(payload).then(function(){
      showSigningHint(false);
    }).catch(function(err){
      console.error('[doHumanAction] sign failed', err);
      showSigningHint(false);
    });
    return;
  }
  executeAction(me, action);
  render();
  if(G.online.active && G.online.isHost){
    broadcastFullState();
    runHostTurn();
  } else {
    runTurnAi();
  }
}

function startTurnTimer(player){
  if(!player || !player.isHuman) return;
  if(G.turnTimer) return;
  G.turnTimeLeft = 30;
  updateTimerUI();
  const tt = $("turnTimer"); if(tt) tt.classList.remove("hidden");
  G.turnTimer = setInterval(function(){
    G.turnTimeLeft -= 0.1;
    if(G.turnTimeLeft <= 0){
      stopTurnTimer();
      const me = G.players[myIndex()];
      if(me && !me.folded && !me.allIn && me.seated !== false){
        log(t("timeoutFold", { name:me.name }), "action");
        doHumanAction({ type:"fold" });
      }
      return;
    }
    const secLeft = Math.ceil(G.turnTimeLeft);
    if(secLeft <= 5 && secLeft > 0 && secLeft !== G._lastTickSecond){
      G._lastTickSecond = secLeft;
      if(window.PokerAudio) PokerAudio.play('tick');
    }
    updateTimerUI();
  }, 100);
}
function stopTurnTimer(){
  if(G.turnTimer){ clearInterval(G.turnTimer); G.turnTimer = null; }
  if(G._turnTickTimer){ clearInterval(G._turnTickTimer); G._turnTickTimer = null; }
  G._timerKey = null; G._lastTickSecond = 0;
  const tt = $("turnTimer"); if(tt) tt.classList.add('hidden');
}
function updateTimerUI(){
  const f = $("timerFill"), t2 = $("timerText");
  if(!f || !t2) return;
  const pct = Math.max(0, G.turnTimeLeft / 30) * 100;
  f.style.width = pct + "%";
  t2.textContent = Math.ceil(Math.max(0, G.turnTimeLeft)) + "s";
  if(G.turnTimeLeft <= 5){ f.classList.add("warn"); t2.classList.add("warn"); }
  else { f.classList.remove("warn"); t2.classList.remove("warn"); }
}

/* ================= 聊天 & 表情 ================= */
function appendChat(name, text, self){
  const el = document.getElementById('chatMessages');
  if(!el) return;
  const div = document.createElement('div');
  div.className = 'chat-msg' + (self ? ' self' : '');
  div.innerHTML = '<span class="chat-name">' + escapeHtml(name) + '</span><span class="chat-text">' + escapeHtml(text) + '</span>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  while(el.childNodes.length > 50) el.removeChild(el.firstChild);
}

function showSeatBubble(peerIdOrSeatId, text, usePeerId){
  if(!text) return;
  const found = usePeerId
    ? G.players.findIndex(function(p){ return p.peerId === peerIdOrSeatId; })
    : G.players.findIndex(function(p){ return String(p.id) === String(peerIdOrSeatId); });
  if(found < 0) return;
  const p = G.players[found];
  const seat = document.querySelector('.seat[data-pid="' + p.id + '"]');
  if(!seat) return;

  const old = seat.querySelector('.chat-bubble');
  if(old) old.remove();

  let display = String(text);
  if(display.length > 24) display = display.slice(0, 24) + '…';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = display;
  seat.appendChild(bubble);

  const fadeTimer = setTimeout(function(){ bubble.classList.add('fade'); }, 1600);
  const removeTimer = setTimeout(function(){
    if(bubble.parentNode) bubble.remove();
  }, 2000);

  bubble._fadeTimer = fadeTimer;
  bubble._removeTimer = removeTimer;
}

function clearAllBubbles(){
  document.querySelectorAll('.chat-bubble').forEach(function(b){
    if(b._fadeTimer) clearTimeout(b._fadeTimer);
    if(b._removeTimer) clearTimeout(b._removeTimer);
    b.remove();
  });
}

function initChat(){
  const fab = document.getElementById('chatFab');
  const panel = document.getElementById('chatPanel');
  const closeBtn = document.getElementById('chatCloseBtn');
  const sendBtn = document.getElementById('chatSendBtn');
  const input = document.getElementById('chatInput');
  const quick = document.getElementById('chatQuick');

  if(fab) fab.onclick = function(){
    panel.classList.toggle('hidden');
    if(window.PokerAudio) PokerAudio.play('click');
  };
  if(closeBtn) closeBtn.onclick = function(){ panel.classList.add('hidden'); };

  function doSend(text){
    text = (text || '').trim();
    if(!text) return;
    if(text.length > 80) text = text.slice(0, 80);
    const me = G.players[myIndex()];
    const myName = (me && me.name) || 'Me';
    appendChat(myName, text, true);
    if(G.online.active && window.PokerOnline){
      showSeatBubble(PokerOnline.getMyId(), text, true);
      PokerOnline.sendChat({ peerId: PokerOnline.getMyId(), name: myName, text: text });
    } else if(me){
      showSeatBubble(me.id, text, false);
    }
    if(input) input.value = '';
  }

  if(sendBtn) sendBtn.onclick = function(){ doSend(input.value); };
  if(input) input.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); doSend(input.value); }
  });
  if(quick) quick.addEventListener('click', function(e){
    const b = e.target.closest('button[data-quick]');
    if(!b) return;
    const raw = b.getAttribute('data-quick');
    const text = raw && raw.indexOf('quick') === 0 ? t(raw) : raw;
    doSend(text);
  });

  const langSel = document.getElementById('langSelect');
  if(langSel && !langSel.__chatBound){
    langSel.__chatBound = true;
    langSel.addEventListener('change', function(){
      if(input) input.placeholder = t('chatPlaceholder');
    });
  }
  if(input) input.placeholder = t('chatPlaceholder');

  document.addEventListener('pointerdown', function(e){
    const tgt = e.target;
    if(tgt && tgt.classList && tgt.classList.contains('chat-close')){
      const p = document.getElementById('chatPanel');
      if(p) p.classList.add('hidden');
      e.preventDefault();
      e.stopPropagation();
      if(window.PokerAudio) PokerAudio.play('click');
    }
  }, true);

  document.addEventListener('pointerdown', function(e){
    const p = document.getElementById('chatPanel');
    if(!p || p.classList.contains('hidden')) return;
    const f = document.getElementById('chatFab');
    if(f && f.contains(e.target)) return;
    if(p.contains(e.target)) return;
    p.classList.add('hidden');
  }, true);

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      const p = document.getElementById('chatPanel');
      if(p) p.classList.add('hidden');
    }
  });
}

/* ================= 局内历史 ================= */
function renderHistoryList(list){
  if(!list.length){
    return '<div class="ingame-history-empty">' + (isEn() ? 'No hands yet' : '还没有记录') + '</div>';
  }
  return list.map(function(rec){
    const myCardsHtml = (rec.myCards || []).map(function(s){
      const red = s.indexOf('♥') >= 0 || s.indexOf('♦') >= 0;
      return '<span class="mini-card-inline ' + (red ? 'red' : 'black') + '">' + s + '</span>';
    }).join('');
    const commHtml = (rec.community || []).map(function(s){
      const red = s.indexOf('♥') >= 0 || s.indexOf('♦') >= 0;
      return '<span class="mini-card-inline ' + (red ? 'red' : 'black') + '">' + s + '</span>';
    }).join('');
    const deltaCls = rec.delta >= 0 ? 'pos' : 'neg';
    const deltaText = (rec.delta >= 0 ? '+' : '') + fmtNum(rec.delta);
    return '<div class="ingame-history-item">' +
      '<div class="ihi-row"><b>#' + rec.handNumber + '</b><span class="ihi-result ' + deltaCls + '">' + deltaText + '</span></div>' +
      '<div class="ihi-row"><span class="ihi-label">' + (isEn()?'You':'你') + '</span>' + myCardsHtml + '</div>' +
      (commHtml ? '<div class="ihi-row"><span class="ihi-label">' + (isEn()?'Board':'公共') + '</span>' + commHtml + '</div>' : '') +
      (rec.result ? '<div class="ihi-row"><span class="ihi-label">' + (isEn()?'Hand':'成牌') + '</span><span>' + rec.result + '</span></div>' : '') +
      '</div>';
  }).join('');
}

function refreshHistoryPanelsIfOpen(){
  const list = PokerStorage.getHandHistory ? PokerStorage.getHandHistory() : [];
  const html = renderHistoryList(list);
  const el1 = document.getElementById('inGameHistory');
  const body1 = document.getElementById('inGameHistoryBody');
  if(el1 && body1 && !el1.classList.contains('hidden')){
    body1.innerHTML = html;
  }
  const el2 = document.getElementById('mobileLogPanel');
  const mBody = document.getElementById('mobileLogHistoryBody');
  if(el2 && mBody && !el2.classList.contains('hidden')){
    mBody.innerHTML = html;
  }
}

function openInGameHistory(){
  const el = document.getElementById('inGameHistory');
  const body = document.getElementById('inGameHistoryBody');
  const mobileBody = document.getElementById('mobileLogHistoryBody');
  const list = PokerStorage.getHandHistory ? PokerStorage.getHandHistory() : [];
  const html = renderHistoryList(list);
  if(el && body){
    body.innerHTML = html;
    el.classList.remove('hidden');
  }
  if(mobileBody){
    mobileBody.innerHTML = html;
  }
  if(window.PokerAudio) PokerAudio.play('click');
}
function closeInGameHistory(){
  const el = document.getElementById('inGameHistory');
  if(el) el.classList.add('hidden');
}

/* ================= 初始化 ================= */
document.addEventListener("DOMContentLoaded", function(){
  applyDeviceClass();
  let resizeTimer = null;
  function onResizeOrOrientation(){
    if(resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      applyDeviceClass();
      if(!$("gameScreen").classList.contains("hidden") && G.players.length){
        G.seatPositions = computeSeatPositions(G.players.length);
        render();
      }
    }, 180);
  }
  window.addEventListener("resize", onResizeOrOrientation);
  window.addEventListener("orientationchange", onResizeOrOrientation);
  if(window.matchMedia){
    try { window.matchMedia("(orientation: portrait)").addEventListener("change", onResizeOrOrientation); } catch(e){}
  }

  if(PokerStorage.ensureInitialPoints) PokerStorage.ensureInitialPoints();

  const saved = (function(){
    try { return localStorage.getItem('neon_holdem_lang') || 'zh'; } catch(e){ return 'zh'; }
  })();
  PokerI18n.setLang(saved);
  const ls = $("langSelect"); if(ls) ls.value = saved;
  if(ls) ls.addEventListener("change", function(){
    PokerI18n.setLang(this.value);
    try { localStorage.setItem('neon_holdem_lang', this.value); } catch(e){}
    PokerI18n.apply(document);
    document.querySelectorAll('[data-i18n-ph]').forEach(function(el){
      el.placeholder = PokerI18n.t(el.getAttribute('data-i18n-ph'));
    });
    renderLobby();
    renderNumbers();
    if(G.players.length && !$("gameScreen").classList.contains("hidden")){
      G._lastBoardSig = ''; G._lastHandSig = '';
      render();
      updateHandInfo();
    }
  });

  document.querySelectorAll(".nav-link").forEach(function(a){
    a.addEventListener("click", function(){
      if(window.PokerAudio) PokerAudio.play('click');
      showScreen(a.getAttribute("data-nav"));
    });
  });
  document.querySelectorAll(".mode-tab").forEach(function(tab){
    tab.addEventListener("click", function(){
      if(window.PokerAudio) PokerAudio.play('click');
      document.querySelectorAll(".mode-tab").forEach(function(x){ x.classList.remove("active"); });
      tab.classList.add("active");
      const mode = tab.getAttribute("data-mode");
      ["aiSection","pointsSection","realSection"].forEach(function(id){
        const el = $(id); if(el) el.classList.add("hidden");
      });
      if(mode === "ai") $("aiSection").classList.remove("hidden");
      else if(mode === "points") $("pointsSection").classList.remove("hidden");
      else { $("realSection").classList.remove("hidden"); if(window.PokerWallet) PokerWallet.updateUI(); }
      renderRoomLists();
    });
  });
  document.querySelectorAll(".seats-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(window.PokerAudio) PokerAudio.play('click');
      document.querySelectorAll(".seats-btn").forEach(function(x){ x.classList.remove("active"); });
      btn.classList.add("active");
      G.aiSeats = parseInt(btn.getAttribute("data-seats"), 10);
      renderTableGrid("aiTableGrid", "ai");
    });
  });

  if(window.PokerOnline){
    PokerOnline.init().then(function(){
      PokerOnline.setMessageCallback(handleOnlineMessage);
      PokerOnline.setPlayersCallback(function(players, info){
        updateWaitingBar();
        if(G.online.active && (G.stage === 'waiting' || !G.online.started)){
          syncWaitingSeatsFromRoom();
        }
        // ★ 房主在局中时，检测离桌并立即推进
        if(G.online.active && G.online.isHost && G.online.started && G.stage !== 'waiting'){
          checkRosterSync();
        }
        updateSpectatorUI();
        renderPlayersList();
      });
      PokerOnline.setRoomsCallback(function(){ renderRoomLists(); });
      renderLobby();
    }).catch(function(err){
      console.warn('Supabase init failed', err);
      renderLobby();
    });
  } else { renderLobby(); }

  const aiRb = $("aiRebuyBtn");
  if(aiRb) aiRb.onclick = function(){
    if(window.PokerAudio) PokerAudio.play('chip');
    const amt = parseInt($("aiRebuyAmount").value, 10);
    PokerStorage.addAiChips(amt);
    refreshBalanceUI();
  };
  const prb = $("pointsRebuyBtn");
  if(prb) prb.onclick = function(){
    if(window.PokerAudio) PokerAudio.play('chip');
    const amt = parseInt($("pointsRebuyAmount").value, 10);
    PokerStorage.addPoints(amt);
    refreshBalanceUI();
  };
  const sn = $("saveNicknameBtn");
  if(sn) sn.onclick = function(){
    if(window.PokerAudio) PokerAudio.play('click');
    const v = $("nicknameInput").value.trim();
    if(!v){ appToast(isEn() ? "Enter a nickname" : "请输入昵称", "error"); return; }
    PokerStorage.setNickname(v);
    appToast(isEn() ? ("Saved: " + v) : ("已保存：" + v), "success");
  };
  const cw = $("connectWalletBtn");
  const rc = $("realConnectBtn");
  const doConnect = async function(){
    if(window.PokerAudio) PokerAudio.play('click');
    try {
      const res = await PokerWallet.connect();
      if(res){ $("walletOverlay").classList.add("hidden"); refreshBalanceUI(); }
      else { appToast(isEn() ? "Connect failed" : "连接失败", "error"); }
    } catch(e){ console.error(e); appToast(isEn() ? "Connect failed" : "连接失败", "error"); }
  };
  if(cw) cw.onclick = doConnect;
  if(rc) rc.onclick = doConnect;

  const db = $("depositBtn");
  if(db) db.onclick = async function(){
    if(!PokerWallet.isConnected()){ appToast(isEn() ? "Connect wallet first" : "请先连接钱包", "error"); return; }
    const amt = parseFloat($("depositAmount").value);
    if(!amt || amt <= 0){ appToast(isEn() ? "Enter an amount" : "请输入充值数量", "error"); return; }
    if(amt < MIN_DEPOSIT_BEM){
      appToast(isEn() ? ("Minimum " + MIN_DEPOSIT_BEM + " BEM") : ("最低充值 " + MIN_DEPOSIT_BEM + " BEM"), "error");
      return;
    }
    try {
      const res = await PokerWallet.depositBem(amt);
      if(res && res.netChips > 0){
        refreshBalanceUI();
        $("depositAmount").value = "";
        appToast(isEn() ? ("Deposited +" + res.netChips.toLocaleString()) : ("充值成功 +" + res.netChips.toLocaleString()), "success");
      }
    } catch(err){
      console.error('[deposit]', err);
      const msg = err && (err.reason || err.shortMessage || err.message) ? (err.reason || err.shortMessage || err.message) : String(err);
      appToast((isEn() ? "Deposit failed: " : "充值失败：") + msg, "error");
    }
  };

    const wd = $("withdrawBtn");
  if(wd) wd.onclick = async function(){
    if(!PokerWallet.isConnected()){ appToast(isEn() ? "Connect wallet first" : "请先连接钱包", "error"); return; }
    const bem = parseFloat($("withdrawAmount").value);
    if(!bem || bem <= 0){ appToast(isEn() ? "Enter an amount" : "请输入提现数量", "error"); return; }
    if(bem < MIN_WITHDRAW_BEM){
      appToast(isEn() ? ("Minimum " + MIN_WITHDRAW_BEM + " BEM") : ("最低提现 " + MIN_WITHDRAW_BEM + " BEM"), "error");
      return;
    }
    const chipsNeeded = Math.ceil(bem / CHIP_TO_BEM);
    // ★ 改为从链上读取余额，不再读本地假账
    const chainBem = (window.PokerWallet ? PokerWallet.getContractBalance() : 0);
    const chainChips = Math.floor(chainBem / CHIP_TO_BEM);

    if(chainChips < chipsNeeded){
      appToast(isEn() ? ("Not enough chips. Need " + chipsNeeded.toLocaleString() + ", have " + chainChips.toLocaleString())
                      : ("筹码不足。需要 " + chipsNeeded.toLocaleString() + " 筹码，当前 " + chainChips.toLocaleString()), "error");
      return;
    }
    if(!confirm(isEn()
      ? ("Withdraw " + bem + " BEM? Will deduct " + chipsNeeded.toLocaleString() + " chips.")
      : ("确认提现 " + bem + " BEM？将扣减 " + chipsNeeded.toLocaleString() + " 筹码。"))) {
      return;
    }
    try {
      if(window.PokerAudio) PokerAudio.play('chip');
      // 调用钱包合约提现
      const res = await PokerWallet.withdrawBem(bem);
      if(res && res.txHash){
        // ★ 删除本地的 PokerStorage.setRealChips()，改为刷新链上余额
        refreshBalanceUI();
        $("withdrawAmount").value = "";
        appToast(isEn() ? ("Withdraw success: +" + bem + " BEM") : ("提现成功：+" + bem + " BEM"), "success");
      }
    } catch(err){
      console.error('[withdraw]', err);
      const msg = err && (err.reason || err.shortMessage || err.message) ? (err.reason || err.shortMessage || err.message) : String(err);
      appToast((isEn() ? "Withdraw failed: " : "提现失败：") + msg, "error");
    }
  };

  const wdInput = $("withdrawAmount");
  if(wdInput){
    wdInput.addEventListener("input", function(){
      const bem = parseFloat(this.value) || 0;
      const chips = Math.ceil(bem / CHIP_TO_BEM);
      const preview = $("withdrawPreview");
      if(preview){
        preview.textContent = bem > 0
          ? (isEn() ? ("Costs " + chips.toLocaleString() + " chips") : ("将扣 " + chips.toLocaleString() + " 筹码"))
          : (isEn() ? "Min 0.0001 BEM (= 1 chip)" : "最低 0.0001 BEM（= 1 筹码）");
      }
    });
  }
  const chb = $("clearHistoryBtn");
  if(chb) chb.onclick = function(){
    if(confirm(isEn() ? "Clear hand history?" : "清空复盘记录？")){
      PokerStorage.clearHandHistory();
      renderHandHistory();
    }
  };
  const wcb = $("walletConnectBtn");
  if(wcb) wcb.onclick = doConnect;
  const wcl = $("walletCloseBtn");
  if(wcl) wcl.onclick = function(){ $("walletOverlay").classList.add("hidden"); };
  const rnb = $("resetNumbersBtn");
  if(rnb) rnb.onclick = function(){
    if(confirm(isEn() ? "Reset all numbers?" : "确定清空所有战绩记录吗？")){
      PokerStorage.resetStats();
      renderNumbers();
    }
  };
  const fsBtn = $("fullscreenBtn");
  const updateFullscreenState = function(){
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    document.body.classList.toggle('is-fullscreen', isFs);
  };
  if(fsBtn){
    fsBtn.onclick = function(){
      if(window.PokerAudio) PokerAudio.play('click');
      const el = document.documentElement;
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
      if(!isFs){
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if(req){
          try {
            const p = req.call(el);
            if(p && p.catch) p.catch(function(e){ console.warn('fullscreen failed', e); });
          } catch(e){ console.warn('fullscreen failed', e); }
        }
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        if(exit){
          try {
            const p = exit.call(document);
            if(p && p.catch) p.catch(function(e){ console.warn('exit fullscreen failed', e); });
          } catch(e){ console.warn(e); }
        }
      }
    };
  }
  document.addEventListener('fullscreenchange', updateFullscreenState);
  document.addEventListener('webkitfullscreenchange', updateFullscreenState);
  document.addEventListener('msfullscreenchange', updateFullscreenState);

  window.addEventListener('walletConnected', function(){
    try { refreshBalanceUI(); } catch(e){ console.warn(e); }
    if(window.PokerWallet) PokerWallet.updateUI();
  });

  const back = $("backToLobbyBtn");
  if(back) back.onclick = function(){
    if(confirm(isEn() ? "Leave the table?" : "确定离桌吗？")) backToLobby();
  };
  const ngb = $("newGameBtn");
  if(ngb) ngb.onclick = function(){ $("gameOverOverlay").classList.add("hidden"); backToLobby(); };
  const rs = $("raiseSlider"); if(rs) rs.addEventListener("input", updateRaiseAmount);
  const crb = $("cancelRaiseBtn");
  if(crb) crb.onclick = function(){
    if(window.PokerAudio) PokerAudio.play('click');
    $("raisePanel").classList.add("hidden");
  };
  const cfr = $("confirmRaiseBtn");
  if(cfr) cfr.onclick = function(){
    const inp = $("raiseInput");
    let amt = parseInt(inp.value, 10);
    if(isNaN(amt)) amt = G.raiseMin;
    amt = Math.max(G.raiseMin, Math.min(G.raiseMax, amt));
    doHumanAction({ type:"raise", target:amt });
  };
  const rp = $("raisePresets");
  if(rp) rp.addEventListener("click", function(e){
    const b = e.target.closest('button[data-preset]');
    if(b) applyRaisePreset(b.getAttribute('data-preset'));
  });

  const tsb = $("takeSeatBtn");
  if(tsb) tsb.onclick = function(){
    if(window.PokerAudio) PokerAudio.play('click');
    if(!window.PokerOnline) return;
    PokerOnline.sendTakeSeat();
    appToast(isEn() ? "Will take seat next hand" : "下一局开始后自动上座", "success");
    updateSpectatorUI();
  };
  const lsb = $("leaveSeatBtn");
  if(lsb) lsb.onclick = function(){
    if(window.PokerAudio) PokerAudio.play('click');
    if(!window.PokerOnline) return;
    PokerOnline.sendLeaveSeat();
    updateSpectatorUI();
  };

  const tpb = $("togglePrivateBtn");
  if(tpb) tpb.onclick = function(){
    if(window.PokerAudio) PokerAudio.play('click');
    if(!G.online.isHost || !window.PokerOnline) return;
    const info = PokerOnline.getRoomInfo();
    const next = !info.isPrivate;
    PokerOnline.sendTogglePrivate(next);
    appToast(next ? (isEn() ? "Now private" : "已切换为私人房间") : (isEn() ? "Now public" : "已切换为公开房间"), "success");
  };

  const pob = $("playersOpenBtn");
  if(pob) pob.onclick = function(){
    if(window.PokerAudio) PokerAudio.play('click');
    renderPlayersList();
    $("playersOverlay").classList.remove("hidden");
  };
  const pcb = $("playersCloseBtn");
  if(pcb) pcb.onclick = function(){ $("playersOverlay").classList.add("hidden"); };

  const mlogFab = document.getElementById('mobileLogFab');
  const mlogPanel = document.getElementById('mobileLogPanel');
  const mlogClose = document.getElementById('mobileLogClose');
  if(mlogFab && mlogPanel){
    mlogFab.onclick = function(){
      mlogPanel.classList.toggle('hidden');
      if(!mlogPanel.classList.contains('hidden')){
        const list = PokerStorage.getHandHistory ? PokerStorage.getHandHistory() : [];
        const mBody = document.getElementById('mobileLogHistoryBody');
        if(mBody) mBody.innerHTML = renderHistoryList(list);
        const tabA = document.querySelector('.mobile-log-tab[data-tab="action"]');
        if(tabA && !tabA.classList.contains('active')) tabA.click();
      }
      if(window.PokerAudio) PokerAudio.play('click');
    };
  }
  if(mlogClose) mlogClose.onclick = function(){
    mlogPanel.classList.add('hidden');
  };
  document.querySelectorAll('.mobile-log-tab').forEach(function(tab){
    tab.onclick = function(){
      document.querySelectorAll('.mobile-log-tab').forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      const which = tab.getAttribute('data-tab');
      const bodyA = document.getElementById('mobileLogBodyAction');
      const bodyH = document.getElementById('mobileLogBodyHistory');
      if(which === 'action'){
        if(bodyA) bodyA.classList.remove('hidden');
        if(bodyH) bodyH.classList.add('hidden');
      } else {
        if(bodyA) bodyA.classList.add('hidden');
        if(bodyH) bodyH.classList.remove('hidden');
        const list = PokerStorage.getHandHistory ? PokerStorage.getHandHistory() : [];
        const mBody = document.getElementById('mobileLogHistoryBody');
        if(mBody) mBody.innerHTML = renderHistoryList(list);
      }
      if(window.PokerAudio) PokerAudio.play('click');
    };
  });

  let _zoomLevel = parseInt(localStorage.getItem('neon_holdem_zoom') || '100', 10);
  if(isNaN(_zoomLevel)) _zoomLevel = 100;
  if(_zoomLevel < 50) _zoomLevel = 50;
  if(_zoomLevel > 110) _zoomLevel = 110;

  function applyZoom(){
    const scale = _zoomLevel / 100;
    const gs = document.getElementById('gameScreen');
    if(!gs) return;
    gs.style.zoom = String(scale);
    if(scale === 1){
      gs.style.width = '';
      gs.style.height = '';
      document.body.classList.remove('zoom-active');
    } else {
      gs.style.width = (100 / scale) + 'vw';
      gs.style.height = (100 / scale) + 'dvh';
      document.body.classList.add('zoom-active');
    }
    try { localStorage.setItem('neon_holdem_zoom', String(_zoomLevel)); } catch(e){}
  }
  applyZoom();

  bindRaiseInputEvents();
  initChat();
  const hob = $("historyOpenBtn"); if(hob) hob.onclick = openInGameHistory;
  const ihc = $("inGameHistoryClose"); if(ihc) ihc.onclick = closeInGameHistory;
});
function showSettlementPanel(players){
  const winners = players.filter(function(p){ return p._isWinner && p._winAmount > 0; });
  if(!winners.length) return;

  const el = document.createElement('div');
  el.className = 'settlement-panel';

  let html = '<div class="settlement-title">' + (isEn() ? 'Settlement' : '本手结算') + '</div>';
  winners.forEach(function(p){
    const isMe = p.isHuman;
    html += '<div class="settlement-row' + (isMe ? ' me' : '') + '">';
    html += '<span class="settlement-name">🏆 ' + escapeHtml(p.name) + '</span>';
    html += '<span class="settlement-amount">+' + fmtNum(p._winAmount) + ' ' + t('chips') + '</span>';
    html += '</div>';
    // 池子明细
    if(p._winPots && p._winPots.length > 0){
      p._winPots.forEach(function(wp){
        html += '<div class="settlement-sub">· ' + wp.label + ': +' + fmtNum(wp.amount) + '</div>';
      });
    }
  });
  // 亏损玩家
  const losers = players.filter(function(p){
    return !p.folded && p.seated !== false && p.totalContributed > 0 && !p._isWinner;
  });
  if(losers.length){
    html += '<div class="settlement-divider"></div>';
    losers.forEach(function(p){
      const delta = -p.totalContributed;
      html += '<div class="settlement-row loss">';
      html += '<span class="settlement-name">' + escapeHtml(p.name) + '</span>';
      html += '<span class="settlement-amount neg">' + fmtNum(delta) + ' ' + t('chips') + '</span>';
      html += '</div>';
    });
  }
  el.innerHTML = html;

  const tableArea = document.querySelector('.table-area');
  if(tableArea) tableArea.appendChild(el);
  else document.body.appendChild(el);

  requestAnimationFrame(function(){ el.classList.add('show'); });

  setTimeout(function(){
    el.classList.remove('show');
    setTimeout(function(){ el.remove(); }, 400);
  }, 4000);
}
function showSeatDelta(seatId, delta, isRefund){
  const seat = document.querySelector('.seat[data-pid="' + seatId + '"]');
  if(!seat) return;
  const el = document.createElement('div');
  el.className = 'seat-delta ' + (isRefund ? 'refund' : (delta > 0 ? 'pos' : 'neg'));
  if(isRefund){
    el.textContent = '返还 +' + fmtNum(delta);
  } else {
    el.textContent = (delta > 0 ? '+' : '') + fmtNum(delta);
  }
  seat.appendChild(el);
  setTimeout(function(){
    el.classList.add('fade');
    setTimeout(function(){ el.remove(); }, 400);
  }, 2200);
}
/* ★ 签名中提示（防止玩家以为卡住） */
function showSigningHint(show){
  let el = document.getElementById('signingHint');
  if(show){
    if(!el){
      el = document.createElement('div');
      el.id = 'signingHint';
      el.className = 'signing-hint';
      el.textContent = (isEn() ? '✍️ Signing action...' : '✍️ 正在签名...');
      document.body.appendChild(el);
    }
    el.classList.add('show');
  } else {
    if(el){
      el.classList.remove('show');
      setTimeout(function(){ if(el.parentNode) el.remove(); }, 300);
    }
  }
}
})();
