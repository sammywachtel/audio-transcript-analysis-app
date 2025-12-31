#!/bin/bash

# Enhanced Development Environment Setup with Optional Quality Gates
# Supports both basic setup and comprehensive quality gates

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
WITH_QUALITY_GATES=false
BASIC_SETUP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --with-quality-gates)
      WITH_QUALITY_GATES=true
      shift
      ;;
    --basic)
      BASIC_SETUP=true
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --with-quality-gates    Enable comprehensive quality gates (recommended)"
      echo "  --basic                 Basic setup without quality gates"
      echo "  --help                  Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                      # Interactive setup (will prompt for quality gates)"
      echo "  $0 --with-quality-gates # Automatic setup with quality gates"
      echo "  $0 --basic              # Basic setup only"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_header() {
    echo ""
    print_status $BLUE "🔧 $1"
    echo "----------------------------------------"
}

# Interactive prompt if no flags specified
if [[ "$WITH_QUALITY_GATES" == false ]] && [[ "$BASIC_SETUP" == false ]]; then
    echo ""
    print_status $BLUE "🚀 FULLSTACK PROJECT DEVELOPMENT SETUP"
    echo ""
    print_status $YELLOW "Choose your setup type:"
    echo ""
    print_status $GREEN "1. 🛡️  COMPREHENSIVE (Recommended)"
    print_status $BLUE "   • Strict quality gates and linting"
    print_status $BLUE "   • Pre-commit hooks prevent bad commits"
    print_status $BLUE "   • Zero lint errors reach CI/CD"
    print_status $BLUE "   • Perfect for production projects"
    echo ""
    print_status $YELLOW "2. 📦 BASIC"
    print_status $BLUE "   • Standard development setup"
    print_status $BLUE "   • Basic pre-commit hooks only"
    print_status $BLUE "   • Good for prototyping/learning"
    echo ""
    read -p "Select setup type (1 for Comprehensive, 2 for Basic): " choice

    case $choice in
        1)
            WITH_QUALITY_GATES=true
            print_status $GREEN "✅ Comprehensive setup selected!"
            ;;
        2)
            BASIC_SETUP=true
            print_status $YELLOW "📦 Basic setup selected"
            ;;
        *)
            print_status $RED "Invalid choice. Defaulting to Comprehensive setup."
            WITH_QUALITY_GATES=true
            ;;
    esac
fi

