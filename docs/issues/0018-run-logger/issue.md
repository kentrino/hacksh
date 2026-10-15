---
title: run から使える構造化されたロガーがない
theme: terminal-output
---

# Problem

`run` のコンテキストは `cmd`・`args`・`rawArgs`・`passthrough`・`extraArgs` だけで、出力の手段を持たない。コマンドの作者は `console.log` などで直接書くことになり、出力は文字列だけで、重要度や付随するデータを持たない。そのため、同じ出力を形式を変えて書き分けたり（0019）、見た目を揃えたり（0020）する土台がない。

テストで `run` の出力を確かめるには、`console` を差し替える必要がある。

解決後は、`run` からロガーを受け取り、重要度・メッセージ・構造化されたデータを持つ出力を書ける。出力の書き先は呼び出し側が差し替えられ、テストで出力を値として検証できる。

# Rules

- hacksh の依存は現在 `zod`（peer）だけである。

# Open Decisions

- 重要度の段階（LogTape の `trace`〜`fatal` の6段階か、@clack/prompts の `step`・`success` のような意味付きの種類も持つか）。
- メッセージの書き方（テンプレート文字列とプロパティ、または文字列とデータの組）。
- 親子コマンドで、カテゴリ（例: `["mycli", "deploy"]`）を自動で付けるか。
- `runCommand` でも書き先を差し替えられるようにするか、呼び出しごとの値（0001）の仕組みに乗せるか。
- 0009 のように hacksh 自身が出すエラーや使い方の表示も、同じロガーを通すか。

# Related Files

- `src/command.ts` — `CommandContext`
- `src/run.ts` — `run` の呼び出しと `console.log`・`console.error` による出力
- `docs/issues/0001-invocation-data/issue.md` — 呼び出しごとの値を `run` に渡す仕組み
