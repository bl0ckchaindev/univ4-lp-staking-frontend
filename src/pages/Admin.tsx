import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatCard from "@/components/StatCard";
import {
  Shield,
  Users,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Plus,
  Trash2,
  Settings,
  Zap,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, encodeAbiParameters, encodePacked, keccak256, padHex } from "viem";
import { getContractAddresses } from "@/lib/contracts";
import { vaultAbi } from "@/lib/abis/vault";
import { poolManagerAbi } from "@/lib/abis/poolManager";
import { getPriceAtTick } from "@/lib/poolPrice";

const SHARE_DECIMALS = 18;
const USDC_DECIMALS = 6;
const WETH_DECIMALS = 18;

function formatShort(value: string): string {
  const n = parseFloat(value);
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(4);
}

function formatTimeAgo(timestamp: bigint): string {
  if (timestamp === 0n) return "Never";
  const sec = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  const diff = now - sec;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(sec * 1000).toLocaleDateString();
}

const TICK_SPACING = 60;

/**
 * Compute PoolId from poolKey (keccak256(abi.encode(poolKey)) per v4 PoolIdLibrary).
 */
function getPoolId(poolKey: readonly [`0x${string}`, `0x${string}`, number, number, `0x${string}`]): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: "address", name: "currency0" },
      { type: "address", name: "currency1" },
      { type: "uint24", name: "fee" },
      { type: "int24", name: "tickSpacing" },
      { type: "address", name: "hooks" },
    ],
    [poolKey[0], poolKey[1], poolKey[2], poolKey[3], poolKey[4]]
  );
  return keccak256(encoded as `0x${string}`);
}

/**
 * Compute storage slot for pool's slot0 in PoolManager (StateLibrary._getPoolStateSlot).
 */
function getSlot0StorageSlot(poolId: `0x${string}`): `0x${string}` {
  const packed = encodePacked(
    ["bytes32", "bytes32"],
    [poolId, padHex("0x06", { size: 32 })]
  );
  return keccak256(packed);
}

/**
 * Decode slot0 bytes32 from PoolManager: sqrtPriceX96 (160 bits), tick (24 bits signed).
 */
function decodeSlot0(data: `0x${string}`): { sqrtPriceX96: bigint; tick: number } {
  const big = BigInt(data);
  const sqrtPriceX96 = big & ((1n << 160n) - 1n);
  let tick = Number((big >> 160n) & 0xffffffn);
  if (tick >= 0x800000) tick -= 0x1000000; // sign-extend 24-bit
  return { sqrtPriceX96, tick };
}

/**
 * Convert sqrtPriceX96 to human price (USDC per 1 ETH). price = (sqrtPriceX96/2^96)^2; price_human = price_raw * 10^(decimals0-decimals1).
 * Uses scaled BigInt division to preserve precision.
 */
function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): number {
  if (sqrtPriceX96 <= 0n) return 0;
  const Q96 = 2n ** 96n;
  const scale = 10n ** 24n;
  const rawPriceScaled = (sqrtPriceX96 * sqrtPriceX96 * scale) / (Q96 * Q96);
  const rawPrice = Number(rawPriceScaled) / Number(scale);
  const pow = decimals0 - decimals1;
  const factor = pow >= 0 ? 10 ** pow : 1 / 10 ** -pow;
  return rawPrice * factor;
}

/**
 * Raw tick from price (before rounding to tick spacing). price = 1.0001^tick.
 */
function priceToTickRaw(
  priceHuman: number,
  decimals0: number,
  decimals1: number
): number {
  if (priceHuman <= 0 || !Number.isFinite(priceHuman)) return 0;
  const pow = decimals1 - decimals0;
  const factor = pow >= 0 ? 10 ** pow : 1 / 10 ** -pow;
  const rawPrice = priceHuman * factor;
  return Math.log(rawPrice) / Math.log(1.0001);
}

/**
 * Convert human-readable price to Uniswap tick, rounded down to tick spacing (for lower bound).
 */
function priceToTickLower(
  priceHuman: number,
  decimals0: number,
  decimals1: number,
  tickSpacing: number
): number {
  const raw = priceToTickRaw(priceHuman, decimals0, decimals1);
  return Math.floor(raw / tickSpacing) * tickSpacing;
}

/**
 * Convert human-readable price to Uniswap tick, rounded up to tick spacing (for upper bound).
 */