main() {
    if [[ "$WITH_QUALITY_GATES" == true ]]; then
        print_status $BLUE "🚀 SETTING UP COMPREHENSIVE DEVELOPMENT ENVIRONMENT"
        print_status $BLUE "This includes strict quality gates and pre-commit hooks"
    else
        print_status $BLUE "🚀 SETTING UP BASIC DEVELOPMENT ENVIRONMENT"
    fi
    echo ""

    # Check prerequisites
    print_header "CHECKING PREREQUISITES"

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_status $RED "❌ Node.js is not installed. Please install Node.js 20+"
        exit 1
    else
        NODE_VERSION=$(node --version)
        print_status $GREEN "✅ Node.js found: $NODE_VERSION"
    fi

    # Check Python
    if ! command -v python3 &> /dev/null; then
        print_status $RED "❌ Python 3 is not installed. Please install Python 3.11+"
        exit 1
    else
        PYTHON_VERSION=$(python3 --version)
        print_status $GREEN "✅ Python found: $PYTHON_VERSION"

        # Virtual environment will be created automatically in backend/.venv
        print_status $BLUE "ℹ️  Virtual environment will be created in backend/.venv (Python 3.11+)"
    fi

    # Check npm (only if package.json exists or frontend directory exists)
    if [[ -f "package.json" || -d "frontend" ]]; then
        if ! command -v npm &> /dev/null; then
            print_status $RED "❌ npm is not installed (required for JavaScript/TypeScript projects)"
            exit 1
        else
            NPM_VERSION=$(npm --version)
            print_status $GREEN "✅ npm found: $NPM_VERSION"
        fi
    else
        print_status $BLUE "Python-only project detected - npm not required"
    fi

    # Install pre-commit (always needed)
    print_header "INSTALLING CORE TOOLS"

    if ! command -v pre-commit &> /dev/null; then
        print_status $BLUE "Installing pre-commit..."
        pip3 install pre-commit || pip install pre-commit
    else
        print_status $GREEN "✅ pre-commit already installed"
    fi

    # Install quality tools if comprehensive setup
    if [[ "$WITH_QUALITY_GATES" == true ]]; then
        print_status $BLUE "Installing quality gate tools..."

        # Install commitizen for conventional commits
        pip3 install commitizen || pip install commitizen

        # Install detect-secrets for security scanning
        pip3 install detect-secrets || pip install detect-secrets

        print_status $GREEN "✅ Quality gate tools installed"
    fi

    # Install root dependencies (only if package.json exists)
    if [[ -f "package.json" ]]; then
        print_header "INSTALLING ROOT DEPENDENCIES"
        print_status $BLUE "Installing root package dependencies..."
        npm install

        # Install ESLint if TypeScript files exist but ESLint is missing
        print_status $BLUE "Checking for linting tools..."
        if ls *.ts *.tsx components/**/*.tsx pages/**/*.tsx 2>/dev/null | head -1 >/dev/null; then
            # TypeScript files detected - ensure ESLint is installed
            if ! npm ls eslint 2>/dev/null | grep -q "eslint@"; then
                print_status $YELLOW "TypeScript detected but ESLint not installed - adding ESLint v9..."
                npm install --save-dev eslint@^9 @eslint/js @typescript-eslint/parser @typescript-eslint/eslint-plugin typescript-eslint

                # Determine config file extension (.mjs for CommonJS projects, .js for ESM)
                local eslint_config_file="eslint.config.mjs"
                if grep -q '"type".*:.*"module"' package.json 2>/dev/null; then
                    eslint_config_file="eslint.config.js"
                fi

                # Create ESLint v9 flat config if no config exists
                if [[ ! -f "eslint.config.js" && ! -f "eslint.config.mjs" && ! -f ".eslintrc.json" && ! -f ".eslintrc.js" ]]; then
                    print_status $BLUE "Creating ESLint v9 flat configuration..."
                    cat > "$eslint_config_file" << 'ESLINT_EOF'
// ESLint v9 Flat Configuration for TypeScript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Add custom rules here
    },
  },
);
ESLINT_EOF
                    print_status $GREEN "✅ Created $eslint_config_file (v9 flat config)"
                fi

                print_status $GREEN "✅ ESLint v9 installed and configured"
            else
                # ESLint already installed - check version and migrate if needed
                ESLINT_VERSION=$(npm ls eslint --depth=0 2>/dev/null | grep eslint@ | sed 's/.*@//' | cut -d' ' -f1)
                ESLINT_MAJOR=$(echo "$ESLINT_VERSION" | cut -d. -f1)

                if [[ "$ESLINT_MAJOR" -ge 9 ]]; then
                    print_status $GREEN "✅ ESLint v$ESLINT_VERSION already installed"

                    # Warn if using deprecated config format
                    if [[ -f ".eslintrc.json" || -f ".eslintrc.js" ]] && [[ ! -f "eslint.config.js" && ! -f "eslint.config.mjs" ]]; then
                        print_status $YELLOW "⚠️  ESLint v9 detected but using deprecated .eslintrc.* format"
                        print_status $YELLOW "    Config will be ignored! Generating flat config..."

                        # Determine config file extension
                        local eslint_config_file="eslint.config.mjs"
                        if grep -q '"type".*:.*"module"' package.json 2>/dev/null; then
                            eslint_config_file="eslint.config.js"
                        fi

                        cat > "$eslint_config_file" << 'ESLINT_EOF'
// ESLint v9 Flat Configuration for TypeScript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Add custom rules here
    },
  },
);
ESLINT_EOF
                        print_status $GREEN "✅ Migrated to $eslint_config_file (flat config)"
                        print_status $YELLOW "    You can now safely delete .eslintrc.* files"
                    else
                        print_status $GREEN "✅ Using ESLint v9 flat config"
                    fi
                else
                    print_status $GREEN "✅ ESLint v$ESLINT_VERSION already installed (legacy)"
                fi
            fi

            # Install Prettier if TypeScript files exist but Prettier is missing
            print_status $BLUE "Checking for code formatting tools..."
            if ! npm ls prettier 2>/dev/null | grep -q "prettier@"; then
                print_status $YELLOW "Prettier not installed - adding Prettier..."
                npm install --save-dev prettier prettier-plugin-tailwindcss
                print_status $GREEN "✅ Prettier installed with Tailwind plugin"
            else
                print_status $GREEN "✅ Prettier already installed"
            fi
        fi
    else
        print_status $BLUE "No package.json found - skipping npm dependencies (Python-only project)"
    fi

    # Install frontend dependencies
    print_header "INSTALLING FRONTEND DEPENDENCIES"
    if [[ -d "frontend" ]]; then
        cd frontend
        print_status $BLUE "Installing frontend dependencies..."
        npm ci

        # Check for ESLint in frontend directory
        if ls *.ts *.tsx src/**/*.tsx 2>/dev/null | head -1 >/dev/null; then
            if ! npm ls eslint 2>/dev/null | grep -q "eslint@"; then
                print_status $YELLOW "TypeScript detected in frontend but ESLint not installed - adding ESLint v9..."
                npm install --save-dev eslint@^9 @eslint/js @typescript-eslint/parser @typescript-eslint/eslint-plugin typescript-eslint

                # Determine config file extension (.mjs for CommonJS projects, .js for ESM)
                local eslint_config_file="eslint.config.mjs"
                if grep -q '"type".*:.*"module"' package.json 2>/dev/null; then
                    eslint_config_file="eslint.config.js"
                fi

                # Create ESLint v9 flat config if no config exists
                if [[ ! -f "eslint.config.js" && ! -f "eslint.config.mjs" && ! -f ".eslintrc.json" && ! -f ".eslintrc.js" ]]; then
                    cat > "$eslint_config_file" << 'ESLINT_EOF'
