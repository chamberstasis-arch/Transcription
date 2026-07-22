import {
  AlertTriangle,
  AudioLines,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileAudio,
  FileJson,
  FileText,
  Film,
  FolderOpen,
  HardDrive,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Music,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "./api";
import type { ApiConfig, Job, LocalFile, ServerFile, StreamSegment } from "./types";
import { formatBytes, formatDate, formatDuration, formatTimestamp, statusClass, statusLabel } from "./utils";

type Tab = "upload" | "local";
type AppView = "transcribe" | "files";

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "accent";
  onConfirm: () => Promise<void>;
}

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

  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [booted, setBooted] = useState(false);
  const [liveSegments, setLiveSegments] = useState<StreamSegment[]>([]);

  const [appView, setAppView] = useState<AppView>(() => (window.location.hash === "#archivos" ? "files" : "transcribe"));
  const [files, setFiles] = useState<ServerFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<ServerFile | null>(null);

  const isWorking = Boolean(busyLabel);
  const selectedJobIsActive = selectedJob?.status === "uploaded" || selectedJob?.status === "processing";

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedJobId || !selectedJobIsActive) return;
    const jobId = selectedJobId;

    const patchJob = (changes: Partial<Job>) =>
      setSelectedJob((prev) => (prev && prev.job_id === jobId ? { ...prev, ...changes } : prev));

    const source = api.streamJob(jobId, {
      onState: (state) => {
        setLiveSegments(state.segments ?? []);
        patchJob({ status: state.status, progress: state.progress, stage: state.stage, message: state.message });
      },
      onSegment: (segment) => {
        setLiveSegments((prev) =>
          prev.some((s) => s.index === segment.index)
            ? prev
            : [...prev, segment].sort((a, b) => a.index - b.index),
        );
      },
      onProgress: (progress) => {
        patchJob({ progress: progress.progress, stage: progress.stage, message: progress.message });
      },
      onDone: () => {
        setBusyLabel("");
        refreshJobs().catch(showError);
        api
          .job(jobId)
          .then((job) => {
            setSelectedJob(job);
            setLiveSegments([]);
          })
          .catch(showError);
      },
      onFailed: () => {
        setBusyLabel("");
        refreshJobs().catch(showError);
        api.job(jobId).then(setSelectedJob).catch(showError);
      },
      onCancelled: () => {
        setBusyLabel("");
        refreshJobs().catch(showError);
        api.job(jobId).then(setSelectedJob).catch(showError);
      },
    });

    return () => source.close();
  }, [selectedJobId, selectedJobIsActive]);

  useEffect(() => {
    if (appView === "files" && (!authRequired || authenticated)) {
      loadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appView, authenticated, authRequired]);

  const selectedFileError = useMemo(() => {
    if (!selectedFile || !config) return "";
    const extension = `.${selectedFile.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!config.supported_extensions.includes(extension)) {
      return `Formato no soportado: ${extension}`;
    }
    return "";
  }, [config, selectedFile]);

  async function bootstrap() {
    try {
      const status = await api.authStatus();
      setAuthRequired(status.auth_required);
      setAuthenticated(status.authenticated);
      setBooted(true);
      if (status.auth_required && !status.authenticated) {
        setShowLogin(true);
        return;
      }
      await refreshAll();
    } catch (bootError) {
      setBooted(true);
      showError(bootError);
    }
  }

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

  function goView(view: AppView) {
    setAppView(view);
    window.location.hash = view === "files" ? "archivos" : "";
  }

  async function loadFiles() {
    setFilesLoading(true);
    try {
      setFiles(await api.files());
    } catch (filesError) {
      showError(filesError);
    } finally {
      setFilesLoading(false);
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
    setLiveSegments([]);
    setSelectedJobId(jobId);
    const job = await api.job(jobId);
    setSelectedJob(job);
  }

  async function handleLogin(apiKey: string) {
    await api.login(apiKey);
    setAuthenticated(true);
    setShowLogin(false);
    setError("");
    await refreshAll();
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // aunque falle, limpiamos el estado local
    }
    setAuthenticated(false);
    setConfig(null);
    setJobs([]);
    setLocalFiles([]);
    setSelectedJob(null);
    setSelectedJobId(null);
    if (authRequired) setShowLogin(true);
  }

  // Si ya hay un resultado concluido en pantalla, confirma antes de iniciar otro
  // (la vista se reemplaza; el resultado anterior no se borra, queda en el historial).
  function requestImport(start: () => void) {
    if (selectedJob?.status === "completed") {
      setConfirmState({
        title: "Nueva transcripción",
        message: `Se reemplazará la vista actual por el nuevo proceso. El resultado de "${selectedJob.original_filename}" no se borra: seguirá disponible en la pestaña Local → Historial.`,
        confirmLabel: "Continuar",
        tone: "accent",
        onConfirm: async () => start(),
      });
    } else {
      start();
    }
  }

  function handleUpload() {
    if (!selectedFile) {
      setError("Selecciona un archivo antes de subir.");
      return;
    }
    if (selectedFileError) {
      setError(selectedFileError);
      return;
    }
    requestImport(() => {
      runUpload().catch(showError);
    });
  }

  async function runUpload() {
    if (!selectedFile) return;
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

  function handleLocalProcess(path: string) {
    requestImport(() => {
      runLocalProcess(path).catch(showError);
    });
  }

  async function runLocalProcess(path: string) {
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

  async function handleCancel() {
    if (!selectedJobId) return;
    try {
      await api.cancelJob(selectedJobId);
      setSelectedJob((prev) => (prev ? { ...prev, message: "Cancelando…" } : prev));
    } catch (cancelError) {
      showError(cancelError);
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

  function confirmDeleteFile(file: ServerFile) {
    setConfirmState({
      title: "Eliminar archivo",
      message: `Se eliminará físicamente ${file.name} del servidor. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      onConfirm: async () => {
        await api.deleteFile(file.source, file.ref);
        await loadFiles();
      },
    });
  }

  function showError(value: unknown) {
    if (value instanceof ApiError && value.status === 401) {
      setAuthenticated(false);
      setAuthRequired(true);
      setShowLogin(true);
      setError("");
      return;
    }
    setError(value instanceof Error ? value.message : String(value));
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="app-header">
        <div className="mx-auto flex w-full max-w-[1440px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <span className="brandmark">
              <AudioLines size={20} strokeWidth={2.4} />
            </span>
            <div>
              <h1 className="t-display text-ink">Transcriptor</h1>
              <p className="t-mono mt-0.5 text-muted">TRANSCRIPCIÓN LOCAL · FASTER-WHISPER</p>
            </div>
          </div>

          <nav className="flex shrink-0 items-center gap-1.5">
            <NavItem active={appView === "transcribe"} onClick={() => goView("transcribe")} icon={<AudioLines size={15} />}>
              Transcriptor
            </NavItem>
            <NavItem active={appView === "files"} onClick={() => goView("files")} icon={<HardDrive size={15} />}>
              Archivos
            </NavItem>
          </nav>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
            {appView === "transcribe" && <StatusPill status={selectedJob?.status} />}
            {authRequired &&
              (authenticated ? (
                <button className="btn" onClick={() => handleLogout().catch(showError)} type="button">
                  <LogOut size={15} />
                  Cerrar sesión
                </button>
              ) : (
                <button className="btn" onClick={() => setShowLogin(true)} type="button">
                  <LogIn size={15} />
                  Iniciar sesión
                </button>
              ))}
            <button
              className="btn"
              onClick={() => (appView === "files" ? loadFiles() : refreshAll().catch(showError))}
              type="button"
              disabled={authRequired && !authenticated}
            >
              <RefreshCw size={15} />
              Actualizar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] grow px-4 py-5 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-[12px] border border-danger-dim bg-[rgba(251,113,133,0.07)] px-4 py-3 text-[13px] text-danger">
            <AlertTriangle className="mt-0.5 shrink-0" size={16} />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {appView === "transcribe" ? (
          <div className="grid gap-[18px] lg:grid-cols-[400px_minmax(0,1fr)]">
          <section className="card flex flex-col self-start overflow-hidden">
            <div className="tabbar pt-2">
              <TabButton active={activeTab === "upload"} onClick={() => setActiveTab("upload")} icon={<Upload size={14} />}>
                Subir
              </TabButton>
              <TabButton active={activeTab === "local"} onClick={() => setActiveTab("local")} icon={<FolderOpen size={14} />}>
                Local
              </TabButton>
            </div>
            <div className="p-3.5">
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

          <StatusPanel
            job={selectedJob}
            uploadProgress={uploadProgress}
            busyLabel={busyLabel}
            liveSegments={liveSegments}
            onCancel={handleCancel}
          />
          </div>
        ) : (
          <FileManager
            files={files}
            loading={filesLoading}
            onRefresh={() => loadFiles()}
            onPreview={setPreviewFile}
            onDelete={confirmDeleteFile}
          />
        )}
      </main>

      {showLogin && <LoginDialog onSubmit={handleLogin} canClose={authenticated} onClose={() => setShowLogin(false)} />}

      {previewFile && <FilePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />}

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

      {!booted && <div className="fixed inset-0 grid place-items-center bg-void"><Loader2 className="spin text-muted" size={22} /></div>}
    </div>
  );
}

