const LABELS: Record<string, string> = {
  pending: "Pending — waiting for rig",
  claimed: "Claimed — ready on rig",
  applying: "Applying in ProPresenter",
  completed: "Completed",
  failed: "Failed",
};

export function formatBuildStatus(status: string): string {
  return LABELS[status] ?? status;
}

export function buildStatusTone(status: string): "neutral" | "active" | "ok" | "error" {
  if (status === "completed") return "ok";
  if (status === "failed") return "error";
  if (status === "pending") return "neutral";
  return "active";
}