function priceToTickUpper(
  priceHuman: number,
  decimals0: number,
  decimals1: number,
  tickSpacing: number
): number {
  const raw = priceToTickRaw(priceHuman, decimals0, decimals1);
  return Math.ceil(raw / tickSpacing) * tickSpacing;
}

/**
 * Integer square root (floor) using Newton's method.
 */
function sqrtBigInt(n: bigint): bigint {
  if (n < 0n) return 0n;
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/**
 * Compute sqrtPriceX96 from human-readable price (token1 per token0).
 * Uses BigInt-only math: sqrtPriceX96 = sqrt(price * 10^(decimals1-decimals0) * 2^192).
 * E.g. price 2000 = 1 ETH = 2000 USDC (currency0=ETH 18d, currency1=USDC 6d).
 */
function priceToSqrtPriceX96(
  price: number,
  decimals0: number,
  decimals1: number
): bigint {
  if (price <= 0 || !Number.isFinite(price)) return 0n;
  const Q96 = 2n ** 96n;
  const pow = decimals1 - decimals0; // e.g. 6-18 = -12
  const priceE8 = BigInt(Math.floor(price * 1e8)); // price with 8 decimals to avoid float
  // rawPrice = price * 10^pow. radicand = rawPrice * Q96^2 = (priceE8/10^8) * 10^pow * Q96^2, kept as integer.
  // So radicand = priceE8 * 10^pow * Q96^2 / 10^8 = priceE8 * Q96^2 / 10^(8 - pow).
  const radicand =
    pow >= 0
      ? (priceE8 * 10n ** BigInt(pow) * Q96 * Q96) / 10n ** 8n
      : (priceE8 * Q96 * Q96) / 10n ** BigInt(8 - pow);
  if (radicand <= 0n) return 0n;
  return sqrtBigInt(radicand);
}

const Admin = () => {
  const chainId = useChainId();
  const { address: userAddress, isConnected } = useAccount();
  const { vault, poolManager } = getContractAddresses(chainId);

  const [newAddress, setNewAddress] = useState("");
  const [pullPortionPct, setPullPortionPct] = useState("25");
  const [priceLower, setPriceLower] = useState("");
  const [priceUpper, setPriceUpper] = useState("");
  const [initialPrice, setInitialPrice] = useState("");
  const [feeRecipientInput, setFeeRecipientInput] = useState("");
  const [managementFeeBpsInput, setManagementFeeBpsInput] = useState("");
  const [performanceFeeBpsInput, setPerformanceFeeBpsInput] = useState("");
  const [managementFeeEdited, setManagementFeeEdited] = useState(false);
  const [performanceFeeEdited, setPerformanceFeeEdited] = useState(false);

  const { data: vaultOwner } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "owner",
  });

  const isVaultOwner =
    isConnected &&
    userAddress &&
    vaultOwner &&
    userAddress.toLowerCase() === (vaultOwner as string).toLowerCase();

  const { data: totalAssets } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalAssets",
  });
  const { data: totalSupply } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalSupply",
  });
  const { data: totalStrategyValue } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalStrategyValue",
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
  const { data: lastManagementFeeTime } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "lastManagementFeeTime",
  });
  const { data: highWaterMark } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "highWaterMark",
  });
  const { data: positionTokenId } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "positionTokenId",
  });
  const { data: tickLower } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "tickLower",
  });
  const { data: tickUpper } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "tickUpper",
  });
  const { data: isWhitelistedCheck } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "isWhitelisted",
    args: newAddress && newAddress.startsWith("0x") && newAddress.length === 42 ? [newAddress as `0x${string}`] : undefined,
  });

  const { data: poolKey } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "poolKey",
  });

  const poolKeyTuple = poolKey as readonly [`0x${string}`, `0x${string}`, number, number, `0x${string}`] | undefined;
  const slot0StorageSlot =
    poolKeyTuple && poolManager ? getSlot0StorageSlot(getPoolId(poolKeyTuple)) : undefined;

  const { data: slot0Data } = useReadContract({
    address: poolManager,
    abi: poolManagerAbi,
    functionName: "extsload",
    args: slot0StorageSlot ? [slot0StorageSlot] : undefined,
  });

  const currentOnChainPrice =
    slot0Data != null && slot0Data !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      ? (() => {
          const { sqrtPriceX96 } = decodeSlot0(slot0Data as `0x${string}`);
          return sqrtPriceX96ToPrice(sqrtPriceX96, WETH_DECIMALS, USDC_DECIMALS);
        })()
      : undefined;

  const { writeContract, status: writeStatus } = useWriteContract();

  useEffect(() => {
    if (feeRecipient != null && feeRecipient !== "0x0000000000000000000000000000000000000000")
      setFeeRecipientInput((feeRecipient as string) ?? "");
  }, [feeRecipient]);
  useEffect(() => {
    if (managementFeeBps != null) {
      setManagementFeeBpsInput(String(managementFeeBps));
      setManagementFeeEdited(false);
    }
  }, [managementFeeBps]);
  useEffect(() => {
    if (performanceFeeBps != null) {
      setPerformanceFeeBpsInput(String(performanceFeeBps));
      setPerformanceFeeEdited(false);
    }
  }, [performanceFeeBps]);

  const refetch = () => {
    window.location.reload();
  };
  useEffect(() => {
    if (writeStatus === "success") refetch();
  }, [writeStatus]);

  const totalAssetsFormatted =
    totalAssets != null ? formatUnits(totalAssets, SHARE_DECIMALS) : "0";
  const hasPosition = positionTokenId != null && positionTokenId > 0n;

  const handleAddWhitelist = () => {
    if (!vault || !newAddress || !newAddress.startsWith("0x") || newAddress.length !== 42) return;
    writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "addToWhitelist",
      args: [newAddress as `0x${string}`],
    });
  };
  const handleRemoveWhitelist = () => {
    if (!vault || !newAddress || !newAddress.startsWith("0x") || newAddress.length !== 42) return;
    writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "removeFromWhitelist",
      args: [newAddress as `0x${string}`],
    });
  };
  const handleCompound = () => {
    if (!vault) return;
    writeContract({ address: vault, abi: vaultAbi, functionName: "compound" });
  };
  const handleInitializePool = () => {
    if (!poolManager || !poolKey) return;
    const sqrt = computedSqrtPriceX96;
    if (!sqrt || sqrt <= 0n) return;
    const key = poolKey as readonly [address: `0x${string}`, address: `0x${string}`, fee: number, tickSpacing: number, hooks: `0x${string}`];
    writeContract({
      address: poolManager,
      abi: poolManagerAbi,
      functionName: "initialize",
      args: [{ currency0: key[0], currency1: key[1], fee: key[2], tickSpacing: key[3], hooks: key[4] }, sqrt],
    });
  };

  const priceNum = initialPrice.trim() ? parseFloat(initialPrice) : NaN;
  const computedSqrtPriceX96 =
    !Number.isNaN(priceNum) && priceNum > 0
      ? priceToSqrtPriceX96(priceNum, WETH_DECIMALS, USDC_DECIMALS)
      : undefined;

  const handleRebalance = () => {
    if (!vault || rebalanceTickLower == null || rebalanceTickUpper == null) return;
    if (rebalanceTickLower >= rebalanceTickUpper) return;
    writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "rebalance",
      args: [rebalanceTickLower, rebalanceTickUpper],
    });
  };

  const priceLowerNum = priceLower.trim() ? parseFloat(priceLower) : NaN;
  const priceUpperNum = priceUpper.trim() ? parseFloat(priceUpper) : NaN;
  const rebalanceTickLower =
    !Number.isNaN(priceLowerNum) && priceLowerNum > 0
      ? priceToTickLower(priceLowerNum, WETH_DECIMALS, USDC_DECIMALS, TICK_SPACING)
      : undefined;
  const rebalanceTickUpper =
    !Number.isNaN(priceUpperNum) && priceUpperNum > 0
      ? priceToTickUpper(priceUpperNum, WETH_DECIMALS, USDC_DECIMALS, TICK_SPACING)
      : undefined;
  const handlePullLiquidity = () => {
    if (!vault) return;
    const pct = parseFloat(pullPortionPct);
    if (Number.isNaN(pct) || pct <= 0 || pct > 100) return;
    const portion = BigInt(Math.round((pct / 100) * 1e18));
    writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "pullLiquidity",
      args: [portion],
    });
  };
  const handleChargeManagementFee = () => {
    if (!vault) return;
    writeContract({ address: vault, abi: vaultAbi, functionName: "chargeManagementFee" });
  };
  const handleChargePerformanceFee = () => {
    if (!vault) return;
    writeContract({ address: vault, abi: vaultAbi, functionName: "chargePerformanceFee" });
  };
  const handleUpdateFeeSettings = () => {
    if (!vault) return;
    const recipient = feeRecipientInput.trim();
    const mgmtBps = managementFeeEdited
      ? managementFeeBpsInput.trim()
      : managementFeeBps != null
        ? String(managementFeeBps)
        : managementFeeBpsInput.trim();
    const perfBps = performanceFeeEdited
      ? performanceFeeBpsInput.trim()
      : performanceFeeBps != null
        ? String(performanceFeeBps)
        : performanceFeeBpsInput.trim();
    if (recipient && recipient.startsWith("0x") && recipient.length === 42) {
      writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "setFeeRecipient",
        args: [recipient as `0x${string}`],
      });
      return;
    }
    if (mgmtBps) {
      const bps = BigInt(mgmtBps);
      if (bps <= 2000n) {
        writeContract({
          address: vault,
          abi: vaultAbi,
          functionName: "setManagementFee",
          args: [bps],
        });
        return;
      }
    }
    if (perfBps) {
      const bps = BigInt(perfBps);
      if (bps <= 5000n) {
        writeContract({
          address: vault,
          abi: vaultAbi,
          functionName: "setPerformanceFee",
          args: [bps],
        });
      }
    }
  };

  if (!vault) {
    return (
      <div className="min-h-screen pt-24 pb-16 flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="font-heading text-xl font-semibold mb-2">Vault not configured</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Set VITE_VAULT_ADDRESS for this chain to use the admin page.
          </p>
          <Button asChild variant="glow">
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen pt-24 pb-16 flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="font-heading text-xl font-semibold mb-2">Connect your wallet</h2>
          <p className="text-muted-foreground text-sm mb-4">
            You need to connect the vault owner wallet to access the admin page.
          </p>
          <Button asChild variant="glow">
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!isVaultOwner) {
    return (
      <div className="min-h-screen pt-24 pb-16 flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="font-heading text-xl font-semibold mb-2">Access denied</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Only the vault owner can access this page. Your wallet is not the vault owner.
          </p>
          <Button asChild variant="glow">
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isPending = writeStatus === "pending";

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs font-mono text-muted-foreground mb-4">
            <Shield className="w-3 h-3 text-primary" />
            Owner Only
          </div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold">
            Vault <span className="text-gradient-primary">Admin</span>
          </h1>
        </motion.div>

        {/* Admin stats from contract */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <StatCard
            icon={DollarSign}
            label="Total AUM (18d)"
            value={`$${formatShort(totalAssetsFormatted)}`}
          />
          <StatCard
            icon={TrendingUp}
            label="High water mark (18d)"
            value={
              highWaterMark != null && highWaterMark > 0n
                ? `$${formatShort(formatUnits(highWaterMark, SHARE_DECIMALS))}`
                : "—"
            }
          />
          <StatCard
            icon={Users}
            label="Total supply"
            value={
              totalSupply != null && totalSupply > 0n
                ? formatShort(formatUnits(totalSupply, SHARE_DECIMALS))
                : "0"
            }
          />
          <StatCard
            icon={RefreshCw}
            label="Last mgmt fee"
            value={
              lastManagementFeeTime != null
                ? formatTimeAgo(lastManagementFeeTime)
                : "—"
            }
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Whitelist management */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-6"
          >
            <h3 className="font-heading font-semibold text-lg mb-5 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Whitelist
            </h3>

            <div className="flex gap-3 mb-5">
              <Input
                placeholder="0x... address"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                className="bg-secondary/50 border-border font-mono text-sm"
              />
              <Button
                variant="glow"
                size="sm"
                className="shrink-0"
                onClick={handleAddWhitelist}
                disabled={isPending || !newAddress}
              >
                <Plus className="w-4 h-4" /> Add
              </Button>
              <Button
                variant="glow-outline"
                size="sm"
                className="shrink-0"
                onClick={handleRemoveWhitelist}
                disabled={isPending || !newAddress}
              >
                <Trash2 className="w-4 h-4" /> Remove
              </Button>
            </div>
            {newAddress && newAddress.startsWith("0x") && newAddress.length === 42 && (
              <p className="text-xs text-muted-foreground mb-4">
                <strong>{newAddress.slice(0, 10)}…</strong> is{" "}
                {isWhitelistedCheck ? "whitelisted" : "not whitelisted"}.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Contract does not expose a list of whitelisted addresses. Use Add/Remove by pasting an address.
            </p>
          </motion.div>

          {/* Strategy controls */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* Create & Initialize Pool (Uniswap v4 PoolManager.initialize) */}
            <div className="glass rounded-2xl p-6">
              <h3 className="font-heading font-semibold text-lg mb-3 flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" /> Create & Initialize Pool
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Initialize the Uniswap v4 pool with the vault&apos;s poolKey. Use once per pool. Fails if pool is already initialized.
              </p>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="min-w-[200px]">
                    <label className="text-sm text-muted-foreground mb-1 block">
                      Price (USDC per 1 ETH)
                    </label>
                    <Input
                      placeholder="e.g. 2000"
                      type="number"
                      step="any"
                      min="0"
                      value={initialPrice}
                      onChange={(e) => setInitialPrice(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <Button
                    variant="glow"
                    size="sm"
                    onClick={handleInitializePool}
                    disabled={isPending || !computedSqrtPriceX96 || computedSqrtPriceX96 <= 0n || !poolKey || !poolManager}
                  >
                    Initialize pool
                  </Button>
                </div>
                {computedSqrtPriceX96 != null && computedSqrtPriceX96 > 0n && (
                  <div className="space-y-1 text-xs text-muted-foreground font-mono bg-secondary/50 rounded px-3 py-2">
                    <div className="font-medium text-foreground">
                      Initialize at: {priceNum > 0 ? `$${priceNum.toLocaleString()} USDC per 1 ETH` : ""}
                    </div>
                    <div className="break-all">sqrtPriceX96: {computedSqrtPriceX96.toString()}</div>
                  </div>
                )}
              </div>
              {!poolManager && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  PoolManager not configured. Set VITE_POOL_MANAGER_ADDRESS or use default for this chain.
                </p>
              )}
            </div>

            {/* Vault state from contract */}
            <div className="glass rounded-2xl p-6">
              <h3 className="font-heading font-semibold text-lg mb-3">Vault state</h3>
              <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                <div className="text-muted-foreground">Current ETH price (pool):</div>
                <div>
                  {currentOnChainPrice != null && currentOnChainPrice > 0
                    ? `$${currentOnChainPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC per 1 ETH`
                    : "—"}
                </div>
                <div className="text-muted-foreground">Price range (USDC per 1 ETH):</div>
                <div>
                  {tickLower != null && tickUpper != null
                    ? `$${getPriceAtTick(tickLower, WETH_DECIMALS, USDC_DECIMALS).toFixed(2)} – $${getPriceAtTick(tickUpper, WETH_DECIMALS, USDC_DECIMALS).toFixed(2)}`
                    : "—"}
                </div>
                <div className="text-muted-foreground">Strategy value (18d):</div>
                <div>{totalStrategyValue != null ? formatUnits(totalStrategyValue, SHARE_DECIMALS) : "—"}</div>
                <div className="text-muted-foreground">Position ID:</div>
                <div>{positionTokenId != null ? String(positionTokenId) : "—"}</div>
                <div className="text-muted-foreground">Tick lower / upper:</div>
                <div>{tickLower != null && tickUpper != null ? `${tickLower} / ${tickUpper}` : "—"}</div>
              </div>
            </div>

            {/* Operations */}
            <div className="glass rounded-2xl p-6">
              <h3 className="font-heading font-semibold text-lg mb-5 flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" /> Operations
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="glow"
                  className="h-auto py-4 flex-col gap-1"
                  onClick={handleCompound}
                  disabled={isPending || !hasPosition}
                >
                  <RefreshCw className="w-5 h-5" />
                  <span className="text-sm">Compound</span>
                  <span className="text-xs text-primary-foreground/70">Collect & add to idle</span>
                </Button>
                <Button variant="glow-outline" className="h-auto py-4 flex-col gap-1" disabled>
                  <ArrowUpDown className="w-5 h-5" />
                  <span className="text-sm">Rebalance</span>
                  <span className="text-xs text-muted-foreground">Use form below</span>
                </Button>
                <Button
                  variant="glass"
                  className="h-auto py-4 flex-col gap-1"
                  onClick={handleChargeManagementFee}
                  disabled={isPending}
                >
                  <DollarSign className="w-5 h-5" />
                  <span className="text-sm">Charge Mgmt Fee</span>
                  <span className="text-xs text-muted-foreground">
                    {managementFeeBps != null ? `${Number(managementFeeBps) / 100}%` : "—"} annual
                  </span>
                </Button>
                <Button
                  variant="glass"
                  className="h-auto py-4 flex-col gap-1"
                  onClick={handleChargePerformanceFee}
                  disabled={isPending}
                >
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm">Charge Perf Fee</span>
                  <span className="text-xs text-muted-foreground">
                    {performanceFeeBps != null ? `${Number(performanceFeeBps) / 100}%` : "—"} of profit
                  </span>
                </Button>
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Set the liquidity range in ETH price (USDC per 1 ETH). Ticks are computed and rounded to tick spacing 60.
                </p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Price lower (USDC per 1 ETH)</label>
                    <Input
                      placeholder="e.g. 1000"
                      type="number"
                      step="any"
                      min="0"
                      value={priceLower}
                      onChange={(e) => setPriceLower(e.target.value)}
                      className="w-36 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Price upper (USDC per 1 ETH)</label>
                    <Input
                      placeholder="e.g. 4000"
                      type="number"
                      step="any"
                      min="0"
                      value={priceUpper}
                      onChange={(e) => setPriceUpper(e.target.value)}
                      className="w-36 font-mono"
                    />
                  </div>
                  <Button
                    variant="glow-outline"
                    size="sm"
                    onClick={handleRebalance}
                    disabled={isPending || rebalanceTickLower == null || rebalanceTickUpper == null || rebalanceTickLower >= rebalanceTickUpper}
                  >
                    Rebalance
                  </Button>
                </div>
                {rebalanceTickLower != null && rebalanceTickUpper != null && rebalanceTickLower < rebalanceTickUpper && (
                  <div className="text-xs text-muted-foreground font-mono bg-secondary/50 rounded px-3 py-2">
                    Computed ticks: {rebalanceTickLower} to {rebalanceTickUpper}
                  </div>
                )}
              </div>
            </div>

            {/* Fee settings from contract */}
            <div className="glass rounded-2xl p-6">
              <h3 className="font-heading font-semibold text-lg mb-5 flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" /> Fee Settings (from contract)
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Fee Recipient</label>
                  <Input
                    value={feeRecipientInput}
                    onChange={(e) => setFeeRecipientInput(e.target.value)}
                    placeholder="0x..."
                    className="bg-secondary/50 border-border font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">
                      Management Fee (bps, max 2000)
                    </label>
                    {/* <p className="text-xs text-primary/80 font-mono mb-1">
                      Current from contract: {managementFeeBps != null ? String(managementFeeBps) : "—"} bps
                      {managementFeeBps != null ? ` (${Number(managementFeeBps) / 100}%)` : ""}
                    </p> */}
                    <Input
                      value={
                        managementFeeEdited
                          ? managementFeeBpsInput
                          : managementFeeBps != null
                            ? String(managementFeeBps)
                            : managementFeeBpsInput
                      }
                      onChange={(e) => {
                        setManagementFeeBpsInput(e.target.value);
                        setManagementFeeEdited(true);
                      }}
                      placeholder="e.g. 200"
                      className="bg-secondary/50 border-border font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">
                      Performance Fee (bps, max 5000)
                    </label>
                    {/* <p className="text-xs text-primary/80 font-mono mb-1">
                      Current from contract: {performanceFeeBps != null ? String(performanceFeeBps) : "—"} bps
                      {performanceFeeBps != null ? ` (${Number(performanceFeeBps) / 100}%)` : ""}
                    </p> */}
                    <Input
                      value={
                        performanceFeeEdited
                          ? performanceFeeBpsInput
                          : performanceFeeBps != null
                            ? String(performanceFeeBps)
                            : performanceFeeBpsInput
                      }
                      onChange={(e) => {
                        setPerformanceFeeBpsInput(e.target.value);
                        setPerformanceFeeEdited(true);
                      }}
                      placeholder="e.g. 2000"
                      className="bg-secondary/50 border-border font-mono"
                    />
                  </div>
                </div>
                <Button
                  variant="glow"
                  className="w-full"
                  onClick={handleUpdateFeeSettings}
                  disabled={isPending}
                >
                  Update Fee Settings
                </Button>
              </div>
            </div>

            {/* Pull Liquidity */}
            <div className="glass rounded-2xl p-6">
              <h3 className="font-heading font-semibold text-lg mb-5">Pull Liquidity</h3>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Portion to pull (%)</label>
                <div className="flex gap-3">
                  <Input
                    value={pullPortionPct}
                    onChange={(e) => setPullPortionPct(e.target.value)}
                    className="bg-secondary/50 border-border font-mono"
                  />
                  <Button
                    variant="glow-outline"
                    className="shrink-0"
                    onClick={handlePullLiquidity}
                    disabled={isPending || !hasPosition}
                  >
                    Pull
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Portion in percent (1–100). Returns liquidity to vault as idle WETH/USDC.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
