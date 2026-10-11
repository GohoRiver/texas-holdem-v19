# 进度快照 2026-10-07

## 已完成
- 阶段1（ECIES 加密链路）
- 阶段2a（进房密钥对 + 数据库 pubkey）

## 进行中
- 阶段2b（房主改调 Edge Function 发牌）
- 正在修：公共牌不洗牌、第一手看不到底牌、浮动数字缺失、房主离桌卡死

## 关键 URL
- 前端: https://texas-holdem-v19.pages.dev/
- GitHub: https://github.com/GohoRiver/texas-holdem-v19
- Edge Function: https://olmlqguftnmnpyefrokk.supabase.co/functions/v1/dealer
- Worker: https://texas-holdem-settle.2027499636.workers.dev
- 合约: 0xD3A6a1605aDC9092aac058c4ABBBc9B513b0aa7c

## 下次要做的
- 推阶段2b的 bug 修复，测试
- 阶段3（摊牌 reveal_hole）
- 阶段4（下注校验搬 Edge Function）
- 阶段5（种子公开 + 审计）