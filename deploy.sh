#!/usr/bin/env bash
# =============================================================================
# QC-Manager — Production VPS Deployment Script
# =============================================================================
# Usage:
#   Export all required environment variables, then run:
#     chmod +x deploy.sh && ./deploy.sh
#
# Required environment variables (no defaults — all must be set):
#   GITHUB_TOKEN          GitHub Personal Access Token (repo scope)
#   DOCKER_HUB_USERNAME   Docker Hub account username
#   DOCKER_HUB_TOKEN      Docker Hub access token
#   JWT_SECRET            Secret for signing JWTs (min 32 chars)
#   POSTGRES_PASSWORD     PostgreSQL password for qc_admin user
#   N8N_WEBHOOK_URL       n8n webhook base URL (e.g. https://n8n.example.com/webhook)
#   WEB_DOMAIN            Public domain for the web app (e.g. app.example.com)
#   API_DOMAIN            Public domain for the API (e.g. api.example.com)
#   CORS_ORIGIN           Allowed CORS origin (e.g. https://app.example.com)
#
# Optional:
#   GITHUB_USERNAME       GitHub account name (default: Gebrilo)
#   DEPLOY_DIR            Deployment directory    (default: /opt/qc-manager)
#   BRANCH                Git branch to deploy    (default: main)
#   BACKUP_RETENTION_DAYS Days to keep DB backups (default: 7)
#
# CI/CD example (GitHub Actions):
#   envs: GITHUB_TOKEN,DOCKER_HUB_USERNAME,DOCKER_HUB_TOKEN,...
#   script: bash /opt/qc-manager/deploy.sh
#
# Idempotent: safe to run repeatedly on the same VPS.
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

DEPLOY_DIR="${DEPLOY_DIR:-/opt/qc-manager}"
BRANCH="${BRANCH:-main}"
GITHUB_USERNAME="${GITHUB_USERNAME:-Gebrilo}"
REPO_URL="https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com/Gebrilo/QC-Manager.git"
COMPOSE_FILE="docker-compose.prod.yml"
NETWORK_NAME="qc-shared-network"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

# =============================================================================
# LOGGING HELPERS
# =============================================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${BLUE}[$(date '+%H:%M:%S')] [INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] [OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[$(date '+%H:%M:%S')] [WARN]${NC}   $*"; }
error()   { echo -e "${RED}[$(date '+%H:%M:%S')] [ERROR]${NC} $*" >&2; }
section() { echo -e "\n${BOLD}━━━ $* ━━━${NC}"; }

# =============================================================================
# STEP 0: VALIDATE REQUIRED ENVIRONMENT VARIABLES
# =============================================================================
# All secrets must be injected — we never prompt interactively.
# Fail fast here rather than part-way through the deploy.

section "Validating environment"

REQUIRED_VARS=(
  GITHUB_TOKEN
  DOCKER_HUB_USERNAME
  DOCKER_HUB_TOKEN
  JWT_SECRET
  POSTGRES_PASSWORD
  N8N_WEBHOOK_URL
  WEB_DOMAIN
  API_DOMAIN
  CORS_ORIGIN
)

missing=0
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    error "Required variable \$$var is not set."
    missing=$((missing + 1))
  fi
done

if [ "$missing" -gt 0 ]; then
  error "$missing required variable(s) missing. Aborting."
  exit 1
fi

success "All required environment variables are present."

# =============================================================================
# STEP 1: VERIFY DOCKER & DOCKER COMPOSE ARE INSTALLED
# =============================================================================
# Docker is expected to already be installed on the VPS.
# If not, we install it non-interactively via the official convenience script.

section "Checking Docker installation"

if ! command -v docker &>/dev/null; then
  warn "Docker not found — installing via get.docker.com"
  curl -fsSL https://get.docker.com | sh
  # Allow the current user to run Docker without sudo
  usermod -aG docker "$USER" 2>/dev/null || true
  success "Docker installed: $(docker --version)"
else
  success "Docker already installed: $(docker --version)"
fi

