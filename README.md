# Prospect Pipeline Backend

Simple Express/TypeScript service that powers the prospect UI. It exposes
REST endpoints to fetch prospect data, queue enrichment work, and tag
prospects as outreach ready.

## Setup

```bash
cd backend
npm install
cp .env.example .env
# provide GOOGLE_APPLICATION_CREDENTIALS pointing at a service account JSON
npm run dev
```

The server starts on port `4000` by default. The React app expects
`VITE_API_BASE_URL` to point at this address (see `prospect-ui/.env.example`).

### Service account permissions

Use a Firebase/Google Cloud service account with at least:

* `Datastore User` (or `Cloud Datastore Owner`) to read/write Firestore
* Optional: `Cloud Scheduler Job Runner` / Pub/Sub if you later connect to
  background queues

Expose the path to the JSON file via `GOOGLE_APPLICATION_CREDENTIALS` or load it
via any other ADC-compatible mechanism.

## Endpoints

### `GET /api/prospects`

Query parameters:

| Param        | Description                                |
|--------------|--------------------------------------------|
| `listIds`    | Comma-separated `list_ids` values           |
| `priorities` | Comma-separated priorities (`P1,P2`)        |
| `statuses`   | Comma-separated enrichment statuses         |
| `search`     | Fuzzy match on name, organization, or title |
| `pageSize`   | Defaults to 50 (max 200)                    |
| `pageToken`  | Use the `nextPageToken` from previous call  |

Response:

```json
{
  "data": [ { "id": "...", "name": "...", ... } ],
  "nextPageToken": "<docId>"        // omitted when no more pages
}
```

### `GET /api/list-options`

Returns the distinct `list_ids` values seen across the first 500 prospect
documents. The UI uses this to render the multi-select filter.

### `POST /api/enqueue_enrichment`

Request body:

```json
{
  "prospectIds": ["prospectsDocId1", "prospectsDocId2"],
  "listTag": "my_queue_label",       // optional
  "metadata": { "notes": "optional context" }
}
```

Behaviour:

* Creates a document in `enrichment_runs` with status `queued`.
* For each prospect (batched), sets:
  * `enrichment.status = "queued"`
  * `enrichment.queue_run_id = <runId>`
  * `enrichment.queue_timestamp = now`
  * Adds `listTag` (or `DEFAULT_QUEUE_LIST_ID` from `.env`) to `list_ids`.

Response:

```json
{
  "runId": "...",
  "queued": 42,
  "listTag": "enrichment_queue"
}
```

Your enrichment worker (e.g. `linkedin_enrichment.py`) can query Firestore for
`enrichment.status == "queued"` to process these records.

### `POST /api/tag_outreach_ready`

Request body:

```json
{
  "prospectIds": ["prospectsDocId1"],
  "listTag": "outreach_ready"      // optional override
}
```

Behaviour:

* Sets `outreach.ready = true`, `outreach.ready_at = now`, `outreach.updated_at = now`.
* Adds `listTag` (or `OUTREACH_READY_LIST_ID` from `.env`) to `list_ids` for the
  selected documents.

Response:

```json
{
  "updated": 5,
  "listTag": "outreach_ready"
}
```

You can extend this endpoint to push leads into external CRMs or messaging
tools once they are marked ready.

## Deployment

The service is ready for Cloud Run / App Engine:

1. Enable Artifact Registry (once per project): `gcloud services enable artifactregistry.googleapis.com --project <PROJECT_ID>`
2. Create a Docker repository (one-time):
   ```bash
   gcloud artifacts repositories create prospect-backend \
     --repository-format=docker \
     --location=us \
     --description="Prospect backend images"
   ```
3. Build and push the container:
   ```bash
   gcloud builds submit \
     --tag us-docker.pkg.dev/<PROJECT_ID>/prospect-backend/api
   ```
4. Deploy via Cloud Run:
   ```bash
   gcloud run deploy prospect-backend \
     --image us-docker.pkg.dev/<PROJECT_ID>/prospect-backend/api \
     --platform managed \
     --region <REGION> \
     --allow-unauthenticated \
     --set-env-vars "DEFAULT_QUEUE_LIST_ID=..." \
     --set-env-vars "OUTREACH_READY_LIST_ID=..." \
     --set-env-vars "CORS_ALLOWED_ORIGINS=https://your-frontend-domain"
   ```
3. Credentials:
   * Attach a service account with Firestore access to the Cloud Run service. The container uses
     Application Default Credentials by default, so grant it `Datastore User` (or higher).
   * If you prefer to pass credentials manually, set `GOOGLE_APPLICATION_CREDENTIALS_JSON` or
     `GOOGLE_APPLICATION_CREDENTIALS_B64` with the raw or Base64-encoded service account JSON.
   * Only one authentication method is needed—either ADC + service account or the inline env vars.

For a full step-by-step checklist (including IAM role bindings), see `docs/cloud-run-setup.md`.

The React frontend uses relative fetch paths. When deploying both services under
the same domain, configure a reverse proxy or set `VITE_API_BASE_URL` to your
backend’s public URL.
