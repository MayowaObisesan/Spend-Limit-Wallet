# Spend Limit Wallet – DApp

## Overview

A fully on-chain **Spend Limit Wallet** dapp with a real Solidity smart contract. The contract enforces a rolling time-window spending cap (e.g. 1 ETH per 24 hours) and implements a three-state machine: **IDLE → ACTIVE → LOCKED**.

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
│           │   ├── wagmi.ts         # wagmi config (Hardhat localhost chain)
│           │   ├── contract.ts      # SpendLimitWallet ABI + default address
│           │   └── deployment.json  # Written by deploy script
│           ├── pages/Dashboard.tsx  # Main dapp UI
│           └── App.tsx
├── lib/
│   └── contracts/           # Hardhat project
│       ├── contracts/
│       │   └── SpendLimitWallet.sol
│       ├── scripts/
│       │   └── deploy.js    # Deploy to localhost, saves deployment.json
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
- `Deposited` — ETH received
- `WindowReset` — spending window expired and reset

## Running the DApp

### 1. Start the Hardhat node (already configured as a workflow)
```bash
pnpm --filter @workspace/contracts run node
```

### 2. Deploy the contract
```bash
pnpm --filter @workspace/contracts run deploy:local
```

### 3. Configure MetaMask
- **RPC URL**: http://localhost:8545
- **Chain ID**: 31337
- **Currency**: ETH
- Import a test private key from the Hardhat node output (Account #0 is the owner)

## Deployed Contract

- **Address**: `0x5FbDB2315678afecb367f032d93F642f64180aa3` (deterministic on fresh Hardhat node)
- **Daily limit**: 1 ETH
- **Window**: 24 hours
- **Initial funding**: 2 ETH (seeded by deploy script)

## Re-deploy

If the Hardhat node restarts, redeploy with:
```bash
pnpm --filter @workspace/contracts run deploy:local
```
The address will always be `0x5FbDB2315678afecb367f032d93F642f64180aa3` on a fresh node.
