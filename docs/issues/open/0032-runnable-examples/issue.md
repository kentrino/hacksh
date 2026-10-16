---
title: 導入から配布とテストまで辿れる実行可能な例がない
theme: oss-readiness
---

# Problem

README には API の断片があるが、CLI を配布しテストするまでの一式を利用者が確認できない。手順と依存バージョンが変わっても、文書だけでは破損を検出できない。

作者が小さい実例を実行・変更して、自分のCLIへ発展させられる状態にする。

# Rules

- 単一スクリプト、サブコマンド付きCLI、npmのbinとして配布する例を最小の数で用意する。
- 公開 API とビルドしたパッケージだけを使い、srcの内部importに依存しない。
- 0029のテスト例を再利用し、独立したテスト用APIを作らない。
- git/ghの認証、個人のdotfiles、実際の公開処理を検証の前提にしない。

# Acceptance Criteria

- README から実行・テスト・配布構成へ辿れる。
- パックしたCLIのbinがhelp、正常入力、エラー入力で期待どおり動く。
- 各例の型検査とスモークテストがCIで動く。
- Node/Denoなど、例ごとの対応環境と必要な権限が明記される。

# Open Decisions

- examplesディレクトリかテンプレートか。まずは生成CLIを増やさず実例を優先する。
- cittyからの移行例をどこまで含めるか。

# Related Files

- `README.md`
- `scripts/test-packed-consumers.mjs`
- `docs/issues/0015-contribution-guide/issue.md`
- `docs/issues/0029-command-testing/issue.md`
