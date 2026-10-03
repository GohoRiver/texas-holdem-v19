window.PokerI18n = (function(){
  const T = {
    zh: {
      navLobby:"大厅", navRules:"规则", navMyNumbers:"我的数据",
      noTables:"0 桌开放", connectWallet:"连接钱包", backToLobby:"大厅",
      tabAi:"AI 练习场", tabPoints:"积分场 · 真人", tabReal:"链上场 · BEM",

      aiBadge:"单机练习 · 无限筹码", aiTitle:"无限筹码<br>随便练手",
      aiDesc:"和 AI 对手打牌，不花钱、不注册、不需要钱包。适合熟悉规则、练习 GTO 打法。",
      quickSeat:"⚡ 快速入座", howToPlay:"怎么玩？", youLabel:"你",
      chooseLevel:"选择盲注等级", tableSeats:"桌人数",
      myAiChips:"我的 AI 场筹码", aiWinTotal:"累计赢得", rebuy:"补码",
      aiRebuyNote:"筹码跨局累积；赢的每一分都算进总额",

      pointsBadge:"积分场 · 真人 · 不花钱也能玩",
      pointsTitle:"真人同桌<br>不花钱也能玩",
      pointsDesc:"和真人同桌打。创建一个房间，把房间号发给朋友即可同桌。",
      myPoints:"我的积分", pointsNote:"积分只用来玩，不能充值、提现，也不能换成 BEM",
      pointsStorageWarning:"⚠️ 积分保存在本浏览器，换设备或清除数据后会丢失。",
      pointsTables:"积分牌桌（真人对战 · 2-7 人）",

      realBadge:"全链上 · BEM 结算 · 真人",
      realTitle:"真金白银<br>链上公平",
      realDesc:"连接币安 Web3 钱包，充 BEM 换筹码，和真人同桌打。",
      walletBem:"钱包 BEM 余额", realBalance:"对战场筹码", walletAddr:"钱包地址",
      deposit:"充值", depositNote:"最低 0.001 BEM；充值收 2% 手续费",
      withdraw:"提现", withdrawNote:"最低 0.0001 BEM（= 1 筹码）",
      realTables:"链上牌桌（真人对战 · 2-7 人）",

      createRoom:"创建房间", joinRoom:"加入房间",
      createRoomTitle:"创建房间", createRoomDesc:"选择房间类型：",
      roomPublic:"公开房间", roomPrivate:"私人房间",
      roomPasswordPlaceholder:"房间密码",
      joinRoomTitle:"加入房间", joinRoomDesc:"输入朋友分享的房间号：",
      join:"加入", confirm:"确定", cancel:"取消", close:"关闭",

      footer1:"1 筹码 = 0.0001 BEM。抽水只在看到翻牌的牌局中收取：底池的 1%，上限 1 个大盲。",
      footer2:"发牌使用平台随机数系统，链上仅负责 BEM 充提；每手牌局可事后复盘。",

      rulesTitle:"发牌：任何人都能看到每手牌的最终结果",
      rulesDesc:"牌局由平台随机数系统发牌；链上仅负责 BEM 的充值和提现。",
      rule1Title:"发牌", rule1Body:"平台使用系统随机数生成器洗牌发牌。",
      rule2Title:"复盘", rule2Body:"每手结束本地保存复盘记录。",
      rule3Title:"筹码与抽水", rule3Body:"1 筹码 = 0.0001 BEM。抽水 1% 封顶 1 个大盲。",
      rule4Title:"三种模式", rule4Body:"AI 练习 / 积分场 / 链上场。",
      rule5Title:"充值 / 提现", rule5Body:"充值最低 0.001 BEM；提现最低 0.0001 BEM。",
      rule6Title:"断线不能赖账", rule6Body:"30 秒无回应按弃牌处理。",
      rule7Title:"你在信任什么", rule7Body:"发牌平台随机；链上托管 BEM。",
      rule8Title:"和其他德州扑克不一样", rule8Body:"充提走链上，每手可复盘。",

      faqTitle:"常见问题",
      faq1Q:"运营方能否出千？", faq1A:"发牌由平台 RNG，链上只证明充提。",
      faq2Q:"为什么不用链上洗牌？", faq2A:"gas 成本极高。",
      faq3Q:"能否串通？", faq3A:"每手记录留存。",
      faq4Q:"有没有机器人？", faq4A:"AI 场有 AI；积分场/链上场是真人。",
      faq5Q:"网络不好？", faq5A:"30 秒超时弃牌。",
      faq6Q:"合约跑路？", faq6A:"合约托管 BEM，随时可提。",
      faq7Q:"费用？", faq7A:"充值 2%，提现付 gas。",
      faq8Q:"抽水去向？", faq8A:"合约公示地址。",
      faq9Q:"审计？", faq9A:"未审计，先小额试。",
      faq10Q:"隐私？", faq10A:"钱包公开，牌局本地保存。",
      faq11Q:"积分/链上是真人？", faq11A:"都是真人 P2P。",
      faq12Q:"手机怎么玩？", faq12A:"横屏。",
      faq13Q:"合法吗？", faq13A:"各地法规不同。",

      myNumbersTitle:"我的数据", myNumbersSub:"0 桌 · 钱包 未连接",
      statTotalPnl:"总盈亏（筹码）", statTables:"打过的桌", statWinRate2:"赢下底池的比例",
      statBiggest:"最大底池", statTotalBuyIn:"累计买入", statTotalCashout:"累计取回",
      sessionsHeading:"桌次",
      colTable:"桌", colBlinds:"盲注", colBuyIn:"买入", colCashout:"取回",
      colPnl:"盈亏", colHands:"手数", colWon:"赢下", colStatus:"状态",
      resetNumbers:"清空战绩",
      handHistoryHeading:"最近牌局（复盘）", clearHistory:"清空",

      logTitle:"牌局记录", handInfoTitle:"本手信息", dealer:"荷官",
      potLabel:"底池", sidePotLabel:"边池", yourHand:"你的手牌", nextHand:"下一手",
      preset2x:"2×", preset3x:"3×", preset4x:"4×",
      presetQuarter:"1/4 池", presetThird:"1/3 池", presetHalf:"1/2 池",
      presetTwoThird:"2/3 池", presetThreeQuarter:"3/4 池", presetPot:"底池", presetAllin:"全下",
      rebuyTitle:"筹码耗尽", rebuyContinue:"补码继续", leaveTable:"离桌",
      gameOverTitle:"对局结束",
      walletTitle:"连接钱包", walletDesc:"请用币安 Web3 钱包或 MetaMask 连接 BNB Chain。",

      actionFold:"弃牌", actionCheck:"过牌", actionCall:"跟注",
      actionBet:"下注", actionRaiseTo:"加注到", actionRaise:"加注…", actionBetMenu:"下注…",
      stagePreflop:"翻牌前", stageFlop:"翻牌", stageTurn:"转牌", stageRiver:"河牌", stageShowdown:"摊牌",
      handNum:"第 {n} 手", dealerIs:"庄家 {name}", blindsAre:"盲注 {sb} / {bb}",
      handShortLabel:"第 {n} 手",
      sbBet:"小盲 {name} 下注 {amt}，大盲 {name2} 下注 {amt2}",
      playerFolds:"{name} 弃牌", playerChecks:"{name} 过牌",
      playerCalls:"{name} 跟注 {amt}", playerBets:"{name} 下注 {amt}",
      playerRaises:"{name} 加注到 {amt}",
      flopIs:"翻牌：{cards}", turnIs:"转牌：{card}", riverIs:"河牌：{card}",
      showdownHeader:"--- 摊牌 ---", reveals:"{name} 亮牌：{cards}",
      handResult:"{name}：{cards} → {hand}",
      winsPot:"{name} 赢得 {pot}（其他玩家全部弃牌）",
      winsPotSide:"{name} 赢得 {potLabel} {amt}（{hand}）",
      pot:"底池", mainPot:"主池", sidePot:"边池", chips:"筹码", hand:"手",
      infoHand:"手数", infoStage:"阶段", infoPot:"底池",
      infoYourBet:"你的下注", infoToCall:"需跟注",
      timeoutFold:"{name} 思考超时，自动弃牌",
      handHighCard:"高牌", handPair:"一对", handTwoPair:"两对",
      handTrips:"三条", handStraight:"顺子", handFlush:"同花",
      handFullHouse:"葫芦", handQuads:"四条", handStraightFlush:"同花顺",
      styleTAG:"紧凶", styleLAG:"松凶", styleNit:"紧弱", styleStation:"跟注站", styleManiac:"疯狂型",
      posBTNSB:"BTN/SB", posBTN:"BTN", posSB:"SB", posBB:"BB",
      posUTG:"UTG", posUTG1:"UTG+1", posHJ:"HJ", posCO:"CO", posMP:"MP",
      handShort:"手牌",

      chatTitle:"聊天", chatPlaceholder:"说点什么...", chatSend:"发送",
      ingameHistoryTitle:"对局记录",
      quickNice:"好牌", quickThanks:"谢谢", quickBluff:"偷鸡吗?", quickAngry:"!!!!!😡",

      waitingRoomTitle:"联机等待室", roomCode:"房间号", copy:"复制",
      playersOnline:"在线人数", ready:"准备好了", waitingHint:"至少需要 2 人才能开始",
      roomFull:"房间已满（最多 7 人）",
      waitingForPlayers:"等待玩家加入...",
      notReady:"未准备", isReady:"已准备",

      /* ★ 新增 */
      youAreSpectating:"你在观战中",
      takeSeat:"上座（下一局开始）",
      leaveSeat:"下座观战",
      cancelTakeSeat:"取消上座",
      spectatorsList:"观战者",
      hostControls:"房主控制",
      togglePrivate:"切换房间类型",
      playersListTitle:"房间玩家",
      kickBtn:"踢出",
      transferHostBtn:"转让房主",
      youLabel2:"你",
      hostLabel:"房主",
      seatLabel:"已上座",
      spectatorLabel:"观战",
      confirmKick:"确定踢出该玩家？",
      confirmTransfer:"确定将房主转让给该玩家？",
      kickedOut:"你已被房主踢出房间",
      becomeHost:"你已成为新房主",
      hostChanged:"房主已变更",
      roomIsPrivate:"私人房间",
      roomIsPublic:"公开房间",
      wrongPassword:"房间密码错误",
      needPassword:"该房间需要密码",
      waitingForNextHand:"下一局开始后自动上座",
      playerJoinedRoom:"{name} 加入房间",
      playerTookSeat:"{name} 已上座",
      playerBecameSpectator:"{name} 转为观战"
    },
    en: {
      navLobby:"Lobby", navRules:"Rules", navMyNumbers:"My numbers",
      noTables:"0 tables open", connectWallet:"Connect wallet", backToLobby:"Lobby",
      tabAi:"AI Practice", tabPoints:"Points · Real", tabReal:"On-chain · BEM",

      aiBadge:"Solo practice · Unlimited chips",
      aiTitle:"Unlimited chips<br>Practice freely",
      aiDesc:"Play against AI. No money, no sign-up, no wallet needed.",
      quickSeat:"⚡ Quick seat", howToPlay:"How to play?", youLabel:"You",
      chooseLevel:"Choose blinds level", tableSeats:"Seats",
      myAiChips:"My AI chips", aiWinTotal:"Total won", rebuy:"Rebuy",
      aiRebuyNote:"Chips carry over between sessions",

      pointsBadge:"Points · Real · No money needed",
      pointsTitle:"Real players<br>No money needed",
      pointsDesc:"Play with real people via P2P.",
      myPoints:"My points", pointsNote:"Points are for play only",
      pointsStorageWarning:"⚠️ Points stored in this browser only.",
      pointsTables:"Points tables",

      realBadge:"Full on-chain · BEM · Real players",
      realTitle:"Real money<br>Fair on-chain",
      realDesc:"Connect Binance Web3 Wallet, deposit BEM for chips.",
      walletBem:"Wallet BEM balance", realBalance:"On-chain chips", walletAddr:"Wallet address",
      deposit:"Deposit", depositNote:"Min 0.001 BEM; 2% fee",
      withdraw:"Withdraw", withdrawNote:"Min 0.0001 BEM",
      realTables:"On-chain tables",

      createRoom:"Create room", joinRoom:"Join room",
      createRoomTitle:"Create Room", createRoomDesc:"Choose room type:",
      roomPublic:"Public", roomPrivate:"Private",
      roomPasswordPlaceholder:"Room password",
      joinRoomTitle:"Join a Room", joinRoomDesc:"Enter the room code:",
      join:"Join", confirm:"Confirm", cancel:"Cancel", close:"Close",

      footer1:"1 chip = 0.0001 BEM.",
      footer2:"Dealing uses platform RNG.",

      rulesTitle:"Dealing", rulesDesc:"Platform RNG; chain only handles BEM.",
      rule1Title:"Dealing", rule1Body:"Platform RNG.",
      rule2Title:"Replay", rule2Body:"Local record saved.",
      rule3Title:"Chips & rake", rule3Body:"1 chip = 0.0001 BEM.",
      rule4Title:"Three modes", rule4Body:"AI / Points / On-chain.",
      rule5Title:"Deposit / Withdraw", rule5Body:"Min 0.001 BEM.",
      rule6Title:"Disconnect", rule6Body:"30s = auto fold.",
      rule7Title:"Trust", rule7Body:"Platform RNG; chain holds BEM.",
      rule8Title:"Differences", rule8Body:"On-chain deposit/withdraw.",
      faqTitle:"FAQ",
      faq1Q:"Cheat?", faq1A:"Platform RNG.",
      faq2Q:"Why not on-chain shuffle?", faq2A:"High gas.",
      faq3Q:"Collude?", faq3A:"Every hand recorded.",
      faq4Q:"Bots?", faq4A:"Only in AI mode.",
      faq5Q:"Bad network?", faq5A:"30s auto fold.",
      faq6Q:"Contract?", faq6A:"BEM held by contract.",
      faq7Q:"Fee?", faq7A:"2% deposit.",
      faq8Q:"Rake?", faq8A:"Contract address.",
      faq9Q:"Audited?", faq9A:"No, start small.",
      faq10Q:"Privacy?", faq10A:"Local storage.",
      faq11Q:"Real players?", faq11A:"Yes.",
      faq12Q:"Mobile?", faq12A:"Landscape.",
      faq13Q:"Legal?", faq13A:"Check local laws.",

      myNumbersTitle:"My numbers", myNumbersSub:"0 tables · not connected",
      statTotalPnl:"Total P&L", statTables:"Tables played", statWinRate2:"Pot win rate",
      statBiggest:"Biggest pot", statTotalBuyIn:"Total buy-in", statTotalCashout:"Total cashout",
      sessionsHeading:"Sessions",
      colTable:"Table", colBlinds:"Blinds", colBuyIn:"Buy-in", colCashout:"Cashout",
      colPnl:"P&L", colHands:"Hands", colWon:"Won", colStatus:"Status",
      resetNumbers:"Reset numbers",
      handHistoryHeading:"Recent hands", clearHistory:"Clear",

      logTitle:"Action Log", handInfoTitle:"Hand Info", dealer:"Dealer",
      potLabel:"Pot", sidePotLabel:"Side pot", yourHand:"Your Hand", nextHand:"Next hand",
      preset2x:"2×", preset3x:"3×", preset4x:"4×",
      presetQuarter:"1/4 Pot", presetThird:"1/3 Pot", presetHalf:"1/2 Pot",
      presetTwoThird:"2/3 Pot", presetThreeQuarter:"3/4 Pot", presetPot:"Pot", presetAllin:"All-in",
      rebuyTitle:"Out of Chips", rebuyContinue:"Rebuy", leaveTable:"Leave",
      gameOverTitle:"Game Over",
      walletTitle:"Connect Wallet", walletDesc:"Connect Binance Web3 or MetaMask to BNB Chain.",

      actionFold:"Fold", actionCheck:"Check", actionCall:"Call",
      actionBet:"Bet", actionRaiseTo:"Raise to", actionRaise:"Raise…", actionBetMenu:"Bet…",
      stagePreflop:"Pre-flop", stageFlop:"Flop", stageTurn:"Turn", stageRiver:"River", stageShowdown:"Showdown",
      handNum:"Hand #{n}", dealerIs:"Dealer {name}", blindsAre:"Blinds {sb} / {bb}",
      handShortLabel:"Hand #{n}",
      sbBet:"SB {name} {amt}, BB {name2} {amt2}",
      playerFolds:"{name} folds", playerChecks:"{name} checks",
      playerCalls:"{name} calls {amt}", playerBets:"{name} bets {amt}",
      playerRaises:"{name} raises to {amt}",
      flopIs:"Flop: {cards}", turnIs:"Turn: {card}", riverIs:"River: {card}",
      showdownHeader:"--- Showdown ---", reveals:"{name} reveals: {cards}",
      handResult:"{name}: {cards} → {hand}",
      winsPot:"{name} wins {pot}", winsPotSide:"{name} wins {potLabel} {amt} ({hand})",
      pot:"Pot", mainPot:"Main", sidePot:"Side", chips:"chips", hand:"hand",
      infoHand:"Hand", infoStage:"Stage", infoPot:"Pot",
      infoYourBet:"Your bet", infoToCall:"To call",
      timeoutFold:"{name} timed out, auto-fold",
      handHighCard:"High Card", handPair:"One Pair", handTwoPair:"Two Pair",
      handTrips:"Three of a Kind", handStraight:"Straight", handFlush:"Flush",
      handFullHouse:"Full House", handQuads:"Four of a Kind", handStraightFlush:"Straight Flush",
      styleTAG:"TAG", styleLAG:"LAG", styleNit:"Nit", styleStation:"Station", styleManiac:"Maniac",
      posBTNSB:"BTN/SB", posBTN:"BTN", posSB:"SB", posBB:"BB",
      posUTG:"UTG", posUTG1:"UTG+1", posHJ:"HJ", posCO:"CO", posMP:"MP",
      handShort:"Hand",

      chatTitle:"Chat", chatPlaceholder:"Type a message...", chatSend:"Send",
      ingameHistoryTitle:"Hand History",
      quickNice:"Nice hand", quickThanks:"Thanks", quickBluff:"Bluffing?", quickAngry:"!!!!!😡",

      waitingRoomTitle:"Online Lobby", roomCode:"Room code", copy:"Copy",
      playersOnline:"Players online", ready:"Ready", waitingHint:"At least 2 players",
      roomFull:"Room is full (max 7)",
      waitingForPlayers:"Waiting for players...",
      notReady:"Not ready", isReady:"Ready",

      youAreSpectating:"You are spectating",
      takeSeat:"Take seat (next hand)",
      leaveSeat:"Leave seat",
      cancelTakeSeat:"Cancel",
      spectatorsList:"Spectators",
      hostControls:"Host Controls",
      togglePrivate:"Toggle Room Type",
      playersListTitle:"Room Players",
      kickBtn:"Kick",
      transferHostBtn:"Transfer Host",
      youLabel2:"You",
      hostLabel:"Host",
      seatLabel:"Seated",
      spectatorLabel:"Spectating",
      confirmKick:"Kick this player?",
      confirmTransfer:"Transfer host to this player?",
      kickedOut:"You have been kicked",
      becomeHost:"You are now the host",
      hostChanged:"Host changed",
      roomIsPrivate:"Private room",
      roomIsPublic:"Public room",
      wrongPassword:"Wrong password",
      needPassword:"Password required",
      waitingForNextHand:"Will take seat next hand",
      playerJoinedRoom:"{name} joined",
      playerTookSeat:"{name} took a seat",
      playerBecameSpectator:"{name} is now spectating"
    }
  };

  let current = 'zh';
  function t(key, vars){
    const lang = T[current] || T.zh;
    let s = lang[key];
    if(s === undefined) s = T.zh[key];
    if(s === undefined) s = key;
    if(vars){
      s = s.replace(/\{(\w+)\}/g, function(m, k){
        return vars[k] !== undefined ? String(vars[k]) : m;
      });
    }
    return s;
  }
  function setLang(l){ if(T[l]) current = l; }
  function getLang(){ return current; }
  function apply(root){
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function(el){
      const key = el.getAttribute('data-i18n');
      const v = t(key);
      if(v.indexOf('<br>') !== -1 || v.indexOf('<') !== -1) el.innerHTML = v;
      else el.textContent = v;
    });
    root.querySelectorAll('[data-i18n-ph]').forEach(function(el){
      el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });
  }
  return { t:t, setLang:setLang, getLang:getLang, apply:apply };
})();