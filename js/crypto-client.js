// js/crypto-client.js
// Tapeout Bracelet · 客户端加密工具
window.PokerCrypto = (function(){
  'use strict';

  let _keyPair = null;
  let _pubKeyJwk = null;

  async function generateKeyPair(){
    _keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );
    _pubKeyJwk = await crypto.subtle.exportKey("jwk", _keyPair.publicKey);
    return _pubKeyJwk;
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

  function reset(){
    _keyPair = null;
    _pubKeyJwk = null;
  }

  return {
    generateKeyPair, getPubKeyJwk, hasKeyPair,
    decryptHoleCards, reset
  };
})();