// ESLint v9 Flat Configuration for TypeScript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Add custom rules here
    },
  },
);
ESLINT_EOF
                    print_status $GREEN "✅ Created frontend/$eslint_config_file (v9 flat config)"
                fi

                print_status $GREEN "✅ ESLint v9 installed in frontend"
            else
                # Check version and migrate if needed (same logic as root)
                ESLINT_VERSION=$(npm ls eslint --depth=0 2>/dev/null | grep eslint@ | sed 's/.*@//' | cut -d' ' -f1)
                ESLINT_MAJOR=$(echo "$ESLINT_VERSION" | cut -d. -f1)

                if [[ "$ESLINT_MAJOR" -ge 9 ]]; then
                    if [[ -f ".eslintrc.json" || -f ".eslintrc.js" ]] && [[ ! -f "eslint.config.js" && ! -f "eslint.config.mjs" ]]; then
                        print_status $YELLOW "⚠️  ESLint v9 detected but using deprecated config - migrating..."

                        # Determine config file extension
                        local eslint_config_file="eslint.config.mjs"
                        if grep -q '"type".*:.*"module"' package.json 2>/dev/null; then
                            eslint_config_file="eslint.config.js"
                        fi

                        cat > "$eslint_config_file" << 'ESLINT_EOF'
// ESLint v9 Flat Configuration for TypeScript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Add custom rules here
    },
  },
);
ESLINT_EOF
                        print_status $GREEN "✅ Migrated frontend to $eslint_config_file"
                    fi
                fi
            fi

            # Install Prettier if TypeScript files exist but Prettier is missing
            print_status $BLUE "Checking for code formatting tools..."
            if ! npm ls prettier 2>/dev/null | grep -q "prettier@"; then
                print_status $YELLOW "Prettier not installed in frontend - adding Prettier..."
                npm install --save-dev prettier prettier-plugin-tailwindcss
                print_status $GREEN "✅ Prettier installed in frontend with Tailwind plugin"
            else
                print_status $GREEN "✅ Prettier already installed in frontend"
            fi
        fi

        print_status $GREEN "✅ Frontend dependencies installed"
        cd ..
    fi

    # Install backend dependencies
    print_header "INSTALLING BACKEND DEPENDENCIES"
    if [[ -d "backend" ]]; then
        cd backend

        # Create and activate Python virtual environment
        if [[ ! -d ".venv" ]]; then
            print_status $BLUE "Creating Python virtual environment (.venv)..."
            python3 -m venv .venv
            print_status $GREEN "✅ Virtual environment created in backend/.venv"
        else
            print_status $GREEN "✅ Virtual environment already exists in backend/.venv"
        fi

        print_status $BLUE "Activating virtual environment..."
        source .venv/bin/activate

        # Verify we're in the virtual environment
        print_status $GREEN "✅ Virtual environment active: $(which python)"

        print_status $BLUE "Installing backend dependencies..."

        # Install requirements using the virtual environment's pip
        if [[ -f "requirements.txt" ]]; then
            pip install -r requirements.txt
        fi

        if [[ "$WITH_QUALITY_GATES" == true ]]; then
            # Install quality tools in virtual environment
            print_status $BLUE "Installing backend quality tools..."
            pip install black isort flake8 mypy
        fi

        print_status $GREEN "✅ Backend dependencies installed in virtual environment"
        cd ..
    fi

    # Configure git and pre-commit hooks
    print_header "CONFIGURING DEVELOPMENT WORKFLOW"

    if [[ "$WITH_QUALITY_GATES" == true ]]; then
        # Set up git commit message template if exists
        if [[ -f ".gitmessage" ]]; then
            git config commit.template .gitmessage
            print_status $GREEN "✅ Git commit message template configured"
        fi

        # Create initial secrets baseline if detect-secrets config exists
        if [[ -f ".pre-commit-config.yaml" ]] && grep -q "detect-secrets" .pre-commit-config.yaml; then
            if [[ ! -f ".secrets.baseline" ]]; then
                print_status $BLUE "Creating secrets baseline..."
                detect-secrets scan . > .secrets.baseline 2>/dev/null || echo '{}' > .secrets.baseline
                print_status $GREEN "✅ Secrets baseline created"
            fi
        fi

        # Make quality gate script executable if it exists
        if [[ -f "scripts/quality-gate.sh" ]]; then
            chmod +x scripts/quality-gate.sh
            print_status $GREEN "✅ Quality gate script configured"
        fi
    fi

    # Install pre-commit hooks
    print_status $BLUE "Installing pre-commit hooks..."
    pre-commit install

    if [[ "$WITH_QUALITY_GATES" == true ]]; then
        # Install commit-msg hook for conventional commits
        pre-commit install --hook-type commit-msg
        print_status $GREEN "✅ Comprehensive pre-commit hooks installed"
    else
        print_status $GREEN "✅ Basic pre-commit hooks installed"
    fi

    # Run initial setup verification
    print_header "VERIFYING SETUP"

    # Test pre-commit
    if pre-commit --version &> /dev/null; then
        print_status $GREEN "✅ Pre-commit installed successfully"
    else
        print_status $RED "❌ Pre-commit installation failed"
        exit 1
    fi

    # Test frontend tools (non-failing)
    if [[ -d "frontend" ]]; then
        cd frontend
        print_status $BLUE "Testing frontend tools..."
        if npm run lint &> /dev/null; then
            print_status $GREEN "✅ Frontend linting works"
        else
            print_status $YELLOW "⚠️  Frontend has linting issues (normal for new projects)"
        fi

        if npx tsc --noEmit &> /dev/null; then
            print_status $GREEN "✅ TypeScript compilation works"
        else
            print_status $YELLOW "⚠️  TypeScript has compilation issues"
        fi
        cd ..
    fi

    # Final success message
    echo ""
    echo "========================================"
    if [[ "$WITH_QUALITY_GATES" == true ]]; then
        print_status $GREEN "🎉 COMPREHENSIVE DEVELOPMENT ENVIRONMENT SETUP COMPLETE!"
        echo ""
        print_status $BLUE "🚨 QUALITY GATES NOW ACTIVE:"
        print_status $YELLOW "• All commits MUST pass strict quality checks"
        print_status $YELLOW "• ESLint errors will block commits"
        print_status $YELLOW "• TypeScript errors will block commits"
        print_status $YELLOW "• Python formatting/linting will block commits"
        print_status $YELLOW "• Security issues will block commits"
        echo ""
        print_status $BLUE "🛠️  QUALITY COMMANDS:"
        print_status $BLUE "• npm run quality:gate         # Run all quality checks"
        print_status $BLUE "• npm run quality:frontend     # Check frontend only"
        print_status $BLUE "• npm run quality:backend      # Check backend only"
        print_status $BLUE "• npm run quality:precommit    # Run pre-commit hooks"
        echo ""
        print_status $BLUE "📋 RECOMMENDED WORKFLOW:"
        print_status $BLUE "1. Make your changes"
        print_status $BLUE "2. Run 'npm run quality:gate' to check everything"
        print_status $BLUE "3. Fix any issues reported"
        print_status $BLUE "4. Commit (hooks will run automatically and MUST pass)"
        print_status $BLUE "5. Push (CI/CD will validate again)"
        echo ""
        print_status $GREEN "Quality gates ensure zero lint errors reach CI/CD! 🚀"
    else
        print_status $GREEN "🎉 BASIC DEVELOPMENT ENVIRONMENT SETUP COMPLETE!"
        echo ""
        print_status $BLUE "📋 STANDARD WORKFLOW:"
        print_status $BLUE "1. Make your changes"
        print_status $BLUE "2. Run tests and linting manually"
        print_status $BLUE "3. Commit (basic hooks will run)"
        print_status $BLUE "4. Push to deploy"
        echo ""
        print_status $YELLOW "💡 Want quality gates? Run: ./add-quality-gates.sh"
    fi

    echo ""
    print_status $BLUE "📖 STANDARD COMMANDS:"
    print_status $BLUE "• npm run dev                   # Start frontend and backend servers"
    print_status $BLUE "• npm test                      # Run frontend tests"
    print_status $BLUE "• npm run lint                  # Run linting checks"
    print_status $BLUE "• pre-commit run --all-files    # Run all hooks manually"
    echo ""
    print_status $BLUE "📖 See DEVELOPMENT.md for detailed workflow information"
}

main "$@"
