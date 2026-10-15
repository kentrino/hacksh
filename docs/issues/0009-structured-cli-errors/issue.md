---
title: CLI として実行したときのエラーを構造化して受け取れない
theme: ai-native
---

# Problem

ライブラリとして呼ぶ場合、`ZittyValidationError` の `issues` で対象の引数とメッセージを取得できる。一方、`runMain` で CLI として実行すると、エラーは人間向けの文と使い方の表示として標準エラーに出力されるだけである。CLI をプロセスとして呼ぶ AI エージェントは、どの引数が何を期待していたかを文から推測する必要がある。

`Unknown command` や `No command specified` などの `ZittyUsageError` は、ライブラリとして呼んでもメッセージ以外に構造化された情報を持たない。

解決後は、CLI として実行した場合も、失敗した引数と期待された値をエージェントが解析せずに特定できる。

# Open Decisions

- 構造化した出力に切り替える条件（オプション、環境変数、常時など）。
- 使い方のエラー（未知のコマンドなど）を検証エラーと同じ形で表すか。

# Related Files

- `src/errors.ts` — `ZittyUsageError`・`ZittyValidationError`・`ZittyIssue`
- `src/run.ts` — `runMain` のエラー表示
