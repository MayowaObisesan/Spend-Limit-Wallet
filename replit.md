# Spend Limit Wallet – DApp

## Overview

A fully on-chain **Spend Limit Wallet** dapp with a real Solidity smart contract. The contract enforces a rolling time-window spending cap (e.g. 1 tRBTC per 24 hours) and implements a three-state machine: **IDLE → ACTIVE → LOCKED**. Deployed and tested on **Rootstock Testnet** (Chain ID: 31).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Smart Contract**: Solidity 0.8.20 (`SpendLimitWallet.sol`)
- **Contract tooling**: Hardhat 2.x + hardhat-ethers
- **Frontend**: React 19 + Vite 7
- **Web3 client**: wagmi v3 + viem v2
- **UI**: Tailwind CSS v4 + shadcn/ui components
- **Backend**: Express 5 (health endpoint only; no DB needed — state lives on-chain)

## Structure

```text
├── artifacts/
│   ├── api-server/          # Express health endpoint
│   └── spend-limit-wallet/  # React dapp frontend
│       └── src/
│           ├── lib/
│           │   ├── wagmi.ts         # wagmi config (rootstockTestnet)
│           │   ├── contract.ts      # SpendLimitWallet ABI + optional address
│           │   └── deployment.json  # Written by deploy script
│           ├── pages/Dashboard.tsx  # Main dapp UI
│           └── App.tsx
├── lib/
│   └── contracts/           # Hardhat project
│       ├── contracts/
│       │   └── SpendLimitWallet.sol
│       ├── scripts/
│       │   └── deploy.js    # Network-aware deploy script
│       └── hardhat.config.js
```

## Smart Contract — SpendLimitWallet.sol

### State Machine
| State    | Meaning |
|----------|---------|
| `IDLE`   | No spending in the current window (or window expired) |
| `ACTIVE` | Some spending has occurred but daily limit not yet hit |
| `LOCKED` | Daily cap reached — no spends until window resets |

### Key Functions
- `spend(address to, uint256 amount, string description)` — owner-only; enforces limit; auto-resets expired window
- `deposit() payable` — anyone can fund the wallet
- `getWindowInfo()` — view: returns (spent, remaining, windowEndsAt, state, balance)
- `updateLimit(uint256 newLimit)` — owner-only; update the daily cap
- `currentState()` — view: returns the current State enum value

### Events
- `SpendApproved` — successful spend executed
- `SpendRejected` — spend blocked by limit
- `Deposited` — tRBTC received
- `WindowReset` — spending window expired and reset

## Deploying to Rootstock Testnet

### 1. Get testnet tRBTC
Visit https://faucet.rootstock.io to receive free testnet tokens.

### 2. Deploy the contract
```bash
PRIVATE_KEY=0x<your_private_key> pnpm --filter @workspace/contracts run deploy:testnet
```
The script prints the contract address — paste it into the dapp or set `VITE_WALLET_ADDRESS`.

### 3. Configure MetaMask
- **Network**: Rootstock Testnet
- **RPC URL**: https://public-node.testnet.rsk.co
- **Chain ID**: 31
- **Currency**: tRBTC
- **Explorer**: https://explorer.testnet.rootstock.io

## Contract Address

Set `VITE_WALLET_ADDRESS=0x<address>` in the environment or paste it into the contract address field in the dapp. The dapp reads `import.meta.env.VITE_WALLET_ADDRESS` at build time and falls back to a runtime input field.

## Local Development (optional)

For local testing, you can still use the Hardhat node:
```bash
pnpm --filter @workspace/contracts run node
pnpm --filter @workspace/contracts run deploy:local
```
Note: the frontend is configured for Rootstock Testnet. To test locally, also switch `wagmi.ts` back to the `hardhat` chain.
