variable "project_id" {
  description = "The Google Cloud Project ID to deploy resources into."
  type        = string
}

variable "region" {
  description = "The GCP region to deploy resources (Singapore is highly recommended for low latency in Malaysia)."
  type        = string
  default     = "asia-southeast1"
}

variable "gemini_location" {
  description = "Gemini / Vertex AI model endpoint location. Use global for the Gemini Enterprise Agent Platform SDK path."
  type        = string
  default     = "global"
}

variable "repository_name" {
  description = "The Artifact Registry repository name."
  type        = string
  default     = "mursyid-repo"
}

variable "service_name" {
  description = "The name of the Cloud Run service."
  type        = string
  default     = "mursyid-ai"
}

variable "deploy_cloud_run" {
  description = "Whether Terraform should create the Cloud Run service. Keep false for the first bootstrap until an image exists in Artifact Registry; Cloud Build can deploy the app afterward."
  type        = bool
  default     = false
}

variable "bq_dataset" {
  description = "BigQuery dataset used for corpus documents, vector chunks, and graph edges."
  type        = string
  default     = "mursyid_knowledge"
}

variable "bq_corpus_table" {
  description = "BigQuery table for full crawled documents."
  type        = string
  default     = "corpus"
}

variable "bq_chunks_table" {
  description = "BigQuery table for semantic chunks and embeddings."
  type        = string
  default     = "chunks"
}

variable "bq_graph_table" {
  description = "BigQuery table for extracted knowledge graph edges."
  type        = string
  default     = "graph_edges"
}

variable "bq_embedding_model" {
  description = "Embedding model name recorded for BigQuery Vector Search rows."
  type        = string
  default     = "text-embedding-004"
}

variable "gcs_raw_bucket_name" {
  description = "Cloud Storage bucket for raw crawled markdown snapshots. Defaults to <project_id>-mursyid-raw."
  type        = string
  default     = ""
}

variable "knowledge_catalog_entry_group" {
  description = "Knowledge Catalog entry group for Mursyid AI custom entries."
  type        = string
  default     = "mursyid-knowledge"
}

variable "knowledge_catalog_entry_type" {
  description = "Knowledge Catalog custom entry type for source and concept entries."
  type        = string
  default     = "mursyid-knowledge-entry"
}

variable "knowledge_catalog_aspect_type" {
  description = "Knowledge Catalog custom aspect type for Mursyid context metadata."
  type        = string
  default     = "mursyid-context"
}

variable "github_repository" {
  description = "GitHub repository allowed to deploy through Workload Identity Federation, in owner/repo format."
  type        = string
  default     = "plc1220/islamic-jurisprudence-agent-knowledge-graph"
}
