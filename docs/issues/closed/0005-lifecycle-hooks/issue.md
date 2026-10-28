---
title: コマンドの前後処理を run の外に定義できない
theme: citty-parity
---

# Problem

`CommandDef` が持つ処理は `run` だけで、子を選択すると親の `run` は呼ばれない。親が確保する資源を子の前に用意し、成功・失敗を問わず解放するには、各子の `run` に try/finally を書く必要があった。

# Decision

対応しない。親子のコマンドは接続や資源を共有しない。資源を開いた `run` がその中で解放する。親の setup と、子への引き渡しは作らない。

# Related Files

- `src/command.ts` — `CommandDef`
- `src/run.ts` — `executeCommand`
- `docs/themes/reliable-invocation.md`
- `docs/issues/closed/0028-invocation-cancellation/issue.md`
