import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatCard from "@/components/StatCard";
import {
  Droplets, TrendingUp, DollarSign, Percent,
  ArrowDownUp, Plus, Minus, Gift, Info, Zap, ChevronDown
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "wagmi";
import { useVault, formatTokenAmount, parseTokenAmount, ETH_DECIMALS, USDC_DECIMALS } from "@/hooks/useVault";
import { usePoolPrice } from "@/hooks/usePoolPrice";
import { formatCompact, formatToken } from "@/lib/utils";
import { getPriceAtTick } from "@/lib/poolPrice";

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
    compoundAsync,
    refetch,
    isVaultReady,
    vaultOwner,
    tickLower,
    tickUpper,
    totalStrategyValue,
    idle0,
    idle1,
    isZapReady,
    vaultWriteStatus,
    zapWriteStatus,
    approveStatus,
    managementFeeBps,
    performanceFeeBps,
    poolFee,
  } = useVault();
  const poolPrice = usePoolPrice();

  const [depositMode, setDepositMode] = useState<"standard" | "zap">("standard");
  const [zapToken, setZapToken] = useState<"ETH" | "USDC">("ETH");
  const [amount, setAmount] = useState("");
  const [amount1, setAmount1] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const handleEthAmountChange = (value: string) => {
    setAmount(value);
    if (poolPrice != null && poolPrice > 0) {
      const ethNum = parseFloat(value) || 0;
      setAmount1(ethNum >= 0 ? formatUsdc(ethNum * poolPrice) : "");
    }
  };

  const handleUsdcAmountChange = (value: string) => {
    setAmount1(value);
    if (poolPrice != null && poolPrice > 0) {
      const usdcNum = parseFloat(value) || 0;
      setAmount(usdcNum >= 0 ? formatEth(usdcNum / poolPrice) : "");
    }
  };

  const totalAssetsFormatted = formatCompact(totalAssets, SHARE_DECIMALS);
  const shareBalanceFormatted = formatCompact(shareBalance, SHARE_DECIMALS);
  const totalSupplyFormatted = formatCompact(totalSupply, SHARE_DECIMALS);
  const ethBalanceFormatted = formatTokenAmount(ethBalance, ETH_DECIMALS);
  const usdcBalanceFormatted = formatTokenAmount(usdcBalance, USDC_DECIMALS);

  const isVaultOwner = userAddress != null && vaultOwner != null && userAddress.toLowerCase() === vaultOwner.toLowerCase();

  const estimatedShares = (() => {
    const a0 = parseTokenAmount(amount || "0", ETH_DECIMALS);
    const a1 = parseTokenAmount(amount1 || "0", USDC_DECIMALS);
    if (a0 === 0n && a1 === 0n) return 0n;
    const assets18 = toAssets18(a0, a1);
    if (totalSupply === 0n) return assets18;
    if (totalAssets === 0n) return 0n;
    return (assets18 * totalSupply) / totalAssets;
  })();
  const estimatedSharesFormatted = formatToken(estimatedShares, SHARE_DECIMALS);

  const canDeposit = isConnected && isWhitelisted && (isVaultReady || isZapReady);
  const isPending =
    vaultWriteStatus === "pending" ||
    zapWriteStatus === "pending" ||
    approveStatus === "pending";

  const handleAddLiquidity = async () => {
    if (!userAddress) return;
    setTxError(null);
    try {
      if (depositMode === "standard") {
        // Uniswap v4: currency0 = ETH, currency1 = USDC
        const amount0Eth = parseTokenAmount(amount || "0", ETH_DECIMALS);
        const amount1Usdc = parseTokenAmount(amount1 || "0", USDC_DECIMALS);
        if (amount0Eth === 0n && amount1Usdc === 0n) return;
        if (isZapReady) {
          await zapInWithApproval(amount0Eth, amount1Usdc, 0n, amount0Eth);
        } else if (isVaultReady) {
          await depositWithApproval(amount0Eth, amount1Usdc, userAddress, amount0Eth);
        }
      } else {
        if (zapToken === "ETH") {
          const val = parseTokenAmount(amount || "0", ETH_DECIMALS);
          if (val === 0n) return;
          await zapInWithEthAsync(0n, val);
        } else {
          const val = parseTokenAmount(amount || "0", USDC_DECIMALS);
          if (val === 0n) return;
          await zapInWithUsdcWithApproval(val, 0n);
        }
      }
      refetch();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!userAddress) return;
    const shares = parseTokenAmount(withdrawAmount || "0", SHARE_DECIMALS);
    if (shares === 0n) return;
    setTxError(null);
    try {
      if (isZapReady) {
        await zapOut(shares, "0x0000000000000000000000000000000000000000" as `0x${string}`, 0n);
      } else if (isVaultReady) {
        await redeem(shares, userAddress, userAddress);
      }
      refetch();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Withdraw failed");
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
            value={totalAssetsFormatted || "—"}
            change={totalSupply > 0n ? `${totalSupplyFormatted} shares` : "—"}
            positive
          />
          <StatCard
            icon={Droplets}
            label="Pool Liquidity"
            value={totalAssetsFormatted || "—"}
            change={totalSupply > 0n ? `${totalSupplyFormatted} shares` : "—"}
            positive
          />
        </div>

        {isConnected && !isWhitelisted && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-4 py-3 mb-6">
            Your address is not whitelisted. Only whitelisted addresses can deposit or withdraw.
          </div>
        )}
        {txError && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3 mb-6">
            {txError}
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
                        {poolPrice != null && poolPrice > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">≈ ${poolPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} per 1 ETH</p>
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
                      <span className="text-muted-foreground">Share price</span>
                      <span className="font-mono">${sharePrice ? sharePrice.toFixed(4) : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Slippage tolerance</span>
                      <span className="font-mono text-primary">0.5%</span>
                    </div>
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

                  <div className="rounded-xl border border-border/30 bg-secondary/10 p-4 space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">You receive</span>
                      <span className="font-mono font-medium">ETH + USDC (proportional)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Exit fee</span>
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
                    disabled={!canDeposit || isPending || !withdrawAmount}
                  >
                    {isPending ? "Confirm in wallet…" : "Withdraw"}
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
                        setTxError(null);
                        try {
                          await compoundAsync();
                          refetch();
                        } catch (e) {
                          setTxError(e instanceof Error ? e.message : "Compound failed");
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
                <div className="flex justify-between"><span className="text-muted-foreground">Current ETH price</span><span className="font-mono">{poolPrice != null && poolPrice > 0 ? `$${poolPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Price range</span><span className="font-mono text-xs">{tickLower < tickUpper ? `$${getPriceAtTick(tickLower, ETH_DECIMALS, USDC_DECIMALS).toFixed(0)} – $${getPriceAtTick(tickUpper, ETH_DECIMALS, USDC_DECIMALS).toFixed(0)}` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fee Tier</span><span className="font-mono">{poolFee != null ? `${(poolFee / 10000).toFixed(2)}%` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Network</span><span className="font-mono text-primary">Base</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Protocol</span><span className="font-mono">Uniswap v4</span></div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5"
            >
              <h3 className="font-heading font-semibold text-sm mb-4 uppercase tracking-wider text-muted-foreground">Fees</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Management</span><span className="font-mono">{managementFeeBps != null ? `${Number(managementFeeBps) / 100}% / yr` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Performance</span><span className="font-mono">{performanceFeeBps != null ? `${Number(performanceFeeBps) / 100}%` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Swap Fee</span><span className="font-mono">{poolFee != null ? `${(poolFee / 10000).toFixed(2)}%` : "—"}</span></div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5"
            >
              <h3 className="font-heading font-semibold text-sm mb-4 flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <ArrowDownUp className="w-3.5 h-3.5 text-primary" /> Pool Position
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total value</span><span className="font-mono">{formatCompact(totalAssets, SHARE_DECIMALS)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">In position</span><span className="font-mono">{formatCompact(totalStrategyValue, SHARE_DECIMALS)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tick range</span><span className="font-mono text-xs">[{tickLower}, {tickUpper}]</span></div>
                {sharePrice > 0 && totalSupply > 0n && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Share price</span><span className="font-mono text-primary">${sharePrice.toFixed(4)}</span></div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Vault;
