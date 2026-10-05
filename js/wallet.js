window.PokerWallet = (function(){
/* 平台收款地址 */
const PLATFORM_ADDRESS = '0x1219c18adc187c918d0216eb7b983f5068eeb19a';

/* BEM 代币合约地址 */
const BEM_ADDRESS = '0x5ce033b2bfca3af30b3e8c8457deaf776a8b695a';

/* 德州扑克合约地址 */
const CONTRACT_ADDRESS = '0xD3A6a1605aDC9092aac058c4ABBBc9B513b0aa7c';
  const FEE_RATE = 0.02;
  const BSC_CHAIN_ID = '0x38';
  const CHIP_TO_BEM = 0.0001;
  const FEE_NUM = 2n;      /* 2% 手续费，用整数计算 */
  const FEE_DEN = 100n;

  const BEM_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
  ];

  const CONTRACT_ABI = [
 
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_bem",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "fee",
          "type": "uint256"
        }
      ],
      "name": "Deposited",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "owner",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "FeeCollected",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "oldBalance",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "newBalance",
          "type": "uint256"
        }
      ],
      "name": "Settled",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "Withdrawn",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "balances",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "bemToken",
      "outputs": [
        {
          "internalType": "contract IERC20",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        }
      ],
      "name": "deposit",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_player",
          "type": "address"
        }
      ],
      "name": "getBalance",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "nonces",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "platformFees",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_player",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_newBalance",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_nonce",
          "type": "uint256"
        },
        {
          "internalType": "bytes",
          "name": "_signature",
          "type": "bytes"
        }
      ],
      "name": "settleBalance",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        }
      ],
      "name": "withdraw",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "withdrawPlatformFees",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];

  let provider = null;
  let signer = null;
  let userAddress = null;
  let bemBalance = 0;
  let contractBalance = 0;
  let decimals = 18;

  function getEth(){
    return window.binancew3w?.ethereum || window.ethereum || null;
  }

  /* 把错误对象转成可读字符串 */
  function errMsg(e){
    if(!e) return 'unknown';
    return e.reason || e.shortMessage || e.info?.error?.message || e.message || String(e);
  }

  async function connect(){
    const eth = getEth();
    if(!eth){
      alert('请安装币安 Web3 钱包或 MetaMask');
      return null;
    }
    try{
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if(!accounts || !accounts.length) return null;
      userAddress = accounts[0];

      try{
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BSC_CHAIN_ID }]
        });
      }catch(sw){
        if(sw.code === 4902){
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: BSC_CHAIN_ID,
              chainName: 'BNB Smart Chain',
              nativeCurrency: { name:'BNB', symbol:'BNB', decimals:18 },
              rpcUrls: ['https://bsc-dataseed.binance.org/'],
              blockExplorerUrls: ['https://bscscan.com/']
            }]
          });
        } else {
          throw sw;
        }
      }

      provider = new ethers.BrowserProvider(eth);
      signer = await provider.getSigner();

      await refreshBemBalance();
      await refreshContractBalance();
      updateUI();

      eth.on && eth.on('accountsChanged', function(accs){
        if(accs && accs.length){
          userAddress = accs[0];
          refreshBemBalance()
            .then(refreshContractBalance)
            .then(updateUI);
        } else {
          userAddress = null;
          bemBalance = 0;
          contractBalance = 0;
          updateUI();
        }
      });

      return { address: userAddress, signer, bemBalance };
    }catch(err){
      console.error('connect error', err);
      return null;
    }
  }

  async function refreshBemBalance(){
    if(!provider || !userAddress) return 0;
    try{
      const contract = new ethers.Contract(BEM_ADDRESS, BEM_ABI, provider);
      const raw = await contract.balanceOf(userAddress);
      try{
        decimals = Number(await contract.decimals());
      }catch(e){ decimals = 18; }
      bemBalance = parseFloat(ethers.formatUnits(raw, decimals));
    }catch(e){
      console.warn('read BEM failed', e);
      bemBalance = 0;
    }
    return bemBalance;
  }

  async function refreshContractBalance(){
    if(!provider || !userAddress) return 0;
    try{
      const game = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const raw = await game.getBalance(userAddress);
      contractBalance = parseFloat(ethers.formatUnits(raw, decimals));
    }catch(e){
      console.warn('read contract balance failed', e);
      contractBalance = 0;
    }
    return contractBalance;
  }
  // ★ 新增：返回链上余额的 wei 字符串（BigInt 精度，给结算用）