function LoginDialog({
  onSubmit,
  canClose,
  onClose,
}: {
  onSubmit: (apiKey: string) => Promise<void>;
  canClose: boolean;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit() {
    if (!apiKey.trim()) {
      setLocalError("Introduce la API key.");
      return;
    }
    setLocalError("");
    setBusy(true);
    try {
      await onSubmit(apiKey.trim());
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(10,13,19,0.72)] px-4">
      <div className="popover animate-pop w-full max-w-md p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="t-title text-ink">Iniciar sesión</h2>
            <p className="mt-2 text-[13px] leading-6 text-ink-dim">
              Esta API requiere autenticación. Introduce la API key una vez; se guarda como cookie de sesión segura en este navegador.
            </p>
          </div>
          {canClose && (
            <button className="row-btn" onClick={onClose} type="button" aria-label="Cerrar">
              <X size={17} />
            </button>
          )}
        </div>

        <label className="mt-5 grid gap-1.5">
          <span className="t-label flex items-center gap-1.5 text-muted">
            <KeyRound size={12} />
            API key
          </span>
          <div className="relative">
            <input
              className="input w-full pr-10"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder="Pega tu API key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              autoFocus
            />
            <button
              className="row-btn absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setShowKey((value) => !value)}
              type="button"
              aria-label={showKey ? "Ocultar" : "Mostrar"}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>

        {localError && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-danger">
            <AlertTriangle size={13} /> {localError}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {canClose && (
            <button className="btn" onClick={onClose} type="button">
              Cancelar
            </button>
          )}
          <button className="btn btn--accent" onClick={submit} type="button" disabled={busy}>
            {busy ? <Loader2 className="spin" size={15} /> : <LogIn size={15} />}
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({ active, icon, children, onClick }: { active: boolean; icon: ReactNode; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-semibold transition ${
        active ? "border-hairline bg-panel-2 text-ink" : "border-transparent text-muted hover:text-ink-dim"
      }`}
    >
      <span className={active ? "text-lime" : ""}>{icon}</span>
      {children}
    </button>
  );
}

function FileManager({
  files,
  loading,
  onRefresh,
  onPreview,
  onDelete,
}: {
  files: ServerFile[];
  loading: boolean;
  onRefresh: () => void;
  onPreview: (file: ServerFile) => void;
  onDelete: (file: ServerFile) => void;
}) {
  return (
    <section className="board overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div>
          <p className="t-overline text-muted">Servidor</p>
          <h2 className="t-title mt-1.5 text-ink">Archivos cargados</h2>
          <p className="mt-1 text-[13px] text-ink-dim">Audios y vídeos en el servidor (uploads y audio_test).</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="chip">{files.length}</span>
          <button className="btn btn--sm" onClick={onRefresh} type="button">
            <RefreshCw size={14} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="scroll-thin max-h-[72vh] overflow-auto">
        {loading && files.length === 0 ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="spin text-muted" size={22} />
          </div>
        ) : files.length === 0 ? (
          <div className="grid place-items-center py-16">
            <span className="t-mono text-muted">Sin archivos en el servidor</span>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-panel">
              <tr className="t-overline text-muted">
                <th className="px-5 py-3 font-semibold">Nombre</th>
                <th className="w-24 px-3 py-3 font-semibold">Tipo</th>
                <th className="w-28 px-3 py-3 font-semibold">Tamaño</th>
                <th className="w-44 px-3 py-3 font-semibold">Fecha</th>
                <th className="w-32 px-5 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <FileRow
                  key={`${file.source}:${file.ref}`}
                  file={file}
                  onPreview={() => onPreview(file)}
                  onDelete={() => onDelete(file)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function FileRow({ file, onPreview, onDelete }: { file: ServerFile; onPreview: () => void; onDelete: () => void }) {
  const TypeIcon = file.kind === "video" ? Film : file.kind === "audio" ? Music : FileAudio;
  const canPreview = file.kind === "audio" || file.kind === "video";

  return (
    <tr className="border-t border-hairline transition hover:bg-panel-2">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-elevated text-ink-dim">
            <TypeIcon size={15} />
          </span>
          <span className="truncate font-body text-[13px] font-medium text-ink">{file.name}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <span className="chip chip--ghost uppercase">{file.ext || file.kind}</span>
      </td>
      <td className="px-3 py-3 font-mono text-[12px] text-ink-dim">{formatBytes(file.size_bytes)}</td>
      <td className="px-3 py-3 font-mono text-[11px] text-muted">{formatDate(file.modified_at)}</td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1.5">
          {canPreview && (
            <button className="row-btn" onClick={onPreview} type="button" aria-label="Visualizar" title="Visualizar">
              <Play size={15} />
            </button>
          )}
          <a
            className="row-btn"
            href={api.fileContentUrl(file.source, file.ref, "attachment")}
            aria-label="Descargar"
            title="Descargar"
          >
            <Download size={15} />
          </a>
          <button className="row-btn row-btn--danger" onClick={onDelete} type="button" aria-label="Eliminar" title="Eliminar">
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function FilePreviewDialog({ file, onClose }: { file: ServerFile; onClose: () => void }) {
  const src = api.fileContentUrl(file.source, file.ref, "inline");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(10,13,19,0.72)] px-4" onClick={onClose}>
      <div className="popover animate-pop w-full max-w-2xl p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="t-overline text-muted">{file.kind === "video" ? "Vídeo" : file.kind === "audio" ? "Audio" : "Archivo"}</p>
            <h2 className="t-title mt-1.5 truncate text-ink">{file.name}</h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="chip chip--ghost uppercase">{file.ext}</span>
              <span className="chip chip--ghost">{formatBytes(file.size_bytes)}</span>
            </div>
          </div>
          <button className="row-btn" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={17} />
          </button>
        </div>

        <div className="mt-5">
          {file.kind === "video" ? (
            <video className="max-h-[60vh] w-full rounded-lg bg-black" src={src} controls autoPlay />
          ) : file.kind === "audio" ? (
            <audio className="w-full" src={src} controls autoPlay />
          ) : (
            <div className="well grid place-items-center p-10">
              <span className="t-mono text-muted">No previsualizable</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <a className="btn" href={api.fileContentUrl(file.source, file.ref, "attachment")}>
            <Download size={15} />
            Descargar
          </a>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, children, icon, onClick }: { active: boolean; children: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button className={`tab ${active ? "tab--active" : ""}`} onClick={onClick} type="button">
      <span className={active ? "text-lime" : ""}>{icon}</span>
      {children}
    </button>
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
    <div className="grid gap-3.5">
      <SectionLabel>Origen · Upload</SectionLabel>

      <label className="dropzone">
        <input
          className="hidden"
          type="file"
          accept={accept}
          disabled={isWorking}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        <span className="grid h-11 w-11 place-items-center rounded-full bg-elevated text-lime">
          <FileAudio size={20} />
        </span>
        <span className="font-body text-[14px] font-semibold text-ink">Examinar archivo</span>
        <span className="t-mono text-muted">AUDIO O VÍDEO</span>
      </label>

      <div className="well px-3 py-2.5">
        {file ? (
          <div className="grid gap-1.5">
            <div className="truncate font-body text-[13px] font-semibold text-ink">{file.name}</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="chip chip--ghost">{formatBytes(file.size)}</span>
            </div>
            {fileError && (
              <div className="flex items-center gap-1.5 text-[12px] text-danger">
                <AlertTriangle size={13} />
                {fileError}
              </div>
            )}
          </div>
        ) : (
          <div className="t-mono text-muted">SIN ARCHIVO SELECCIONADO</div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-[8px] border border-hairline bg-panel-2 px-3 py-2.5">
        <span>
          <span className="block font-body text-[13px] font-semibold text-ink">Persistir entrada</span>
          <span className="block text-[12px] text-muted">Si se desactiva, se limpia al terminar.</span>
        </span>
        <Switch checked={persistInput} disabled={isWorking} onChange={onPersistChange} label="Persistir entrada" />
      </div>

      {uploadProgress !== null && <ProgressBar label={busyLabel || "Subiendo"} value={uploadProgress} />}

      <button
        className="btn btn--accent"
        disabled={!file || Boolean(fileError) || isWorking}
        onClick={onUpload}
        type="button"
      >
        {isWorking ? <Loader2 className="spin" size={15} /> : <Upload size={15} />}
        Subir y procesar
      </button>
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
      <div className="grid gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Archivos en audio_test</SectionLabel>
          <span className="chip">{localFiles.length}</span>
        </div>
        <div className="scroll-thin grid max-h-72 gap-2 overflow-auto pr-1">
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

      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Historial</SectionLabel>
          <div className="flex gap-2">
            <button className="btn btn--sm" onClick={onCleanupTemp} type="button">
              <Trash2 size={13} />
              Temporales
            </button>
            <button className="btn btn--sm btn--danger" onClick={onCleanupHistory} type="button">
              <Trash2 size={13} />
              Historial
            </button>
          </div>
        </div>
        <div className="scroll-thin grid max-h-96 gap-2 overflow-auto pr-1">
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
    <div className="row group p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-body text-[13px] font-semibold text-ink">{file.filename}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="chip chip--ghost">{file.format.toUpperCase()}</span>
            <span className="chip chip--ghost">{formatBytes(file.size_bytes)}</span>
            <span className="chip chip--ghost">{formatDuration(file.duration_seconds)}</span>
            <span className="chip chip--ghost">{file.estimated_chunk_count} chunk</span>
          </div>
        </div>
        <button className="row-btn row-btn--danger opacity-0 transition group-hover:opacity-100" onClick={onDelete} type="button" aria-label="Borrar archivo">
          <Trash2 size={15} />
        </button>
      </div>
      <button className="btn btn--accent btn--sm mt-3 w-full" disabled={isWorking} onClick={onProcess} type="button">
        <FolderOpen size={14} />
        Procesar local
      </button>
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
    <div className={`row group p-3 ${isSelected ? "row--selected" : ""}`}>
      <button className="w-full text-left" onClick={onSelect} type="button">
        <div className="truncate font-body text-[13px] font-semibold text-ink">{job.original_filename}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`pill ${statusClass(job.status)}`}>{statusLabel(job.status)}</span>
          <span className="chip chip--ghost">{job.progress}%</span>
          <span className="chip chip--ghost">{job.source}</span>
        </div>
      </button>
      <button
        className="row-btn row-btn--danger mt-2.5 opacity-0 transition group-hover:opacity-100"
        onClick={onDelete}
        type="button"
        aria-label="Borrar job"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function StatusPanel({
  job,
  uploadProgress,
  busyLabel,
  liveSegments,
  onCancel,
}: {
  job: Job | null;
  uploadProgress: number | null;
  busyLabel: string;
  liveSegments: StreamSegment[];
  onCancel: () => void;
}) {
  const result = job?.result;
  const metadata = job?.metadata;
  // Durante el proceso pintamos los segmentos que llegan por SSE; al completar,
  // el job ya trae result.segments con todo.
  const segments = liveSegments.length > 0 ? liveSegments : result?.segments ?? [];
  const progress = uploadProgress ?? job?.progress ?? 0;
  const isActive = job?.status === "uploaded" || job?.status === "processing";

  return (
    <section className="board self-start overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-hairline px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="t-overline text-muted">Proceso</p>
          <h2 className="t-title mt-1.5 text-ink">Estado del proceso</h2>
          <p className="mt-1 text-[13px] text-ink-dim">{job?.message ?? busyLabel ?? "Sin job activo"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isActive && (
            <button className="btn btn--sm btn--danger" onClick={onCancel} type="button">
              <X size={14} />
              Cancelar
            </button>
          )}
          <StatusPill status={job?.status} />
        </div>
      </div>

      <div className="grid gap-5 p-5">
        <ProgressBar label={busyLabel || job?.stage || "idle"} value={progress} />

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Archivo" value={job?.original_filename ?? "—"} />
          <Metric label="Origen" value={job?.source ?? "—"} mono />
          <Metric label="Persistencia" value={metadata?.input_persisted === false ? "Temporal" : "Persistente"} />
          <Metric label="Formato" value={(result?.source_format ?? metadata?.format ?? "—").toString().toUpperCase()} mono />
          <Metric label="Tamaño" value={formatBytes(metadata?.size_bytes)} mono />
          <Metric label="Duración" value={formatDuration(result?.duration_seconds ?? metadata?.duration_seconds)} mono />
          <Metric label="Chunks" value={String(result?.chunk_count ?? metadata?.estimated_chunk_count ?? "—")} mono />
          <Metric label="Segmentos" value={String(result?.segment_count ?? segments.length ?? "—")} mono />
        </div>

        {job?.error && (
          <div className="flex items-start gap-2 rounded-[8px] border border-danger-dim bg-[rgba(251,113,133,0.07)] px-4 py-3 text-[13px] text-danger">
            <AlertTriangle className="mt-0.5 shrink-0" size={15} />
            <span>{job.error}</span>
          </div>
        )}

        <ResultActions job={job} />

        <ResultTabs segments={segments} />
      </div>
    </section>
  );
}

function ResultActions({ job }: { job: Job | null }) {
  if (job?.status !== "completed") {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <DownloadLink href={api.resultUrl(job.job_id, "txt")} icon={<FileText size={15} />}>
        TXT
      </DownloadLink>
      <DownloadLink href={api.resultUrl(job.job_id, "srt")} icon={<Download size={15} />}>
        SRT
      </DownloadLink>
      <DownloadLink href={api.resultUrl(job.job_id, "segments")} icon={<FileJson size={15} />}>
        Segmentos JSON
      </DownloadLink>
    </div>
  );
}

function ResultTabs({ segments }: { segments: NonNullable<Job["result"]>["segments"] }) {
  const [view, setView] = useState<"segments" | "text">("segments");
  const list = segments ?? [];

  return (
    <div className="well overflow-hidden">
      <div className="tabbar px-2 pt-1.5">
        <button className={`tab ${view === "segments" ? "tab--active" : ""}`} onClick={() => setView("segments")} type="button">
          <span className={view === "segments" ? "text-lime" : ""}>
            <Clock size={13} />
          </span>
          Segmentos
        </button>
        <button className={`tab ${view === "text" ? "tab--active" : ""}`} onClick={() => setView("text")} type="button">
          <span className={view === "text" ? "text-lime" : ""}>
            <FileText size={13} />
          </span>
          Transcripción
        </button>
      </div>

      {view === "segments" ? (
        <div className="scroll-thin max-h-80 overflow-auto">
          <table className="w-full table-fixed text-left">
            <thead className="sticky top-0 bg-void">
              <tr className="t-overline text-muted">
                <th className="w-24 px-4 py-2.5 font-semibold">Inicio</th>
                <th className="w-24 px-4 py-2.5 font-semibold">Fin</th>
                <th className="px-4 py-2.5 font-semibold">Texto</th>
              </tr>
            </thead>
            <tbody>
              {list.length > 0 ? (
                list.map((segment, index) => (
                  <tr className="border-t border-hairline" key={`${segment.start}-${index}`}>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{formatTimestamp(segment.start)}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{formatTimestamp(segment.end)}</td>
                    <td className="px-4 py-2.5 text-[13px] text-ink-dim">{segment.text}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-5 text-[13px] text-muted" colSpan={3}>
                    Sin segmentos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scroll-thin max-h-80 overflow-auto whitespace-pre-wrap p-4 text-[13px] leading-6 text-ink-dim">
          {list.length > 0 ? list.map((segment) => segment.text).join("\n") : "Sin texto"}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({ state, onCancel, onConfirm }: { state: ConfirmState; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(10,13,19,0.62)] px-4">
      <div className="popover animate-pop w-full max-w-md p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="t-title text-ink">{state.title}</h2>
            <p className="mt-2 text-[13px] leading-6 text-ink-dim">{state.message}</p>
          </div>
          <button className="row-btn" onClick={onCancel} type="button" aria-label="Cerrar">
            <X size={17} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={onCancel} type="button">
            Cancelar
          </button>
          <button
            className={`btn ${state.tone === "accent" ? "btn--accent" : "btn--danger"}`}
            onClick={onConfirm}
            type="button"
          >
            {state.tone === "accent" ? <Check size={15} /> : <Trash2 size={15} />}
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  const boundedValue = Math.max(0, Math.min(100, value));
  return (
    <div className="grid gap-2">
      <div className="t-mono flex items-center justify-between gap-3 text-muted">
        <span className="uppercase tracking-[0.14em]">{label}</span>
        <span className="text-ink-dim">{boundedValue}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${boundedValue}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status?: Job["status"] }) {
  const icon =
    status === "completed" ? (
      <CheckCircle2 size={13} />
    ) : status === "processing" ? (
      <Loader2 className="spin" size={13} />
    ) : status === "failed" ? (
      <AlertTriangle size={13} />
    ) : null;

  return (
    <span className={`pill ${statusClass(status)}`}>
      {icon}
      {statusLabel(status)}
    </span>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[8px] border border-hairline bg-panel-2 px-3 py-2.5">
      <div className="t-overline text-muted">{label}</div>
      <div className={`mt-1.5 truncate text-[13px] font-semibold text-ink ${mono ? "font-mono text-[12px]" : "font-body"}`}>
        {value}
      </div>
    </div>
  );
}

function DownloadLink({ children, href, icon }: { children: string; href: string; icon: ReactNode }) {
  return (
    <a className="btn" href={href} rel="noreferrer" target="_blank">
      {icon}
      {children}
    </a>
  );
}

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? "switch--on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__knob" />
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="t-label text-muted">{children}</h2>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid place-items-center rounded-[8px] border border-dashed border-hairline-strong bg-void px-4 py-6 text-center">
      <span className="t-mono text-muted">{text}</span>
    </div>
  );
}
