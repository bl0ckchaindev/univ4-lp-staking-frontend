import type { ReactNode } from "react";

const WALLET_ICONS: Record<string, string> = {
  metamask: "/wallets/metamask.png",
  coinbase: "/wallets/coinbase.svg",
  phantom: "/wallets/phantom.png",
  trust: "/wallets/trust.png",
  walletconnect: "/wallets/walletconnect.svg",
};

function getWalletIconPath(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("metamask")) return WALLET_ICONS.metamask;
  if (n.includes("walletconnect")) return WALLET_ICONS.walletconnect;
  if (n.includes("coinbase")) return WALLET_ICONS.coinbase;
  if (n.includes("phantom")) return WALLET_ICONS.phantom;
  if (n.includes("trust")) return WALLET_ICONS.trust;
  return null;
}

export function getWalletIcon(name: string, className?: string): ReactNode {
  const src = getWalletIconPath(name);
  if (src) return <img src={src} alt="" className={className} />;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
    </svg>
  );
}
