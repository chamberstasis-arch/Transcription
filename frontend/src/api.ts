import type { ApiConfig, CleanupResponse, Job, LocalFile } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface UploadOptions {
  persistInput: boolean;
  onProgress: (progress: number) => void;
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.detail ?? `Error HTTP ${response.status}`);
  }

  return payload as T;
}

export const api = {
  config: () => requestJson<ApiConfig>("/api/config"),

  jobs: () => requestJson<Job[]>("/api/jobs"),

  job: (jobId: string) => requestJson<Job>(`/api/jobs/${jobId}`),

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

  resultUrl: (jobId: string, kind: "txt" | "srt" | "segments") => `${API_URL}/api/jobs/${jobId}/result/${kind}`,

  uploadFile: (file: File, options: UploadOptions) =>
    new Promise<Job>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      form.append("persist_input", String(options.persistInput));

      const request = new XMLHttpRequest();
      request.open("POST", `${API_URL}/api/upload`);

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          options.onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      request.onload = () => {
        const payload = request.responseText ? JSON.parse(request.responseText) : {};
        if (request.status >= 200 && request.status < 300) {
          resolve(payload as Job);
        } else {
          reject(new Error(payload.detail ?? `Error HTTP ${request.status}`));
        }
      };

      request.onerror = () => reject(new Error("No se pudo conectar con el backend"));
      request.send(form);
    }),
};
