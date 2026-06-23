export type JobStatus = "uploaded" | "processing" | "completed" | "failed";
export type JobSource = "upload" | "local";

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface JobResult {
  txt_path?: string;
  srt_path?: string;
  segments_path?: string;
  language?: string | null;
  source_format?: string;
  duration_seconds?: number | null;
  chunk_count?: number;
  segment_count?: number;
  segments?: Segment[];
}

export interface JobMetadata {
  input_persisted?: boolean;
  input_path?: string;
  local_path?: string;
  format?: string;
  size_bytes?: number;
  duration_seconds?: number | null;
  chunk_seconds?: number;
  estimated_chunk_count?: number;
  will_chunk?: boolean;
  temp_path?: string;
  cleanup_state?: {
    temp_cleaned?: boolean;
    input_persisted?: boolean;
    deleted?: string[];
    errors?: string[];
  };
}

export interface Job {
  job_id: string;
  original_filename: string;
  stored_path: string;
  source: JobSource;
  status: JobStatus;
  stage?: string;
  message?: string;
  progress: number;
  created_at: string;
  updated_at: string;
  metadata?: JobMetadata;
  result?: JobResult | null;
  error?: string | null;
}

export interface LocalFile {
  path: string;
  filename: string;
  format: string;
  size_bytes: number;
  duration_seconds: number | null;
  estimated_chunk_count: number;
  will_chunk: boolean;
}

export interface ApiConfig {
  supported_extensions: string[];
  chunk_seconds: number;
}

export interface CleanupResponse {
  jobs_deleted?: number;
  deleted_count?: number;
  deleted?: string[];
  errors?: string[];
}
