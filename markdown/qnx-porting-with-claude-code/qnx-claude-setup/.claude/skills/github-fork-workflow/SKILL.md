---
name: github-fork-workflow
description: Complete workflow for creating pull requests using the fork-based method required by Elliott's QNX porting team. Covers forking, SSH setup, branch naming, pushing changes, and opening PRs on GitHub.
---

# GitHub Fork-Based Pull Request Workflow

## Overview
This skill provides guidance for creating pull requests (PRs) using the fork-based workflow required by Elliott's QNX porting team. This workflow keeps the main repository clean by having contributors work from personal forks rather than creating branches directly on the main repo.

## Core Workflow Principles

### Fork Structure
- **One fork per repository per user**: Each developer maintains a single fork of each main repo (e.g., `emazzucabb/gtk3`)
- **Fork persists after merging**: Forks are permanent workspaces, not disposable
- **Multiple branches per fork**: Create as many branches as needed for different PRs
- **Fork naming**: Should match the main repo name (e.g., fork `gtk3` as `gtk3`, not `gtk3-fix-bug`)

### Branch Naming
- **Descriptive but concise**: Describe what the branch does, not what repo it's for
- **Optional prefixes**: Team may use `fix/`, `feature/`, `bugfix/`, `hotfix/`, `docs/`, `refactor/`
- **Examples**:
  - Good: `fix-maximize-bug`, `fix/maximize-bug`, `add-wayland-support`
  - Bad: `gtk3-fix-maximize-bug` (redundant when fork is already `gtk3`)

## Step-by-Step Workflow

### 1. Fork the Repository (One Time Per Repo)

**On GitHub:**
1. Navigate to the main repository
2. Click "Fork" button (top right)
3. This creates `yourusername/repo-name` in your account
4. **Important**: Fork name should match the main repo name

**If you need to rename a fork:**
1. Go to fork Settings
2. Scroll to "Repository name"
3. Rename to match main repo
4. Click "Rename"

### 2. Clone Your Fork (One Time Per Repo)

```bash
# Clone using SSH (recommended)
git clone git@github.com:emazzucabb/repo-name.git
cd repo-name

# Verify remote
git remote -v
# Should show: origin  git@github.com:emazzucabb/repo-name.git
```

**If remote shows HTTPS instead of SSH:**
```bash
git remote set-url origin git@github.com:emazzucabb/repo-name.git
```

### 3. Create a Branch for Your Changes

```bash
# Create and switch to new branch
git checkout -b fix-your-bug-name

# Or with prefix if team uses them
git checkout -b fix/your-bug-name
```

### 4. Make Your Changes

```bash
# Make code changes, add files, etc.

# Stage changes
git add .

# Or stage specific files
git add path/to/file

# Commit with descriptive message
git commit -m "Fix maximize bug in GTK3 Wayland backend"
```

### 5. Push to Your Fork

```bash
# Push branch to your fork
git push origin fix-your-bug-name

# If first time pushing this branch, you might need:
git push -u origin fix-your-bug-name
```

### 6. Open Pull Request on GitHub

**Method 1: Using the banner (easiest)**
1. Go to your fork: `https://github.com/emazzucabb/repo-name`
2. You'll see a banner: "**fix-your-bug-name** had recent pushes"
3. Click "Compare & pull request"
4. Fill out PR description
5. Click "Create pull request"

**Method 2: Manual PR creation**
1. Go to the **main repository** (not your fork)
2. Click "Pull requests" tab
3. Click "New pull request"
4. Click "compare across forks"
5. Set base: `main-repo:main` (or appropriate branch)
6. Set compare: `emazzucabb/repo-name:fix-your-bug-name`
7. Click "Create pull request"
8. Fill out PR description
9. Click "Create pull request"

## SSH Key Setup (Required for Git Push)

### Check for Existing SSH Key

```bash
ls -la ~/.ssh/
```

Look for files like:
- `id_ed25519` and `id_ed25519.pub` (recommended)
- `id_rsa` and `id_rsa.pub` (older)
- `id_qnx_ed25519` and `id_qnx_ed25519.pub` (the key registered on GitHub for aports push)

### If Key Exists, Add to GitHub

```bash
# Display public key
cat ~/.ssh/id_ed25519.pub
# or
cat ~/.ssh/id_qnx_ed25519.pub
```

1. Copy the entire output (starts with `ssh-ed25519`)
2. Go to https://github.com/settings/keys
3. Click "New SSH key"
4. Paste key and give it a title
5. Click "Add SSH key"

### Test SSH Connection

```bash
# If using default key name
ssh -T git@github.com

# If using custom key name (e.g., id_qnx_ed25519)
ssh -i ~/.ssh/id_qnx_ed25519 -T git@github.com
```

Expected output: `Hi emazzucabb! You've successfully authenticated...`

### Configure SSH for Custom Key Names

If your key has a custom name (not the default `id_ed25519`), create/edit SSH config:

