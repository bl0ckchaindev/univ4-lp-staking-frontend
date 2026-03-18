import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useBalance,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { getContractAddresses } from "@/lib/contracts";
import { vaultAbi } from "@/lib/abis/vault";
import { zapAbi } from "@/lib/abis/zap";
import { erc20Abi } from "@/lib/abis/erc20";
import { positionManagerAbi } from "@/lib/abis/positionManager";
import { usePoolPrice } from "@/hooks/usePoolPrice";
import { getAmountsForLiquidity } from "@/lib/poolPrice";

const ETH_DECIMALS = 18;
/** USDC uses 6 decimals (on-chain standard), not 18. */
const USDC_DECIMALS = 6;

export function useVault() {
  const chainId = useChainId();
  const { address: userAddress } = useAccount();
  const { vault, zap, usdc } = getContractAddresses(chainId);

  // Vault reads
  const { data: totalAssets, refetch: refetchTotalAssets } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalAssets",
  });

  const { data: totalSupply, refetch: refetchTotalSupply } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalSupply",
  });

  const { data: shareBalance, refetch: refetchShareBalance } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
  });

  const { data: isWhitelisted } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "isWhitelisted",
    args: userAddress ? [userAddress] : undefined,
  });

  const { data: idle0 } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "idle0",
  });

  const { data: idle1 } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "idle1",
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

  const { data: vaultOwner } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "owner",
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

  const { data: totalStrategyValue } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalStrategyValue",
  });

  const { data: positionTokenId } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "positionTokenId",
  });
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

  const { data: poolKeyData } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "poolKey",
  });

  // Native ETH balance (Uniswap v4 uses ETH, not WETH)
  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({
    address: userAddress,
  });

  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
  });

  // USDC allowance for vault and zap (for approve-before-deposit)
  const { data: usdcAllowanceVault, refetch: refetchAllowanceVault } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: userAddress && vault ? [userAddress, vault] : undefined,
  });

  const { data: usdcAllowanceZap, refetch: refetchAllowanceZap } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: userAddress && zap ? [userAddress, zap] : undefined,
  });

  const { data: shareAllowanceZap, refetch: refetchShareAllowanceZap } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "allowance",
    args: userAddress && zap ? [userAddress, zap] : undefined,
  });

  const ethBalance = ethBalanceData?.value ?? 0n;

  // ERC20 approve (USDC) – used before deposit/zap
  const { writeContractAsync: writeApproveUsdc, status: approveStatus } = useWriteContract();

  async function approveUsdcAsync(spender: `0x${string}`, amount: bigint): Promise<void> {
    if (!usdc || amount === 0n) return;
    await writeApproveUsdc({
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
    });
    refetchAllowanceVault();
    refetchAllowanceZap();
  }

  // Vault writes (async so we can chain after approve)
  const { writeContractAsync: writeVaultAsync, status: vaultWriteStatus } = useWriteContract();

  async function depositAsync(
    amount0: bigint,
    amount1: bigint,
    receiver: `0x${string}`,
    value?: bigint
  ): Promise<void> {
    if (!vault) return;
    await writeVaultAsync({
      address: vault,
      abi: vaultAbi,
      functionName: "deposit",
      args: [amount0, amount1, receiver],
      value: value ?? 0n,
    });
  }

  async function redeem(shares: bigint, receiver: `0x${string}`, owner: `0x${string}`): Promise<void> {
    if (!vault) return;
    await writeVaultAsync({
      address: vault,
      abi: vaultAbi,
      functionName: "redeem",
      args: [shares, receiver, owner],
    });
  }

  // Zap writes (async so we can chain after approve)
  const { writeContractAsync: writeZapAsync, status: zapWriteStatus } = useWriteContract();

  async function zapInAsync(
    amount0: bigint,
    amount1: bigint,
    minSharesOut: bigint,
    value?: bigint
  ): Promise<void> {
    if (!zap) return;
    await writeZapAsync({
      address: zap,
      abi: zapAbi,
      functionName: "zapIn",
      args: [amount0, amount1, minSharesOut],
      value: value ?? 0n,
    });
  }

  async function zapInWithEthAsync(minSharesOut: bigint, value: bigint): Promise<void> {
    if (!zap) return;
    await writeZapAsync({
      address: zap,
      abi: zapAbi,
      functionName: "zapInWithEth",
      args: [minSharesOut],
      value,
    });
  }

  async function zapInWithUsdcAsync(
    usdcAmount: bigint,
    minSharesOut: bigint
  ): Promise<void> {
    if (!zap) return;
    await writeZapAsync({
      address: zap,
      abi: zapAbi,
      functionName: "zapInWithUsdc",
      args: [usdcAmount, minSharesOut],
    });
  }

  async function zapOut(shares: bigint, tokenOut: `0x${string}`, minAmountOut: bigint): Promise<void> {
    if (!zap) return;
    await writeZapAsync({
      address: zap,
      abi: zapAbi,
      functionName: "zapOut",
      args: [shares, tokenOut, minAmountOut],
    });
  }

  async function approveVaultSharesAsync(spender: `0x${string}`, amount: bigint): Promise<void> {
    if (!vault || amount === 0n) return;
    await writeVaultAsync({
      address: vault,
      abi: vaultAbi,
      functionName: "approve",
      args: [spender, amount],
    });
    refetchShareAllowanceZap();
  }

  async function compoundAsync(): Promise<void> {
    if (!vault) return;
    await writeVaultAsync({
      address: vault,
      abi: vaultAbi,
      functionName: "compound",
    });
  }

  /**
   * Approve USDC for vault (if needed) then deposit. Use for standard deposit.
   */
  async function depositWithApproval(
    amount0: bigint,
    amount1: bigint,
    receiver: `0x${string}`,
    value?: bigint
  ): Promise<void> {
    if (!vault || !userAddress) return;
    if (amount1 > 0n && usdc) {
      const current = usdcAllowanceVault ?? 0n;
      if (current < amount1) {
        await approveUsdcAsync(vault, amount1);
      }
    }
    await depositAsync(amount0, amount1, receiver, value);
  }

  /**
   * Approve USDC for zap (if needed) then zapIn. Use for standard zap (both ETH + USDC).
   */
  async function zapInWithApproval(
    amount0: bigint,
    amount1: bigint,
    minSharesOut: bigint,
    value?: bigint
  ): Promise<void> {
    if (!zap || !userAddress) return;
    if (amount1 > 0n && usdc) {
      const current = usdcAllowanceZap ?? 0n;
      if (current < amount1) {
        await approveUsdcAsync(zap, amount1);
      }
    }
    await zapInAsync(amount0, amount1, minSharesOut, value);
  }

  /**
   * Approve USDC for zap (if needed) then zapInWithUsdc.
   */
  async function zapInWithUsdcWithApproval(
    usdcAmount: bigint,
    minSharesOut: bigint
  ): Promise<void> {
    if (!zap || !userAddress) return;
    if (usdcAmount > 0n && usdc) {
      const current = usdcAllowanceZap ?? 0n;
      if (current < usdcAmount) {
        await approveUsdcAsync(zap, usdcAmount);
      }
    }
    await zapInWithUsdcAsync(usdcAmount, minSharesOut);
  }

  const refetch = () => {
    refetchTotalAssets();
    refetchTotalSupply();
    refetchShareBalance();
    refetchEthBalance();
    refetchUsdcBalance();
    refetchAllowanceVault();
    refetchAllowanceZap();
    refetchShareAllowanceZap();
  };

  // Share price in USD: total vault value (ETH*price + USDC) / total supply. Uses position amounts + idle so 1 share = $X.
  const tickLowerNum = tickLower != null ? Number(tickLower) : null;
  const tickUpperNum = tickUpper != null ? Number(tickUpper) : null;
  const [positionEth, positionUsdc] =
    positionLiquidity != null &&
    sqrtPriceX96 != null &&
    sqrtPriceX96 > 0n &&
    tickLowerNum != null &&
    tickUpperNum != null &&
    tickLowerNum < tickUpperNum
      ? getAmountsForLiquidity(sqrtPriceX96, tickLowerNum, tickUpperNum, positionLiquidity)
      : [0n, 0n];
  const totalEth = (idle0 ?? 0n) + positionEth;
  const totalUsdc = (idle1 ?? 0n) + positionUsdc;
  const totalValueUSD =
    poolPriceNum != null && poolPriceNum > 0 && totalSupply != null && totalSupply > 0n
      ? Number(totalEth) / 1e18 * poolPriceNum + Number(totalUsdc) / 1e6
      : 0;
  const sharePrice =
    totalSupply != null && totalSupply > 0n && totalValueUSD > 0
      ? totalValueUSD / (Number(totalSupply) / 1e18)
      : 0;

  return {
    vault,
    zap,
    usdc,
    poolKey: poolKeyData ?? undefined,
    totalAssets: totalAssets ?? 0n,
    totalSupply: totalSupply ?? 0n,
    shareBalance: shareBalance ?? 0n,
    isWhitelisted: isWhitelisted ?? false,
    idle0: idle0 ?? 0n,
    idle1: idle1 ?? 0n,
    managementFeeBps: managementFeeBps ?? 0n,
    performanceFeeBps: performanceFeeBps ?? 0n,
    vaultOwner: vaultOwner ?? undefined,
    tickLower: tickLower ?? 0,
    tickUpper: tickUpper ?? 0,
    totalStrategyValue: totalStrategyValue ?? 0n,
    poolFee:
      poolKeyData != null
        ? Number("fee" in poolKeyData ? (poolKeyData as { fee: number | bigint }).fee : (poolKeyData as unknown as unknown[])[2])
        : undefined,
    ethBalance,
    usdcBalance: usdcBalance ?? 0n,
    sharePrice,
    positionEth,
    positionUsdc,
    totalValueUSD,
    depositAsync,
    depositWithApproval,
    redeem,
    zapInAsync,
    zapInWithApproval,
    zapInWithEthAsync,
    zapInWithUsdcAsync,
    zapInWithUsdcWithApproval,
    zapOut,
    shareAllowanceZap: shareAllowanceZap ?? 0n,
    approveVaultSharesAsync,
    compoundAsync,
    refetch,
    isVaultReady: !!vault,
    isZapReady: !!zap,
    vaultWriteStatus,
    zapWriteStatus,
    approveStatus,
  };
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  try {
    return formatUnits(amount, decimals);
  } catch {
    return "0";
  }
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  if (!amount || amount === ".") return 0n;
  try {
    return parseUnits(amount, decimals);
  } catch {
    return 0n;
  }
}

export { ETH_DECIMALS, USDC_DECIMALS };
