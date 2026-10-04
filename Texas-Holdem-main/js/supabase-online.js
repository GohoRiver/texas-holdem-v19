window.PokerOnline = (function(){
  const SUPABASE_URL = 'https://olmlqguftnmnpyefrokk.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_QSRZnWEj0nJ1QdxmqBgPcA_0n9fP4oK';

  let supabase = null;
  let channel = null;
  let myId = null;
  let nickname = 'Player';
  let currentRoomId = null;
  let isHost = false;
  let hostPeerId = null;

  let roomPlayers = {};
  let roomInfo = { isPrivate: false, password: '', maxSeats: 7, gameStarted: false };
  let onMessage = null;
  let onPlayersUpdate = null;
  let onRoomsUpdate = null;
  let heartbeatTimer = null;

  let lobbyChannel = null;
  let lobbyRooms = {};
  let hostRoomInfo = null;
  let hostAnnounceTimer = null;
  const ROOM_TTL_MS = 8000;
  const ANNOUNCE_MS = 2000;
  const MAX_SEATS = 7;

  function init(){
    if(!window.supabase) return Promise.reject(new Error('Supabase SDK not loaded'));
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    myId = 'p-' + Math.random().toString(36).slice(2, 10);
    nickname = PokerStorage.getNickname() || 'Player';
    try { initLobbyChannel(); } catch(e){}
    return Promise.resolve();
  }

  function setMessageCallback(cb){ onMessage = cb; }
  function setPlayersCallback(cb){ onPlayersUpdate = cb; }
  function setRoomsCallback(cb){ onRoomsUpdate = cb; }

  function initLobbyChannel(){
    if(lobbyChannel) return;
    lobbyChannel = supabase.channel('lobby', { config: { broadcast: { self: false } } });
    lobbyChannel.on('broadcast', { event: 'room_available' }, (payload) => {
      const p = payload && payload.payload;
      if(!p || !p.roomId) return;
      lobbyRooms[p.roomId] = Object.assign({}, p, { _ts: Date.now() });
      if(onRoomsUpdate) onRoomsUpdate(getKnownRooms());
    });
    lobbyChannel.on('broadcast', { event: 'room_closed' }, (payload) => {
      const rid = payload && payload.payload && payload.payload.roomId;
      if(rid && lobbyRooms[rid]){ delete lobbyRooms[rid]; if(onRoomsUpdate) onRoomsUpdate(getKnownRooms()); }
    });
    lobbyChannel.on('broadcast', { event: 'room_list_request' }, () => {
      if(isHost && hostRoomInfo){
        try { lobbyChannel.send({ type:'broadcast', event:'room_available', payload: hostRoomInfo }); } catch(e){}
      }
    });
    lobbyChannel.subscribe(function(status){
      if(status === 'SUBSCRIBED'){
        try { lobbyChannel.send({ type:'broadcast', event:'room_list_request', payload:{} }); } catch(e){}
      }
    });
  }

  function getKnownRooms(){
    const now = Date.now(); const out = [];
    for(const rid in lobbyRooms){
      const r = lobbyRooms[rid];
      if(now - (r._ts || 0) > ROOM_TTL_MS){ delete lobbyRooms[rid]; continue; }
      out.push(r);
    }
    return out;
  }

  function announceRoom(){
    if(!lobbyChannel || !hostRoomInfo) return;
    /* 统计已上座人数 */
let seatedCount = 0;
Object.keys(roomPlayers).forEach(function(pid){
  const p = roomPlayers[pid];
  if(p.role === 'seated' || p.role == null) seatedCount++;
});
    hostRoomInfo.count = seatedCount;
    hostRoomInfo.totalPlayers = Object.keys(roomPlayers).length;
    hostRoomInfo.isPrivate = roomInfo.isPrivate;
    hostRoomInfo.gameStarted = roomInfo.gameStarted;
    try { lobbyChannel.send({ type:'broadcast', event:'room_available', payload: hostRoomInfo }); } catch(e){}
  }

  function stopAnnounce(){
    if(lobbyChannel && hostRoomInfo){
      try { lobbyChannel.send({ type:'broadcast', event:'room_closed', payload: { roomId: hostRoomInfo.roomId } }); } catch(e){}
    }
    hostRoomInfo = null;
    if(hostAnnounceTimer){ clearInterval(hostAnnounceTimer); hostAnnounceTimer = null; }
  }

  function nextFreeSeat(){
    const used = {};
    Object.keys(roomPlayers).forEach(function(pid){
      const p = roomPlayers[pid];
      if(p.role === 'seated') used[p.seat] = true;
    });
    for(let i = 0; i < MAX_SEATS; i++){ if(!used[i]) return i; }
    return -1;
  }

  function broadcastPlayerList(){
    if(!isHost) return;
    const list = Object.keys(roomPlayers).map(function(pid){
      const p = roomPlayers[pid];
      return { peerId: pid, name: p.name, ready: p.ready, seat: p.seat, role: p.role, wantsSeat: p.wantsSeat };
    });
    send('player_list', { players: list, hostPeerId: hostPeerId, isPrivate: roomInfo.isPrivate, gameStarted: roomInfo.gameStarted });
  }

  function notifyPlayers(){
    if(onPlayersUpdate) onPlayersUpdate(Object.keys(roomPlayers).map(function(pid){
      return Object.assign({ peerId: pid }, roomPlayers[pid]);
    }), { hostPeerId: hostPeerId, isPrivate: roomInfo.isPrivate, gameStarted: roomInfo.gameStarted });
  }

  function becomeHost(){
    if(isHost) return;
    isHost = true;
    hostPeerId = myId;
    if(!hostRoomInfo){
      hostRoomInfo = {
        roomId: currentRoomId,
        level: roomInfo.level || 'nano', mode: roomInfo.mode || 'points',
        hostName: nickname, count: 1, totalPlayers: 1, maxSeats: MAX_SEATS,
        isPrivate: roomInfo.isPrivate, gameStarted: roomInfo.gameStarted
      };
    }
    if(hostAnnounceTimer) clearInterval(hostAnnounceTimer);
    hostAnnounceTimer = setInterval(announceRoom, ANNOUNCE_MS);
    announceRoom();
    broadcastPlayerList();
  }

  function createRoom(roomId, info){
    isHost = true;
    hostPeerId = myId;
    currentRoomId = roomId;
    info = info || {};
    roomInfo.isPrivate = !!info.isPrivate;
    roomInfo.password = info.password || '';
    roomInfo.maxSeats = MAX_SEATS;
    roomInfo.gameStarted = false;
    roomInfo.level = info.level || 'nano';
    roomInfo.mode = info.mode || 'points';

    channel = supabase.channel('room-' + roomId, { config: { broadcast: { self: true } } });

        channel.on('broadcast', { event: 'player_join' }, (payload) => {
  if(!isHost) return;
  const p = payload.payload;
  if(!p || !p.peerId) return;
  if(!roomPlayers[p.peerId]){
    if(Object.keys(roomPlayers).length >= MAX_SEATS){
      try { channel.send({ type:'broadcast', event:'room_full', payload:{ peerId: p.peerId } }); } catch(e){}
      return;
    }
    roomPlayers[p.peerId] = {
      name: p.name || 'Player',
      ready: false,
      seat: nextFreeSeat(),
      role: 'seated',          // ★ 补
      wantsSeat: false,        // ★ 补
      isSelf: false
    };
    broadcastPlayerList(); notifyPlayers(); announceRoom();
    if(onMessage) onMessage({
      type: 'player_join',
      peerId: p.peerId,
      name: p.name,
      seat: roomPlayers[p.peerId].seat
    });
  } else {
    broadcastPlayerList();
  }
});
    /* ★ 玩家请求上座 */
    channel.on('broadcast', { event: 'request_seat' }, (payload) => {
      if(!isHost) return;
      if(onMessage) onMessage({ type: 'request_seat', ...payload.payload });
    });
    channel.on('broadcast', { event: 'ready' }, (payload) => {
      if(!isHost) return;
      const p = payload.payload;
      if(roomPlayers[p.peerId]) roomPlayers[p.peerId].ready = p.ready;
      broadcastPlayerList();
      notifyPlayers();
      tryStartGame();
    });

    /* ★ 上座/下座 */
    channel.on('broadcast', { event: 'take_seat' }, (payload) => {
      if(!isHost) return;
      const p = payload.payload;
      const rp = roomPlayers[p.peerId];
      if(!rp) return;
      rp.wantsSeat = true;
      rp.ready = false;
      broadcastPlayerList();
      notifyPlayers();
      if(onMessage) onMessage({ type: 'seat_changed', peerId: p.peerId, wantsSeat: true });
    });

    channel.on('broadcast', { event: 'leave_seat' }, (payload) => {
      if(!isHost) return;
      const p = payload.payload;
      const rp = roomPlayers[p.peerId];
      if(!rp) return;
      rp.wantsSeat = false;
      rp.role = 'spectator';
      rp.ready = false;
      broadcastPlayerList();
      notifyPlayers();
      if(onMessage) onMessage({ type: 'seat_changed', peerId: p.peerId, wantsSeat: false });
    });

    /* ★ 房主踢人 */
    channel.on('broadcast', { event: 'kick_player' }, (payload) => {
      if(!isHost) return;
      const targetId = payload.payload.peerId;
      if(!roomPlayers[targetId]) return;
      delete roomPlayers[targetId];
      try { channel.send({ type:'broadcast', event:'kicked', payload:{ peerId: targetId } }); } catch(e){}
      broadcastPlayerList();
      notifyPlayers();
      announceRoom();
      if(onMessage) onMessage({ type: 'kicked_player', peerId: targetId });
    });

    /* ★ 房主转让 */
    channel.on('broadcast', { event: 'transfer_host' }, (payload) => {
      if(!isHost) return;
      const targetId = payload.payload.peerId;
      if(!roomPlayers[targetId]) return;
      hostPeerId = targetId;
      isHost = false;
      try { channel.send({ type:'broadcast', event:'host_transferred', payload:{ newHostPeerId: targetId } }); } catch(e){}
      /* 停止自己的公告 */
      stopAnnounce();
      broadcastPlayerList();
      notifyPlayers();
      if(onMessage) onMessage({ type: 'host_changed_local', newHostPeerId: targetId });
    });

    /* ★ 房主切换私人/公开 */
    channel.on('broadcast', { event: 'toggle_private' }, (payload) => {
      if(!isHost) return;
      roomInfo.isPrivate = !!payload.payload.isPrivate;
      broadcastPlayerList();
      notifyPlayers();
      announceRoom();
    });

    channel.on('broadcast', { event: 'leave' }, (payload) => {
      const p = payload.payload;
      if(!p || !p.peerId) return;
      if(p.peerId === myId) return;
      if(roomPlayers[p.peerId]){
        delete roomPlayers[p.peerId];
        broadcastPlayerList();
        notifyPlayers();
        try { channel.send({ type:'broadcast', event:'player_leave', payload: { peerId: p.peerId } }); } catch(e){}
        if(onMessage) onMessage({ type: 'player_leave', peerId: p.peerId });
        announceRoom();
      }
    });

channel.on('broadcast', { event: 'sync_request' }, (payload) => {
  if(!isHost) return;
  broadcastPlayerList();       // ★ 先重发玩家列表
  notifyPlayers();             // ★ 也通知本地 UI
  announceRoom();              // ★ 顺便更新大厅计数
  if(onMessage) onMessage({ type: 'sync_request', peerId: payload.payload.peerId });
});

    channel.on('broadcast', { event: 'player_action' }, (payload) => {
      if(!isHost) return;
      if(onMessage) onMessage({ type: 'player_action', ...payload.payload });
    });

    channel.on('broadcast', { event: 'chat' }, (payload) => {
      if(onMessage) onMessage({ type: 'chat', ...payload.payload });
    });

    channel.on('broadcast', { event: 'show_cards' }, (payload) => {
      if(onMessage) onMessage({ type: 'show_cards', ...payload.payload });
    });

    /* 客户端状态广播（房主用）*/
    channel.on('broadcast', { event: 'state_request' }, (payload) => {
      if(!isHost) return;
      if(onMessage) onMessage({ type: 'state_request', peerId: payload.payload.peerId });
    });

    hostRoomInfo = {
      roomId: roomId,
      level: info.level || 'nano', mode: info.mode || 'points',
      hostName: nickname, count: 1, totalPlayers: 1, maxSeats: MAX_SEATS,
      isPrivate: roomInfo.isPrivate, gameStarted: false
    };

    return new Promise(function(resolve){
      channel.subscribe(function(status){
        if(status === 'SUBSCRIBED'){
          roomPlayers[myId] = {
            name: nickname, ready: false, seat: 0,
            role: 'seated', wantsSeat: false, isSelf: true
          };
          broadcastPlayerList();
          notifyPlayers();
          announceRoom();
if(hostAnnounceTimer) clearInterval(hostAnnounceTimer);
hostAnnounceTimer = setInterval(function(){
  announceRoom();
  broadcastPlayerList();       // ★ 每 2 秒兜底一次
}, ANNOUNCE_MS);
          resolve();
        }
      });
    });
  }

  function joinRoom(roomId, password){
    isHost = false;
    currentRoomId = roomId;
    roomInfo.password = password || '';

    channel = supabase.channel('room-' + roomId, { config: { broadcast: { self: false } } });

    channel.on('broadcast', { event: 'player_list' }, (payload) => {
      roomPlayers = {};
      (payload.payload.players || []).forEach(function(p){
        roomPlayers[p.peerId] = {
          name: p.name, ready: p.ready, seat: p.seat,
          role: p.role || 'seated', wantsSeat: !!p.wantsSeat,
          isSelf: p.peerId === myId
        };
      });
      hostPeerId = payload.payload.hostPeerId || null;
      roomInfo.isPrivate = !!payload.payload.isPrivate;
      roomInfo.gameStarted = !!payload.payload.gameStarted;
      notifyPlayers();
    });

    channel.on('broadcast', { event: 'ready' }, (payload) => {
      const p = payload.payload;
      if(roomPlayers[p.peerId]) roomPlayers[p.peerId].ready = p.ready;
      notifyPlayers();
    });

    /* ★ 被踢 */
    channel.on('broadcast', { event: 'kicked' }, (payload) => {
      if(payload.payload.peerId === myId){
        if(onMessage) onMessage({ type: 'kicked' });
      }
    });

    /* ★ 密码错 */
    channel.on('broadcast', { event: 'wrong_password' }, (payload) => {
      if(payload.payload.peerId === myId){
        if(onMessage) onMessage({ type: 'wrong_password' });
      }
    });

    /* ★ 房主变更 */
    channel.on('broadcast', { event: 'host_transferred' }, (payload) => {
      const newHostId = payload.payload.newHostPeerId;
      if(newHostId === myId){
        /* 我成为新房主 */
        becomeHost();
        if(onMessage) onMessage({ type: 'became_host' });
      } else {
        hostPeerId = newHostId;
        if(onMessage) onMessage({ type: 'host_changed', peerId: newHostId });
      }
      notifyPlayers();
    });

    channel.on('broadcast', { event: 'leave' }, (payload) => {
      const p = payload.payload;
      if(p && p.peerId && roomPlayers[p.peerId]){
        delete roomPlayers[p.peerId];
        notifyPlayers();
      }
    });

    channel.on('broadcast', { event: 'player_leave' }, (payload) => {
      if(onMessage) onMessage({ type: 'player_leave', peerId: payload.payload.peerId });
    });

    channel.on('broadcast', { event: 'room_full' }, (payload) => {
      if(payload.payload.peerId === myId){ if(onMessage) onMessage({ type: 'room_full' }); }
    });

    channel.on('broadcast', { event: 'host_left' }, (payload) => {
      if(onMessage) onMessage({ type: 'host_left' });
    });

    channel.on('broadcast', { event: 'game_start' }, (payload) => {
      if(onMessage) onMessage({ type: 'game_start', ...payload.payload });
    });

    channel.on('broadcast', { event: 'full_state' }, (payload) => {
      if(onMessage) onMessage({ type: 'full_state', state: payload.payload });
    });

    channel.on('broadcast', { event: 'chat' }, (payload) => {
      if(onMessage) onMessage({ type: 'chat', ...payload.payload });
    });

    channel.on('broadcast', { event: 'show_cards' }, (payload) => {
      if(onMessage) onMessage({ type: 'show_cards', ...payload.payload });
    });

    return new Promise(function(resolve){
      channel.subscribe(function(status){
        if(status === 'SUBSCRIBED'){
          for(let i = 0; i < 3; i++){
            setTimeout(function(){
              send('player_join', { peerId: myId, name: nickname, password: roomInfo.password });
            }, i * 300);
          }
          heartbeatTimer = setInterval(function(){
            if(!channel) return;
            send('sync_request', { peerId: myId });
          }, 12000);
          resolve();
        }
      });
    });
  }

  function tryStartGame(){
    const seatedPlayers = Object.keys(roomPlayers).filter(function(pid){
      return roomPlayers[pid].role === 'seated';
    });
    if(seatedPlayers.length < 2) return;
    const allReady = seatedPlayers.every(function(pid){ return roomPlayers[pid].ready; });
    if(!allReady) return;
    const order = seatedPlayers.slice().sort(function(a, b){
      return (roomPlayers[a].seat || 0) - (roomPlayers[b].seat || 0);
    });
    if(onMessage) onMessage({
      type: 'host_start_game',
      playerOrder: order,
      players: order.map(function(pid){
        return { peerId: pid, name: roomPlayers[pid].name, seat: roomPlayers[pid].seat };
      })
    });
  }

  function send(event, payload){
    if(!channel) return null;
    try { return channel.send({ type: 'broadcast', event: event, payload: payload }); }
    catch(e){ return null; }
  }

  function sendFullState(state){ send('full_state', state); }
  function sendPlayerAction(payload){ send('player_action', payload); }
  function sendGameStart(payload){
    for(let i = 0; i < 3; i++){ setTimeout(function(){ send('game_start', payload); }, i * 300); }
    send('game_start', payload);
  }
  function sendHostLeft(){ send('host_left', { peerId: myId }); }
  function sendShowCards(payload){ send('show_cards', payload); }

  /* ★ 观众操作 */
  function sendTakeSeat(){ send('take_seat', { peerId: myId }); }
  function sendLeaveSeat(){ send('leave_seat', { peerId: myId }); }

  /* ★ 房主操作 */
  function sendKick(peerId){ send('kick_player', { peerId: peerId }); }
  function sendTransferHost(peerId){ send('transfer_host', { peerId: peerId }); }
  function sendTogglePrivate(isPrivate){ send('toggle_private', { isPrivate: isPrivate }); }

  /* ★ 请求房主发状态给新观众 */
  function requestState(){ send('state_request', { peerId: myId }); }

  function toggleReady(){
    const me = roomPlayers[myId];
    if(!me) return false;
    if(me.role !== 'seated') return false;
    me.ready = !me.ready;
    send('ready', { peerId: myId, ready: me.ready });
    notifyPlayers();
    return me.ready;
  }

  function leaveRoom(){
  if(heartbeatTimer){ clearInterval(heartbeatTimer); heartbeatTimer = null; }
  const wasHost = isHost;
  const leavingRoomId = currentRoomId;   // ★ 记下来，后面清本地

  // ★ 先广播 room_closed（房主）
  if(wasHost && lobbyChannel && hostRoomInfo){
    try {
      lobbyChannel.send({
        type: 'broadcast',
        event: 'room_closed',
        payload: { roomId: hostRoomInfo.roomId }
      });
    } catch(e){}
  }
  if(hostAnnounceTimer){ clearInterval(hostAnnounceTimer); hostAnnounceTimer = null; }
  hostRoomInfo = null;

  const ch = channel; channel = null;
  if(ch){
    let sent;
    try {
      if(wasHost) sent = ch.send({ type: 'broadcast', event: 'host_left', payload: { peerId: myId } });
      else sent = ch.send({ type: 'broadcast', event: 'leave', payload: { peerId: myId } });
    } catch(e){ sent = null; }
    const cleanup = function(){ try { supabase.removeChannel(ch); } catch(e){} };
    if(sent && typeof sent.then === 'function'){
      Promise.resolve(sent).then(function(){ setTimeout(cleanup, 400); }).catch(function(){ setTimeout(cleanup, 400); });
    } else { setTimeout(cleanup, 600); }
  }

  // ★ 本地也清掉自己房主的那条记录
  if(leavingRoomId && lobbyRooms[leavingRoomId]){
    delete lobbyRooms[leavingRoomId];
    if(onRoomsUpdate) onRoomsUpdate(getKnownRooms());
  }

  currentRoomId = null; isHost = false; roomPlayers = {}; hostPeerId = null;
}

  return {
    init, createRoom, joinRoom, leaveRoom, send,
    sendFullState, sendPlayerAction, sendGameStart, sendHostLeft,
    sendChat: function(payload){ send('chat', payload); },
    sendShowCards,
    sendTakeSeat, sendLeaveSeat,
    sendKick, sendTransferHost, sendTogglePrivate,
    requestState,
    setMessageCallback, setPlayersCallback, setRoomsCallback, toggleReady,
    becomeHost,
    getMyId: function(){ return myId; },
    getRoomId: function(){ return currentRoomId; },
    getRoomPlayers: function(){ return roomPlayers; },
    getRoomInfo: function(){ return roomInfo; },
    getHostPeerId: function(){ return hostPeerId; },
    getKnownRooms, isHost: function(){ return isHost; }
  };
})();