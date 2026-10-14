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
  _pendingHoleCards: {},
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

function computeChipSideForIndex(i){
  const pos = G.seatPositions[i];
  if(!pos) return 'bottom';
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