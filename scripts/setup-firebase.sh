#!/bin/bash
# =============================================================================
# Firebase Developer Onboarding Script
#
# Use this script to set up a DEVELOPER MACHINE for an EXISTING Firebase project.
# This handles local authentication and configuration.
#
# For creating a NEW project from scratch, use: ./scripts/gcp-setup.sh
#
# What this script does:
# - Authenticates you with Firebase CLI
# - Sets the active project
# - Guides you through enabling required services
# - Sets up the Gemini API secret
# - Builds and optionally deploys Cloud Functions
#
# Run this once when joining the project or setting up a new machine.
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Load environment variables
if [ -f ".env" ]; then
    log_info "Loading environment from .env..."
    set -a
    source .env
    set +a
fi

PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-audio-transcript-app-67465}"

echo ""
echo "=============================================="
echo "  Firebase Initial Setup"
echo "  Project: ${PROJECT_ID}"
echo "=============================================="
echo ""

# -----------------------------------------------------------------------------
# Step 1: Check Firebase CLI
# -----------------------------------------------------------------------------
log_info "Checking Firebase CLI installation..."

if ! command -v npx &> /dev/null; then
    log_error "npx not found. Please install Node.js first."
    exit 1
fi

# Check if firebase-tools is installed
if ! npm list firebase-tools --depth=0 &> /dev/null; then
    log_info "Installing firebase-tools..."
    npm install -D firebase-tools
fi

log_success "Firebase CLI available"

# -----------------------------------------------------------------------------
# Step 2: Authenticate with Firebase
# -----------------------------------------------------------------------------
log_info "Checking Firebase authentication..."

# Try to get current user
CURRENT_USER=$(npx firebase login:list 2>/dev/null | grep -o '[^ ]*@[^ ]*' | head -1 || echo "")

if [ -z "$CURRENT_USER" ]; then
    log_warning "Not logged in to Firebase"
    log_info "Opening browser for Firebase login..."
    npx firebase login
else
    log_success "Logged in as: ${CURRENT_USER}"
fi

# -----------------------------------------------------------------------------
# Step 3: Set the active project
# -----------------------------------------------------------------------------
log_info "Setting active Firebase project..."

npx firebase use "${PROJECT_ID}" 2>/dev/null || {
    log_warning "Project not found in firebase use. Adding it..."
    npx firebase use --add "${PROJECT_ID}"
}

log_success "Active project: ${PROJECT_ID}"

# -----------------------------------------------------------------------------
# Step 4: Check/Enable required services
# -----------------------------------------------------------------------------
echo ""
log_info "Checking required Firebase services..."
echo ""

echo "The following services need to be enabled in Firebase Console:"
echo ""
echo "  1. Firestore Database"
echo "     → https://console.firebase.google.com/project/${PROJECT_ID}/firestore"
echo ""
echo "  2. Firebase Storage"
echo "     → https://console.firebase.google.com/project/${PROJECT_ID}/storage"
echo ""
echo "  3. Cloud Functions (requires Blaze plan for external API calls)"
echo "     → https://console.firebase.google.com/project/${PROJECT_ID}/functions"
echo ""

read -p "Have you enabled these services? (y/n): " services_enabled

if [ "$services_enabled" != "y" ]; then
    log_warning "Please enable the required services before continuing."
    log_info "After enabling, run this script again."
    exit 1
fi

# -----------------------------------------------------------------------------
# Step 5: Set up Gemini API key secret
# -----------------------------------------------------------------------------
echo ""
log_info "Setting up Cloud Functions secrets..."

# Check if GEMINI_API_KEY is set
if [ -z "$GEMINI_API_KEY" ]; then
    log_warning "GEMINI_API_KEY not found in environment"
    read -p "Enter your Gemini API key: " GEMINI_API_KEY
fi

if [ -n "$GEMINI_API_KEY" ]; then
    log_info "Setting GEMINI_API_KEY secret..."
    echo "$GEMINI_API_KEY" | npx firebase functions:secrets:set GEMINI_API_KEY
    log_success "Secret set successfully"
else
    log_warning "No Gemini API key provided. Cloud Functions won't work without it."
fi

# -----------------------------------------------------------------------------
# Step 6: Install Cloud Functions dependencies
# -----------------------------------------------------------------------------
log_info "Installing Cloud Functions dependencies..."

cd functions
npm install
npm run build
cd ..

log_success "Cloud Functions built successfully"

# -----------------------------------------------------------------------------
# Step 7: Deploy Firebase components
# -----------------------------------------------------------------------------
echo ""
log_info "Ready to deploy Firebase components"
echo ""

read -p "Deploy security rules and Cloud Functions now? (y/n): " deploy_now

if [ "$deploy_now" = "y" ]; then
    log_info "Deploying Firestore rules..."
    npx firebase deploy --only firestore:rules

    log_info "Deploying Storage rules..."
    npx firebase deploy --only storage

    log_info "Deploying Cloud Functions..."
    npx firebase deploy --only functions

    log_success "All Firebase components deployed!"
else
    log_info "Skipping deployment. Run ./scripts/deploy-firebase.sh when ready."
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
log_success "Firebase setup complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Set VITE_USE_FIRESTORE=true in .env to enable cloud mode"
echo "  2. Run 'npm run dev' to start the app"
echo "  3. Test uploading a conversation"
echo ""
echo "For CI/CD deployment, ensure these GitHub Secrets are set:"
echo "  - FIREBASE_SERVICE_ACCOUNT (JSON key for service account)"
echo "  - GEMINI_API_KEY (for Cloud Functions)"
echo ""
