import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileAudio,
  FileJson,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { ApiConfig, Job, LocalFile } from "./types";
import { formatBytes, formatDuration, formatTimestamp, statusClass, statusLabel } from "./utils";

type Tab = "upload" | "local";

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

const POLL_MS = 2000;

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [persistInput, setPersistInput] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const isWorking = Boolean(busyLabel);
  const selectedJobIsActive = selectedJob?.status === "uploaded" || selectedJob?.status === "processing";

  useEffect(() => {
    refreshAll().catch(showError);
  }, []);

  useEffect(() => {
    if (!selectedJobId || !selectedJobIsActive) return;

    const timer = window.setInterval(() => {
      api
        .job(selectedJobId)
        .then((job) => {
          setSelectedJob(job);
          if (job.status === "completed" || job.status === "failed") {
            setBusyLabel("");
            refreshJobs().catch(showError);
          }
        })
        .catch(showError);
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [selectedJobId, selectedJobIsActive]);

  const selectedFileError = useMemo(() => {
    if (!selectedFile || !config) return "";
    const extension = `.${selectedFile.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!config.supported_extensions.includes(extension)) {
      return `Formato no soportado: ${extension}`;
    }
    return "";
  }, [config, selectedFile]);

  async function refreshAll() {
    setError("");
    const [nextConfig, nextFiles, nextJobs] = await Promise.all([api.config(), api.localFiles(), api.jobs()]);
    setConfig(nextConfig);
    setLocalFiles(nextFiles);
    setJobs(nextJobs);

    if (!selectedJobId && nextJobs.length > 0) {
      await selectJob(nextJobs[0].job_id);
    }
  }

  async function refreshJobs() {
    const nextJobs = await api.jobs();
    setJobs(nextJobs);
    if (selectedJobId) {
      const freshJob = nextJobs.find((job) => job.job_id === selectedJobId);
      if (freshJob) setSelectedJob(freshJob);
    }
  }

  async function selectJob(jobId: string) {
    setError("");
    setSelectedJobId(jobId);
    const job = await api.job(jobId);
    setSelectedJob(job);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError("Selecciona un archivo antes de subir.");
      return;
    }
    if (selectedFileError) {
      setError(selectedFileError);
      return;
    }

    setError("");
    setBusyLabel("Enviando archivo");
    setUploadProgress(0);

    try {
      const job = await api.uploadFile(selectedFile, {
        persistInput,
        onProgress: setUploadProgress,
      });
      setBusyLabel("Procesando");
      setUploadProgress(null);
      setSelectedFile(null);
      await refreshJobs();
      await selectJob(job.job_id);
    } catch (uploadError) {
      setBusyLabel("");
      setUploadProgress(null);
      showError(uploadError);
    }
  }

  async function handleLocalProcess(path: string) {
    setError("");
    setBusyLabel("Creando job");
    try {
      const job = await api.createLocalJob(path);
      setBusyLabel("Procesando");
      await refreshJobs();
      await selectJob(job.job_id);
    } catch (localError) {
      setBusyLabel("");
      showError(localError);
    }
  }

  function confirmDeleteJob(job: Job) {
    setConfirmState({
      title: "Borrar job",
      message: `Se eliminará el historial de ${job.original_filename}, sus resultados y temporales. ${job.source === "upload" ? "También se eliminará el archivo subido." : "El archivo local se conservará."}`,
      confirmLabel: "Borrar job",
      onConfirm: async () => {
        await api.deleteJob(job.job_id, {
          deleteInput: job.source === "upload",
          deleteOutput: true,
          deleteTemp: true,
        });
        setSelectedJob(null);
        setSelectedJobId(null);
        await refreshAll();
      },
    });
  }

  function confirmCleanupHistory() {
    setConfirmState({
      title: "Limpiar historial",
      message: "Se borrarán jobs completados o fallidos, junto con resultados y temporales asociados. Los archivos locales no se borrarán.",
      confirmLabel: "Limpiar historial",
      onConfirm: async () => {
        await api.cleanupJobs({
          statuses: ["completed", "failed"],
          deleteInput: true,
          deleteOutput: true,
          deleteTemp: true,
        });
        setSelectedJob(null);
        setSelectedJobId(null);
        await refreshAll();
      },
    });
  }

  function confirmCleanupTemp() {
    setConfirmState({
      title: "Limpiar temporales",
      message: "Se eliminarán artefactos de procesamiento en data/temp. Los resultados TXT/SRT/JSON se conservarán.",
      confirmLabel: "Limpiar temporales",
      onConfirm: async () => {
        await api.cleanupTemp();
        await refreshAll();
      },
    });
  }

  function confirmDeleteLocalFile(file: LocalFile) {
    setConfirmState({
      title: "Borrar archivo local",
      message: `Se eliminará físicamente ${file.filename} de audio_test.`,
      confirmLabel: "Borrar archivo",
      onConfirm: async () => {
        await api.deleteLocalFile(file.path);
        await refreshAll();
      },
    });
  }

  function showError(value: unknown) {
    setError(value instanceof Error ? value.message : String(value));
  }

  return (
    <div className="min-h-screen px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/70 px-5 py-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">TranscripcionVideo</h1>
            <p className="mt-1 text-sm text-slate-600">
              Backend local en FastAPI · Frontend React
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={selectedJob?.status} />
            <IconButton variant="secondary" onClick={() => refreshAll().catch(showError)} icon={<RefreshCw size={16} />}>
              Actualizar
            </IconButton>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} />
            <span>{error}</span>
          </div>
        )}

        <main className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-white/70 bg-white/75 shadow-sm backdrop-blur">
            <Tabs activeTab={activeTab} onChange={setActiveTab} />
            <div className="p-4">
              {activeTab === "upload" ? (
                <UploadPanel
                  config={config}
                  file={selectedFile}
                  fileError={selectedFileError}
                  persistInput={persistInput}
                  isWorking={isWorking}
                  uploadProgress={uploadProgress}
                  busyLabel={busyLabel}
                  onFileChange={setSelectedFile}
                  onPersistChange={setPersistInput}
                  onUpload={handleUpload}
                />
              ) : (
                <LocalPanel
                  jobs={jobs}
                  localFiles={localFiles}
                  selectedJobId={selectedJobId}
                  isWorking={isWorking}
                  onProcess={handleLocalProcess}
                  onSelectJob={(jobId) => selectJob(jobId).catch(showError)}
                  onDeleteJob={confirmDeleteJob}
                  onDeleteLocalFile={confirmDeleteLocalFile}
                  onCleanupHistory={confirmCleanupHistory}
                  onCleanupTemp={confirmCleanupTemp}
                />
              )}
            </div>
          </section>

          <StatusPanel job={selectedJob} uploadProgress={uploadProgress} busyLabel={busyLabel} />
        </main>
      </div>

      {confirmState && (
        <ConfirmDialog
          state={confirmState}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            confirmState
              .onConfirm()
              .catch(showError)
              .finally(() => setConfirmState(null));
          }}
        />
      )}
    </div>
  );
}

function Tabs({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-white/70 p-3">
      <button
        className={tabClass(activeTab === "upload")}
        onClick={() => onChange("upload")}
        type="button"
      >
        <Upload size={16} />
        Subir
      </button>
      <button
        className={tabClass(activeTab === "local")}
        onClick={() => onChange("local")}
        type="button"
      >
        <FolderOpen size={16} />
        Local
      </button>
    </div>
  );
}

function UploadPanel({
  config,
  file,
  fileError,
  persistInput,
  isWorking,
  uploadProgress,
  busyLabel,
  onFileChange,
  onPersistChange,
  onUpload,
}: {
  config: ApiConfig | null;
  file: File | null;
  fileError: string;
  persistInput: boolean;
  isWorking: boolean;
  uploadProgress: number | null;
  busyLabel: string;
  onFileChange: (file: File | null) => void;
  onPersistChange: (value: boolean) => void;
  onUpload: () => void;
}) {
  const accept = config?.supported_extensions.join(",") ?? ".mp3,.ogg,.wav";

  return (
    <div className="grid gap-4">
      <label className="group grid cursor-pointer gap-3 rounded-2xl border border-dashed border-cyan-300 bg-cyan-50/60 px-4 py-5 text-center transition hover:border-cyan-500 hover:bg-cyan-50">
        <input
          className="hidden"
          type="file"
          accept={accept}
          disabled={isWorking}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm">
          <FileAudio size={21} />
        </span>
        <span className="font-semibold text-slate-900">Examinar archivo</span>
        <span className="text-sm text-slate-600">MP3, OGG o WAV</span>
      </label>

      <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
        {file ? (
          <div className="grid gap-1">
            <div className="font-medium text-slate-900">{file.name}</div>
            <div className="text-sm text-slate-600">{formatBytes(file.size)}</div>
            {fileError && <div className="text-sm text-rose-700">{fileError}</div>}
          </div>
        ) : (
          <div className="text-sm text-slate-600">Sin archivo seleccionado</div>
        )}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
        <span>
          <span className="block text-sm font-medium text-slate-900">Persistir entrada</span>
          <span className="block text-xs text-slate-600">Si se desactiva, se limpia al terminar.</span>
        </span>
        <input
          className="h-5 w-5 accent-cyan-700"
          type="checkbox"
          checked={persistInput}
          disabled={isWorking}
          onChange={(event) => onPersistChange(event.target.checked)}
        />
      </label>

      {uploadProgress !== null && (
        <ProgressBar label={busyLabel || "Subiendo"} value={uploadProgress} />
      )}

      <IconButton
        disabled={!file || Boolean(fileError) || isWorking}
        onClick={onUpload}
        icon={isWorking ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
      >
        Subir y procesar
      </IconButton>
    </div>
  );
}

function LocalPanel({
  jobs,
  localFiles,
  selectedJobId,
  isWorking,
  onProcess,
  onSelectJob,
  onDeleteJob,
  onDeleteLocalFile,
  onCleanupHistory,
  onCleanupTemp,
}: {
  jobs: Job[];
  localFiles: LocalFile[];
  selectedJobId: string | null;
  isWorking: boolean;
  onProcess: (path: string) => void;
  onSelectJob: (jobId: string) => void;
  onDeleteJob: (job: Job) => void;
  onDeleteLocalFile: (file: LocalFile) => void;
  onCleanupHistory: () => void;
  onCleanupTemp: () => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Archivos locales</h2>
          <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-1 text-xs text-slate-600">
            {localFiles.length}
          </span>
        </div>
        <div className="grid max-h-72 gap-2 overflow-auto pr-1">
          {localFiles.length === 0 ? (
            <EmptyState text="Sin archivos locales" />
          ) : (
            localFiles.map((file) => (
              <LocalFileCard
                file={file}
                isWorking={isWorking}
                key={file.path}
                onDelete={() => onDeleteLocalFile(file)}
                onProcess={() => onProcess(file.path)}
              />
            ))
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Historial</h2>
          <div className="flex gap-2">
            <IconButton variant="secondary" onClick={onCleanupTemp} icon={<Trash2 size={14} />}>
              Limpiar temporales
            </IconButton>
            <IconButton variant="danger" onClick={onCleanupHistory} icon={<Trash2 size={14} />}>
              Limpiar historial
            </IconButton>
          </div>
        </div>
        <div className="grid max-h-96 gap-2 overflow-auto pr-1">
          {jobs.length === 0 ? (
            <EmptyState text="Sin jobs" />
          ) : (
            jobs.map((job) => (
              <JobCard
                isSelected={job.job_id === selectedJobId}
                job={job}
                key={job.job_id}
                onDelete={() => onDeleteJob(job)}
                onSelect={() => onSelectJob(job.job_id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function LocalFileCard({
  file,
  isWorking,
  onDelete,
  onProcess,
}: {
  file: LocalFile;
  isWorking: boolean;
  onDelete: () => void;
  onProcess: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/70 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{file.filename}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
            <span>{file.format.toUpperCase()}</span>
            <span>{formatBytes(file.size_bytes)}</span>
            <span>{formatDuration(file.duration_seconds)}</span>
            <span>{file.estimated_chunk_count} chunk</span>
          </div>
        </div>
        <button className="text-rose-600 hover:text-rose-800" onClick={onDelete} type="button">
          <Trash2 size={16} />
        </button>
      </div>
      <IconButton className="mt-3 w-full" disabled={isWorking} onClick={onProcess} icon={<FolderOpen size={15} />}>
        Procesar local
      </IconButton>
    </div>
  );
}

function JobCard({
  job,
  isSelected,
  onDelete,
  onSelect,
}: {
  job: Job;
  isSelected: boolean;
  onDelete: () => void;
  onSelect: () => void;
}) {
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${isSelected ? "border-cyan-300 bg-cyan-50/70" : "border-white/70 bg-white/70"}`}>
      <button className="w-full text-left" onClick={onSelect} type="button">
        <div className="truncate font-medium text-slate-900">{job.original_filename}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full border px-2 py-0.5 ${statusClass(job.status)}`}>{statusLabel(job.status)}</span>
          <span className="text-slate-600">{job.progress}%</span>
          <span className="text-slate-600">{job.source}</span>
        </div>
      </button>
      <button className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800" onClick={onDelete} type="button">
        <Trash2 size={13} />
        Borrar
      </button>
    </div>
  );
}

function StatusPanel({ job, uploadProgress, busyLabel }: { job: Job | null; uploadProgress: number | null; busyLabel: string }) {
  const result = job?.result;
  const metadata = job?.metadata;
  const segments = result?.segments ?? [];
  const progress = uploadProgress ?? job?.progress ?? 0;

  return (
    <section className="rounded-2xl border border-white/70 bg-white/75 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Estado del proceso</h2>
          <p className="mt-1 text-sm text-slate-600">{job?.message ?? busyLabel ?? "Sin job activo"}</p>
        </div>
        <StatusPill status={job?.status} />
      </div>

      <div className="mt-5">
        <ProgressBar label={busyLabel || job?.stage || "idle"} value={progress} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Archivo" value={job?.original_filename ?? "-"} />
        <Metric label="Origen" value={job?.source ?? "-"} />
        <Metric label="Persistencia" value={metadata?.input_persisted === false ? "Temporal" : "Persistente"} />
        <Metric label="Formato" value={result?.source_format ?? metadata?.format ?? "-"} />
        <Metric label="Tamaño" value={formatBytes(metadata?.size_bytes)} />
        <Metric label="Duración" value={formatDuration(result?.duration_seconds ?? metadata?.duration_seconds)} />
        <Metric label="Chunks" value={String(result?.chunk_count ?? metadata?.estimated_chunk_count ?? "-")} />
        <Metric label="Segmentos" value={String(result?.segment_count ?? segments.length ?? "-")} />
      </div>

      {job?.error && (
        <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {job.error}
        </div>
      )}

      <ResultActions job={job} />

      <div className="mt-5 grid gap-4">
        <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileText size={16} />
            Transcripción
          </div>
          <div className="max-h-60 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {segments.length > 0 ? segments.map((segment) => segment.text).join("\n") : "Sin texto"}
          </div>
        </div>
        <SegmentsTable segments={segments} />
      </div>
    </section>
  );
}

function ResultActions({ job }: { job: Job | null }) {
  if (job?.status !== "completed") {
    return null;
  }

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <DownloadLink href={api.resultUrl(job.job_id, "txt")} icon={<FileText size={16} />}>
        Descargar TXT
      </DownloadLink>
      <DownloadLink href={api.resultUrl(job.job_id, "srt")} icon={<Download size={16} />}>
        Descargar SRT
      </DownloadLink>
      <DownloadLink href={api.resultUrl(job.job_id, "segments")} icon={<FileJson size={16} />}>
        Descargar segmentos JSON
      </DownloadLink>
    </div>
  );
}

function SegmentsTable({ segments }: { segments: NonNullable<Job["result"]>["segments"] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/70">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
        Segmentos
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="sticky top-0 bg-white text-xs text-slate-500">
            <tr>
              <th className="w-28 px-4 py-3 font-semibold">Inicio</th>
              <th className="w-28 px-4 py-3 font-semibold">Fin</th>
              <th className="px-4 py-3 font-semibold">Texto</th>
            </tr>
          </thead>
          <tbody>
            {segments && segments.length > 0 ? (
              segments.map((segment, index) => (
                <tr className="border-t border-slate-100" key={`${segment.start}-${index}`}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{formatTimestamp(segment.start)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{formatTimestamp(segment.end)}</td>
                  <td className="px-4 py-3 text-slate-700">{segment.text}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-5 text-slate-500" colSpan={3}>
                  Sin segmentos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfirmDialog({ state, onCancel, onConfirm }: { state: ConfirmState; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{state.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
          </div>
          <button className="text-slate-500 hover:text-slate-900" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <IconButton variant="secondary" onClick={onCancel} icon={<X size={15} />}>
            Cancelar
          </IconButton>
          <IconButton variant="danger" onClick={onConfirm} icon={<Trash2 size={15} />}>
            {state.confirmLabel}
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  const boundedValue = Math.max(0, Math.min(100, value));
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
        <span>{label}</span>
        <span>{boundedValue}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-cyan-600 transition-all" style={{ width: `${boundedValue}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status?: Job["status"] }) {
  const icon = status === "completed" ? <CheckCircle2 size={14} /> : status === "processing" ? <Loader2 className="animate-spin" size={14} /> : null;
  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(status)}`}>
      {icon}
      {statusLabel(status)}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/70 bg-white/70 p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function DownloadLink({ children, href, icon }: { children: string; href: string; icon: ReactNode }) {
  return (
    <a
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-cyan-800 shadow-sm transition hover:border-cyan-400 hover:bg-cyan-50"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {icon}
      {children}
    </a>
  );
}

function IconButton({
  children,
  className = "",
  disabled = false,
  icon,
  onClick,
  variant = "primary",
}: {
  children: string;
  className?: string;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
}) {
  const variants = {
    primary: "border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-800",
    secondary: "border-slate-200 bg-white/80 text-slate-700 hover:border-cyan-300 hover:text-cyan-800",
    danger: "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100",
  };

  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function tabClass(active: boolean) {
  return `inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
    active ? "bg-cyan-700 text-white shadow-sm" : "bg-white/70 text-slate-600 hover:bg-cyan-50 hover:text-cyan-800"
  }`;
}
