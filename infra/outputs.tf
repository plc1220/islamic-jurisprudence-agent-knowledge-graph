output "cloud_run_url" {
  description = "The public URL of the deployed Cloud Run Mursyid AI service."
  value       = google_cloud_run_service.mursyid_app.status[0].url
}

output "postgres_private_ip" {
  description = "The private IP address of the Cloud SQL PostgreSQL instance."
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "redis_private_ip" {
  description = "The private host address of the Cloud Memorystore Redis instance."
  value       = google_redis_instance.cache_redis.host
}

output "artifact_registry_repo" {
  description = "The repository URL in Artifact Registry."
  value       = google_artifact_registry_repository.repo.id
}
