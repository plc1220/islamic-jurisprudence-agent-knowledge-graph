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

variable "bq_crawl_runs_table" {
  description = "BigQuery table for durable crawler run and pass records."
  type        = string
  default     = "crawl_runs"
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

variable "enable_memorystore" {
  description = "Whether to provision Memorystore for Redis and wire Cloud Run through Serverless VPC Access."
  type        = bool
  default     = true
}

variable "cache_vpc_network_name" {
  description = "Dedicated VPC network name for Cloud Run to reach Memorystore."
  type        = string
  default     = "mursyid-cache-vpc"
}

variable "vpc_connector_name" {
  description = "Serverless VPC Access connector name used by Cloud Run for Memorystore traffic."
  type        = string
  default     = "mursyid-vpc-connector"
}

variable "vpc_connector_cidr_range" {
  description = "Unused /28 CIDR range for the Serverless VPC Access connector."
  type        = string
  default     = "10.8.0.0/28"
}

variable "memorystore_instance_name" {
  description = "Memorystore for Redis instance name."
  type        = string
  default     = "mursyid-cache"
}

variable "memorystore_tier" {
  description = "Memorystore tier. BASIC is cheapest; STANDARD_HA adds high availability."
  type        = string
  default     = "BASIC"
}

variable "memorystore_memory_size_gb" {
  description = "Memorystore Redis memory size in GiB."
  type        = number
  default     = 1
}

variable "memorystore_redis_version" {
  description = "Memorystore Redis version."
  type        = string
  default     = "REDIS_7_0"
}

variable "cache_enabled" {
  description = "Enable in-app caching."
  type        = bool
  default     = true
}

variable "query_normalization_enabled" {
  description = "Enable conservative Malay/fiqh query normalization before cache/retrieval matching."
  type        = bool
  default     = true
}

variable "embedding_cache_ttl_ms" {
  description = "TTL for embedding cache entries."
  type        = number
  default     = 86400000
}

variable "embedding_cache_max_entries" {
  description = "Maximum process-local embedding cache entries."
  type        = number
  default     = 1000
}

variable "retrieval_cache_ttl_ms" {
  description = "TTL for retrieval cache entries."
  type        = number
  default     = 900000
}

variable "retrieval_cache_max_entries" {
  description = "Maximum process-local retrieval cache entries."
  type        = number
  default     = 500
}

variable "chat_response_cache_ttl_ms" {
  description = "TTL for exact chat response cache entries."
  type        = number
  default     = 300000
}

variable "chat_response_cache_max_entries" {
  description = "Maximum process-local exact chat response cache entries."
  type        = number
  default     = 250
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
