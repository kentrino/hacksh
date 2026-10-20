---
title: 外部の貢献者が報告や修正の進め方を知る手段がない
theme: oss-readiness
parked: needs-decision
---

# Problem

リポジトリには `CONTRIBUTING.md`、issue テンプレート、pull request テンプレートがない。README の Development 節にはコマンドの一覧があるが、コミットメッセージの形式（履歴は Conventional Commits）、変更時に README を更新すべき範囲、テストの期待などは書かれていない。

既知の課題と方針は `docs/issues` と `docs/themes` に日本語で管理されているが、そのことはどこにも案内されていない。GitHub Issues は有効なので、外部の利用者は GitHub Issues と `docs/issues` のどちらで報告・確認すればよいか分からない。

解決後は、外部の貢献者が、報告先、既知の課題の確認場所、pull request を出す前に満たすべき条件を、作者に尋ねずに知ることができる。

# Open Decisions

- GitHub Issues と `docs/issues` の役割分担（片方へ寄せるか、併用するか）。
- `docs/issues` と `docs/themes` を日本語のままにするか。
- 行動規範（Code of Conduct）を置くか。

# Related Files

- `README.md` — Development 節
- `docs/issues/` — リポジトリ内の issue
- `docs/themes/` — リポジトリ内のテーマ
