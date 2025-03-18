# 🚀 Commit Naming & Versioning Guide

This guide provides a structured approach to writing commit messages following **Conventional Commits**, ensuring automatic versioning, changelog updates, and better collaboration.

---

## 📌 Commit Message Format
Each commit message must follow this format:
```sh
feat(auth): add member login support
```

### 📝 **Rules**
- **Starts with a commit type** (`feat`, `fix`, `docs`, etc.).
- **Can include a scope** (`auth`, `db`, `ui`).
- **Must have a short, clear description**.

---

## ✅ Allowed Commit Types
| **Type**   | **Purpose** | **Version Bump** |
|------------|------------|----------------|
| `feat`     | ✨ New feature | **Minor (`1.x.0 → 1.x+1.0`)** |
| `fix`      | 🐛 Bug fix | **Patch (`1.0.x → 1.0.x+1`)** |
| `chore`    | 🔧 Maintenance tasks (no app logic changes) | ❌ *No version bump* |
| `docs`     | 📖 Documentation updates | ❌ *No version bump* |
| `style`    | 🎨 Formatting changes (no logic change) | ❌ *No version bump* |
| `refactor` | ♻️ Code restructuring without behavior change | ❌ *No version bump* |
| `perf`     | 🚀 Performance improvements | **Patch (`1.0.x → 1.0.x+1`)** |
| `test`     | ✅ Adding or updating tests | ❌ *No version bump* |
| `ci`       | ⚙️ Changes to CI/CD | ❌ *No version bump* |
| `build`    | 🏗 Changes to the build system or dependencies | ❌ *No version bump* |
| `revert`   | ⏪ Reverting a previous commit | **Patch (`1.0.x → 1.0.x+1`)** |

---

## 📌 Commit Scope (Optional)
Scope defines **what part of the code was changed**.

| **Example Scope** | **When to Use?** |
|------------------|----------------|
| `auth` | Authentication system changes |
| `db` | Database schema or queries |
| `api` | Backend API updates |
| `ui` | User interface changes |
| `deps` | Dependency updates |
| `tests` | Changes in test files |
| `ci` | Continuous integration |

✅ **Examples:**

`feat(api): add user profile endpoint`

`fix(db): resolve transaction timeout`

---

## ❌ Bad vs. ✅ Good Commit

| ❌ **Bad Example** | ✅ **Fixed Version** |
|-------------------|------------------|
| `added login` | `feat(auth): add user login` |
| `bug fix` | `fix(db): resolve transaction rollback issue` |
| `update readme` | `docs(readme): update installation guide` |
| `fix UI` | `fix(ui): correct button alignment in profile page` |

---

## 🚀 How to Make a Commit

### 1️⃣ **Stage the changes**
`git add .`

### 2️⃣ Write a Proper Commit Message

#### ✅ New feature:
`git commit -m "feat(auth): add Google login"`

#### ✅ Bug fix:
`git commit -m "fix(db): resolve deadlock issue"`

#### ✅ Documentation update:
`git commit -m "docs(readme): clarify setup instructions"`

#### ✅ Code refactor:
`git commit -m "refactor(api): improve response handling"`


🚀 How to Trigger a Release

#### ✅ Steps
- **1.	Merge staging branch into main:**
```
git checkout main
git merge staging
git push origin main
``` 
- **2. Semantic Release will automatically:**
  #### ✅ Bump the version
  #### ✅ Update CHANGELOG.md
  #### ✅ Create a GitHub Release
