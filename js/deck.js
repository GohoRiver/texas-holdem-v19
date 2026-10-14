window.PokerDeck = (function(){
  const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  const SUITS = ["♠","♥","♦","♣"];
  const RANK_VALUES = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14};
  const RED_SUITS = { "♥": true, "♦": true };

  function create(){
    const d = [];
    for(let si = 0; si < SUITS.length; si++){
      const s = SUITS[si];
      for(let ri = 0; ri < RANKS.length; ri++){
        const r = RANKS[ri];
        d.push({
          rank: r, suit: s,
          value: RANK_VALUES[r],
          display: r + " " + s,
          red: !!RED_SUITS[s]
        });
      }
    }
    return d;
  }

  function shuffle(a){
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  function keccak256OfString(str){
    const bytes = new TextEncoder().encode(str);
    if(!window.ethers || !window.ethers.keccak256) throw new Error('ethers not loaded');
    return window.ethers.keccak256(bytes);
  }

  function shuffleWithSeed(arr, seedHex){
    const a = arr.slice();
    for(let i = a.length - 1; i > 0; i--){
      const hash = keccak256OfString(seedHex + ':' + (a.length - i));
      const hex = hash.startsWith('0x') ? hash.slice(2) : hash;
      const big = BigInt('0x' + hex.slice(0, 13));
      const j = Number(big % BigInt(i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  return { RANKS: RANKS, SUITS: SUITS, RANK_VALUES: RANK_VALUES, create: create, shuffle: shuffle, shuffleWithSeed: shuffleWithSeed };
})();
