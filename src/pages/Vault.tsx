import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatCard from "@/components/StatCard";
import {
  Droplets, TrendingUp, DollarSign, Percent,
  Plus, Minus, Gift, Info, Zap, ChevronDown
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount, useChainId } from "wagmi";
import { useVault, formatTokenAmount, parseTokenAmount, ETH_DECIMALS, USDC_DECIMALS } from "@/hooks/useVault";
import { usePoolPrice } from "@/hooks/usePoolPrice";
import { useZapOutQuote, useZapInQuote } from "@/hooks/useZapOutQuote";
import { getContractAddresses } from "@/lib/contracts";
import { formatCompact, formatToken } from "@/lib/utils";
import { getPriceAtTick, getAmount1ForAmount0, getAmount0ForAmount1 } from "@/lib/poolPrice";
import { toast } from "@/hooks/use-toast";

const SHARE_DECIMALS = 18;

/** Assets in 18 decimals from ETH (18) + USDC (6) amounts (same as vault totalAssets). */
function toAssets18(amount0Wei: bigint, amount1Raw: bigint): bigint {
  return amount0Wei + amount1Raw * 10n ** 12n; // USDC 6 -> 18
}

function formatUsdc(value: number): string {
  if (value === 0) return "";
  if (value < 0.01) return value.toFixed(4);
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatEth(value: number): string {
  if (value === 0) return "";
  if (value < 0.0001) return value.toPrecision(4);
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

const Vault = () => {
  const { address: userAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const { quoter } = getContractAddresses(chainId);
  const {
    totalAssets,
    totalSupply,
    shareBalance,
    isWhitelisted,
    sharePrice,
    ethBalance,
    usdcBalance,
    depositWithApproval,
    redeem,
    zapInWithApproval,
    zapInWithEthAsync,
    zapInWithUsdcWithApproval,
    zapOut,
    shareAllowanceZap,
    approveVaultSharesAsync,
    compoundAsync,
    refetch,
    isVaultReady,
    vault,
    zap,
    usdc,
    vaultOwner,
    tickLower,
    tickUpper,
    totalStrategyValue,
    positionEth,
    positionUsdc,
    totalValueUSD,
    idle0,
    idle1,
    isZapReady,
    vaultWriteStatus,
    zapWriteStatus,
    approveStatus,
    poolFee,
    poolKey,
  } = useVault();
  const { price: poolPriceNum, sqrtPriceX96 } = usePoolPrice();
  const tickLowerNum = tickLower != null ? Number(tickLower) : null;
  const tickUpperNum = tickUpper != null ? Number(tickUpper) : null;
  const hasTickRange =
    tickLowerNum != null &&
    tickUpperNum != null &&
    tickLowerNum < tickUpperNum &&
    sqrtPriceX96 != null &&
    sqrtPriceX96 > 0n;

  const [depositMode, setDepositMode] = useState<"standard" | "zap">("standard");
  const [zapToken, setZapToken] = useState<"ETH" | "USDC">("ETH");
  const [amount, setAmount] = useState("");
  const [amount1, setAmount1] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawOutput, setWithdrawOutput] = useState<"proportional" | "eth" | "usdc">("proportional");

  const handleEthAmountChange = (value: string) => {
    setAmount(value);
    const ethNum = parseFloat(value) || 0;
    if (ethNum < 0) return;
    if (hasTickRange && sqrtPriceX96) {
      const amount0Wei = parseTokenAmount(value || "0", ETH_DECIMALS);
      const amount1Raw = getAmount1ForAmount0(
        sqrtPriceX96,
        tickLowerNum!,
        tickUpperNum!,
        amount0Wei
      );
      setAmount1(amount1Raw > 0n ? formatUsdc(Number(amount1Raw) / 1e6) : "");
    } else if (poolPriceNum != null && poolPriceNum > 0) {
      setAmount1(formatUsdc(ethNum * poolPriceNum));
    }
  };

  const handleUsdcAmountChange = (value: string) => {
    setAmount1(value);
    const usdcNum = parseFloat(value) || 0;
    if (usdcNum < 0) return;
    if (hasTickRange && sqrtPriceX96) {
      const amount1Raw = parseTokenAmount(value || "0", USDC_DECIMALS);
      const amount0Raw = getAmount0ForAmount1(
        sqrtPriceX96,
        tickLowerNum!,
        tickUpperNum!,
        amount1Raw
      );
      setAmount(amount0Raw > 0n ? formatEth(Number(amount0Raw) / 1e18) : "");
    } else if (poolPriceNum != null && poolPriceNum > 0) {
      setAmount(formatEth(usdcNum / poolPriceNum));
    }
  };

  const totalAssetsFormatted = formatCompact(totalAssets, SHARE_DECIMALS);
  const shareBalanceFormatted = formatCompact(shareBalance, SHARE_DECIMALS);
  const totalSupplyFormatted = formatCompact(totalSupply, SHARE_DECIMALS);
  const ethBalanceFormatted = formatTokenAmount(ethBalance, ETH_DECIMALS);
  const usdcBalanceFormatted = formatTokenAmount(usdcBalance, USDC_DECIMALS);

  // Withdraw preview: proportional ETH and USDC for shares to redeem (matches vault redeem logic)
  const totalEth = (idle0 ?? 0n) + (positionEth ?? 0n);
  const totalUsdc = (idle1 ?? 0n) + (positionUsdc ?? 0n);
  const sharesToRedeemWei = parseTokenAmount(withdrawAmount || "0", SHARE_DECIMALS);
  const withdrawPreview =
    totalSupply != null &&
    totalSupply > 0n &&
    totalAssets != null &&
    totalAssets > 0n &&
    sharesToRedeemWei > 0n
      ? (() => {
          const assets18 = (sharesToRedeemWei * totalAssets) / totalSupply;
          const ratio = (assets18 * 10n ** 18n) / totalAssets;
          const previewEth = (totalEth * ratio) / 10n ** 18n;
          const previewUsdc = (totalUsdc * ratio) / 10n ** 18n;
          return { previewEth, previewUsdc } as const;
        })()
      : null;

  // Zap-out to single token: total = proportional amount + other token swapped via pool (estimate using pool price)
  const poolPriceWei = poolPriceNum != null && poolPriceNum > 0 ? BigInt(Math.max(1, Math.floor(poolPriceNum * 1e6))) : 0n;
  const withdrawZapOutEstimate =
    withdrawPreview != null && poolPriceWei > 0n
      ? {
          estimatedEthTotal: withdrawPreview.previewEth + (withdrawPreview.previewUsdc * 10n ** 18n) / poolPriceWei,
          estimatedUsdcTotal: withdrawPreview.previewUsdc + (withdrawPreview.previewEth * poolPriceWei) / 10n ** 18n,
        }
      : null;

  const { exactEthTotal, exactUsdcTotal, isLoading: zapOutQuoteLoading } = useZapOutQuote(
    withdrawPreview,
    withdrawOutput,
    poolKey,
    quoter
  );

  const zapInputAmount =
    depositMode === "zap"
      ? zapToken === "ETH"
        ? parseTokenAmount(amount || "0", ETH_DECIMALS)
        : parseTokenAmount(amount || "0", USDC_DECIMALS)
      : 0n;
  const { estimatedShares: zapInQuoteShares, isLoading: zapInQuoteLoading } = useZapInQuote(
    zapToken,
    zapInputAmount,
    poolKey,
    quoter,
    totalSupply,
    totalAssets
  );

  const isVaultOwner = userAddress != null && vaultOwner != null && userAddress.toLowerCase() === vaultOwner.toLowerCase();

  // Estimated shares: standard = in-ratio assets → shares; zap = quote-based or fallback to price-based
  const estimatedSharesFallback = (() => {
    if (depositMode === "standard") {
      const a0 = parseTokenAmount(amount || "0", ETH_DECIMALS);
      const a1 = parseTokenAmount(amount1 || "0", USDC_DECIMALS);
      if (a0 === 0n && a1 === 0n) return 0n;
      const assets18 = toAssets18(a0, a1);
      if (totalSupply === 0n) return assets18;
      if (totalAssets === 0n) return 0n;
      return (assets18 * totalSupply) / totalAssets;
    }
    // Zap fallback: approximate (amount0, amount1) after 50/50 swap using pool price
    const priceNum = poolPriceNum != null && poolPriceNum > 0 ? poolPriceNum : 1;
    const priceBasis = BigInt(Math.max(1, Math.floor(priceNum * 1e6)));
    if (zapToken === "ETH") {
      const ethWei = parseTokenAmount(amount || "0", ETH_DECIMALS);
      if (ethWei === 0n) return 0n;
      const half = ethWei / 2n;
      const amount0Wei = half;
      const amount1Raw = (half * priceBasis) / 10n ** 18n;
      const assets18 = toAssets18(amount0Wei, amount1Raw);
      if (totalSupply === 0n) return assets18;
      if (totalAssets === 0n) return 0n;
      return (assets18 * totalSupply) / totalAssets;
    }
    const usdcRaw = parseTokenAmount(amount || "0", USDC_DECIMALS);
    if (usdcRaw === 0n) return 0n;
    const half = usdcRaw / 2n;
    const priceWhole = BigInt(Math.max(1, Math.floor(priceNum)));
    const amount0Wei = (half * 10n ** 12n) / priceWhole;
    const amount1Raw = half;
    const assets18 = toAssets18(amount0Wei, amount1Raw);
    if (totalSupply === 0n) return assets18;
    if (totalAssets === 0n) return 0n;
    return (assets18 * totalSupply) / totalAssets;
  })();
  const estimatedShares =
    depositMode === "zap" && zapInQuoteShares != null ? zapInQuoteShares : estimatedSharesFallback;
  const estimatedSharesFormatted =
    depositMode === "zap" && zapInQuoteLoading ? "…" : formatToken(estimatedShares, SHARE_DECIMALS);
  const minSharesOut = (estimatedShares * 95n) / 100n;

  const canDeposit =
    isConnected &&
    isWhitelisted &&
    (depositMode === "standard" ? isVaultReady : isZapReady);
  const isPending =
    vaultWriteStatus === "pending" ||
    zapWriteStatus === "pending" ||
    approveStatus === "pending";

  const handleAddLiquidity = async () => {
    if (!userAddress) return;
    try {
      if (depositMode === "standard") {
        // Standard: deposit ETH + USDC directly to vault (no zap)
        if (!isVaultReady) return;
        const amount0Eth = parseTokenAmount(amount || "0", ETH_DECIMALS);
        const amount1Usdc = parseTokenAmount(amount1 || "0", USDC_DECIMALS);
        if (amount0Eth === 0n && amount1Usdc === 0n) return;
        await depositWithApproval(amount0Eth, amount1Usdc, userAddress, amount0Eth);
      } else {
        // Zap mode: use zap contract only
        if (!isZapReady) return;
        if (zapToken === "ETH") {
          const val = parseTokenAmount(amount || "0", ETH_DECIMALS);
          if (val === 0n) return;
          await zapInWithEthAsync(minSharesOut, val);
        } else {
          const val = parseTokenAmount(amount || "0", USDC_DECIMALS);
          if (val === 0n) return;
          await zapInWithUsdcWithApproval(val, minSharesOut);
        }
      }
      refetch();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Transaction failed", variant: "destructive" });
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!userAddress) return;
    const shares = parseTokenAmount(withdrawAmount || "0", SHARE_DECIMALS);
    if (shares === 0n) return;
    try {
      if (withdrawOutput === "proportional") {
        if (!isVaultReady) return;
        await redeem(shares, userAddress, userAddress);
      } else {
        if (!isZapReady || !zap) return;
        if ((shareAllowanceZap ?? 0n) < shares) {
          await approveVaultSharesAsync(zap, shares);
        }
        const minAmountOut =
          withdrawOutput === "eth"
            ? (exactEthTotal != null ? (exactEthTotal * 95n) / 100n : withdrawZapOutEstimate ? (withdrawZapOutEstimate.estimatedEthTotal * 95n) / 100n : withdrawPreview ? (withdrawPreview.previewEth * 95n) / 100n : 0n)
            : (exactUsdcTotal != null ? (exactUsdcTotal * 95n) / 100n : withdrawZapOutEstimate ? (withdrawZapOutEstimate.estimatedUsdcTotal * 95n) / 100n : withdrawPreview ? (withdrawPreview.previewUsdc * 95n) / 100n : 0n);
        const tokenOut = withdrawOutput === "eth" ? "0x0000000000000000000000000000000000000000" as `0x${string}` : (usdc as `0x${string}`);
        await zapOut(shares, tokenOut, minAmountOut);
      }
      refetch();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Withdraw failed", variant: "destructive" });
    }
  };

  const shareBalanceRaw = formatTokenAmount(shareBalance, SHARE_DECIMALS);
  const setMaxEth = () => handleEthAmountChange(ethBalanceFormatted);
  const setMaxUsdc = () => handleUsdcAmountChange(usdcBalanceFormatted);
  const setMaxShares = () => setWithdrawAmount(shareBalanceRaw);
  const setWithdrawPct = (pct: number) =>
    setWithdrawAmount((Number(shareBalanceRaw) * (pct / 100)).toFixed(6));

  useEffect(() => {
    if (vaultWriteStatus === "success" || zapWriteStatus === "success") refetch();
  }, [vaultWriteStatus, zapWriteStatus, refetch]);

  const pendingLabel =
    approveStatus === "pending"
      ? "Approve in wallet..."
      : vaultWriteStatus === "pending" || zapWriteStatus === "pending"
        ? "Confirm in wallet..."
        : null;

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />

      <div className="container max-w-6xl relative">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-mono text-primary mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Live on Base
          </div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
            ETH/USDC <span className="text-gradient-primary">Liquidity Pool</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Earn yield by providing liquidity. Auto-compounding rewards with MEV protection.
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <StatCard
            icon={DollarSign}
            label="Your Position"
            value={shareBalanceFormatted ? `${shareBalanceFormatted} shares` : "—"}
            change={sharePrice && shareBalance > 0n ? `≈ $${(Number(formatTokenAmount(shareBalance, SHARE_DECIMALS)) * sharePrice).toFixed(2)}` : "Connect wallet"}
            positive
          />
          <StatCard
            icon={TrendingUp}
            label="Share Price"
            value={sharePrice ? `$${sharePrice.toFixed(4)}` : "—"}
            change={totalSupply > 0n ? "Live" : "—"}
            positive
          />
          <StatCard
            icon={Percent}
            label="Total Assets"
            value={totalSupply > 0n ? `${totalSupplyFormatted} shares` : "—"}
            change={totalValueUSD > 0 ? `≈ $${totalValueUSD.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}` : "—"}
            positive
          />
          <StatCard
            icon={Droplets}
            label="In Pool"
            value={
              poolPriceNum != null && poolPriceNum > 0 && (positionEth > 0n || positionUsdc > 0n)
                ? `$${(Number(positionEth) / 1e18 * poolPriceNum + Number(positionUsdc) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
                : "—"
            }
            change={positionEth > 0n || positionUsdc > 0n ? "Liquidity value" : "—"}
            positive
          />
        </div>

        {isConnected && !isWhitelisted && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-4 py-3 mb-6">
            Your address is not whitelisted. Only whitelisted addresses can deposit or withdraw.
          </div>
        )}
        {!isConnected && (
          <div className="rounded-xl border border-border bg-muted/30 text-muted-foreground px-4 py-3 mb-6">
            Connect your wallet to view your position and add or remove liquidity.
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main action panel */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-6 card-hover"
            >
              <Tabs defaultValue="add">
                <TabsList className="w-full bg-secondary/40 mb-6 p-1 rounded-xl">
                  <TabsTrigger value="add" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium">
                    <Plus className="w-4 h-4" /> Deposit
                  </TabsTrigger>
                  <TabsTrigger value="remove" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium">
                    <Minus className="w-4 h-4" /> Withdraw
                  </TabsTrigger>
                  <TabsTrigger value="rewards" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium">
                    <Gift className="w-4 h-4" /> Rewards
                  </TabsTrigger>
                </TabsList>

                {/* ADD LIQUIDITY */}
                <TabsContent value="add" className="space-y-5">
                  {isConnected && !isWhitelisted && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
                      Your address is not whitelisted. Ask the vault admin to add your address on the Admin page so you can deposit.
                    </div>
                  )}
                  {/* Mode toggle */}
                  <div className="flex gap-2 p-1 rounded-lg bg-secondary/30 w-fit">
                    <button
                      onClick={() => setDepositMode("standard")}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                        depositMode === "standard"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Standard
                    </button>
                    <button
                      onClick={() => setDepositMode("zap")}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                        depositMode === "zap"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" /> Zap
                    </button>
                  </div>

                  {depositMode === "standard" ? (
                    <>
                      {/* ETH Input (native) – USDC updates from pool price */}
                      <div className="rounded-xl bg-secondary/20 border border-border/30 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">ETH Amount</label>
                          <span className="text-xs text-muted-foreground">Balance: {ethBalanceFormatted}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => handleEthAmountChange(e.target.value)}
                            className="bg-transparent border-0 text-xl font-mono focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button type="button" onClick={setMaxEth} className="text-xs text-primary font-medium hover:underline">MAX</button>
                            <div className="px-3 py-1.5 rounded-lg bg-card border border-border/50 text-sm font-mono font-medium">ETH</div>
                          </div>
                        </div>
                        {poolPriceNum != null && poolPriceNum > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">≈ ${poolPriceNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} per 1 ETH</p>
                        )}
                      </div>

                      {/* USDC Input – ETH updates from pool price */}
                      <div className="rounded-xl bg-secondary/20 border border-border/30 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">USDC Amount</label>
                          <span className="text-xs text-muted-foreground">Balance: {usdcBalanceFormatted}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={amount1}
                            onChange={(e) => handleUsdcAmountChange(e.target.value)}
                            className="bg-transparent border-0 text-xl font-mono focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button type="button" onClick={setMaxUsdc} className="text-xs text-primary font-medium hover:underline">MAX</button>
                            <div className="px-3 py-1.5 rounded-lg bg-card border border-border/50 text-sm font-mono font-medium">USDC</div>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Only the in-ratio amount at the pool price is deposited (no idle funds). Excess ETH is refunded.
                      </p>
                    </>
                  ) : (
                    /* ZAP Mode */
                    <>
                      <div className="rounded-xl bg-secondary/20 border border-border/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">You Pay</label>
                      <span className="text-xs text-muted-foreground">Balance: {zapToken === "ETH" ? ethBalanceFormatted : usdcBalanceFormatted}</span>
                    </div>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="bg-transparent border-0 text-xl font-mono focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button type="button" onClick={zapToken === "ETH" ? setMaxEth : setMaxUsdc} className="text-xs text-primary font-medium hover:underline">MAX</button>
                            <button
                              onClick={() => setZapToken(zapToken === "ETH" ? "USDC" : "ETH")}
                              className="px-3 py-1.5 rounded-lg bg-card border border-border/50 text-sm font-mono font-medium flex items-center gap-1.5 hover:border-primary/40 transition-colors"
                            >
                              {zapToken} <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
                        <Zap className="w-3.5 h-3.5 text-primary" />
                        <span>Auto-splits via Uniswap v4 into optimal 50/50 position</span>
                      </div>
                      {(!poolPriceNum || poolPriceNum <= 0) && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Pool price unavailable. Ensure the pool is initialized on this network; otherwise zap may revert.
                        </p>
                      )}
                    </>
                  )}

                  <div className="rounded-xl border border-border/30 bg-secondary/10 p-4 space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">You receive</span>
                      <span className="font-mono font-medium">
                        {estimatedSharesFormatted} shares
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Slippage tolerance</span>
                      <span className="font-mono text-primary">0.5%</span>
                    </div>
                    {depositMode === "zap" && zapInQuoteShares != null && (
                      <p className="text-xs text-muted-foreground pt-0.5">
                        Estimate from pool quote (50% swapped). Min received: 95%.
                      </p>
                    )}
                  </div>

                  <Button
                    variant="glow"
                    className="w-full text-base h-12 rounded-xl font-semibold"
                    size="lg"
                    onClick={handleAddLiquidity}
                    disabled={!canDeposit || isPending}
                  >
                    {isPending ? pendingLabel ?? "Confirm..." : depositMode === "zap" ? (
                      <><Zap className="w-4 h-4 mr-1" /> Zap & Deposit</>
                    ) : (
                      "Deposit"
                    )}
                  </Button>
                </TabsContent>

                <TabsContent value="remove" className="space-y-5">
                  <div className="rounded-xl bg-secondary/20 border border-border/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Shares to Redeem</label>
                      <span className="text-xs text-muted-foreground">Your shares: {shareBalanceFormatted}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="bg-transparent border-0 text-xl font-mono focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={setMaxShares} className="text-xs text-primary font-medium hover:underline">MAX</button>
                        <div className="px-3 py-1.5 rounded-lg bg-card border border-border/50 text-sm font-mono font-medium">Shares</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      ≈ ${withdrawAmount && sharePrice ? (Number(withdrawAmount) * sharePrice).toFixed(2) : "0.00"} · Your shares: {shareBalanceFormatted}
                    </div>
                  </div>

                  {/* Percentage shortcuts */}
                  <div className="flex gap-2">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setWithdrawPct(pct)}
                        className="flex-1 py-2 rounded-lg bg-secondary/30 border border-border/30 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  {/* Withdraw output: proportional or zap out to single token */}
                  <div className="rounded-xl border border-border/30 bg-secondary/10 p-4">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Receive as</div>
                    <div className="flex gap-2">
                      {(["proportional", "eth", "usdc"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setWithdrawOutput(mode)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                            withdrawOutput === mode
                              ? "bg-primary/15 border-primary text-primary"
                              : "bg-secondary/30 border-border/30 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {mode === "proportional" ? "ETH + USDC" : mode === "eth" ? "ETH only" : "USDC only"}
                        </button>
                      ))}
                    </div>
                    {withdrawOutput !== "proportional" && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {exactEthTotal != null || exactUsdcTotal != null
                          ? "Exact amount from pool quote (before slippage). Min received is 95% of this."
                          : "Zap out swaps to one token via the pool. Amount may vary with price and slippage."}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/30 bg-secondary/10 p-4 space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">You receive</span>
                      <span className="font-mono font-medium text-right">
                        {withdrawPreview
                          ? withdrawOutput === "proportional"
                            ? `${formatToken(withdrawPreview.previewEth, ETH_DECIMALS)} ETH + ${formatToken(withdrawPreview.previewUsdc, USDC_DECIMALS)} USDC`
                            : withdrawOutput === "eth"
                              ? exactEthTotal != null
                                ? `${formatToken(exactEthTotal, ETH_DECIMALS)} ETH`
                                : zapOutQuoteLoading
                                  ? "…"
                                  : withdrawZapOutEstimate
                                    ? `≈ ${formatToken(withdrawZapOutEstimate.estimatedEthTotal, ETH_DECIMALS)} ETH`
                                    : `≈ ${formatToken(withdrawPreview.previewEth, ETH_DECIMALS)} ETH`
                              : exactUsdcTotal != null
                                ? `${formatToken(exactUsdcTotal, USDC_DECIMALS)} USDC`
                                : zapOutQuoteLoading
                                  ? "…"
                                  : withdrawZapOutEstimate
                                    ? `≈ ${formatToken(withdrawZapOutEstimate.estimatedUsdcTotal, USDC_DECIMALS)} USDC`
                                    : `≈ ${formatToken(withdrawPreview.previewUsdc, USDC_DECIMALS)} USDC`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Withdrawal fee</span>
                      <span className="font-mono">0%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Estimated value</span>
                      <span className="font-mono text-primary">
                        ${withdrawAmount && sharePrice ? (Number(withdrawAmount) * sharePrice).toFixed(2) : "0"}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="glow"
                    className="w-full text-base h-12 rounded-xl font-semibold"
                    size="lg"
                    onClick={handleRemoveLiquidity}
                    disabled={
                      !withdrawAmount ||
                      isPending ||
                      (withdrawOutput === "proportional" ? !isVaultReady : !isZapReady) ||
                      !isConnected ||
                      !isWhitelisted
                    }
                  >
                    {isPending ? "Confirm in wallet…" : withdrawOutput !== "proportional" ? "Zap out" : "Withdraw"}
                  </Button>
                </TabsContent>

                {/* REWARDS */}
                <TabsContent value="rewards" className="space-y-5">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
                    <Gift className="w-10 h-10 text-primary mx-auto mb-3" />
                    <div className="font-heading text-3xl font-bold mb-1">
                      {idle0 > 0n || idle1 > 0n
                        ? `${formatToken(idle0, ETH_DECIMALS)} ETH + ${formatToken(idle1, USDC_DECIMALS)} USDC`
                        : "0"}
                    </div>
                    <p className="text-sm text-muted-foreground">Uncompounded fees in vault</p>
                  </div>

                  <div className="rounded-xl border border-border/30 bg-secondary/10 p-4">
                    <div className="text-sm font-medium mb-1">LP trading fees</div>
                    <div className="text-xs text-muted-foreground">
                      Fees from the position are collected into the vault. Only the vault owner can compound them back into the position.
                    </div>
                    <div className="flex justify-between mt-3 text-sm">
                      <span className="text-muted-foreground">ETH (idle)</span>
                      <span className="font-mono">{formatToken(idle0, ETH_DECIMALS)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">USDC (idle)</span>
                      <span className="font-mono">{formatToken(idle1, USDC_DECIMALS)}</span>
                    </div>
                  </div>

                  {isVaultOwner ? (
                    <Button
                      variant="glow"
                      className="w-full text-base h-12 rounded-xl font-semibold"
                      size="lg"
                      disabled={isPending || (idle0 === 0n && idle1 === 0n)}
                      onClick={async () => {
                        try {
                          await compoundAsync();
                          refetch();
                        } catch (e) {
                          toast({ title: "Error", description: e instanceof Error ? e.message : "Compound failed", variant: "destructive" });
                        }
                      }}
                    >
                      {isPending ? "Confirm..." : "Compound fees into position"}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center">
                      Only the vault owner can compound fees. Your share of fees accrues via the vault share price.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </motion.div>
          </div>

          <div className="space-y-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5"
            >
              <h3 className="font-heading font-semibold text-sm mb-4 flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <Info className="w-3.5 h-3.5 text-primary" /> Pool Details
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Pair</span><span className="font-mono">ETH / USDC</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Current ETH price</span><span className="font-mono">{poolPriceNum != null && poolPriceNum > 0 ? `$${poolPriceNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Price range</span><span className="font-mono text-xs">{tickLower != null && tickUpper != null && tickLower < tickUpper ? `$${getPriceAtTick(Number(tickLower), ETH_DECIMALS, USDC_DECIMALS).toFixed(0)} – $${getPriceAtTick(Number(tickUpper), ETH_DECIMALS, USDC_DECIMALS).toFixed(0)}` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ETH in pool</span><span className="font-mono">{positionEth > 0n ? `${formatToken(positionEth, ETH_DECIMALS)} ETH` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">USDC in pool</span><span className="font-mono">{positionUsdc > 0n ? `${formatToken(positionUsdc, USDC_DECIMALS)} USDC` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fee Tier</span><span className="font-mono">{poolFee != null ? `${(Number(poolFee) / 10000).toFixed(2)}%` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Network</span><span className="font-mono text-primary">Base</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Protocol</span><span className="font-mono">Uniswap v4</span></div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Vault;
