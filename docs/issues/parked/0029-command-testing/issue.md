---
title: CLI 作者がテストの観測と差し替えを毎回組み立てる必要がある
theme: testable-cli
parked: blocked
---

# Problem

runCommand と printer の差し替えはあるが、結果・出力・エラー・終了状態をまとめて観測する利用例がない。prompt の入力や今後の exec を制御するには作者が独自の仕組みを用意する必要がある。

公開 API だけで再現性のあるテストを書けるようにする。

# Rules

- まず実行可能なテスト例を作り、重複する準備だけを helper として公開する。
- runCommand と同じ実行経路を使い、テスト専用の引数解析や終了意味論を作らない。
- mock は invocation ごとに渡す。想定外の exec や未指定の prompt 回答は明確に失敗し、実処理へフォールバックしない。
- 新しい実行時依存を増やさず、利用者のテストフレームワークを限定しない。

# Acceptance Criteria

- 成功・引数エラー・実行例外について、結果・PrintEvent・終了状態を検証する例が動く。
- prompt の応答と exec の結果を差し替え、呼び出し内容と順序を検証できる。
- 2つの並行テストで回答・イベント・設定・実行記録が混ざらない。
- パッケージ利用側から実行でき、端末・ネットワーク・git/gh に依存しない。

# Open Decisions

- hacksh/testing として公開するか、まず例とfactoryのみで十分か。
- 結果出力0026・終了状態0028の確定前に提供できる最小範囲。

# Related Files

- `src/run.ts`
- `src/public-api.test.ts`
- `docs/issues/closed/0023-context-exec/issue.md`
- `docs/issues/parked/0026-command-results/issue.md`
- `docs/issues/open/0028-invocation-cancellation/issue.md`
