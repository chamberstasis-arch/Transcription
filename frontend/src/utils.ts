import type { JobStatus } from "./types";

export function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return "-";

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(value?: number | null): string {
  if (value === undefined || value === null) return "-";

  const total = Math.max(0, Math.floor(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatTimestamp(value?: number | null): string {
  const total = Math.max(0, Number(value) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const milliseconds = Math.round((total - Math.floor(total)) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(status?: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    uploaded: "En cola",
    processing: "Procesando",
    completed: "Completado",
    failed: "Falló",
    cancelled: "Cancelado",
  };

  return status ? labels[status] : "Idle";
}

/**
 * Status pill modifier. Lime is the live-state cursor: reserved for the active
 * job (processing) and the "applied" confirmation (completed). Everything else
 * stays neutral, and failures take danger rose.
 */
export function statusClass(status?: JobStatus): string {
  if (status === "processing") return "pill--live";
  if (status === "completed") return "pill--done";
  if (status === "failed") return "pill--fail";
  return "";
}
