# GitHub CI/CD -> Google Cloud Run (automatyczny deploy)

Ten dokument podpina GitHuba tak, aby po kazdym pushu do `main` robil sie automatyczny deploy.

## 1. Co juz jest gotowe w repo

- Workflow: `.github/workflows/deploy-gcp.yml`
- Docker API: `apps/api/Dockerfile`
- Docker Web: `apps/web-admin/Dockerfile`

## 2. Podlacz repo do GitHub

W PowerShell (lokalnie):

```powershell
git init
git add .
git commit -m "chore: setup github actions deploy to gcp"
git branch -M main
git remote add origin https://github.com/TWOJ_LOGIN/TWOJE_REPO.git
git push -u origin main
```

## 3. Utworz Service Account w Google Cloud

W Cloud Shell:

```bash
PROJECT_ID="TWOJ_PROJECT_ID"
REGION="europe-central2"
REPO="urlopy"

gcloud config set project "$PROJECT_ID"

gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Deployer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:github-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:github-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:github-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Klucz JSON (wariant prosty)
gcloud iam service-accounts keys create github-deployer-key.json \
  --iam-account="github-deployer@$PROJECT_ID.iam.gserviceaccount.com"
```

## 4. Dodaj sekrety i zmienne w GitHub

W repo GitHub -> Settings -> Secrets and variables -> Actions:

Secrets:

- `GCP_SA_KEY` = zawartosc pliku `github-deployer-key.json`

Variables:

- `GCP_PROJECT_ID` = Twoj project id
- `GCP_REGION` = `europe-central2`
- `GCP_ARTIFACT_REPOSITORY` = `urlopy`
- `GCP_CLOUD_RUN_API_SERVICE` = `urlopy-api`
- `GCP_CLOUD_RUN_WEB_SERVICE` = `urlopy-web`

## 5. Pierwszy automatyczny deploy

Po pushu do `main` workflow uruchomi sie sam:

- buduje obrazy Docker,
- wrzuca do Artifact Registry,
- deployuje API i Web do Cloud Run.

URL-e uslug beda w logu joba (krok "Print service URLs").

## 6. Co ustawic recznie po pierwszym deployu

W Cloud Run `urlopy-api` dodaj zmienne srodowiskowe biznesowe:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `COMMUNICATION_MODE`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `MAILBOX_ADDRESS`
- `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`
- `ONEDRIVE_DRIVE_ID`, `ONEDRIVE_BASE_PATH`

W Cloud Run `urlopy-web` ustaw:

- `NEXT_PUBLIC_API_URL=https://URL_API_Z_CLOUD_RUN`

## 7. Mobilka po automatyzacji

W `apps/mobile-worker/eas.json` ustaw publiczny URL API i zbuduj APK.

