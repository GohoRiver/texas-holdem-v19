'use strict';

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
  G.players.forEach(function(p){ p._isWinner = false; if(p.peerId) existing[p.peerId] = p; });
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

/* ================= 联机状态广播 ================= */
function broadcastFullState(){
  if(!G.online.isHost) return;
  const myId = PokerOnline.getMyId();
  const state = {
    players: G.players.map(function(p){
      const isSelf = (p.peerId === myId);
      const safeHoleCards = isSelf
        ? p.holeCards
        : (p.revealCards ? p.holeCards : []);
      return {
        id: p.id, peerId: p.peerId, name: p.name,
        chips: p.chips, folded: p.folded, allIn: p.allIn,
        seated: p.seated !== false,
        currentBet: p.currentBet,
        holeCards: safeHoleCards,
        holeCardCount: (p.holeCards && p.holeCards.length) || 0,
        lastAction: p.lastAction,
        position: p.position, positionKey: p.positionKey,
        revealCards: p.revealCards,
        _intentReveal: p._intentReveal || false,
        _spectator: p._spectator || false,
        _waitNextHand: p._waitNextHand || false,
        preflopOrder: p.preflopOrder, postflopOrder: p.postflopOrder,
        _highlight: p._highlight ? Array.from(p._highlight) : null,
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
    G.seatPositions = computeSeatPositions(G.players.length);
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

  tryApplyPendingHoles();

  render();
  const meNow = G.players[G.online.mySeat];
  const handOver = (state.stage === 'showdown' || state.stage === 'waiting' ||
                    (state.nextHandEndsAt && state.nextHandEndsAt > Date.now()));
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

  if(meNow && meNow.chips <= 0 && meNow.seated !== false && handOver){
    if(G._rebuyShownFor !== handKey){
      G._rebuyShownFor = handKey;
      setTimeout(showRebuy, 8000);
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
  if(msg.type === 'request_reveal'){
    const myPeerId = PokerOnline.getMyId();
    const me = G.players.find(function(x){ return x.peerId === myPeerId; });
    if(me && me.holeCards && me.holeCards.length === 2 && !me.folded){
      PokerOnline.sendRevealHole({
        peerId: myPeerId,
        handNumber: msg.handNumber,
        cards: me.holeCards.map(function(c){
          return { rank: c.rank, suit: c.suit, value: c.value, display: c.display, red: c.red };
        })
      });
    }
    return;
  }
  if(msg.type === 'reveal_hole'){
    const p = G.players.find(function(x){ return x.peerId === msg.peerId; });
    if(p && (!p.holeCards || p.holeCards.length < 2) && msg.cards && msg.cards.length === 2){
      p.holeCards = normalizeCards(msg.cards);
      console.log('[reveal] 收到玩家明文底牌:', msg.peerId, msg.cards.map(function(c){return c.rank+c.suit;}).join(' '));
      if(G.online.isHost) render();
    }
    return;
  }
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
        if(!G._pendingHoleCards) G._pendingHoleCards = {};
        G._pendingHoleCards[myPeerId] = cards;
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
        render();
        broadcastFullState();
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

        const v = PokerOnline.verifyActionSignature(msg);
        if(!v.valid){
          console.warn('[host] 动作验签失败:', v.reason, msg.playerId);
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
      const kmsg = reasons[msg.reason] || (isEn() ? "You have been kicked" : "你已被房主踢出房间");
      appToast(kmsg, "error");
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

      if(G.online.started && G.stage !== 'waiting' && !G.gameOver){
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
        setTimeout(function(){ if(G.online.started) broadcastFullState(); }, 300);
      }
      break;
    }
    case 'host_changed': {
      dropPeer(msg.oldHostPeerId);
      updateSpectatorUI();
      appToast(isEn() ? "Host changed" : "房主已变更", "info");
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
        appToast(isEn() ? "Host changed" : "房主已变更", "info");
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

/* ================= 联机房主开局 ================= */
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
          PokerStorage.addPoints(buyInChips - have);
          have = PokerStorage.getPoints();
        }
        PokerStorage.setPoints(have - buyInChips);
      }
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

/* ================= 联机房间管理 ================= */
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
  pwInput.classList.remove("hidden");

  input.addEventListener("blur", function(){
    const code = input.value.trim();
    if(!code) return;
    let known = null;
    try {
      known = (PokerOnline.getKnownRooms() || []).find(function(r){ return r.roomId === code; });
    } catch(e){}
    if(known && !known.isPrivate){
      pwInput.classList.add("hidden");
    } else {
      pwInput.classList.remove("hidden");
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

/* ================= AI 场入口 ================= */
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
