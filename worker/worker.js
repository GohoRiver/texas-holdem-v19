import { ethers } from "ethers";

const BSC_RPC = "https://bsc-dataseed.binance.org/";
const CONTRACT_ADDRESS = "0xD3A6a1605aDC9092aac058c4ABBBc9B513b0aa7c";

const CONTRACT_ABI = [
  "function nonces(address) view returns (uint256)"
];

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const { playerAddress, newBalanceWei } = await request.json();

      if (!playerAddress || !newBalanceWei) {
        return new Response(JSON.stringify({ error: "Invalid input" }), {
          status: 400, headers: corsHeaders,
        });
      }

      // ★ 1. 从链上读当前 nonce（必须！）
      const provider = new ethers.JsonRpcProvider(BSC_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const onChainNonce = await contract.nonces(playerAddress);
      const nonce = onChainNonce.toString();

      // 2. 签名
      const wallet = new ethers.Wallet(env.PLATFORM_PRIVATE_KEY);
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256"],
        [playerAddress, newBalanceWei, nonce]
      );
      const signature = await wallet.signMessage(ethers.getBytes(messageHash));

      return new Response(JSON.stringify({
        success: true,
        signature: signature,
        nonce: nonce,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: corsHeaders,
      });
    }
  },
};