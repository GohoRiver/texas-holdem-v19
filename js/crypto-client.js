// js/crypto-client.js
// Tapeout Bracelet · 客户端加密工具 v2
window.PokerCrypto = (function(){
  'use strict';

  let _keyPair = null;
  let _pubKeyJwk = null;

  const STORAGE_PREFIX = 'poker_keypair_';

  async function generateKeyPair(){
    _keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );
    _pubKeyJwk = await crypto.subtle.exportKey("jwk", _keyPair.publicKey);
    return _pubKeyJwk;
  }

  /* ★ 新增：确保有密钥对（优先从 sessionStorage 恢复，防止刷新丢失） */
  async function ensureKeyPair(roomId){
    const storageKey = STORAGE_PREFIX + roomId;

    // 1. 尝试恢复
    try {
      const saved = sessionStorage.getItem(storageKey);
      if(saved){
        const obj = JSON.parse(saved);
        const priv = await crypto.subtle.importKey(
          'jwk', obj.privateKey,
          { name: 'ECDH', namedCurve: 'P-256' },
          true, ['deriveKey', 'deriveBits']
        );
        const pub = await crypto.subtle.importKey(
          'jwk', obj.publicKey,
          { name: 'ECDH', namedCurve: 'P-256' },
          true, []
        );
        _keyPair = { privateKey: priv, publicKey: pub };
        _pubKeyJwk = obj.publicKey;
        console.log('[crypto] 从 sessionStorage 恢复密钥对');
        return _pubKeyJwk;
      }
    } catch(e){
      console.warn('[crypto] 恢复密钥失败，将重新生成', e);
    }

    // 2. 新生成
    const pubJwk = await generateKeyPair();
    try {
      const privJwk = await crypto.subtle.exportKey('jwk', _keyPair.privateKey);
      sessionStorage.setItem(storageKey, JSON.stringify({
        privateKey: privJwk,
        publicKey: pubJwk
      }));
      console.log('[crypto] 新密钥对已生成并保存');
    } catch(e){
      console.warn('[crypto] 保存密钥失败', e);
    }
    return pubJwk;
  }

  function getPubKeyJwk(){ return _pubKeyJwk; }
  function hasKeyPair(){ return !!_keyPair; }

  async function deriveSharedAesKey(myPriv, theirPub){
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: theirPub },
      myPriv,
      256
    );
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
      ["decrypt"]
    );
  }

  async function decryptHoleCards(payload){
    if(!_keyPair) throw new Error('Key pair not generated');

    const ephemPub = await crypto.subtle.importKey(
      "jwk", payload.ephem_pubkey,
      { name: "ECDH", namedCurve: "P-256" },
      false, []
    );

    const aesKey = await deriveSharedAesKey(_keyPair.privateKey, ephemPub);

    const iv = hexToBytes(payload.iv);
    const ciphertext = hexToBytes(payload.ciphertext);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  function hexToBytes(hex){
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for(let i = 0; i < bytes.length; i++){
      bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /* ★ 新增：清空指定房间的密钥（离房时调用） */
  function clearKeyPair(roomId){
    if(roomId){
      try { sessionStorage.removeItem(STORAGE_PREFIX + roomId); } catch(e){}
    }
    _keyPair = null;
    _pubKeyJwk = null;
  }

  function reset(){
    _keyPair = null;
    _pubKeyJwk = null;
  }

  return {
    generateKeyPair,
    ensureKeyPair,     // ★ 新增
    clearKeyPair,      // ★ 新增
    getPubKeyJwk,
    hasKeyPair,
    decryptHoleCards,
    reset
  };
})();