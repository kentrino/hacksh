---
title: run から使える構造化されたロガーがない
theme: terminal-output
---

# Problem

`run` のコンテキストは `cmd`・`args`・`rawArgs`・`passthrough`・`extraArgs` だけで、出力の手段を持たない。コマンドの作者は `console.log` などで直接書くことになり、出力は文字列だけで、重要度や付随するデータを持たない。この出力は hacksh の printer（0022）を通らないので、形式の書き分け（0019）や見た目の統一（0020）が及ばない。

テストで `run` の出力を確かめるには、`console` を差し替える必要がある。

解決後は、`run` からロガーを受け取り、重要度・メッセージ・構造化されたデータを持つ出力を書ける。その出力は printer を通り、printer を差し替えればテストで出力を値として検証できる。

# Rules

- hacksh から出る出力は、すべて同じ printer を通る（0022）。
- 依存は `zod`（peer）以外に増やさない。

# Open Decisions

- 重要度の段階（LogTape の `trace`〜`fatal` の6段階か、@clack/prompts の `step`・`success` のような意味付きの種類も持つか）。
- メッセージの書き方（テンプレート文字列とプロパティ、または文字列とデータの組）。
- 親子コマンドで、カテゴリ（例: `["mycli", "deploy"]`）を自動で付けるか。
- ロガーを `CommandContext` に直接置くか、呼び出しごとの値（0001）の仕組みに乗せるか。

# Related Files

- `src/command.ts` — `CommandContext`
- `src/run.ts` — `run` の呼び出し
- `docs/issues/0001-invocation-data/issue.md` — 呼び出しごとの値を `run` に渡す仕組み
- `docs/issues/0022-single-printer/issue.md` — すべての出力が通る printer
