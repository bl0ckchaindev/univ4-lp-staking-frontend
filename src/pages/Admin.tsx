import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Settings, Shield, AlertCircle, Info, Play, Copy, Check } from "lucide-react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { getContractAddresses, supportedChains } from "@/lib/contracts";
import { vaultAbi } from "@/lib/abis/vault";
import { poolManagerAbi } from "@/lib/abis/poolManager";
import { positionManagerAbi } from "@/lib/abis/positionManager";
import { getWhitelist, addWhitelistAddress, removeWhitelistAddress } from "@/lib/api";
import { priceToSqrtPriceX96, getPriceAtTick, getAmountsForLiquidity } from "@/lib/poolPrice";
import { usePoolPrice } from "@/hooks/usePoolPrice";

const TICK_SPACING = 60;
const WETH_DECIMALS = 18;
/** USDC = 6 decimals (not 18). */
const USDC_DECIMALS = 6;

function priceToTickRaw(priceHuman: number, decimals0: number, decimals1: number): number {
  if (priceHuman <= 0 || !Number.isFinite(priceHuman)) return 0;
  const pow = decimals1 - decimals0;
  const factor = pow >= 0 ? 10 ** pow : 1 / 10 ** -pow;
  const rawPrice = priceHuman * factor;
  return Math.log(rawPrice) / Math.log(1.0001);
}
function priceToTickLower(priceHuman: number, d0: number, d1: number, tickSpacing: number): number {
  const raw = priceToTickRaw(priceHuman, d0, d1);
  return Math.floor(raw / tickSpacing) * tickSpacing;
}
function priceToTickUpper(priceHuman: number, d0: number, d1: number, tickSpacing: number): number {
  const raw = priceToTickRaw(priceHuman, d0, d1);
  return Math.ceil(raw / tickSpacing) * tickSpacing;
}

