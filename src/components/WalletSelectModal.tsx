import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConnect } from "wagmi";
import { getWalletIcon } from "@/components/WalletIcon";
import { Wallet } from "lucide-react";
import type { Connector } from "wagmi";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function WalletSelectModal({ open, onOpenChange }: Props) {
  const { connect, connectors, isPending, error } = useConnect({
    mutation: { onSuccess: () => onOpenChange(false) },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Connect Wallet
          </DialogTitle>
          <DialogDescription>
            Choose a wallet to connect. Your wallet may need to be on the correct network (e.g. Base).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              onClick={() => connect({ connector: c })}
              disabled={isPending}
              className="flex items-center gap-4 w-full rounded-xl border border-border/60 bg-card/50 hover:bg-muted/50 hover:border-primary/30 p-4 text-left transition-colors disabled:opacity-50 [&_img]:h-6 [&_img]:w-6"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/80 overflow-hidden [&_img]:object-contain">
                {getWalletIcon(c.name, "h-6 w-6")}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{c.name}</span>
                {c.type !== "injected" && (
                  <span className="text-xs text-muted-foreground capitalize">{c.type}</span>
                )}
              </div>
              {isPending && <span className="text-xs text-muted-foreground animate-pulse">Connecting...</span>}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{error.message}</p>
        )}

        <p className="text-xs text-muted-foreground">
          MetaMask, Phantom, Coinbase Wallet, and WalletConnect are supported.
        </p>
      </DialogContent>
    </Dialog>
  );
}
