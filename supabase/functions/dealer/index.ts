// supabase/functions/dealer/index.ts
// Tapeout Bracelet · Edge Function Dealer v1（阶段 1：只支持 deal）
// ============================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { keccak_256 } from "https://esm.sh/@noble/hashes@1.3.2/sha3";
import { bytesToHex } from "https://esm.sh/@noble/hashes@1.3.2/utils";

// 兼容原代码：包装成 keccak256(str) → 0x... 字符串
function keccak256(str: string): string {
  return bytesToHex(keccak_256(new TextEncoder().encode(str)));
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const SUITS = ["♠","♥","♦","♣"];

interface Card {
  rank: string;
  suit: string;
  value: number;
  red: boolean;
}

function createDeck(): Card[] {
  const deck: Card[] = [];
  const rankValues: Record<string, number> = {
    "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14
  };
  for(const s of SUITS){
    for(const r of RANKS){
      deck.push({
        rank: r, suit: s, value: rankValues[r],
        red: s === "♥" || s === "♦"
      });
    }
  }
  return deck;
}

// ============================================================
// 确定性 PRNG + Fisher-Yates 洗牌
// 与前端 deck.js 的 shuffleWithSeed 保持完全一致
// ============================================================
function deterministicHash(seedHex: string, index: number): string {
  return keccak256(seedHex + ":" + index);
}

function shuffleWithSeed<T>(arr: T[], seedHex: string): T[] {
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const hash = deterministicHash(seedHex, a.length - i);
    // 取 hash 前 13 个 hex 字符（52 bits）转 BigInt，避免精度问题
    const big = BigInt("0x" + hash.slice(0, 13));
    const j = Number(big % BigInt(i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function generateSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// ECIES 加密（ECDH P-256 + AES-GCM）
// 服务器用玩家的 ECDH 公钥，生成临时密钥对，算出共享密钥，
// 用 AES-GCM 加密底牌，把临时公钥 + IV + 密文返回。
// 玩家用自己私钥 + 临时公钥算出共享密钥解密。
// ============================================================

async function generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,  // extractable（需要导出临时公钥给玩家）
    ["deriveKey", "deriveBits"]
  );
}

async function importPlayerPubKey(jwk: JsonWebKey | string): Promise<CryptoKey> {
  // ★ 兼容数据库里存的字符串形式（TEXT 字段）
  const key = typeof jwk === "string" ? JSON.parse(jwk) : jwk;
  return await crypto.subtle.importKey(
    "jwk", key,
    { name: "ECDH", namedCurve: "P-256" },
    false, []
  );
}

async function deriveSharedAesKey(
  myPriv: CryptoKey,
  theirPub: CryptoKey
): Promise<CryptoKey> {
  // 先算共享 secret bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: theirPub },
    myPriv,
    256
  );
  // 用 HKDF 把 shared secret 转成 AES key
  const hkdfKey = await crypto.subtle.importKey(
    "raw", sharedBits, "HKDF", false, ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("tapeout-poker-v1")
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptForPlayer(
  playerPubJwk: JsonWebKey,
  plaintext: string
): Promise<{ ephemPubkey: JsonWebKey; iv: string; ciphertext: string }> {
  const playerPub = await importPlayerPubKey(playerPubJwk);
  const ephem = await generateEphemeralKeyPair();
  const aesKey = await deriveSharedAesKey(ephem.privateKey, playerPub);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  const ephemPubJwk = await crypto.subtle.exportKey("jwk", ephem.publicKey);

  return {
    ephemPubkey: ephemPubJwk,
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, "0")).join(""),
    ciphertext: Array.from(new Uint8Array(enc)).map(b => b.toString(16).padStart(2, "0")).join("")
  };
}

// ============================================================
// HTTP Handler
// ============================================================

serve(async (req) => {
  if(req.method === "OPTIONS"){
    return new Response(null, { headers: corsHeaders });
  }
  if(req.method !== "POST"){
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch(e){
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = body.action;
  if(!action){
    return json({ error: "Missing action" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!   // ★ 用 service role，绕过 RLS
  );

  try {
    switch(action){
      case "deal":
        return await handleDeal(supabase, body);
      case "deal_community":
        return await handleDealCommunity(supabase, body);
      case "reveal":
        return await handleReveal(supabase, body);
      default:
        return json({ error: "Unknown action: " + action }, 400);
    }
  } catch(err){
    console.error("[dealer] error:", err);
    return json({ error: (err as Error).message || String(err) }, 500);
  }
});

function json(data: any, status = 200){
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// ============================================================
// deal：开局发牌
// ============================================================

async function handleDeal(supabase: any, body: any){
  const { room_id, hand_no } = body;

  if(!room_id || typeof hand_no !== "number"){
    return json({ error: "Missing room_id or hand_no" }, 400);
  }

  // 1. 读房间信息
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("*")
    .eq("room_id", room_id)
    .single();
  if(roomErr || !room) return json({ error: "Room not found" }, 404);

  // 2. 读房间玩家（有 pubkey 的才算参战）
  const { data: players, error: playersErr } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", room_id)
    .not("pubkey", "is", null)
    .order("seat", { ascending: true });
  if(playersErr) return json({ error: "Players read failed: " + playersErr.message }, 500);
  if(!players || players.length < 2){
    return json({ error: "Need at least 2 players with pubkeys" }, 400);
  }

  // 3. 检查这一手是否已存在（幂等）
  const { data: existingHand } = await supabase
    .from("hands")
    .select("hand_id, seed_commit")
    .eq("room_id", room_id)
    .eq("hand_no", hand_no)
    .maybeSingle();
  if(existingHand){
    return json({ error: "Hand already exists", hand_id: existingHand.hand_id }, 409);
  }

  // 4. 生成 seed 并 commit
  const seed = generateSeed();
  const seedCommit = "0x" + keccak256(seed);

  // 5. 洗牌
  const deck = createDeck();
  const shuffled = shuffleWithSeed(deck, seed);

  // 6. 计算 dealer seat（简单轮转）
  const dealerSeat = ((hand_no - 1) % players.length);
  // 假设 players 已按 seat 排序，dealerSeat 是 index
  const dealerIdx = dealerSeat;

  // 7. 给每个玩家发两张底牌（按座位顺序）
  // 发牌顺序：从 dealer 下家开始，每人两张（第一轮 + 第二轮）
  const n = players.length;
  let deckIdx = 0;
  const holeCards: Record<string, Card[]> = {};

  for(let round = 0; round < 2; round++){
    for(let i = 1; i <= n; i++){
      const idx = (dealerIdx + i) % n;
      const p = players[idx];
      if(!holeCards[p.peer_id]) holeCards[p.peer_id] = [];
      holeCards[p.peer_id].push(shuffled[deckIdx]);
      deckIdx++;
    }
  }

  // 8. 写入 hands 表
  const community: Card[] = [];
  const { data: handRow, error: handErr } = await supabase
    .from("hands")
    .insert({
      room_id,
      hand_no,
      seed_commit: seedCommit,
      stage: "preflop",
      community_cards: [],
      pot: 0,
      current_bet: 0,
      dealer_seat: dealerIdx,
      current_player_seat: (dealerIdx + 1) % n,
      state_snapshot: {
        deck_remaining: shuffled.slice(deckIdx),
        players_order: players.map(p => ({ peer_id: p.peer_id, seat: p.seat }))
      }
    })
    .select()
    .single();

  if(handErr || !handRow){
    return json({ error: "Insert hand failed: " + (handErr?.message || "unknown") }, 500);
  }

  const handId = handRow.hand_id;

  // 9. 加密每人的底牌并写入 hand_holes
  const holesForClient: Record<string, any> = {};
  const insertRows: any[] = [];

  for(const p of players){
    const cards = holeCards[p.peer_id] || [];
    if(cards.length !== 2) continue;

    const plaintext = JSON.stringify(cards);
    const encrypted = await encryptForPlayer(p.pubkey, plaintext);

    insertRows.push({
      hand_id: handId,
      peer_id: p.peer_id,
      seat: p.seat,
      ephem_pubkey: JSON.stringify(encrypted.ephemPubkey),
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext
    });

    // 只把"该玩家的密文"返回给调用者？不 —— deal 是房主调用的
    // 所以这里返回所有密文，由房主广播。
    // 但密文是加密的，房主也无法解密别人的牌。
    holesForClient[p.peer_id] = {
      ephem_pubkey: encrypted.ephemPubkey,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext
    };
  }

  const { error: holesErr } = await supabase
    .from("hand_holes")
    .insert(insertRows);
  if(holesErr){
    console.error("[deal] insert holes failed:", holesErr);
    return json({ error: "Insert holes failed: " + holesErr.message }, 500);
  }

  // 9.5 写入 hand_secrets（seed 暂不公开）
  const { error: secretErr } = await supabase
    .from("hand_secrets")
    .insert({ hand_id: handId, seed: seed });
  if(secretErr){
    console.error("[deal] insert hand_secrets failed:", secretErr);
    return json({ error: "Insert hand_secrets failed: " + secretErr.message }, 500);
  }

  // 10. 返回给调用者
  return json({
    success: true,
    hand_id: handId,
    hand_no,
    seed_commit: seedCommit,
    // ★ 不返回 seed！手结束后才公开
    // ★ 不返回 deck_order！手结束后才公开
    dealer_seat: dealerIdx,
    current_player_seat: (dealerIdx + 1) % n,
    // 所有玩家的密文底牌（由房主广播给对应玩家）
    holes: holesForClient,
    // 玩家顺序（供广播）
    players: players.map(p => ({
      peer_id: p.peer_id, seat: p.seat, name: p.name
    }))
  });
}

// ============================================================
// deal_community：翻牌 / 转牌 / 河牌
// ============================================================

async function handleDealCommunity(supabase: any, body: any){
  const { room_id, hand_no, stage } = body;

  if(!room_id || typeof hand_no !== "number" || !stage){
    return json({ error: "Missing room_id, hand_no or stage" }, 400);
  }

  // 1. 读当前手牌
  const { data: hand, error: handErr } = await supabase
    .from("hands")
    .select("*")
    .eq("room_id", room_id)
    .eq("hand_no", hand_no)
    .maybeSingle();
  if(handErr || !hand){
    return json({ error: "Hand not found" }, 404);
  }

  const snapshot = hand.state_snapshot || {};
  const deckRemaining: Card[] = Array.isArray(snapshot.deck_remaining)
    ? snapshot.deck_remaining.slice()
    : [];
  const communityCards: Card[] = Array.isArray(hand.community_cards)
    ? hand.community_cards.slice()
    : [];
  const currentStage: string = hand.stage || "preflop";

  // 2. 校验阶段连续性并决定取牌数
  let drawCount = 0;
  if(currentStage === "preflop" && stage === "flop") drawCount = 3;
  else if(currentStage === "flop" && stage === "turn") drawCount = 1;
  else if(currentStage === "turn" && stage === "river") drawCount = 1;
  else return json({ error: "Invalid stage transition" }, 400);

  if(deckRemaining.length < drawCount){
    return json({ error: "Not enough cards in deck" }, 500);
  }

  // 3. 从牌堆前部取牌
  const newCards = deckRemaining.splice(0, drawCount);
  const updatedCommunity = communityCards.concat(newCards);

  // 4. 更新 hands 表
  const { error: updErr } = await supabase
    .from("hands")
    .update({
      community_cards: updatedCommunity,
      stage: stage,
      state_snapshot: Object.assign({}, snapshot, { deck_remaining: deckRemaining })
    })
    .eq("hand_id", hand.hand_id);
  if(updErr){
    console.error("[deal_community] update failed:", updErr);
    return json({ error: "Update failed: " + updErr.message }, 500);
  }

  return json({
    success: true,
    stage: stage,
    new_cards: newCards,
    community_cards: updatedCommunity
  });
}

// ============================================================
// reveal：手牌结束后公开 seed
// ============================================================

async function handleReveal(supabase: any, body: any){
  const { room_id, hand_no } = body;

  if(!room_id || typeof hand_no !== "number"){
    return json({ error: "Missing room_id or hand_no" }, 400);
  }

  // 1. 读 hands
  const { data: hand, error: handErr } = await supabase
    .from("hands")
    .select("hand_id, seed_commit, seed_revealed")
    .eq("room_id", room_id)
    .eq("hand_no", hand_no)
    .maybeSingle();
  if(handErr || !hand){
    return json({ error: "Hand not found" }, 404);
  }

  // 2. 已公开过 → 直接返回
  if(hand.seed_revealed){
    return json({
      success: true,
      seed: hand.seed_revealed,
      seed_commit: hand.seed_commit,
      already: true
    });
  }

  // 3. 读 hand_secrets
  const { data: secret, error: secretErr } = await supabase
    .from("hand_secrets")
    .select("seed")
    .eq("hand_id", hand.hand_id)
    .maybeSingle();
  if(secretErr || !secret){
    return json({ error: "Secret not found" }, 500);
  }

  // 4. 更新 hands.seed_revealed
  const { error: updErr } = await supabase
    .from("hands")
    .update({ seed_revealed: secret.seed })
    .eq("hand_id", hand.hand_id);
  if(updErr){
    console.error("[reveal] update hands failed:", updErr);
    return json({ error: "Update hands failed: " + updErr.message }, 500);
  }

  // 5. 标记 hand_secrets.revealed_at
  const { error: markErr } = await supabase
    .from("hand_secrets")
    .update({ revealed_at: new Date().toISOString() })
    .eq("hand_id", hand.hand_id);
  if(markErr){
    console.warn("[reveal] mark revealed_at failed:", markErr);
  }

  return json({
    success: true,
    seed: secret.seed,
    seed_commit: hand.seed_commit
  });
}
