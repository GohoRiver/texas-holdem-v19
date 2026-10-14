'use strict';

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
      const res = await PokerWallet.withdrawBem(bem);
      if(res && res.txHash){
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