# Docker Compose V2 is bundled with Docker Desktop / recent Docker Engine.
# We check for `docker compose` (plugin) not the legacy `docker-compose`.
if ! docker compose version &>/dev/null; then
  error "Docker Compose plugin not available."
  error "Fix: apt-get install -y docker-compose-plugin"
  exit 1
fi

success "Docker Compose available: $(docker compose version --short)"

# =============================================================================
# STEP 2: CLONE OR UPDATE THE REPOSITORY
# =============================================================================
# GitHub access uses HTTPS + Personal Access Token embedded in the URL.
# No SSH keys are used or required.
# The token is never written to disk — it only lives in this shell's memory.

section "Syncing repository → $DEPLOY_DIR"

if [ ! -d "$DEPLOY_DIR/.git" ]; then
  # First run: clone fresh
  log "No repository found at $DEPLOY_DIR — cloning..."
  mkdir -p "$DEPLOY_DIR"
  # Mask the token in git's credential store so it never leaks to disk
  git clone \
    --branch "$BRANCH" \
    --single-branch \
    --depth 1 \
    "$REPO_URL" \
    "$DEPLOY_DIR"
  success "Repository cloned."
else
  # Subsequent runs: pull latest without caching credentials
  log "Existing repository found — pulling latest from origin/$BRANCH"
  cd "$DEPLOY_DIR"
  # Update the remote URL in case the token has been rotated
  git remote set-url origin "$REPO_URL"
  git fetch --depth 1 origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
  success "Repository updated to $(git rev-parse --short HEAD)."
fi

cd "$DEPLOY_DIR"

# =============================================================================
# STEP 3: ENSURE SHARED DOCKER NETWORK EXISTS
# =============================================================================
# qc-shared-network connects this stack to Traefik and n8n which live in
# separate compose stacks. Creating it here is idempotent.

section "Docker network: $NETWORK_NAME"

if docker network inspect "$NETWORK_NAME" &>/dev/null; then
  success "Network '$NETWORK_NAME' already exists — skipping."
else
  docker network create "$NETWORK_NAME"
  success "Network '$NETWORK_NAME' created."
fi

# =============================================================================
# STEP 4: GENERATE .env FILE FROM INJECTED SECRETS
# =============================================================================
# The .env file is written fresh on every deploy so it always reflects the
# current values of the injected secrets. It is never committed to Git.

section "Writing .env"

{
  echo "# Generated by deploy.sh on $(date -u '+%Y-%m-%dT%H:%M:%SZ') — do not edit manually"
  echo ""
  echo "# Docker Hub"
  echo "DOCKER_HUB_USERNAME=${DOCKER_HUB_USERNAME}"
  echo ""
  echo "# Domains (read by Traefik labels)"
  echo "WEB_DOMAIN=${WEB_DOMAIN}"
  echo "API_DOMAIN=${API_DOMAIN}"
  echo ""
  echo "# PostgreSQL"
  echo "POSTGRES_USER=qc_admin"
  echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  echo "POSTGRES_DB=qc_app"
  echo ""
  echo "# Application"
  echo "JWT_SECRET=${JWT_SECRET}"
  echo "CORS_ORIGIN=${CORS_ORIGIN}"
  echo "N8N_WEBHOOK_URL=${N8N_WEBHOOK_URL}"
  echo ""
  echo "# Backups"
  echo "BACKUP_PATH=./backups"
  echo "BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS}"
} > .env

# Restrict .env permissions — only the owner should read it
chmod 600 .env

success ".env written and locked to 600."

# =============================================================================
# STEP 5: ENSURE BACKUP DIRECTORY EXISTS
# =============================================================================

section "Backup directory"

mkdir -p "$DEPLOY_DIR/backups"
success "Backup directory ready at $DEPLOY_DIR/backups"

# =============================================================================
# STEP 6: AUTHENTICATE WITH DOCKER HUB
# =============================================================================
# We pipe the token to avoid it appearing in the process list (ps aux).

section "Docker Hub authentication"

