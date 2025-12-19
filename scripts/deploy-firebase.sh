#!/bin/bash
# =============================================================================
# Firebase Deployment Script
#
# Deploys Firebase components (rules, functions) to the configured project.
# This script is designed to be run both locally and in CI/CD.
#
# Usage:
#   ./scripts/deploy-firebase.sh              # Deploy everything
#   ./scripts/deploy-firebase.sh --rules-only # Deploy only security rules
#   ./scripts/deploy-firebase.sh --functions  # Deploy only Cloud Functions
#   ./scripts/deploy-firebase.sh --dry-run    # Show what would be deployed
# =============================================================================

set -e

# Colors (disabled in CI)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
DEPLOY_RULES=true
DEPLOY_FUNCTIONS=true
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --rules-only)
            DEPLOY_FUNCTIONS=false
            shift
            ;;
        --functions)
            DEPLOY_RULES=false
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --rules-only    Deploy only Firestore and Storage rules"
            echo "  --functions     Deploy only Cloud Functions"
            echo "  --dry-run       Show what would be deployed without deploying"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Load environment
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-audio-transcript-app-67465}"

echo ""
echo "=============================================="
echo "  Firebase Deployment"
echo "  Project: ${PROJECT_ID}"
echo "=============================================="
echo ""

# Check if we're in CI environment
if [ -n "$CI" ]; then
    log_info "Running in CI environment"

    # In CI, we use the service account key from secrets
    if [ -n "$FIREBASE_SERVICE_ACCOUNT" ]; then
        log_info "Using service account from FIREBASE_SERVICE_ACCOUNT"
        echo "$FIREBASE_SERVICE_ACCOUNT" > /tmp/firebase-sa.json
        export GOOGLE_APPLICATION_CREDENTIALS="/tmp/firebase-sa.json"
    fi
fi

# -----------------------------------------------------------------------------
# Verify Firebase CLI
# -----------------------------------------------------------------------------
if ! command -v npx &> /dev/null; then
    log_error "npx not found. Please install Node.js."
    exit 1
fi

# -----------------------------------------------------------------------------
# Set project
# -----------------------------------------------------------------------------
log_info "Setting Firebase project..."
npx firebase use "${PROJECT_ID}" || {
    log_error "Failed to set project. Are you logged in?"
    log_info "Run: npx firebase login"
    exit 1
}

# -----------------------------------------------------------------------------
# Build Functions
# -----------------------------------------------------------------------------
if [ "$DEPLOY_FUNCTIONS" = true ]; then
    log_info "Building Cloud Functions..."
    cd functions
    npm ci --production=false
    npm run build
    cd ..
    log_success "Cloud Functions built"
fi

# -----------------------------------------------------------------------------
# Deploy
# -----------------------------------------------------------------------------
if [ "$DRY_RUN" = true ]; then
    log_warning "DRY RUN - Would deploy:"
    [ "$DEPLOY_RULES" = true ] && echo "  - Firestore rules (firestore.rules)"
    [ "$DEPLOY_RULES" = true ] && echo "  - Storage rules (storage.rules)"
    [ "$DEPLOY_RULES" = true ] && echo "  - Firestore indexes (firestore.indexes.json)"
    [ "$DEPLOY_FUNCTIONS" = true ] && echo "  - Cloud Functions (functions/)"
    exit 0
fi

# Build deployment targets
TARGETS=""

if [ "$DEPLOY_RULES" = true ]; then
    TARGETS="firestore:rules,firestore:indexes,storage"
fi

if [ "$DEPLOY_FUNCTIONS" = true ]; then
    if [ -n "$TARGETS" ]; then
        TARGETS="${TARGETS},functions"
    else
        TARGETS="functions"
    fi
fi

log_info "Deploying: ${TARGETS}"

npx firebase deploy --only "${TARGETS}" --force

# Cleanup CI artifacts
if [ -f "/tmp/firebase-sa.json" ]; then
    rm /tmp/firebase-sa.json
fi

echo ""
log_success "Deployment complete!"
echo ""