async function getContractBalanceWei(){
  if(!provider || !userAddress) return '0';
  try{
    const game = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const raw = await game.getBalance(userAddress);
    return raw.toString();  // uint256 的字符串
  }catch(e){
    console.warn('getContractBalanceWei failed', e);
    return '0';
  }
}

  function updateUI(){
    const btn = document.getElementById('connectWalletBtn');
    const btn2 = document.getElementById('realConnectBtn');
    const label = userAddress
      ? (userAddress.slice(0,6) + '...' + userAddress.slice(-4))
      : null;

    if(btn){
      if(label){ btn.textContent = label; btn.classList.add('connected'); }
      else { btn.textContent = window.PokerI18n.t('connectWallet'); btn.classList.remove('connected'); }
    }
    if(btn2){
      if(label){ btn2.textContent = label; btn2.classList.add('connected'); }
      else { btn2.textContent = window.PokerI18n.t('connectWallet'); btn2.classList.remove('connected'); }
    }

    const bem = document.getElementById('walletBemBalance');
    if(bem) bem.textContent = bemBalance.toFixed(4);

    const addr = document.getElementById('walletAddress');
    if(addr){
      addr.textContent = userAddress
        ? (userAddress.slice(0,6) + '...' + userAddress.slice(-4))
        : window.PokerI18n.t('notConnected');
    }

    const pill = document.getElementById('statusPill');
    if(pill && userAddress){
      pill.innerHTML = '<span class="dot" style="background:#22c55e;box-shadow:0 0 6px #22c55e;"></span>' + bemBalance.toFixed(2) + ' BEM';
    }
  }

  /* =========================================================
     充值：用户 approve 合约 → 转手续费到平台 → 调用合约 deposit
     全程用 BigInt 精确计算，避免浮点误差
     ========================================================= */
  async function depositBem(amountBem){
  if(!signer || !userAddress) throw new Error('钱包未连接');
  const amount = Number(amountBem);
  if(!amount || amount < 0.001) throw new Error('最低充值 0.001 BEM');
  if(amount > bemBalance) throw new Error('钱包 BEM 不足');

  // 1. 转换为 wei 精度
  const amountWei = ethers.parseUnits(amount.toFixed(6), decimals);

  const bemContract = new ethers.Contract(BEM_ADDRESS, BEM_ABI, signer);
  const gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  // 2. 授权合约全额（合约内部会自动扣 2% 给平台）
  console.log('[deposit] step1 approve...');
  const approveTx = await bemContract.approve(CONTRACT_ADDRESS, amountWei);
  await approveTx.wait();
  console.log('[deposit] approve ok:', approveTx.hash);

  // 3. 调用合约 deposit（内部记账：98% 给玩家，2% 给平台）
  console.log('[deposit] step2 contract.deposit...');
  const depositTx = await gameContract.deposit(amountWei);
  await depositTx.wait();
  console.log('[deposit] deposit ok:', depositTx.hash);

  // 4. 刷新链上余额
  await refreshBemBalance();
  await refreshContractBalance();
  updateUI();

  // 5. 返回给前端用于 UI 展示的数据
  const feeBem = amount * 0.02;
  const netBem = amount * 0.98;
  return {
    netChips: Math.floor(netBem / CHIP_TO_BEM),
    netBem: netBem,
    feeBem: feeBem,
    txHash: depositTx.hash
  };
}

  /* =========================================================
     提现：调用合约的 withdraw
     ========================================================= */
 async function withdrawBem(amountBem){
  if(!signer || !userAddress) throw new Error('钱包未连接');
  const amount = Number(amountBem);
  if(!amount || amount <= 0) throw new Error('请输入提现金额');

  const amountWei = ethers.parseUnits(amount.toFixed(6), decimals);
  const gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  console.log('[withdraw] amountWei =', amountWei.toString());
  const tx = await gameContract.withdraw(amountWei);
  await tx.wait();
  console.log('[withdraw] ok:', tx.hash);

  await refreshBemBalance();
  await refreshContractBalance();
  updateUI();

  return { txHash: tx.hash, amount: amount };
}
  // ★ 离桌结算：由 Cloudflare Worker 签名后，玩家调用链上合约
   async function settleBalanceOnChain(playerAddress, newBalance, nonce, signature) {
    if(!signer) throw new Error('钱包未连接');
    const gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    const tx = await gameContract.settleBalance(playerAddress, newBalance, nonce, signature);
    await tx.wait();
    await refreshContractBalance();
    updateUI();
    return tx;
  }
  /* ★ 新增：用当前钱包签名任意消息（用于联机防作弊） */
async function signMessage(message){
  if(!signer) throw new Error('钱包未连接');
  if(!userAddress) throw new Error('钱包地址为空');
  return await signer.signMessage(message);
}

/* ★ 新增：离线验证签名（不需要 signer，纯计算） */
function verifyMessage(message, signature){
  try {
    return ethers.verifyMessage(message, signature);
  } catch(e){
    console.warn('verifyMessage failed', e);
    return null;
  }
}

  function getBemBalance(){ return bemBalance; }
  function getContractBalance(){ return contractBalance; }
  function getAddress(){ return userAddress; }
  function isConnected(){ return !!userAddress; }
  function getPlatformAddress(){ return PLATFORM_ADDRESS; }
  function getContractAddress(){ return CONTRACT_ADDRESS; }
  function getFeeRate(){ return FEE_RATE; }

  return {
    connect,
    depositBem,
    withdrawBem,
    settleBalanceOnChain,   // ★ 加上这行
    signMessage,          // ★ 加
  verifyMessage, 
    refreshBemBalance,
    refreshContractBalance,
    getContractBalanceWei,
    updateUI,
    getBemBalance,
    getContractBalance,
    getAddress,
    isConnected,
    getPlatformAddress,
    getContractAddress,
    getFeeRate
  };
})();
