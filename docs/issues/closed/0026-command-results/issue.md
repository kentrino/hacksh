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

# Decisions

- run の context に `output` を置き、`print(text)`・`println(text?)`・`json(value)` を持たせる。`println` は `print` に改行を足したものとする。呼び出しごとに一つの `output` イベントを出す逐次レコード列とし、結果スキーマは持たない。
- run の戻り値は `runCommand` の呼び出し元にだけ返し、`runMain` は表示しない。返す値と同じものを出力したい場合は、作者が `output` も呼ぶ。
- stdout は結果専用とし、`output`・help・version だけを書く。ログは全レベルを stderr に出す。
- pretty では text をそのまま書き、json は 2 スペースで整形する。JSON では `{"type":"output","kind":"text","text":...}` と `{"type":"output","kind":"json","data":...}` の envelope を使う。text を連結すると、端末制御シーケンスを除いて pretty の stdout と一致する。
- 色は stdout と stderr それぞれが TTY かどうかで判定する。
- 空文字列・`null`・同じ値の繰り返しも、それぞれ一つのイベントとして出す。何も呼ばなければ何も出さない。失敗前に書いた結果は取り消さず、エラーを stderr に続けて出す。
- 書き込みの失敗は drain でまとめて呼び出しの失敗にする。run の処理は止めない。
- 既存の JSON-lines 利用者との互換は保たない。info 以下のログを stdout から読んでいた利用者は stderr から読む。

# Related Files

- `src/command-output.ts`
- `src/run.ts`
- `src/printer.ts`
- `src/pretty.ts`
- `docs/themes/terminal-output.md`
- `docs/issues/parked/0033-public-compatibility/issue.md`
