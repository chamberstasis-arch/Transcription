import type {
  ApiConfig,
  AuthStatus,
  CleanupResponse,
  Job,
  LocalFile,
  ServerFile,
  StreamProgress,
  StreamSegment,
  StreamState,
} from "./types";

interface StreamHandlers {
  onState: (state: StreamState) => void;
  onSegment: (segment: StreamSegment) => void;
  onProgress: (progress: StreamProgress) => void;
  onDone: () => void;
  onFailed?: (message: string) => void;
  onCancelled?: () => void;
  onError?: () => void;
}

// El front se sirve same-origin (backend en producción, proxy de Vite en dev),
// así que todas las rutas son relativas y la cookie de sesión viaja sola.

interface UploadOptions {
  persistInput: boolean;
  onProgress: (progress: number) => void;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", ...options });
  } catch {
    throw new ApiError("No se pudo conectar con la API.", 0);
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : {};

  if (!response.ok) {
    const detail = (payload as { detail?: string }).detail ?? `Error HTTP ${response.status}`;
    throw new ApiError(
      response.status === 401 ? "Sesión no válida o expirada." : detail,
      response.status,
    );
  }

  return payload as T;
}

export const api = {
  authStatus: () => requestJson<AuthStatus>("/api/auth/status"),

  login: (apiKey: string) =>
    requestJson<{ ok: boolean; authenticated: boolean }>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    }),

  logout: () => requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  config: () => requestJson<ApiConfig>("/api/config"),

  jobs: () => requestJson<Job[]>("/api/jobs"),

  job: (jobId: string) => requestJson<Job>(`/api/jobs/${jobId}`),

  cancelJob: (jobId: string) =>
    requestJson<{ cancel_requested: boolean }>(`/api/jobs/${jobId}/cancel`, { method: "POST" }),

  localFiles: () => requestJson<LocalFile[]>("/api/local-files"),

  createLocalJob: (path: string) =>
    requestJson<Job>("/api/jobs/from-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }),

  deleteLocalFile: (path: string) =>
    requestJson<CleanupResponse>("/api/local-files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }),

  deleteJob: (jobId: string, options: { deleteInput: boolean; deleteOutput: boolean; deleteTemp: boolean }) => {
    const params = new URLSearchParams({
      delete_input: String(options.deleteInput),
      delete_output: String(options.deleteOutput),
      delete_temp: String(options.deleteTemp),
    });

    return requestJson<CleanupResponse>(`/api/jobs/${jobId}?${params.toString()}`, {
      method: "DELETE",
    });
  },

  cleanupJobs: (options: { statuses?: string[]; deleteInput: boolean; deleteOutput: boolean; deleteTemp: boolean }) =>
    requestJson<CleanupResponse>("/api/jobs/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statuses: options.statuses,
        delete_input: options.deleteInput,
        delete_output: options.deleteOutput,
        delete_temp: options.deleteTemp,
      }),
    }),

  cleanupTemp: () =>
    requestJson<CleanupResponse>("/api/temp/cleanup", {
      method: "POST",
    }),

  files: () => requestJson<ServerFile[]>("/api/files"),

  fileContentUrl: (source: string, ref: string, disposition: "inline" | "attachment") =>
    `/api/files/content?source=${encodeURIComponent(source)}&ref=${encodeURIComponent(ref)}&disposition=${disposition}`,

  deleteFile: (source: string, ref: string) =>
    requestJson<{ deleted: boolean }>(
      `/api/files?source=${encodeURIComponent(source)}&ref=${encodeURIComponent(ref)}`,
      { method: "DELETE" },
    ),

  // Descarga same-origin: la cookie de sesión viaja con el <a href>.
  resultUrl: (jobId: string, kind: "txt" | "srt" | "segments") => `/api/jobs/${jobId}/result/${kind}`,

  // Stream SSE en vivo del job. EventSource envía la cookie same-origin solo.
  streamJob(jobId: string, handlers: StreamHandlers): EventSource {
    const source = new EventSource(`/api/jobs/${jobId}/stream`);
    const parse = <T>(event: Event) => JSON.parse((event as MessageEvent).data) as T;

    source.addEventListener("state", (event) => handlers.onState(parse<StreamState>(event)));
    source.addEventListener("segment", (event) => handlers.onSegment(parse<StreamSegment>(event)));
    source.addEventListener("progress", (event) => handlers.onProgress(parse<StreamProgress>(event)));
    source.addEventListener("done", () => {
      handlers.onDone();
      source.close();
    });
    source.addEventListener("failed", (event) => {
      handlers.onFailed?.(parse<{ message?: string }>(event).message ?? "");
      source.close();
    });
    source.addEventListener("cancelled", () => {
      handlers.onCancelled?.();
      source.close();
    });
    source.onerror = () => handlers.onError?.();

    return source;
  },

  uploadFile: (file: File, options: UploadOptions) =>
    new Promise<Job>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      form.append("persist_input", String(options.persistInput));

      const request = new XMLHttpRequest();
      request.open("POST", "/api/upload");

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          options.onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      request.onload = () => {
        const payload = request.responseText ? safeJson(request.responseText) : {};
        if (request.status >= 200 && request.status < 300) {
          resolve(payload as Job);
        } else if (request.status === 401) {
          reject(new ApiError("Sesión no válida o expirada.", 401));
        } else {
          reject(new ApiError((payload as { detail?: string }).detail ?? `Error HTTP ${request.status}`, request.status));
        }
      };

      request.onerror = () => reject(new ApiError("No se pudo conectar con la API.", 0));
      request.send(form);
    }),
};
