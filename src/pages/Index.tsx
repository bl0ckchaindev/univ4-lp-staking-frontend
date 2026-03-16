import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/StatCard";
import {
  Droplets, Shield, Zap, TrendingUp, Lock, ArrowRight,
  RefreshCw, Layers, DollarSign, CheckCircle2
} from "lucide-react";
import { Link } from "react-router-dom";
import { useVaultStats } from "@/hooks/useVaultStats";

const features = [
  { icon: Shield, title: "MEV Protected", desc: "Your trades are shielded from front-running and sandwich attacks through Uniswap v4 hooks." },
  { icon: RefreshCw, title: "Auto-Compounding", desc: "Your earned fees are continuously reinvested — no manual claiming needed." },
  { icon: Zap, title: "One-Click Zap", desc: "Deposit a single token. We handle the swap and balancing for you automatically." },
  { icon: Lock, title: "Institutional Grade", desc: "Audited smart contracts with whitelisted access for verified participants." },
  { icon: Layers, title: "ERC-4626 Standard", desc: "Fully composable vault shares. Transparent pricing, no surprises." },
  { icon: TrendingUp, title: "Optimized Yield", desc: "Active position management to capture maximum trading fees around the current price." },
];

const Index = () => {
  const { tvlFormatted, sharePrice, totalSupplyFormatted, totalSupply, hasVault } = useVaultStats();
  const stats = [
    { icon: DollarSign, label: "Total Value Locked", value: hasVault ? tvlFormatted : "—", change: "Vault assets (18d)", positive: true },
    { icon: TrendingUp, label: "Share Price", value: sharePrice > 0 ? `$${sharePrice.toFixed(4)}` : "—", change: totalSupply > 0n ? "Live" : "—", positive: true },
    { icon: Layers, label: "Total Shares", value: hasVault && totalSupply > 0n ? totalSupplyFormatted : "—", change: "Outstanding", positive: true },
    { icon: Droplets, label: "Pool", value: "ETH/USDC", change: "Uniswap v4", positive: true },
  ];

  return (
    <div className="min-h-screen">
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute top-1/3 -left-40 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[160px]" />
        <div className="absolute bottom-1/3 -right-40 w-[400px] h-[400px] rounded-full bg-accent/6 blur-[140px]" />

        <div className="container relative z-10 pt-24">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-mono text-primary mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Live on Base · Uniswap v4
              </div>

              <h1 className="font-heading text-5xl md:text-7xl font-bold leading-[1.1] mb-6 tracking-tight">
                Earn yield on
                <br />
                <span className="text-gradient-glow">WETH & USDC</span>
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
                Provide liquidity to the highest-performing pool on Base.
                Auto-compounding, MEV-protected, and built on Uniswap v4.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/vault">
                  <Button variant="glow" size="lg" className="text-base px-8 h-12 rounded-xl font-semibold">
                    Start Earning <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button variant="glass" size="lg" className="text-base px-8 h-12 rounded-xl">
                    How It Works
                  </Button>
                </a>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-20 max-w-4xl mx-auto"
          >
            {stats.map((s) => <StatCard key={s.label} {...s} />)}
          </motion.div>
        </div>
      </section>

      <section className="py-16 border-t border-border/30">
        <div className="container">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex flex-wrap justify-center gap-x-10 gap-y-4 text-sm text-muted-foreground"
          >
            {["Audited Smart Contracts", "Non-Custodial", "Transparent Fees", "Real-Time Analytics"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                {item}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="features" className="py-28">
        <div className="container">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="font-heading text-3xl md:text-5xl font-bold mb-4 tracking-tight">
              Why <span className="text-gradient-primary">AquaVault</span>
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Built for LPs who want maximum yield without the complexity.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-2xl border border-border/40 bg-card/50 p-6 group hover:border-primary/30 hover:bg-card/70 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-heading font-semibold text-base mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24">
        <div className="container max-w-4xl">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm p-8 md:p-12"
          >
            <h3 className="font-heading text-2xl md:text-3xl font-bold mb-10 text-center tracking-tight">
              Three steps to earning yield
            </h3>
            <div className="grid md:grid-cols-3 gap-8 text-center">
              {[
                { step: "01", title: "Deposit", desc: "Add WETH, USDC, or both. Use Zap for single-token entry — we balance it for you.", icon: Zap },
                { step: "02", title: "Earn Fees", desc: "Your capital works as Uniswap v4 liquidity. Fees accrue to your position automatically.", icon: Layers },
                { step: "03", title: "Withdraw Anytime", desc: "Redeem your shares for the underlying tokens whenever you want. No lockups.", icon: TrendingUp },
              ].map((item) => (
                <div key={item.step} className="flex flex-col items-center">
                  <div className="text-xs font-mono text-primary/60 mb-3">{item.step}</div>
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h4 className="font-heading font-semibold mb-2">{item.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24">
        <div className="container text-center">
          <motion.div initial={{ opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
            <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              Start earning <span className="text-gradient-glow">yield</span> today
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Connect your wallet, add liquidity, and let the vault do the rest.
            </p>
            <Link to="/vault">
              <Button variant="glow" size="lg" className="text-base px-10 h-12 rounded-xl font-semibold">
                Enter Pool <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border/30 py-8">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-heading font-semibold text-foreground">
            <Droplets className="w-4 h-4 text-primary" />
            AquaVault
          </div>
          <span className="font-mono text-xs">WETH/USDC · Uniswap v4 · Base</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
