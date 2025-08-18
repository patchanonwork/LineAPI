# Line Gatekeeper

Line Gatekeeper is a **LINE Official Account** automation bot built with Node.js and Express. It listens to messages sent by users, detects intents (contact requests, admin notifications and quote inquiries) and responds with natural Thai messages. Quotes are computed via a lightweight rule‑based engine in `brain.js`, and notifications to administrators are sent via email and LINE push. The service is designed to run on Google Cloud Run using Buildpacks for containerisation and automatic deployment from a GitHub repository.

## Repository structure

    index.js             # Express server and webhook handler
    brain.js             # Intent detection and pricing logic
    notifier.js          # Email and LINE push helpers
    contactFlex.json     # Flex bubble template for contact info
    package.json         # Node.js metadata and dependencies
    cloudbuild.yaml      # Cloud Build pipeline definition
    .gcloudignore        # Exclusions for Cloud Build uploads
    README.md            # This document

## Prerequisites

To run this bot locally you need:

* **Node.js** (v16 or later recommended)
* **npm** to install dependencies
* A **LINE channel** with a channel secret and access token
* SMTP credentials for sending emails
* (Optional) A LINE group or user ID to receive admin notifications

### Environment variables

The bot reads its configuration exclusively from environment variables. These are *never* committed to the repository and must be provided at runtime. When running locally you can create a `.env` file in the project root with the following entries:

```
# LINE credentials
LINE_CHANNEL_SECRET=<your channel secret>
LINE_CHANNEL_ACCESS_TOKEN=<your channel access token>

# Contact information used in the Flex message
CONTACT_PHONE=<e.g. 0812345678>
CONTACT_EMAIL=<e.g. info@example.com>

# Admin notification targets (at least one should be set)
ADMIN_GROUP_ID=<LINE group ID for admin notifications>  # optional
ADMIN_USER_ID=<LINE user ID for admin notifications>    # optional

# SMTP settings for email notifications
SMTP_HOST=<smtp host, e.g. smtp.gmail.com>
SMTP_PORT=<smtp port, e.g. 587>
SMTP_USER=<smtp username>
SMTP_PASS=<smtp password>
NOTIFY_EMAIL_TO=<recipient email address>

# Cloud Run will automatically provide PORT
# PORT=8080 (default when running locally)
```

## Installing dependencies

Clone the repository from GitHub and install the required packages:

```
git clone https://github.com/<GITHUB_OWNER>/<REPO_NAME>.git
cd <REPO_NAME>
npm install
```

## Running locally

1. Ensure your `.env` file is populated with the necessary values as described above.
2. Start the server:

   ```
   npm start
   ```

3. The server listens on `http://localhost:8080` (or the `PORT` you specified). Two endpoints are exposed:

   * `GET /healthz` – health check returning `ok`.
   * `POST /webhook` – LINE webhook endpoint. In development you can test it using `curl`:

     ```
     curl -X POST http://localhost:8080/webhook \
       -H 'Content-Type: application/json' \
       -H 'X-Line-Signature: <dummy signature>' \
       -d '{"events":[{"replyToken":"test","type":"message","message":{"type":"text","text":"ติดต่อ"}}]}'
     ```

     The dummy signature will be rejected, so when testing locally you may want to temporarily bypass signature validation or supply a valid signature from the LINE platform.

## Deployment on Google Cloud Run

The provided `cloudbuild.yaml` automates the build and deployment process via Cloud Build. Each push to the `main` branch triggers a pipeline that:

1. Ensures an Artifact Registry repository (`cloud-run-source-deploy` in `asia-southeast1`) exists.
2. Uses the Pack CLI with Google Buildpacks to build a container image from the source and pushes it to Artifact Registry.
3. Deploys the image to Cloud Run as service `line-gatekeeper` in region `asia-southeast1`.

### One‑time setup

1. **Enable required APIs** in your project:

   ```
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
   ```

2. **Create or verify** the Artifact Registry repository. The build pipeline will do this automatically, but you can create it manually:

   ```
   gcloud artifacts repositories create cloud-run-source-deploy \
     --location=asia-southeast1 \
     --repository-format=docker \
     --description="Repository for Cloud Run source deployments"
   ```

3. **Create a build/deploy service account** (optional but recommended). Grant it the following roles:

   * Cloud Build Service Account (`roles/cloudbuild.builds.editor`)
   * Cloud Run Admin (`roles/run.admin`)
   * Artifact Registry Writer (`roles/artifactregistry.writer`)
   * Service Account User on the Cloud Run runtime service account

   Then update the `_DEPLOYER_SA` substitution in `cloudbuild.yaml` or configure it in the Cloud Build trigger variables.

4. **Create a Cloud Build trigger** from the Google Cloud Console or via CLI:

   ```
   gcloud beta builds triggers create github \
     --name=line-gatekeeper-trigger \
     --repo-name=<REPO_NAME> \
     --repo-owner=<GITHUB_OWNER> \
     --branch-pattern=^main$ \
     --build-config=cloudbuild.yaml \
     --substitutions=_DEPLOYER_SA=<your-deployer-sa@PROJECT_ID.iam.gserviceaccount.com>,_SERVICE_NAME=line-gatekeeper \
     --included-files='**'
   ```

   Ensure you set **logging** to **CLOUD_LOGGING_ONLY** in the trigger advanced settings when using a custom service account.

5. After the first deployment, open the Cloud Run service in the console and **add all required environment variables** (the ones listed above) via the **Variables & Secrets** tab. Restart the service to apply the changes.

### Configuring the LINE webhook

In the LINE Developers console:

1. Navigate to your channel and open the **Messaging API** settings.
2. Enable the webhook and set the **Webhook URL** to:

       https://<your-cloud-run-service-url>/webhook

3. Verify the connection; you should see a `200 OK` when calling `/healthz`.
4. Fill in the channel secret and access token in the **Basic settings** and **Messaging API** sections respectively.

## Testing the bot

With the service deployed and environment variables configured, you should be able to send the following Thai messages to your LINE Official Account and observe the responses:

| Message                               | Expected behaviour                                                 |
|---------------------------------------|--------------------------------------------------------------------|
| `ติดต่อ` or `contact`                | Receive a Flex message with “โทรหา”, “อีเมล” and “รอการตอบกลับข้อความ”. |
| `แจ้งเตือน` or similar               | Bot acknowledges receipt and admin receives a notification.         |
| A brief specifying platform, format and asset type | Bot returns an estimated price.                             |

If some details are missing from a quote request, the bot politely asks for the missing information in Thai before proceeding.

---

For any questions or issues please contact the repository maintainer.
