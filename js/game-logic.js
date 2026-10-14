'use strict';

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
  const pos = [{ x:50, y:86 }];
  if(n === 1) return pos;
  const others = n - 1;
  const cx = 50, cy = 48;
  const rx = 42, ry = 36;
  const myAngle = 90;
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
  if(G.online.active && G.online.isHost) G.online.started = true;
  G._nextHandEndsAt = 0;
  G._deltaShown = false;
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

function getBetLabel(raiseCount, target){
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
  if(me.chips <= 0){ setTimeout(showRebuy, 8000); return; }
  offerShowCards();
  beginNextHandCountdown(startNewHandAi);
}

function calculateSidePots(){
  const contributors = G.players
    .filter(function(p){ return (p.totalContributed || 0) > 0; })
    .map(function(p){ return { player: p, amount: p.totalContributed, folded: p.folded }; });

  const pots = [];
  let pendingDeadMoney = 0;
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
      pendingDeadMoney += amt;
    } else {
      pots.push({
        amount: amt + pendingDeadMoney,
        eligible: eligible
      });
      pendingDeadMoney = 0;
    }
  }

  if(pendingDeadMoney > 0){
    if(pots.length > 0){
      pots[pots.length - 1].amount += pendingDeadMoney;
      console.warn('[sidePots] dead money merged into last pot:', pendingDeadMoney);
    } else {
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

    G.players.forEach(function(p){
      p._isWinner = false;
      p._winnerType = null;
      p._winAmount = 0;
      p._winPots = [];
    });

    pots.forEach(function(pot, i){
      if(!pot.eligible.length){
        console.warn('[resolveAi] Empty pot detected, amount:', pot.amount);
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

        const isRefund = (pot.eligible.length === 1);
        w._winPots.push({
          label: lbl,
          amount: gain,
          isRefund: isRefund
        });

        if(isRefund){
          if(!w._winnerType) w._winnerType = 'refund';
        } else {
          if(isMain){
            w._winnerType = 'main';
          } else if(w._winnerType !== 'main'){
            w._winnerType = 'side';
          }
        }
      });

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
    if(me.chips <= 0){ setTimeout(showRebuy, 4000); return; }
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
    const me = G.players.find(p => p.peerId === PokerOnline.getMyId()) || G.players[myIndex()];
    me.chips = amount;
    me.seated = true;
    me.folded = false;
    G.sessionBuyIn += amount;
    PokerAudio.play('chip');
    render();
    if(G.online.active && !G.online.isHost && window.PokerOnline && PokerOnline.send){
      PokerOnline.send('rebuy', { peerId: PokerOnline.getMyId(), amount: amount });
      return;
    }
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
    }
    if(G.online.active){
      $("rebuyOverlay").classList.add("hidden");
      if(G.online.isHost){
        me.seated = true;
        if(window.PokerOnline && PokerOnline.clearAllReady) PokerOnline.clearAllReady();
        broadcastFullState();
        returnToWaiting();
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

  if(me && G.sessionBuyIn > 0 && G.gameMode === 'real' && me.chips !== G.sessionBuyIn){
    try {
      const playerAddress = PokerWallet.getAddress();
      const chainBalanceWei = await PokerWallet.getContractBalanceWei();
      const deltaChips = me.chips - G.sessionBuyIn;
      const deltaWei = BigInt(deltaChips) * 100000000000000n;
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

/* ================= 联机房主流程 ================= */
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
  if(!data.success){
    if(res.status === 409){
      const err = new Error('HAND_EXISTS');
      err.code = 409;
      throw err;
    }
    throw new Error(data.error || 'deal failed');
  }
  return data;
}

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
  if(G._dealingInProgress){
    console.warn('[deal] 已有一手在发牌中，跳过');
    return;
  }
  G._dealingInProgress = true;
  try {

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
  const thisHandNo = G.handNumber;
  G.pot = 0; G.community = [];
  G.currentBet = 0; G.lastRaiseAmount = G.bigBlind;
  G.stage = "preflop"; G.busy = false; G._busySince = 0;
  G._nextHandEndsAt = 0;
  G._deltaShown = false;
  G.raiseCount = 1;
  let dealResult = null;
  if(G.online.active && G.online.isHost){
    try {
      log(isEn() ? 'Waiting for all pubkeys...' : '等待所有玩家公钥就绪...', 'hl');
      await PokerOnline.waitSeatedPubkeys(5000);
      log(isEn() ? 'Requesting deal from server...' : '正在向服务器请求发牌...', 'hl');
      dealResult = await callDealerDeal(G.online.roomId, thisHandNo);
      G._encryptedHoles = dealResult.holes;
      G._currentHandId = dealResult.hand_id;
      G._seedCommit = dealResult.seed_commit;
      log(isEn() ? 'Deal received (encrypted)' : '已收到加密牌堆', 'hl');
    } catch(e){
      if(e.code === 409){
        console.error('[deal] 手牌已存在，取消本手', e);
        log(isEn() ? 'Deal conflict, abort this hand' : '发牌冲突，本手作废', 'hl');

        G.handNumber++;
        setTimeout(function(){ if(G.online.isHost) returnToWaiting(); }, 1500);
        return;
      }
      console.error('[deal] Edge Function 调用失败', e);
      log(isEn() ? 'Server deal failed, fallback to local' : '服务器发牌失败，回退本地', 'hl');
      dealResult = null;
    }
  }

  G.deck = PokerDeck.create();
  PokerDeck.shuffle(G.deck);
  G._renderedCards = new WeakSet();
  G._lastBoardSig = ''; G._lastHandSig = ''; G._lastActionSig = '';
  stopTurnTimer();
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
    }
  });
  assignPositions();
  computeActionOrders();
  if(dealResult){
    G.players.forEach(function(p){ p.holeCards = []; });

    PokerOnline.sendDealHoles({
      hand_id: dealResult.hand_id,
      hand_no: dealResult.hand_no,
      seed_commit: dealResult.seed_commit,
      holes: dealResult.holes,
      dealer_seat: G.dealerIndex,
      current_player_seat: G.currentPlayerIndex
    });
    log(isEn() ? 'Deal broadcasted' : '发牌已广播，等待各方解密', 'hl');

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
  } finally {
    // 无论成功、抛错还是 409 提前 return，锁都在这里释放
    G._dealingInProgress = false;
  }
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
  const needReveal = cont.filter(function(p){ return !p.holeCards || p.holeCards.length < 2; });
  if(needReveal.length > 0 && G.online.isHost){
    console.log('[showdown] 广播 request_reveal');
    PokerOnline.sendRequestReveal({ handNumber: G.handNumber });
  }
  const startRevealAnimation = function(){
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
  };
  const startWait = Date.now();
  const waitReveal = function(){
    const stillMissing = cont.filter(function(p){ return !p.holeCards || p.holeCards.length < 2; });
    if(stillMissing.length > 0 && Date.now() - startWait < 800){
      setTimeout(waitReveal, 100);
      return;
    }
    startRevealAnimation();
  };
  if(needReveal.length > 0 && G.online.isHost){
    waitReveal();
  } else {
    startRevealAnimation();
  }
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

        const isRefund = (pot.eligible.length === 1);
        w._winPots.push({
          label: lbl,
          amount: gain,
          isRefund: isRefund
        });

        if(isRefund){
          if(!w._winnerType) w._winnerType = 'refund';
        } else {
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

  if(me && me.chips <= 0){
    setTimeout(showRebuy, 8000);
    return;
  }

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
  if(G.online.active && !G.online.isHost){
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
