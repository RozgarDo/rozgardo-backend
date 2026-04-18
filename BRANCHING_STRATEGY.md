# Git Branching Strategy

## Overview
This project uses a structured branching strategy to manage code releases and development workflow.

## Branch Structure

### **main** (Production)
- **Purpose:** Production deployment branch
- **Deployment:** Linked to Vercel/Production environment
- **Rules:**
  - Only merge from `dev` via Pull Request
  - Requires code review before merge
  - Automatically deploys to production on merge
  - Always stable and production-ready code

### **dev** (Development)
- **Purpose:** Main development branch
- **Deployment:** Development/Staging environment
- **Rules:**
  - Accept PRs from `feature/*` branches
  - Code review required
  - Staging environment auto-deploys on merge
  - Integration testing environment

### **feature/\*** (Temporary Feature Branches)
- **Purpose:** Individual feature development
- **Naming Convention:** `feature/feature-name` or `feature/JIRA-123-feature-description`
- **Rules:**
  - Branch from: `dev`
  - Merge back to: `dev` via Pull Request
  - Delete after merge
  - Example: `feature/user-authentication`, `feature/job-search-filter`

## Workflow

### Creating a New Feature
```bash
# Update dev branch
git checkout dev
git pull origin dev

# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "Description of changes"

# Push to GitHub
git push -u origin feature/your-feature-name
```

### Merging to Development
1. Create Pull Request from `feature/*` to `dev`
2. Request code review
3. After approval, merge and delete branch
4. Changes are tested in staging environment

### Releasing to Production
1. Create Pull Request from `dev` to `main`
2. Code review (final check)
3. After approval, merge and delete `dev` branch
4. Changes automatically deploy to production

## Branch Protection Rules (Recommended)

### For `main` branch:
- ✅ Require pull request reviews
- ✅ Require status checks to pass
- ✅ Require branches to be up to date
- ✅ Require code reviews from code owners
- ✅ Enforce all conversations to be resolved

### For `dev` branch:
- ✅ Require pull request reviews (1-2 reviewers)
- ✅ Require status checks to pass
- ✅ Allow auto-merge if checks pass

## Current Branches
- `main` - Production (deployed to Vercel)
- `dev` - Development (deployed to Render)
- No `master` branch (deleted)

## Environment Mapping
| Branch | Environment | URL |
|--------|-------------|-----|
| main | Production | https://rozgardo-frontend.vercel.app (Frontend) |
| main | Production | https://rozgardo-backend.onrender.com (Backend) |
| dev | Development/Staging | - |

---
**Last Updated:** April 18, 2026