```bash
nano ~/.ssh/config
```

Add:
```
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_qnx_ed25519
```

Save and exit. Now SSH will automatically use the correct key for GitHub.

### Generate New SSH Key (If Needed)

```bash
ssh-keygen -t ed25519 -C "emazzuca@qnx.com"
```

Follow prompts, then add the public key to GitHub as described above.

## Common Issues and Solutions

### Issue: Git asks for username/password when pushing

**Cause**: Using HTTPS URL instead of SSH

**Solution**:
```bash
# Check current remote
git remote -v

# If shows https://, switch to SSH
git remote set-url origin git@github.com:emazzucabb/repo-name.git
```

### Issue: Permission denied (publickey)

**Cause**: SSH key not configured properly

**Solutions**:
1. Verify key is added to GitHub: https://github.com/settings/keys
2. Test SSH connection: `ssh -T git@github.com`
3. If using custom key name, configure `~/.ssh/config` (see above)
4. Verify key file permissions: `chmod 600 ~/.ssh/id_ed25519`

### Issue: Fork has wrong name

**Solution**: Rename the fork (see "Fork the Repository" section)

### Issue: Need to make another PR from same fork

**Solution**: Just create a new branch!
```bash
# Switch back to main
git checkout main

# Pull latest changes
git pull origin main

# Create new branch
git checkout -b fix-another-bug

# Make changes, commit, push, open new PR
```

## Elliott's GitHub Credentials

- **GitHub Username**: `emazzucabb`
- **Email**: `emazzuca@qnx.com`
- **SSH push key**: `~/.ssh/id_qnx_ed25519` (this is the key registered on GitHub; fingerprint `SHA256:FJZuZ...` matches this key)
- **Do NOT use** `~/.ssh/id_ed25519_2025`: it exists locally but is NOT registered on GitHub, so pushing with it fails with permission denied.

### aports work: one remote, always

All aports porting work uses a single remote, regardless of which package you are porting:

```
git@github.com:emazzucabb/aports.git
```

There is no per-package repo (no `emazzucabb/gtk4`, no `emazzucabb/llama.cpp`). Everything lives in the one aports fork on branches. When any push issue arises during aports work, first verify and correct the remote before anything else:

```bash
git remote -v
# must show: origin  git@github.com:emazzucabb/aports.git
git remote set-url origin git@github.com:emazzucabb/aports.git
```

The per-repo-fork guidance elsewhere in this skill applies to the older non-aports project repos (gtk3 as its own fork, etc.). For current aports porting, the single-remote rule above takes precedence.

## Commit subject conventions for aports

Use the standard package commit subject style so reviews are consistent:

- New aport: `<repo>/<pkgname>: new aport` (for example `extra/llama.cpp: new aport`)
- Existing aport getting QNX support: `<repo>/<pkgname>: enable/fix build on QNX`

## PR split rules

- Keep one package per PR unless a dependency chain requires a tightly coupled version bump.
- Submit dependency packages before consumer packages, so reviewers can land them in build order.
- Branch per package/change on the single aports remote; the fork persists and you make a new branch for each PR.

## PR review reply style

When replying to reviewer comments: use plain language and first person singular, never "we". Match the energy of the reviewer's comment: short corrections get short replies; for a substantive change, explain what was wrong, what changed, and why it works. No threading jargon (`std::promise`, future exception state, etc.). Keep PR-reply justifications in the PR thread, not in code comments.

## Codelab PRs (different repo, different rule)

Codelab PRs go to the codelabs repo, not aports. For those, only the markdown source goes in the PR; the `claat export` generated output (index.html, codelab.json under docs/) is generated and must NOT be committed. This is the opposite of a normal source PR and is easy to get wrong.

## Quick Reference Commands

```bash
# One-time setup per repo
git clone git@github.com:emazzucabb/repo-name.git
cd repo-name

# For each new PR
git checkout -b fix/bug-name
# ... make changes ...
git add .
git commit -m "Description of changes"
git push origin fix/bug-name
# Then open PR on GitHub

# Check remote URL
git remote -v

# Switch to SSH if needed
git remote set-url origin git@github.com:emazzucabb/repo-name.git

# Test SSH
ssh -T git@github.com

# View SSH config
cat ~/.ssh/config
```

## Key Reminders

1. **Fork once, reuse forever**: Don't create new forks for each PR
2. **Branch per feature/fix**: Each PR gets its own branch
3. **Fork naming**: Match the main repo name
4. **Branch naming**: Describe the change, not the repo
5. **SSH over HTTPS**: Configure SSH keys for easier authentication
6. **Custom key names**: Need `~/.ssh/config` entry if not using default names
7. **Fork persists**: Your fork stays after PR is merged, ready for next contribution

## Team Context

- **Team**: QNX porting team
- **Managers**: Cris and Yun
- **Workflow**: Fork-based PRs (don't create branches on main repo)
- **Primary repos**: gtk3, gtk4, alpine packages, MATE desktop components

