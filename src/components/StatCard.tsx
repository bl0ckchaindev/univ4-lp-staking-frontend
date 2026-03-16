import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
}

const StatCard = ({ icon: Icon, label, value, change, positive }: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="glass rounded-xl p-5 group hover:glow-primary transition-shadow duration-500 card-hover border border-border/50"
  >
    <div className="flex items-center gap-3 mb-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
    <div className="font-heading font-bold text-2xl tracking-tight">{value}</div>
    {change && (
      <span className={`text-xs font-mono mt-1 inline-block ${positive ? "text-primary" : "text-destructive"}`}>
        {change}
      </span>
    )}
  </motion.div>
);

export default StatCard;
