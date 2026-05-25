/** Opaque ProPresenter API payloads — shape documented via probe samples. */
export type PpJson = Record<string, unknown>;

export type PpProbeStep = {
  name: string;
  ok: boolean;
  method: string;
  path: string;
  status?: number;
  summary?: string;
  /** Truncated response sample for spike documentation. */
  sample?: unknown;
  notes?: string;
};

export type PpProbeReport = {
  connected: boolean;
  baseUrl: string;
  allowWrites: boolean;
  error?: string;
  steps: PpProbeStep[];
  /** Keys found on a sample presentation payload (arrangement / cue discovery). */
  presentationShape?: string[];
};
