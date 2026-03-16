import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Droplets, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useConnect, useDisconnect, useChainId, usePublicClient } from "wagmi";
import { isAddressEqual, getAddress } from "viem";
import { WalletSelectModal } from "@/components/WalletSelectModal";
import { getContractAddresses } from "@/lib/contracts";
import { vaultAbi } from "@/lib/abis/vault";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/vault", label: "Vault" },
  { to: "/admin", label: "Admin", ownerOnly: true },
];

const Navbar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { vault } = getContractAddresses(chainId);
  const [ownerAddress, setOwnerAddress] = useState<`0x${string}` | null>(null);
  const publicClient = usePublicClient({ chainId });

  useEffect(() => {
    if (!vault || !publicClient) {
      setOwnerAddress(null);
      return;
    }
    let cancelled = false;
    (publicClient as { readContract: (p: { address: typeof vault; abi: typeof vaultAbi; functionName: "owner" }) => Promise<unknown> })
      .readContract({ address: vault, abi: vaultAbi, functionName: "owner" })
      .then((result) => {
        if (cancelled) return;
        const raw = typeof result === "string" ? result : String(result);
        const hex = raw.startsWith("0x") ? raw : `0x${raw.padStart(40, "0")}`;
        if (hex.length === 42) setOwnerAddress(getAddress(hex) as `0x${string}`);
        else setOwnerAddress(null);
      })
      .catch(() => { if (!cancelled) setOwnerAddress(null); });
    return () => { cancelled = true; };
  }, [vault, publicClient]);

  const isVaultOwner = Boolean(
    isConnected && address && vault && ownerAddress != null &&
    (() => { try { return isAddressEqual(address, ownerAddress); } catch { return false; } })()
  );
  const visibleNavLinks = navLinks.filter((l) => !l.ownerOnly || isVaultOwner);
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  const handleConnectClick = () => {
    if (isConnected) disconnect();
    else setWalletModalOpen(true);
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-border/40">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 font-heading font-bold text-lg">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-primary" />
            </div>
            <span className="text-gradient-primary tracking-tight">AquaVault</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {visibleNavLinks.map((link) => (
              <Link key={link.to} to={link.to}>
                <Button variant={location.pathname === link.to ? "glow-outline" : "ghost"} size="sm">
                  {link.label}
                </Button>
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="glow" size="sm" onClick={handleConnectClick} disabled={isPending}>
              {isPending ? "Connecting..." : isConnected ? shortAddress : "Connect Wallet"}
            </Button>
          </div>

          <button className="md:hidden text-foreground" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden glass-strong border-t border-border overflow-hidden"
            >
              <div className="container py-4 flex flex-col gap-2">
                {visibleNavLinks.map((link) => (
                  <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}>
                    <Button variant={location.pathname === link.to ? "glow-outline" : "ghost"} className="w-full justify-start">
                      {link.label}
                    </Button>
                  </Link>
                ))}
                <Button variant="glow" className="mt-2" onClick={() => { handleConnectClick(); setMobileOpen(false); }} disabled={isPending}>
                  {isPending ? "Connecting..." : isConnected ? shortAddress : "Connect Wallet"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <WalletSelectModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />
    </>
  );
};

export default Navbar;
