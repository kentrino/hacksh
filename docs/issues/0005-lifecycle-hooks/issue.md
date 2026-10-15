---
title: コマンドの前後処理を run の外に定義できない
theme: citty-parity
---

# Problem

`CommandDef` が持つ処理は `run` だけで、子を選択すると親の `run` は呼ばれない。親が確保する資源（接続や一時ディレクトリなど）を子の実行前に用意し、成功・失敗を問わず後で解放するには、各子の `run` に try/finally を書く必要がある。

解決後は、親子のコマンドで前処理と後処理を定義でき、実行が失敗しても前処理に成功した分の後処理が行われる。

# Open Decisions

- ヘルプやバージョンの表示だけの呼び出しで前後処理を行うか。
- 本体の失敗と後処理の失敗が重なったときに、どちらのエラーを返すか。

# Related Files

- `src/command.ts` — `CommandDef`
- `src/run.ts` — `executeCommand`
