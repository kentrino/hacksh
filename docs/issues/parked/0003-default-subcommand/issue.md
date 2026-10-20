---
title: サブコマンド名を省略したときに既定の子を実行できない
theme: citty-parity
parked: needs-decision
---

# Problem

サブコマンド名がない呼び出しでは親の `run` が呼ばれ、親に `run` がなければ `No command specified` になる。名前の省略時に特定の子と同じ処理をさせるには、親の `run` から子の処理を手で呼ぶ必要があり、その場合は子の引数スキーマで検証されない。

解決後は、サブコマンド名を省略した呼び出しが既定の子として解析・検証・実行される。

# Open Decisions

- 採用するかどうか。名前を誤った呼び出しが明確なエラーではなく別の挙動になる余地がある（`ai-native`）。
- 親と既定の子の間で、名前付きオプションや passthrough をどちらが受け取るか。
- 親の `--help` が親と既定の子のどちらを表示するか。

# Related Files

- `src/run.ts` — `resolveCommand` と `executeCommand`
