export function nodeStatusChipClass(status: string): string {
  if (status === "completed") {
    return "border-success/50 bg-success/10 text-success";
  }
  if (status === "warning") {
    return "border-warning/50 bg-warning/10 text-warning";
  }
  if (status === "failed") {
    return "border-danger/50 bg-danger/10 text-danger";
  }
  if (status === "running") {
    return "border-accent/50 bg-accent/10 text-accent";
  }
  return "border-border bg-background/70 text-muted";
}

export function selectedGraphNodeCardClass(selected: boolean): string {
  return selected
    ? "w-[210px] border-accent/70 bg-accent/10 shadow-sm shadow-accent/10"
    : "w-[210px] border-border bg-surface/90";
}
