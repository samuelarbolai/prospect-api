# Cloud Run Deployment Checklist

Use this as a repeatable runbook for deploying the Prospect Pipeline backend (or similar Node/Firestore services) to Cloud Run.

## Prerequisites

- Google Cloud SDK installed (`gcloud version` should be recent).
- Project ID set (e.g. `export PROJECT_ID=leadgen-475923`).
- Logged in with a user or service account that has Project Owner (or equivalent) permissions.

## One-time project setup

1. **Enable required APIs**
   ```bash
   gcloud services enable \
     run.googleapis.com \
     artifactregistry.googleapis.com \
     cloudbuild.googleapis.com
   ```

2. **Create an Artifact Registry repository for Docker images**
   ```bash
   gcloud artifacts repositories create prospect-backend \
     --repository-format=docker \
     --location=us \
     --description="Prospect backend images"
   ```

3. **Grant CI/CD service accounts permissions**
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")

   # Cloud Build: can read/write Artifact Registry and logs, plus read Cloud Storage sources
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
     --role="roles/artifactregistry.writer"
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
     --role="roles/storage.admin"
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
     --role="roles/logging.logWriter"

   # Compute default service account (Cloud Run runtime) needs Firestore + Artifact Registry + logs
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/datastore.user"
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/artifactregistry.writer"
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/logging.logWriter"
   ```

   > Adjust roles if the runtime needs Firestore write access (`roles/datastore.owner`) or if you use a custom service account.

## Build and deploy

1. **Build & push the container**
   ```bash
   gcloud builds submit \
     --tag us-docker.pkg.dev/$PROJECT_ID/prospect-backend/api
   ```

2. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy prospect-backend \
     --image us-docker.pkg.dev/$PROJECT_ID/prospect-backend/api \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars "DEFAULT_QUEUE_LIST_ID=enrichment_queue,OUTREACH_READY_LIST_ID=outreach_ready"
   ```

   - Replace the env var values with the ones appropriate for the environment.
   - Add optional credential env vars if you need inline service accounts:
     - `GOOGLE_APPLICATION_CREDENTIALS_JSON`
     - `GOOGLE_APPLICATION_CREDENTIALS_B64`

## Verifying the deployment

- **Check logs**
  ```bash
  gcloud logging read \
    'resource.type="cloud_run_revision" AND resource.labels.service_name="prospect-backend"' \
    --project="$PROJECT_ID" \
    --limit=50
  ```

- **Health endpoint**: `curl https://<SERVICE_URL>/healthz` should return `{"status":"ok",...}`.

- **CORS**: The backend sends `Access-Control-Allow-Origin: *` by default via Express/CORS middleware.

## Common troubleshooting

- **`tsc: not found` during build**: ensure `NODE_ENV` is not set to `production` before `npm ci`; the provided Dockerfile handles this.
- **GCS permission errors**: grant `storage.objectViewer` or `storage.admin` to the service account mentioned in the error.
- **Artifact Registry push denied**: repository missing or service account lacks `artifactregistry.writer`.
- **Firestore permission errors (manifest as CORS failures)**: confirm the Cloud Run runtime service account has `roles/datastore.user` (or higher).

Save these steps for new projects to avoid repeating the IAM and setup debugging.
