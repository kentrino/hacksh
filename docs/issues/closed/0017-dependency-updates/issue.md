---
title: 依存関係と GitHub Actions の更新が手作業に頼っている
theme: oss-readiness
---

# Problem

Dependabot や Renovate の設定がない。GitHub Actions はコミット SHA で固定されている（`actions/checkout@3d3c42e…`、`voidzero-dev/setup-vp@0cffb0a…`）ため、自動では更新されない。`pnpm-workspace.yaml` の catalog にある開発依存（`vite-plus`、`typescript`、`zod` など）も同じく手作業で更新する必要がある。

peer dependency の `zod` は `^4.0.0` だが、テストは catalog にある 1 つのバージョンでしか実行されない。Zod 4 の新しいマイナーバージョンで壊れても、誰かが手で更新するまで気付けない。

解決後は、依存関係と Actions の更新が定期的に pull request として届き、CI で検証される。

# Open Decisions

- Dependabot と Renovate のどちらを使うか。
- 更新をまとめる単位と頻度。
- peer dependency の下限（`zod@4.0.0`）も CI で検証するか。

# Related Files

- `.github/workflows/ci.yml` — SHA で固定した Actions
- `.github/actions/setup/action.yml` — SHA で固定した Actions
- `pnpm-workspace.yaml` — 依存の catalog
- `package.json` — `peerDependencies.zod`
