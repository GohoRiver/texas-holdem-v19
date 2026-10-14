'use strict';

/* ================= 大厅数据 UI ================= */
function refreshBalanceUI(){
  const rBem = (window.PokerWallet && PokerWallet.isConnected()) ? PokerWallet.getContractBalance() : 0;
  const r = Math.floor(rBem / CHIP_TO_BEM);
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

/* ================= 牌桌渲染 ================= */
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
    seat.classList.toggle("spectating", !!p._spectator);
    updateSpectatorUI();
    seat.classList.toggle("all-in", !!p.allIn && !p.folded && p.seated !== false);
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
            const r = (p._score && p._bestCards) ? { score: p._score, cards: p._bestCards } : PokerEval.bestHand(p.holeCards.concat(G.community));
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
      nextCards = [null, null];
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
  if(G.stage === 'showdown' && G._settled && !G._deltaShown){
    G._deltaShown = true;
    G.players.forEach(function(p){
      if(p.seated === false) return;
      let delta = 0;
      let isRefund = false;
      if(p._isWinner && p._winAmount > 0){
        const allRefund = p._winPots && p._winPots.length > 0 &&
                         p._winPots.every(function(wp){ return wp.isRefund; });
        if(allRefund){
          delta = p._winAmount;
          isRefund = true;
        } else {
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
  refreshSideHistory();
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
      '<div class="seat-chips">' + fmtNum((function(){
  const gp = G.players.find(function(x){ return x.peerId === p.peerId; });
  return gp ? gp.chips : ((G._onlineLv || { buyMax: 10000 }).buyMax);
})()) + ' ' + t("chips") + '</div>' +
      '<div class="seat-bet">' + (isEn() ? 'Seat ' : '座位 ') + (seatIdx + 1) + '</div>';
    container.appendChild(seat);
  }
}

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

  updateHandTypeBadge(me);

  const bem = $("handBem");
  if(bem) bem.textContent = G.gameMode === 'real'
    ? "≈ " + toBem(me ? me.chips : 0) + " BEM"
    : fmtNum(me ? me.chips : 0) + (isEn() ? " chips" : " 筹码");

  if(!me){ c.innerHTML = ""; return; }
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

  let presets;
  if(isFirstBettor){
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

  function computeBubbleTarget(preset){
    let target;
    if(preset.mode === 'pot-bet'){
      target = Math.floor(G.pot * preset.ratio);
    } else if(preset.mode === 'mult'){
      target = Math.floor(oldBet * preset.ratio);
    } else if(preset.mode === 'pot-raise'){
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

/* ================= 计时器 ================= */
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
  refreshSideHistory();
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
  refreshSideHistory();
  if(window.PokerAudio) PokerAudio.play('click');
}
function closeInGameHistory(){
  const el = document.getElementById('inGameHistory');
  if(el) el.classList.add('hidden');
}

function refreshSideHistory(){
  const el = document.getElementById('sideHistoryBody');
  if(!el) return;
  const list = PokerStorage.getHandHistory ? PokerStorage.getHandHistory() : [];
  const sig = list.length + ':' + (list[0] ? list[0].ts : 0);
  if(G._lastSideHistorySig === sig) return;
  G._lastSideHistorySig = sig;
  el.innerHTML = renderHistoryList(list);
}

/* ================= 结算面板 & 飘字 ================= */
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
    if(p._winPots && p._winPots.length > 0){
      p._winPots.forEach(function(wp){
        html += '<div class="settlement-sub">· ' + wp.label + ': +' + fmtNum(wp.amount) + '</div>';
      });
    }
  });
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
