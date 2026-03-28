#!/bin/bash

# GitHub Setup Script for read-pal
# Run this after fixing .git directory permissions

echo "🚀 Setting up read-pal repository with GitHub..."

# Initialize git if needed
if [ ! -d .git ]; then
  git init
  echo "✅ Git repository initialized"
fi

# Add remote
git remote add origin git@github.com:pengdd1998/read-pal.git 2>/dev/null || echo "Remote already exists"

# Show remote
echo "📡 Git remote configured:"
git remote -v

# Stage all files
echo "📦 Staging files..."
git add .

# Create initial commit
echo "💾 Creating initial commit..."
git commit -m "Initial commit: read-pal AI Reading Companion

Features:
- Complete authentication system (JWT)
- Book upload and processing (EPUB/PDF)
- Beautiful reading interface with 3 themes
- Annotation system (highlights, notes, bookmarks)
- AI Companion chat integration
- Library management with progress tracking
- Responsive web design
- Complete API with Express + TypeScript
- Database models (PostgreSQL, Redis, Neo4j, Pinecone)

Tech Stack:
- Frontend: Next.js 14, TypeScript, TailwindCSS
- Backend: Express, TypeScript, Sequelize
- AI: Claude Agent SDK with Sonnet 4.6
- Databases: PostgreSQL, Redis, Neo4j, Pinecone
- Infrastructure: Docker Compose

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
"

# Set main branch
git branch -M main

echo ""
echo "✅ Repository ready!"
echo ""
echo "Next steps:"
echo "1. Review the commit: git log --oneline"
echo "2. Push to GitHub: git push -u origin main --force"
echo ""
echo "🎉 read-pal is ready for GitHub!"