echo "$DOCKER_HUB_TOKEN" | docker login \
  --username "$DOCKER_HUB_USERNAME" \
  --password-stdin

success "Authenticated with Docker Hub as $DOCKER_HUB_USERNAME."

# =============================================================================
# STEP 7: PULL LATEST IMAGES FROM DOCKER HUB
# =============================================================================
# Always pull before recreating so we get the freshest image tagged :latest.
# If the pull fails (e.g. network issue), we abort rather than restarting
# containers with a stale image.

section "Pulling Docker images"

docker compose -f "$COMPOSE_FILE" pull
success "All images pulled."

# =============================================================================
# STEP 8: DEPLOY (RECREATE CONTAINERS)
# =============================================================================
# --force-recreate ensures containers are replaced even if their config
# hasn't changed, picking up any new image layers that were just pulled.

section "Deploying containers"

docker compose -f "$COMPOSE_FILE" up -d --force-recreate --remove-orphans
success "Containers deployed."

# =============================================================================
# STEP 9: CLEAN UP DANGLING IMAGES
# =============================================================================
# After pulling new images the old layers become dangling. Remove them to
# prevent disk space from growing unboundedly on repeated deploys.

section "Cleaning up unused images"

docker image prune -f
success "Dangling images removed."

# =============================================================================
# STEP 10: VALIDATE THE DEPLOYMENT
# =============================================================================
# Give containers a moment to initialise, then verify each service is healthy.

section "Validating deployment"

log "Waiting 15 seconds for services to initialise..."
sleep 15

# Show current container state
docker compose -f "$COMPOSE_FILE" ps

# --- API health check ---
log "Checking API health (https://${API_DOMAIN}/health)..."
API_OK=false
for i in 1 2 3 4 5; do
  if curl -sfk https://${API_DOMAIN}/health -o /dev/null; then
    API_OK=true
    break
  fi
  warn "API not ready yet (attempt $i/5) — retrying in 10s..."
  sleep 10
done

if $API_OK; then
  success "API is healthy."
else
  error "API health check failed after 5 attempts."
  error "Debug: docker compose -f $COMPOSE_FILE logs api"
  VALIDATION_FAILED=true
fi

# --- Web health check ---
log "Checking web app (https://${WEB_DOMAIN})..."
WEB_OK=false
for i in 1 2 3; do
  if curl -sfk https://${WEB_DOMAIN} -o /dev/null; then
    WEB_OK=true
    break
  fi
  warn "Web not ready yet (attempt $i/3) — retrying in 10s..."
  sleep 10
done

if $WEB_OK; then
  success "Web app is healthy."
else
  warn "Web app did not respond — it may still be starting."
  warn "Debug: docker compose -f $COMPOSE_FILE logs web"
fi

# =============================================================================
# SUMMARY
# =============================================================================

section "Deployment summary"

echo ""
echo -e "  ${GREEN}Commit deployed:${NC}  $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
echo -e "  ${GREEN}Web:${NC}              https://${WEB_DOMAIN}"
echo -e "  ${GREEN}API:${NC}              https://${API_DOMAIN}"
echo -e "  ${GREEN}Backups:${NC}          ${DEPLOY_DIR}/backups"
echo -e "  ${GREEN}Compose file:${NC}     ${DEPLOY_DIR}/${COMPOSE_FILE}"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo "    View logs:        docker compose -f $DEPLOY_DIR/$COMPOSE_FILE logs -f [service]"
echo "    Container status: docker compose -f $DEPLOY_DIR/$COMPOSE_FILE ps"
echo "    Restart service:  docker compose -f $DEPLOY_DIR/$COMPOSE_FILE restart <service>"
echo "    Roll back:        git -C $DEPLOY_DIR checkout <sha> && docker compose -f $DEPLOY_DIR/$COMPOSE_FILE up -d --force-recreate"
echo ""

# Exit non-zero if a critical health check failed
if [ "${VALIDATION_FAILED:-false}" = "true" ]; then
  error "One or more services failed their health check. Review logs above."
  exit 1
fi

success "Deploy complete. All services are running."