const ASSET_DECIMALS = 18;
function formatAsset18(value: bigint | undefined): string {
  if (value == null || value === 0n) return "0";
  const div = 10n ** BigInt(ASSET_DECIMALS);
  const int = value / div;
  const frac = (value % div).toString().padStart(ASSET_DECIMALS, "0").slice(0, 4).replace(/0+$/, "") || "0";
  return frac ? `${int}.${frac}` : String(int);
}
function formatTimestamp(ts: bigint | undefined): string {
  if (ts == null || ts === 0n) return "—";
  try {
    return new Date(Number(ts) * 1000).toLocaleString();
  } catch {
    return "—";
  }
}
function truncateAddress(addr: string | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getChainName(chainId: number): string {
  return supportedChains.find((c) => c.id === chainId)?.name ?? "Unknown";
}

const Admin = () => {
  const chainId = useChainId();
  const { address: userAddress, isConnected } = useAccount();
  const { vault, poolManager, zap } = getContractAddresses(chainId);

  const [newAddress, setNewAddress] = useState("");
  const [pullPct, setPullPct] = useState("25");
  const [priceLower, setPriceLower] = useState("");
  const [priceUpper, setPriceUpper] = useState("");
  const [initPoolPrice, setInitPoolPrice] = useState("");
  const [feeRecipientInput, setFeeRecipientInput] = useState("");
  const [mgmtBps, setMgmtBps] = useState("");
  const [perfBps, setPerfBps] = useState("");
  const [whitelistAddresses, setWhitelistAddresses] = useState<string[]>([]);
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<"vault" | "positionId" | "feeRecipient" | "hook" | "zap" | null>(null);
  const lastWhitelistAction = useRef<{ type: "add" | "remove"; address: string } | null>(null);

  const copyToClipboard = async (text: string, field: "vault" | "positionId" | "feeRecipient" | "hook" | "zap") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {}
  };

  const { data: vaultOwner } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "owner",
  });
  const { data: feeRecipient } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "feeRecipient",
  });
  const { data: managementFeeBps } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "managementFeeBps",
  });
  const { data: performanceFeeBps } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "performanceFeeBps",
  });
  const { data: positionTokenId } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "positionTokenId",
  });
  const { data: isWhitelistedCheck } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "isWhitelisted",
    args: newAddress?.startsWith("0x") && newAddress.length === 42 ? [newAddress as `0x${string}`] : undefined,
  });
  const { data: totalAssets } = useReadContract({ address: vault, abi: vaultAbi, functionName: "totalAssets" });
  const { data: totalSupply } = useReadContract({ address: vault, abi: vaultAbi, functionName: "totalSupply" });
  const { data: highWaterMark } = useReadContract({ address: vault, abi: vaultAbi, functionName: "highWaterMark" });
  const { data: lastManagementFeeTime } = useReadContract({ address: vault, abi: vaultAbi, functionName: "lastManagementFeeTime" });
  const { data: tickLower } = useReadContract({ address: vault, abi: vaultAbi, functionName: "tickLower" });
  const { data: tickUpper } = useReadContract({ address: vault, abi: vaultAbi, functionName: "tickUpper" });
  const { data: totalStrategyValue } = useReadContract({ address: vault, abi: vaultAbi, functionName: "totalStrategyValue" });
  const { data: poolKey } = useReadContract({ address: vault, abi: vaultAbi, functionName: "poolKey" });
  const { data: hookAddress } = useReadContract({ address: vault, abi: vaultAbi, functionName: "hook" });
  const { data: positionManagerAddress } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "positionManager",
  });
  const { data: positionLiquidity } = useReadContract({
    address: positionManagerAddress as `0x${string}` | undefined,
    abi: positionManagerAbi,
    functionName: "getPositionLiquidity",
    args: positionTokenId != null && positionTokenId > 0n ? [positionTokenId] : undefined,
  });
  const { price: poolPriceNum, sqrtPriceX96 } = usePoolPrice();

  const isVaultOwner =
    isConnected &&
    userAddress &&
    vaultOwner &&
    userAddress.toLowerCase() === (vaultOwner as string).toLowerCase();
  const hasPosition = positionTokenId != null && positionTokenId > 0n;

  useEffect(() => {
    if (feeRecipient != null && feeRecipient !== "0x0000000000000000000000000000000000000000")
      setFeeRecipientInput((feeRecipient as string) ?? "");
  }, [feeRecipient]);
  useEffect(() => {
    if (managementFeeBps != null) setMgmtBps(String(managementFeeBps));
  }, [managementFeeBps]);
  useEffect(() => {
    if (performanceFeeBps != null) setPerfBps(String(performanceFeeBps));
  }, [performanceFeeBps]);

  const poolInitialized = poolPriceNum != null && poolPriceNum > 0 && Number.isFinite(poolPriceNum);
  const [positionEth, positionUsdc] =
    positionLiquidity != null &&
    sqrtPriceX96 != null &&
    sqrtPriceX96 > 0n &&
    tickLower != null &&
    tickUpper != null &&
    Number(tickLower) < Number(tickUpper)
      ? getAmountsForLiquidity(sqrtPriceX96, Number(tickLower), Number(tickUpper), positionLiquidity)
      : [0n, 0n];
  const positionEthFormatted =
    positionEth > 0n
      ? Number(positionEth) / 1e18 < 0.0001
        ? (Number(positionEth) / 1e18).toExponential(2)
        : (Number(positionEth) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6, minimumFractionDigits: 0 })
      : null;
  const positionUsdcFormatted =
    positionUsdc > 0n
      ? (Number(positionUsdc) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 })
      : null;
  const currentPriceLower =
    tickLower != null && tickUpper != null && Number(tickLower) < Number(tickUpper)
      ? getPriceAtTick(Number(tickLower), WETH_DECIMALS, USDC_DECIMALS)
      : null;
  const currentPriceUpper =
    tickLower != null && tickUpper != null && Number(tickLower) < Number(tickUpper)
      ? getPriceAtTick(Number(tickUpper), WETH_DECIMALS, USDC_DECIMALS)
      : null;

  useEffect(() => {
    if (poolInitialized && poolPriceNum != null) setInitPoolPrice(poolPriceNum.toFixed(0));
  }, [poolInitialized, poolPriceNum]);
  useEffect(() => {
    if (currentPriceLower != null && currentPriceLower > 0) setPriceLower(currentPriceLower.toFixed(0));
  }, [currentPriceLower]);
  useEffect(() => {
    if (currentPriceUpper != null && currentPriceUpper > 0) setPriceUpper(currentPriceUpper.toFixed(0));
  }, [currentPriceUpper]);

  const { writeContract, status: writeStatus } = useWriteContract();
  const isPending = writeStatus === "pending";

  const fetchWhitelist = async () => {
    try {
      setWhitelistLoading(true);
      const list = await getWhitelist();
      setWhitelistAddresses(list);
    } catch {
      setWhitelistAddresses([]);
    } finally {
      setWhitelistLoading(false);
    }
  };
  useEffect(() => {
    fetchWhitelist();
  }, []);

  useEffect(() => {
    if (writeStatus !== "success") return;
    const action = lastWhitelistAction.current;
    if (action) {
      const sync = action.type === "add" ? addWhitelistAddress(action.address) : removeWhitelistAddress(action.address);
      sync.then(() => fetchWhitelist()).catch(() => {}).finally(() => {
        lastWhitelistAction.current = null;
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }, [writeStatus]);

  const run = (fn: () => void) => {
    if (!vault || isPending) return;
    fn();
  };

  const handleAddWhitelist = () =>
    run(() => {
      if (!newAddress?.startsWith("0x") || newAddress.length !== 42) return;
      lastWhitelistAction.current = { type: "add", address: newAddress };
      writeContract({ address: vault!, abi: vaultAbi, functionName: "addToWhitelist", args: [newAddress as `0x${string}`] });
    });
  const handleRemoveWhitelist = () =>
    run(() => {
      if (!newAddress?.startsWith("0x") || newAddress.length !== 42) return;
      lastWhitelistAction.current = { type: "remove", address: newAddress };
      writeContract({ address: vault!, abi: vaultAbi, functionName: "removeFromWhitelist", args: [newAddress as `0x${string}`] });
    });
  const handleCompound = () => run(() => writeContract({ address: vault!, abi: vaultAbi, functionName: "compound" }));
  const handleChargeMgmt = () => run(() => writeContract({ address: vault!, abi: vaultAbi, functionName: "chargeManagementFee" }));
  const handleChargePerf = () => run(() => writeContract({ address: vault!, abi: vaultAbi, functionName: "chargePerformanceFee" }));
  const handlePull = () =>
    run(() => {
      const pct = parseFloat(pullPct);
      if (Number.isNaN(pct) || pct <= 0 || pct > 100) return;
      const portion = BigInt(Math.round((pct / 100) * 1e18));
      writeContract({ address: vault!, abi: vaultAbi, functionName: "pullLiquidity", args: [portion] });
    });
  const handleRebalance = () =>
    run(() => {
      const pl = priceLower.trim() ? parseFloat(priceLower) : NaN;
      const pu = priceUpper.trim() ? parseFloat(priceUpper) : NaN;
      if (Number.isNaN(pl) || Number.isNaN(pu) || pl <= 0 || pu <= 0 || pl >= pu) return;
      const tl = priceToTickLower(pl, WETH_DECIMALS, USDC_DECIMALS, TICK_SPACING);
      const tu = priceToTickUpper(pu, WETH_DECIMALS, USDC_DECIMALS, TICK_SPACING);
      if (tl >= tu) return;
      writeContract({ address: vault!, abi: vaultAbi, functionName: "rebalance", args: [tl, tu] });
    });
  const handleSetFeeRecipient = () =>
    run(() => {
      const r = feeRecipientInput.trim();
      if (!r.startsWith("0x") || r.length !== 42) return;
      writeContract({ address: vault!, abi: vaultAbi, functionName: "setFeeRecipient", args: [r as `0x${string}`] });
    });
  const handleSetMgmtFee = () =>
    run(() => {
      const b = BigInt(mgmtBps);
      if (b > 2000n) return;
      writeContract({ address: vault!, abi: vaultAbi, functionName: "setManagementFee", args: [b] });
    });
  const handleSetPerfFee = () =>
    run(() => {
      const b = BigInt(perfBps);
      if (b > 5000n) return;
      writeContract({ address: vault!, abi: vaultAbi, functionName: "setPerformanceFee", args: [b] });
    });

  const handleInitializePool = () => {
    if (!poolManager || !poolKey || isPending) return;
    const price = parseFloat(initPoolPrice);
    if (Number.isNaN(price) || price <= 0) return;
    const sqrtPriceX96 = priceToSqrtPriceX96(price, WETH_DECIMALS, USDC_DECIMALS);
    if (sqrtPriceX96 === 0n) return;
    const pk = poolKey as readonly [string, string, number, number, string];
    const key = {
      currency0: pk[0] as `0x${string}`,
      currency1: pk[1] as `0x${string}`,
      fee: pk[2],
      tickSpacing: pk[3],
      hooks: pk[4] as `0x${string}`,
    };
    writeContract({
      address: poolManager,
      abi: poolManagerAbi,
      functionName: "initialize",
      args: [key, sqrtPriceX96],
    });
  };

  if (!vault) {
    return (
      <div className="min-h-screen pt-24 pb-16 flex items-center justify-center">
        <div className="rounded-xl border border-border bg-card p-6 max-w-sm text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-semibold mb-2">Vault not configured</h2>
          <p className="text-sm text-muted-foreground mb-4">Set VITE_VAULT_ADDRESS for this chain.</p>
          <Button asChild><Link to="/">Go home</Link></Button>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen pt-24 pb-16 flex items-center justify-center">
        <div className="rounded-xl border border-border bg-card p-6 max-w-sm text-center">
          <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-semibold mb-2">Connect wallet</h2>
          <p className="text-sm text-muted-foreground mb-4">Connect the vault owner wallet.</p>
          <Button asChild><Link to="/">Go home</Link></Button>
        </div>
      </div>
    );
  }

  if (!isVaultOwner) {
    return (
      <div className="min-h-screen pt-24 pb-16 flex items-center justify-center">
        <div className="rounded-xl border border-border bg-card p-6 max-w-sm text-center">
          <Shield className="w-10 h-10 text-destructive mx-auto mb-3" />
          <h2 className="font-semibold mb-2">Access denied</h2>
          <p className="text-sm text-muted-foreground mb-4">Only the vault owner can access this page.</p>
          <Button asChild><Link to="/">Go home</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Vault Admin</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Vault info + Whitelist */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 h-fit">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Whitelist
              </h3>
              <div className="flex gap-2">
                <Input
                  placeholder="0x... address"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="font-mono text-sm flex-1"
                />
                <Button size="sm" onClick={handleAddWhitelist} disabled={isPending || !newAddress}>Add</Button>
                <Button variant="outline" size="sm" onClick={handleRemoveWhitelist} disabled={isPending || !newAddress}>Remove</Button>
              </div>
              {newAddress && newAddress.startsWith("0x") && newAddress.length === 42 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {isWhitelistedCheck ? "Whitelisted" : "Not whitelisted"}
                </p>
              )}
              {import.meta.env.VITE_API_URL ? (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">Whitelisted users ({whitelistAddresses.length})</p>
                  {whitelistLoading ? (
                    <p className="text-xs text-muted-foreground">Loading…</p>
                  ) : whitelistAddresses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No addresses in list. Add via contract above; list syncs from backend.</p>
                  ) : (
                    <ul className="text-xs font-mono space-y-1 max-h-60 overflow-y-auto rounded border border-border bg-muted/30 p-2">
                      {whitelistAddresses.map((addr) => (
                        <li key={addr} className="truncate" title={addr}>
                          {addr}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 h-fit">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" /> Vault info
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs [&_dd]:min-h-5 [&_dd]:leading-5">
                <dt className="text-muted-foreground">Chain</dt>
                <dd className="font-mono">{getChainName(chainId)}({chainId})</dd>
                <dt className="text-muted-foreground">Vault</dt>
                <dd className="font-mono flex items-center gap-1 min-w-0">
                  <span className="truncate" title={vault ?? undefined}>{truncateAddress(vault ?? undefined)}</span>
                  {vault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 p-0 min-h-0"
                      onClick={() => copyToClipboard(vault, "vault")}
                      title="Copy address"
                    >
                      {copiedField === "vault" ? <Check className="h-2.5 w-2.5 text-green-600" /> : <Copy className="h-2.5 w-2.5" />}
                    </Button>
                  )}
                </dd>

                <dt className="text-muted-foreground">Fee recipient</dt>
                <dd className="font-mono flex items-center gap-1 min-w-0">
                  <span className="truncate" title={feeRecipient as string}>{truncateAddress(feeRecipient as string)}</span>
                  {feeRecipient && (feeRecipient as string) !== "0x0000000000000000000000000000000000000000" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 p-0 min-h-0"
                      onClick={() => copyToClipboard(feeRecipient as string, "feeRecipient")}
                      title="Copy address"
                    >
                      {copiedField === "feeRecipient" ? <Check className="h-2.5 w-2.5 text-green-600" /> : <Copy className="h-2.5 w-2.5" />}
                    </Button>
                  )}
                </dd>
                <dt className="text-muted-foreground">Hook</dt>
                <dd className="font-mono flex items-center gap-1 min-w-0">
                  <span className="truncate" title={hookAddress as string}>{truncateAddress(hookAddress as string)}</span>
                  {hookAddress && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 p-0 min-h-0"
                      onClick={() => copyToClipboard(hookAddress as string, "hook")}
                      title="Copy address"
                    >
                      {copiedField === "hook" ? <Check className="h-2.5 w-2.5 text-green-600" /> : <Copy className="h-2.5 w-2.5" />}
                    </Button>
                  )}
                </dd>
                <dt className="text-muted-foreground">Zap</dt>
                <dd className="font-mono flex items-center gap-1 min-w-0">
                  <span className="truncate" title={zap ?? undefined}>{truncateAddress(zap ?? undefined)}</span>
                  {zap && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 p-0 min-h-0"
                      onClick={() => copyToClipboard(zap, "zap")}
                      title="Copy address"
                    >
                      {copiedField === "zap" ? <Check className="h-2.5 w-2.5 text-green-600" /> : <Copy className="h-2.5 w-2.5" />}
                    </Button>
                  )}
                </dd>
                <dt className="text-muted-foreground">Position ID</dt>
                <dd className="font-mono flex items-center gap-1 min-w-0">
                  <span>{positionTokenId != null && positionTokenId > 0n ? String(positionTokenId) : "No position"}</span>
                  {positionTokenId != null && positionTokenId > 0n && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 p-0 min-h-0"
                      onClick={() => copyToClipboard(String(positionTokenId), "positionId")}
                      title="Copy position ID"
                    >
                      {copiedField === "positionId" ? <Check className="h-2.5 w-2.5 text-green-600" /> : <Copy className="h-2.5 w-2.5" />}
                    </Button>
                  )}
                </dd>
                <dt className="text-muted-foreground">Total assets</dt>
                <dd className="font-mono">{formatAsset18(totalAssets as bigint | undefined)} (18d)</dd>
                <dt className="text-muted-foreground">Total supply</dt>
                <dd className="font-mono">{formatAsset18(totalSupply as bigint | undefined)}</dd>
                <dt className="text-muted-foreground">Strategy value</dt>
                <dd className="font-mono">{formatAsset18(totalStrategyValue as bigint | undefined)}</dd>
                <dt className="text-muted-foreground">High water mark</dt>
                <dd className="font-mono">{formatAsset18(highWaterMark as bigint | undefined)}</dd>
                <dt className="text-muted-foreground">Last mgmt fee</dt>
                <dd className="font-mono">{formatTimestamp(lastManagementFeeTime as bigint | undefined)}</dd>
                <dt className="text-muted-foreground">Current ETH price</dt>
                <dd className="font-mono">
                  {poolPriceNum != null && poolPriceNum > 0
                    ? `$${poolPriceNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : "—"}
                </dd>
                <dt className="text-muted-foreground">Price range (USDC/ETH)</dt>
                <dd className="font-mono">
                  {tickLower != null && tickUpper != null
                    ? `$${getPriceAtTick(Number(tickLower), WETH_DECIMALS, USDC_DECIMALS).toFixed(2)} ~ $${getPriceAtTick(Number(tickUpper), WETH_DECIMALS, USDC_DECIMALS).toFixed(2)}`
                    : "—"}
                </dd>
                <dt className="text-muted-foreground">ETH in pool</dt>
                <dd className="font-mono">{positionEthFormatted != null ? `${positionEthFormatted} ETH` : "—"}</dd>
                <dt className="text-muted-foreground">USDC in pool</dt>
                <dd className="font-mono">{positionUsdcFormatted != null ? `${positionUsdcFormatted} USDC` : "—"}</dd>
                <dt className="text-muted-foreground">Mgmt / Perf fee</dt>
                <dd className="font-mono">{managementFeeBps != null && performanceFeeBps != null ? `${(Number(managementFeeBps) / 100).toFixed(1)}% / ${(Number(performanceFeeBps) / 100).toFixed(1)}%` : "—"}</dd>
              </dl>
            </div>
          </div>

          {/* Right: Admin actions */}
          <div className="space-y-4">
            {poolManager && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Play className="w-4 h-4 text-primary" /> Initialize pool
                </h3>
                <p className="text-xs text-muted-foreground mb-2">
                  One-time: create the Uniswap v4 pool at an initial price (no liquidity). Only the vault can add liquidity; do this first, then set tick range and deposit.
                </p>
                {poolInitialized ? (
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Already initialized
                  </div>
                ) : (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 min-w-0">
                      <label className="text-xs text-muted-foreground block mb-1">Initial price (USDC per 1 ETH)</label>
                      <Input
                        type="number"
                        placeholder="e.g. 3500"
                        value={initPoolPrice}
                        onChange={(e) => setInitPoolPrice(e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleInitializePool}
                      disabled={isPending || !initPoolPrice || parseFloat(initPoolPrice || "0") <= 0 || !poolKey}
                    >
                      {isPending ? "Confirm..." : "Initialize pool"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3">Actions</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleCompound} disabled={isPending || !hasPosition}>Compound</Button>
                <Button variant="outline" size="sm" onClick={handleChargeMgmt} disabled={isPending}>Charge Mgmt Fee</Button>
                <Button variant="outline" size="sm" onClick={handleChargePerf} disabled={isPending}>Charge Perf Fee</Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3">Rebalance</h3>
              <p className="text-xs text-muted-foreground mb-2">Price range (USDC per 1 ETH). Ticks use spacing {TICK_SPACING}.</p>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Lower</label>
                  <Input
                    type="number"
                    placeholder={currentPriceLower != null ? String(Math.round(currentPriceLower)) : "1000"}
                    value={priceLower}
                    onChange={(e) => setPriceLower(e.target.value)}
                    className="w-24 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Upper</label>
                  <Input
                    type="number"
                    placeholder={currentPriceUpper != null ? String(Math.round(currentPriceUpper)) : "4000"}
                    value={priceUpper}
                    onChange={(e) => setPriceUpper(e.target.value)}
                    className="w-24 font-mono text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRebalance}
                  disabled={isPending || !priceLower || !priceUpper || parseFloat(priceLower) >= parseFloat(priceUpper)}
                >
                  Rebalance
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3">Pull liquidity</h3>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Portion %</label>
                  <Input type="number" min="1" max="100" value={pullPct} onChange={(e) => setPullPct(e.target.value)} className="w-20 font-mono text-sm" />
                </div>
                <Button variant="outline" size="sm" onClick={handlePull} disabled={isPending || !hasPosition}>Pull</Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" /> Fee settings
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Fee recipient</label>
                  <div className="flex gap-2 items-center">
                    <Input placeholder="0x..." value={feeRecipientInput} onChange={(e) => setFeeRecipientInput(e.target.value)} className="font-mono text-sm flex-1" />
                    <Button variant="outline" size="sm" onClick={handleSetFeeRecipient} disabled={isPending || !feeRecipientInput.trim()}>Set recipient</Button>
                  </div>
                </div>
                <div className="flex gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-muted-foreground block mb-1">Mgmt fee (bps, max 2000)</label>
                    <div className="flex gap-2 items-center">
                      <Input placeholder="200" value={mgmtBps} onChange={(e) => setMgmtBps(e.target.value)} className="font-mono text-sm flex-1 min-w-0" />
                      <Button variant="outline" size="sm" onClick={handleSetMgmtFee} disabled={isPending || !mgmtBps}>Set</Button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-muted-foreground block mb-1">Perf fee (bps, max 5000)</label>
                    <div className="flex gap-2 items-center">
                      <Input placeholder="2000" value={perfBps} onChange={(e) => setPerfBps(e.target.value)} className="font-mono text-sm flex-1 min-w-0" />
                      <Button variant="outline" size="sm" onClick={handleSetPerfFee} disabled={isPending || !perfBps}>Set</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Button variant="ghost" asChild><Link to="/vault">Back to Vault</Link></Button>
        </div>
      </div>
    </div>
  );
};

export default Admin;
