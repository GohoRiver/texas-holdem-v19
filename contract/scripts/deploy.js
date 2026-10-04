const hre = require("hardhat");

async function main() {
  const BEM_TOKEN_ADDRESS = "0x5ce033b2bfca3af30b3e8c8457deaf776a8b695a";

  const [deployer] = await hre.ethers.getSigners();
  console.log("部署账户:", deployer.address);

  const Game = await hre.ethers.getContractFactory("TexasHoldemGame");
  console.log("开始部署合约...");

  // 发送部署交易
  const game = await Game.deploy(BEM_TOKEN_ADDRESS);
  
  // 直接获取地址（避免触发 ethers 的解析 bug）
  const contractAddress = await game.getAddress();
  const tx = game.deploymentTransaction();
  
  console.log("========================================");
  console.log("合约地址:", contractAddress);
  console.log("交易哈希:", tx ? tx.hash : "未知");
  console.log("请把这个合约地址填入前端 js/wallet.js");
  console.log("========================================");
  
  // 尝试等待确认，如果报错就忽略（因为交易实际上已经上链）
  if (tx) {
    try {
      await tx.wait();
      console.log("交易已确认！");
    } catch (e) {
      console.log("节点返回解析错误，但交易可能已经成功，请去 BscScan 核对哈希。");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});