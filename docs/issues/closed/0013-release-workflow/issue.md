---
title: npm に公開する手順と変更履歴がない
theme: oss-readiness
---

# Problem

初回公開に向けて、バージョン管理と npm 公開の手順を整備する必要がある。公開用のワークフローはなく、`.github/actions/setup/action.yml` には「publish jobs」向けの `registry-url` 入力があるのに、それを使うジョブがない。

`CHANGELOG` もない。コミット履歴には `feat!:` の破壊的変更が続いているが、利用者がバージョン間で何が変わったかを知る手段がない。

解決後は、決まった手順でバージョンを上げて npm に公開でき、各リリースの変更点（特に破壊的変更）を利用者が確認できる。

# Open Decisions

- リリースを手動で起動するか、マージやタグを契機に自動で行うか。
- 変更履歴を Conventional Commits から生成するか、changeset などで手書きするか。
- npm provenance（Trusted Publishing）を使うか。
- `1.0.0` より前の破壊的変更をバージョン番号でどう表すか。

# Related Files

- `package.json` — `version`
- `.github/actions/setup/action.yml` — 使われていない `registry-url` 入力
- `.github/workflows/ci.yml` — 公開ジョブがない
