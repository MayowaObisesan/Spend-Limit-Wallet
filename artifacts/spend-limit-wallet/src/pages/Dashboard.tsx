import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useWatchContractEvent,
  useBalance,
} from "wagmi";
import { parseEther, formatEther, isAddress } from "viem";
import { rootstockTestnet } from "wagmi/chains";
import { WALLET_ABI, STATE_LABELS, WALLET_ADDRESS } from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Zap, Lock, Clock, ArrowUpRight, ArrowDownLeft, RefreshCw, AlertCircle, CheckCircle2, XCircle, Info } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TxEvent {
  id: string;
  type: "approved" | "rejected" | "deposited" | "reset" | "limitUpdated" | "limitScheduled" | "ownership";
  description: string;
  amount?: string;
  to?: string;
  timestamp: number;
}

// ─── Countdown helper ─────────────────────────────────────────────────────────
function useCountdown(targetTs: number) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      setRemaining(Math.max(0, targetTs - now));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetTs]);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  return { h, m, s, remaining };
}

// ─── State badge ──────────────────────────────────────────────────────────────
function StateBadge({ state }: { state: number | undefined }) {
  if (state === undefined)
    return <Badge variant="outline" className="text-muted-foreground">Loading…</Badge>;

  if (state === 0)
    return (
      <Badge className="bg-muted text-muted-foreground border-muted-border gap-1.5 text-sm px-3 py-1">
        <Clock className="w-3.5 h-3.5" />
        IDLE
      </Badge>
    );
  if (state === 1)
    return (
      <Badge className="active-glow bg-accent/20 text-accent border-accent/40 gap-1.5 text-sm px-3 py-1">
        <Zap className="w-3.5 h-3.5" />
        ACTIVE
      </Badge>
    );
  return (
    <Badge className="locked-glow bg-destructive/20 text-destructive border-destructive/40 gap-1.5 text-sm px-3 py-1">
      <Lock className="w-3.5 h-3.5" />
      LOCKED
    </Badge>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────────
function EventRow({ event }: { event: TxEvent }) {
  const icons: Record<TxEvent["type"], React.ReactNode> = {
    approved:      <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />,
    rejected:      <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />,
    deposited:     <ArrowDownLeft className="w-4 h-4 text-primary shrink-0 mt-0.5" />,
    reset:         <RefreshCw className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />,
    limitUpdated:  <Zap className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />,
    limitScheduled:<Clock className="w-4 h-4 text-yellow-400/70 shrink-0 mt-0.5" />,
    ownership:     <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />,
  };
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      {icons[event.type]}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{event.description}</p>
        {event.amount && (
          <p className="text-xs text-muted-foreground mt-0.5">{event.amount} tRBTC</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {new Date(event.timestamp * 1000).toLocaleTimeString()}
      </span>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { toast } = useToast();

  const [events, setEvents] = useState<TxEvent[]>([]);
  const [spendTo, setSpendTo] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [spendDesc, setSpendDesc] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [newLimitAmount, setNewLimitAmount] = useState("");
  const [transferToAddress, setTransferToAddress] = useState("");
  const contractAddress = WALLET_ADDRESS;

  const addEvent = useCallback((e: Omit<TxEvent, "id">) => {
    setEvents((prev) => [{ ...e, id: `${e.timestamp}-${Math.random()}` }, ...prev].slice(0, 50));
  }, []);

  // ── Contract reads ──────────────────────────────────────────────────────────
  const { data: windowInfo, refetch: refetchWindowInfo } = useReadContract({
    address: contractAddress,
    abi: WALLET_ABI,
    functionName: "getWindowInfo",
    query: { enabled: !!contractAddress, refetchInterval: 5000 },
  });

  const { data: ownerAddress } = useReadContract({
    address: contractAddress,
    abi: WALLET_ABI,
    functionName: "owner",
    query: { enabled: !!contractAddress },
  });

  const { data: dailyLimitRaw } = useReadContract({
    address: contractAddress,
    abi: WALLET_ABI,
    functionName: "dailyLimit",
    query: { enabled: !!contractAddress },
  });

  const { data: windowDurationRaw } = useReadContract({
    address: contractAddress,
    abi: WALLET_ABI,
    functionName: "windowDuration",
    query: { enabled: !!contractAddress },
  });

  const { data: pendingOwnerAddress } = useReadContract({
    address: contractAddress,
    abi: WALLET_ABI,
    functionName: "pendingOwner",
    query: { enabled: !!contractAddress, refetchInterval: 5000 },
  });

  const { data: userBalance, refetch: refetchBalance } = useBalance({
    address,
    chainId: rootstockTestnet.id,
    query: { enabled: !!address },
  });

  // ── Contract writes ─────────────────────────────────────────────────────────
  const { writeContractAsync: writeContract, isPending: isTxPending } = useWriteContract();

  // ── Event watchers ──────────────────────────────────────────────────────────
  useWatchContractEvent({
    address: contractAddress,
    abi: WALLET_ABI,
    eventName: "SpendApproved",
    enabled: !!contractAddress,
    poll: true,
    pollingInterval: 3000,
    onLogs(logs) {
      logs.forEach((l: any) => {
        addEvent({
          type: "approved",
          description: `Spend to ${String(l.args.to ?? "").slice(0, 10)}… — "${l.args.description}"`,
          amount: formatEther(l.args.amount ?? 0n),
          timestamp: Math.floor(Date.now() / 1000),
        });
        refetchWindowInfo();
        refetchBalance();
      });
    },
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: WALLET_ABI,
    eventName: "SpendRejected",
    enabled: !!contractAddress,
    poll: true,
    pollingInterval: 3000,
    onLogs(logs) {
      logs.forEach((l: any) => {
        addEvent({
          type: "rejected",
          description: `Rejected "${l.args.description}" — ${l.args.reason}`,
          amount: formatEther(l.args.amount ?? 0n),
          timestamp: Math.floor(Date.now() / 1000),
        });
      });
    },
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: WALLET_ABI,
    eventName: "Deposited",
    enabled: !!contractAddress,
    poll: true,
    pollingInterval: 3000,
    onLogs(logs) {
      logs.forEach((l: any) => {
        addEvent({
          type: "deposited",
          description: `Deposit from ${String(l.args.from ?? "").slice(0, 10)}…`,
          amount: formatEther(l.args.amount ?? 0n),
          timestamp: Math.floor(Date.now() / 1000),
        });
        refetchWindowInfo();
        refetchBalance();
      });
    },
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: WALLET_ABI,
    eventName: "WindowReset",
    enabled: !!contractAddress,
    poll: true,
    pollingInterval: 3000,
    onLogs(logs) {
      logs.forEach((l: any) => {
        addEvent({
          type: "reset",
          description: `Window reset. Previous spent: ${formatEther(l.args.previousSpent ?? 0n)} tRBTC`,
          timestamp: Math.floor(Date.now() / 1000),
        });
        refetchWindowInfo();
      });
    },
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: WALLET_ABI,
    eventName: "LimitUpdated",
    enabled: !!contractAddress,
    poll: true,
    pollingInterval: 3000,
    onLogs(logs) {
      logs.forEach((l: any) => {
        addEvent({
          type: "limitUpdated",
          description: `Daily limit changed: ${formatEther(l.args.oldLimit ?? 0n)} → ${formatEther(l.args.newLimit ?? 0n)} tRBTC`,
          timestamp: Math.floor(Date.now() / 1000),
        });
        refetchWindowInfo();
      });
    },
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: WALLET_ABI,
    eventName: "LimitUpdateScheduled",
    enabled: !!contractAddress,
    poll: true,
    pollingInterval: 3000,
    onLogs(logs) {
      logs.forEach((l: any) => {
        const effectiveDate = new Date(Number(l.args.effectiveAt ?? 0n) * 1000).toLocaleTimeString();
        addEvent({
          type: "limitScheduled",
          description: `Limit change to ${formatEther(l.args.newLimit ?? 0n)} tRBTC scheduled — takes effect at next window (${effectiveDate})`,
          timestamp: Math.floor(Date.now() / 1000),
        });
      });
    },
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: WALLET_ABI,
    eventName: "OwnershipTransferInitiated",
    enabled: !!contractAddress,
    poll: true,
    pollingInterval: 3000,
    onLogs(logs) {
      logs.forEach((l: any) => {
        addEvent({
          type: "ownership",
          description: `Ownership transfer initiated → ${String(l.args.pendingOwner ?? "").slice(0, 10)}…`,
          timestamp: Math.floor(Date.now() / 1000),
        });
      });
    },
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: WALLET_ABI,
    eventName: "OwnershipTransferred",
    enabled: !!contractAddress,
    poll: true,
    pollingInterval: 3000,
    onLogs(logs) {
      logs.forEach((l: any) => {
        addEvent({
          type: "ownership",
          description: `Ownership transferred to ${String(l.args.newOwner ?? "").slice(0, 10)}…`,
          timestamp: Math.floor(Date.now() / 1000),
        });
      });
    },
  });

  // ── Parsed window data ──────────────────────────────────────────────────────
  const [spent, remaining, windowEndsAt, walletState, contractBalance] = windowInfo
    ? [
        windowInfo[0],
        windowInfo[1],
        windowInfo[2],
        windowInfo[3],
        windowInfo[4],
      ]
    : [0n, 0n, 0n, undefined, 0n];

  const limit = dailyLimitRaw ?? 0n;
  const duration = windowDurationRaw ? Number(windowDurationRaw) / 3600 : 24;
  const spentEth = parseFloat(formatEther(spent as bigint));
  const limitEth = parseFloat(formatEther(limit));
  const remainingEth = parseFloat(formatEther(remaining as bigint));
  const balanceEth = parseFloat(formatEther(contractBalance as bigint));
  const progress = limitEth > 0 ? (spentEth / limitEth) * 100 : 0;

  const { h, m, s, remaining: secs } = useCountdown(Number(windowEndsAt ?? 0n));

  const isOwner = address && ownerAddress &&
    address.toLowerCase() === (ownerAddress as string).toLowerCase();

  const isPendingOwner = address && pendingOwnerAddress &&
    (pendingOwnerAddress as string) !== "0x0000000000000000000000000000000000000000" &&
    address.toLowerCase() === (pendingOwnerAddress as string).toLowerCase();

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleSpend = async () => {
    if (!contractAddress) return;
    if (!isAddress(spendTo)) { toast({ title: "Invalid address", variant: "destructive" }); return; }
    const amt = parseFloat(spendAmount);
    if (!amt || amt <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (!spendDesc.trim()) { toast({ title: "Add a description", variant: "destructive" }); return; }
    try {
      await writeContract({
        address: contractAddress,
        abi: WALLET_ABI,
        functionName: "spend",
        args: [spendTo as `0x${string}`, parseEther(spendAmount), spendDesc],
      });
      toast({ title: "Spend submitted!" });
      setSpendAmount(""); setSpendDesc(""); setSpendTo("");
    } catch (e: any) {
      toast({ title: "Transaction failed", description: e.shortMessage ?? e.message, variant: "destructive" });
    }
  };

  const handleDeposit = async () => {
    if (!contractAddress) return;
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    try {
      await writeContract({
        address: contractAddress,
        abi: WALLET_ABI,
        functionName: "deposit",
        value: parseEther(depositAmount),
      });
      toast({ title: "Deposit submitted!" });
      setDepositAmount("");
    } catch (e: any) {
      toast({ title: "Deposit failed", description: e.shortMessage ?? e.message, variant: "destructive" });
    }
  };

  const handleUpdateLimit = async () => {
    if (!contractAddress) return;
    const amt = parseFloat(newLimitAmount);
    if (!amt || amt <= 0) { toast({ title: "Invalid limit", variant: "destructive" }); return; }
    try {
      await writeContract({
        address: contractAddress,
        abi: WALLET_ABI,
        functionName: "updateLimit",
        args: [parseEther(newLimitAmount)],
      });
      toast({ title: "Limit update submitted!" });
      setNewLimitAmount("");
    } catch (e: any) {
      toast({ title: "Update failed", description: e.shortMessage ?? e.message, variant: "destructive" });
    }
  };

  const handleTransferOwnership = async () => {
    if (!contractAddress) return;
    if (!isAddress(transferToAddress)) {
      toast({ title: "Invalid address", variant: "destructive" });
      return;
    }
    try {
      await writeContract({
        address: contractAddress,
        abi: WALLET_ABI,
        functionName: "transferOwnership",
        args: [transferToAddress as `0x${string}`],
      });
      toast({ title: "Transfer initiated — nominee must call Accept Ownership" });
      setTransferToAddress("");
    } catch (e: any) {
      toast({ title: "Transfer failed", description: e.shortMessage ?? e.message, variant: "destructive" });
    }
  };

  const handleAcceptOwnership = async () => {
    if (!contractAddress) return;
    try {
      await writeContract({
        address: contractAddress,
        abi: WALLET_ABI,
        functionName: "acceptOwnership",
      });
      toast({ title: "Ownership accepted! You are now the owner." });
    } catch (e: any) {
      toast({ title: "Accept failed", description: e.shortMessage ?? e.message, variant: "destructive" });
    }
  };

  // ── Wrong network warning ───────────────────────────────────────────────────
  const wrongNetwork = isConnected && chain?.id !== rootstockTestnet.id;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Spend Limit Wallet</h1>
              <p className="text-xs text-muted-foreground">Daily cap enforcement · on-chain state machine</p>
            </div>
          </div>

          {isConnected ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs text-muted-foreground">Connected</span>
                <span className="text-xs font-mono text-foreground">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => disconnect()} className="text-xs">
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => connect({ connector: connectors[0] })}
              className="gap-2"
            >
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </Button>
          )}
        </div>

        {/* Wrong network warning */}
        {wrongNetwork && (
          <div className="mb-6 p-4 rounded-lg border border-destructive/30 bg-destructive/10 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Wrong network</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Switch MetaMask to <strong>Rootstock Testnet</strong> (Chain ID: 31).
                RPC: <code className="bg-destructive/20 rounded px-1">https://public-node.testnet.rsk.co</code>
              </p>
            </div>
          </div>
        )}

        {/* Connect prompt — shown when wallet not connected */}
        {!isConnected && (
          <Card className="mb-6 border-primary/20 bg-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                Connect your wallet to get started
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>Make sure MetaMask is configured on <strong className="text-foreground">Rootstock Testnet</strong>:</p>
              <div className="bg-muted/50 rounded p-3 text-xs font-mono space-y-1">
                <p>Network: <span className="text-foreground">Rootstock Testnet</span></p>
                <p>RPC: <span className="text-foreground">https://public-node.testnet.rsk.co</span></p>
                <p>Chain ID: <span className="text-foreground">31</span></p>
                <p>Currency: <span className="text-foreground">tRBTC</span></p>
                <p>Explorer: <span className="text-foreground">https://explorer.testnet.rootstock.io</span></p>
              </div>
              <Button onClick={() => connect({ connector: connectors[0] })}>
                <Wallet className="w-4 h-4 mr-2" />
                Connect MetaMask
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main grid */}
        {isConnected && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Left column: State overview ─────────────────────────────── */}
            <div className="lg:col-span-2 space-y-6">

              {/* State machine card */}
              <Card className="border-border bg-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Wallet State</CardTitle>
                    <StateBadge state={walletState as number | undefined} />
                  </div>
                  <CardDescription className="text-xs">
                    {duration}h daily window · {limitEth} tRBTC daily limit
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>Spent: {spentEth.toFixed(4)} tRBTC</span>
                      <span>Limit: {limitEth.toFixed(4)} tRBTC</span>
                    </div>
                    <Progress
                      value={Math.min(progress, 100)}
                      className={`h-3 ${walletState === 2 ? "bg-destructive/20" : walletState === 1 ? "bg-accent/20" : "bg-muted"}`}
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Remaining: <span className="text-foreground font-medium">{remainingEth.toFixed(4)} tRBTC</span>
                    </p>
                  </div>

                  {/* Window countdown */}
                  {secs > 0 && (
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Window resets in
                      </p>
                      <div className="flex gap-3 font-mono text-2xl font-bold tabular-nums">
                        <span>{String(h).padStart(2, "0")}<span className="text-xs text-muted-foreground font-normal ml-1">h</span></span>
                        <span>{String(m).padStart(2, "0")}<span className="text-xs text-muted-foreground font-normal ml-1">m</span></span>
                        <span>{String(s).padStart(2, "0")}<span className="text-xs text-muted-foreground font-normal ml-1">s</span></span>
                      </div>
                    </div>
                  )}

                  {/* Contract balance */}
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Contract Balance</span>
                    <span className="font-mono font-semibold text-foreground">{balanceEth.toFixed(4)} tRBTC</span>
                  </div>

                  {/* Owner badge */}
                  {isOwner && (
                    <div className="flex items-center gap-2 text-xs text-accent">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      You are the contract owner
                    </div>
                  )}
                  {isConnected && !isOwner && ownerAddress && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Owner: {(ownerAddress as string).slice(0, 10)}… (only owner can spend)
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Accept ownership banner — visible to pending owner */}
              {isPendingOwner && (
                <Card className="border-primary/40 bg-primary/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      Ownership Transfer Pending
                    </CardTitle>
                    <CardDescription className="text-xs">
                      You have been nominated as the new owner of this wallet. Accept to complete the handover.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" onClick={handleAcceptOwnership} disabled={isTxPending}>
                      {isTxPending ? "Confirming…" : "Accept Ownership"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Spend form (owner only) */}
              {isOwner && (
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ArrowUpRight className="w-4 h-4 text-primary" />
                      Make a Spend
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Transfers tRBTC from the wallet to a recipient. Blocked if it would exceed the daily cap.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      placeholder="Recipient address (0x…)"
                      className="font-mono text-sm"
                      value={spendTo}
                      onChange={(e) => setSpendTo(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Amount (tRBTC)"
                        type="number"
                        step="0.001"
                        min="0"
                        value={spendAmount}
                        onChange={(e) => setSpendAmount(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        className="shrink-0 text-xs"
                        onClick={() => setSpendAmount(remainingEth.toFixed(4))}
                      >
                        Max
                      </Button>
                    </div>
                    <Input
                      placeholder="Description (e.g. NFT purchase)"
                      value={spendDesc}
                      onChange={(e) => setSpendDesc(e.target.value)}
                    />
                    <Button
                      className="w-full"
                      onClick={handleSpend}
                      disabled={isTxPending || walletState === 2}
                    >
                      {isTxPending ? "Sending…" : walletState === 2 ? "Wallet LOCKED" : "Submit Spend"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Owner controls — update limit + transfer ownership */}
              {isOwner && (
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      Owner Controls
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">

                    {/* Update daily limit */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Update Daily Limit</p>
                      <p className="text-xs text-muted-foreground">
                        Current: <span className="text-foreground font-mono">{limitEth} tRBTC</span>.
                        {" "}If a window is active, the new limit takes effect at the next window.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="New limit (tRBTC)"
                          type="number"
                          step="0.0001"
                          min="0"
                          className="text-sm"
                          value={newLimitAmount}
                          onChange={(e) => setNewLimitAmount(e.target.value)}
                        />
                        <Button variant="outline" onClick={handleUpdateLimit} disabled={isTxPending} className="shrink-0">
                          Set
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-border" />

                    {/* Transfer ownership */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Transfer Ownership</p>
                      <p className="text-xs text-muted-foreground">
                        Two-step: nominate a new owner below. They must then connect their wallet and click{" "}
                        <em>Accept Ownership</em> to complete the transfer.
                      </p>
                      {pendingOwnerAddress &&
                        (pendingOwnerAddress as string) !== "0x0000000000000000000000000000000000000000" && (
                        <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded px-3 py-2">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          Pending nominee: <span className="font-mono ml-1">
                            {(pendingOwnerAddress as string).slice(0, 10)}…{(pendingOwnerAddress as string).slice(-6)}
                          </span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          placeholder="New owner address (0x…)"
                          className="font-mono text-sm"
                          value={transferToAddress}
                          onChange={(e) => setTransferToAddress(e.target.value)}
                        />
                        <Button
                          variant="outline"
                          onClick={handleTransferOwnership}
                          disabled={isTxPending}
                          className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                        >
                          Nominate
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Deposit form */}
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowDownLeft className="w-4 h-4 text-accent" />
                    Deposit tRBTC
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Fund the wallet so it can make spends. Anyone can deposit.
                    {userBalance && (
                      <span className="ml-1 text-foreground">Your balance: {parseFloat(formatEther(userBalance.value)).toFixed(4)} tRBTC</span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input
                    placeholder="Amount (tRBTC)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                  <Button variant="outline" onClick={handleDeposit} disabled={isTxPending} className="shrink-0">
                    Deposit
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* ── Right column: Event log ────────────────────────────────── */}
            <div>
              <Card className="border-border bg-card h-full">
                <CardHeader>
                  <CardTitle className="text-base">Event Log</CardTitle>
                  <CardDescription className="text-xs">Live contract events</CardDescription>
                </CardHeader>
                <CardContent>
                  {events.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <RefreshCw className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      No events yet
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      {events.map((e) => <EventRow key={e.id} event={e} />)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* State machine diagram */}
              <Card className="mt-6 border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-base">State Machine</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-3">
                  <div className={`rounded p-2.5 border ${walletState === 0 ? "border-primary/40 bg-primary/10 text-foreground" : "border-border"}`}>
                    <strong className="text-muted-foreground">IDLE</strong>
                    <p>No spending this window, or window expired.</p>
                  </div>
                  <div className={`rounded p-2.5 border ${walletState === 1 ? "border-accent/40 bg-accent/10 text-foreground" : "border-border"}`}>
                    <strong className="text-muted-foreground">ACTIVE</strong>
                    <p>Spending started, limit not yet reached.</p>
                  </div>
                  <div className={`rounded p-2.5 border ${walletState === 2 ? "border-destructive/40 bg-destructive/10 text-foreground" : "border-border"}`}>
                    <strong className="text-muted-foreground">LOCKED</strong>
                    <p>Daily cap hit. No spends until window resets.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
