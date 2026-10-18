---
title: 処理結果をログと分けて出力できない
theme: composable-output
---

# Problem

runCommand は run の戻り値を返すが、runMain はその値を出力しない。現在の PrintEvent には結果専用の種類がなく、info ログも stdout に流れる。PR 一覧などの成果物を他のプログラムへ渡すには作者が独自の出力経路を作る必要がある。

解決後は成果物を明示的に出力でき、ログを有効にしたまま機械が結果を読み取れる。

# Rules

- 結果とログを区別し、両方とも printer を通す。
- run の戻り値を暗黙に表示しない。ライブラリ利用時の戻り値との関係を明示する。
- 単一結果と逐次レコード列のどちらを初期対応にするか決める。非対応の形を曖昧に受け入れない。
- stdout/stderr の変更は既存の terminal-output 契約との差分として文書化する。

# Acceptance Criteria

- pretty と JSON の双方で結果を出せ、JSON の成果物と診断ログを分離できる。
- 空結果、null、結果未出力、重複出力、実行失敗後の部分結果の扱いを定義する。
- 出力先の失敗・EPIPE と drain の扱いをテストする。
- 既存 printer と既存 JSON-lines 利用者への移行方法を示す。

# Open Decisions

- result メソッドか output オブジェクトか。結果スキーマを初期範囲に含めるか。
- stdout を結果専用にする範囲、JSON 本体とイベント envelope の選択、ログの出力先。
- 完了前に結果を書いた後で処理が失敗した場合の契約。

# Related Files

- `src/run.ts`
- `src/printer.ts`
- `docs/themes/terminal-output.md`
- `docs/issues/open/0033-public-compatibility/issue.md`
