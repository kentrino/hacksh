---
title: 利用者が更新時の互換性と対応環境を判断できない
theme: oss-readiness
parked: needs-decision
---

# Problem

公開API、引数の解釈、JSONイベントは利用者が依存する契約になる。Nodeの最小バージョンなどは記載されているが、OS・ランタイムの対応範囲、0.xでの破壊的変更、JSON形式の変更方針がまとまっていない。

利用者が導入と更新の判断をでき、保守側も変更の影響を一定の基準で説明できるようにする。

# Rules

- 実際に検証する環境と未検証の環境を分け、未検証を対応済みと表示しない。
- 型/API、引数解釈、結果・エラー・JSONイベントを互換性の対象として扱う。
- 表示上の装飾と機械向け契約を区別する。
- 0013のリリースフロー、0014のパッケージ検証、0015の貢献ガイドへ接続し、別のリリース基盤は作らない。

# Acceptance Criteria

- 対応OS・Node/Deno・Zodの範囲と検証方針が利用者向けに記載される。
- 0.xで破壊的変更を出すバージョンと移行案内の方針が決まる。
- JSONイベントへの項目追加・削除、未知のイベント種別、エラーコードの安定性を定義する。
- 代表的な公開契約をパッケージ利用側の回帰テストで確認する。

# Open Decisions

- JSONの独立したschemaVersionが必要か、パッケージバージョンの方針で十分か。
- Windowsを初期対応に含めるか。対応する場合のCIと端末・プロセス機能の制限。

# Related Files

- `package.json`
- `src/index.ts`
- `docs/issues/closed/0013-release-workflow/issue.md`
- `docs/issues/open/0014-ci-packed-consumers/issue.md`
