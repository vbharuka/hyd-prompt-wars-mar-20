#!/bin/bash
# deploy.sh
# Execute with: ./deploy.sh [YOUR-PROJECT-ID]

PROJECT_ID=$1

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./deploy.sh [YOUR-PROJECT-ID]"
  exit 1
fi

echo "Setting Active Project: $PROJECT_ID"
gcloud config set project $PROJECT_ID

echo "Permissions: Checking required Google Cloud APIs..."
REQUIRED_APIS="run.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com cloudbuild.googleapis.com"
for api in $REQUIRED_APIS; do
  STATUS=$(gcloud services list --enabled --filter="config.name:$api" --format="value(config.name)")
  if [ -z "$STATUS" ]; then
    echo "Enabling $api..."
    gcloud services enable $api
  else
    echo "✅ $api is already enabled."
  fi
done

echo "Setting up Artifact Registry 'med-link-repo'..."
gcloud artifacts repositories describe med-link-repo --location=asia-south1 > /dev/null 2>&1
if [ $? -ne 0 ]; then
  gcloud artifacts repositories create med-link-repo \
    --repository-format=docker \
    --location=asia-south1 \
    --description="Med-Link Artifact Registry Repository"
  echo "✅ med-link-repo Artifact Repository Created."
else
  echo "✅ med-link-repo Artifact Repository already exists."
fi

# Define the Image URL
IMAGE_URL="asia-south1-docker.pkg.dev/$PROJECT_ID/med-link-repo/med-link-bridge"

echo "Build & Push: Containerizing using Google Cloud Build..."
gcloud builds submit --tag $IMAGE_URL

echo "Deploying container 'med-link-bridge' to Cloud Run..."
gcloud run deploy med-link-bridge \
  --image $IMAGE_URL \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID

echo "Deployment Sequence Completed Successfully!"
