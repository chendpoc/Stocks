import { AlertTriangle, Loader2, RefreshCcw, ShieldAlert } from "lucide-react";

type StateBlockProps = {
  title: string;
  description: string;
  state?: "empty" | "loading" | "error" | "reconnecting" | "permission";
  actionLabel?: string;
  onAction?: () => void;
};

const icons = {
  empty: RefreshCcw,
  loading: Loader2,
  error: AlertTriangle,
  reconnecting: RefreshCcw,
  permission: ShieldAlert,
};

export function StateBlock({
  title,
  description,
  state = "empty",
  actionLabel,
  onAction,
}: StateBlockProps) {
  const Icon = icons[state];

  return (
    <section className="rounded-md border border-border bg-surface/80 p-4 text-sm">
      <div className="flex items-start gap-3">
        <Icon className={state === "loading" ? "mt-0.5 h-4 w-4 animate-spin text-accent" : "mt-0.5 h-4 w-4 text-warning"} />
        <div className="min-w-0">
          <h3 className="font-medium text-foreground">{title}</h3>
          <p className="mt-1 leading-5 text-muted">{description}</p>
          {actionLabel ? (
            <button
              type="button"
              onClick={onAction}
              className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
