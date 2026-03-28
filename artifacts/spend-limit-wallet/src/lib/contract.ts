// ABI for SpendLimitWallet – kept in sync with contracts/SpendLimitWallet.sol
// Deployed on Rootstock Testnet (Chain ID: 31)
export const WALLET_ADDRESS = (
  import.meta.env.VITE_WALLET_ADDRESS ?? "0xC749ddF97bf27bAB624C300eC7ad09C8235D8a59"
) as `0x${string}`;

export const WALLET_ABI = [
  // ── Constructor ────────────────────────────────────────────────────────────
  {
    type: "constructor",
    inputs: [
      { name: "_dailyLimit", type: "uint256", internalType: "uint256" },
      { name: "_windowDuration", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "nonpayable",
  },

  // ── Public state variables (auto-getters) ──────────────────────────────────
  {
    name: "owner",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    name: "dailyLimit",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "windowDuration",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "spentInWindow",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "windowStart",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },

  // ── View functions ─────────────────────────────────────────────────────────
  {
    name: "isWindowExpired",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    name: "currentState",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "enum SpendLimitWallet.State" }],
    stateMutability: "view",
  },
  {
    name: "getWindowInfo",
    type: "function",
    inputs: [],
    outputs: [
      { name: "spent", type: "uint256", internalType: "uint256" },
      { name: "remaining", type: "uint256", internalType: "uint256" },
      { name: "windowEndsAt", type: "uint256", internalType: "uint256" },
      { name: "state", type: "uint8", internalType: "enum SpendLimitWallet.State" },
      { name: "balance", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },

  // ── Write functions ────────────────────────────────────────────────────────
  {
    name: "spend",
    type: "function",
    inputs: [
      { name: "to", type: "address", internalType: "address payable" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "description", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "updateLimit",
    type: "function",
    inputs: [{ name: "newLimit", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "deposit",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },

  // ── Receive ───────────────────────────────────────────────────────────────
  { type: "receive", stateMutability: "payable" },

  // ── Events ────────────────────────────────────────────────────────────────
  {
    name: "Deposited",
    type: "event",
    inputs: [
      { name: "from", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
  {
    name: "SpendApproved",
    type: "event",
    inputs: [
      { name: "to", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "description", type: "string", indexed: false, internalType: "string" },
      { name: "spentTotal", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "remaining", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
  {
    name: "SpendRejected",
    type: "event",
    inputs: [
      { name: "to", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "description", type: "string", indexed: false, internalType: "string" },
      { name: "reason", type: "string", indexed: false, internalType: "string" },
    ],
  },
  {
    name: "WindowReset",
    type: "event",
    inputs: [
      { name: "newWindowStart", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "previousSpent", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
  {
    name: "LimitUpdated",
    type: "event",
    inputs: [
      { name: "oldLimit", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "newLimit", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },

  // ── Custom Errors ─────────────────────────────────────────────────────────
  { name: "NotOwner", type: "error", inputs: [] },
  {
    name: "LimitExceeded",
    type: "error",
    inputs: [
      { name: "requested", type: "uint256", internalType: "uint256" },
      { name: "remaining", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    name: "InsufficientBalance",
    type: "error",
    inputs: [
      { name: "requested", type: "uint256", internalType: "uint256" },
      { name: "available", type: "uint256", internalType: "uint256" },
    ],
  },
  { name: "ZeroAmount", type: "error", inputs: [] },
  { name: "ZeroLimit", type: "error", inputs: [] },
  { name: "InvalidRecipient", type: "error", inputs: [] },
] as const;

export type WalletState = 0 | 1 | 2; // IDLE=0, ACTIVE=1, LOCKED=2
export const STATE_LABELS: Record<number, string> = {
  0: "IDLE",
  1: "ACTIVE",
  2: "LOCKED",
};
