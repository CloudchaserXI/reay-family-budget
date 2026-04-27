#!/bin/bash
# ─────────────────────────────────────────────
#  Reay Family Budget — One-command deploy
#  Run from this folder: bash deploy.sh
# ─────────────────────────────────────────────

echo "🏡 Reay Family Budget — deploying to Vercel..."

# Install Vercel CLI if not present
if ! command -v vercel &> /dev/null; then
  echo "Installing Vercel CLI..."
  npm install -g vercel
fi

# Deploy (first run will prompt for login + project setup)
vercel --prod

echo "✅ Done! Your app is live."
