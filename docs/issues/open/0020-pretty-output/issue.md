---
title: 人間向けの出力に統一された見た目がない
theme: terminal-output
---

# Problem

hacksh が人間向けに書く出力は、`console.log`・`console.error` による装飾のない文で、重要度による色や記号の区別がない。`run` からの出力（0018）を人間向けに表示するときの見た目も決まっていない。

@clack/prompts のように、左端の罫線で一連の出力をまとめ、記号と色で手順・完了・警告・エラーを見分けられる表示にしたい。

```text
┌  mycli deploy
│
◇  Building web
│
✔  Deployed web to prod
│
▲  Cache was not cleared
│
└  Done
```

解決後は、人間向け形式での出力が重要度ごとに見分けられ、ヘルプ・エラー・対話入力（0021）とも見た目が揃う。色を使えない環境でも、記号だけで区別できる。

# Rules

- 依存は `zod`（peer）以外に増やさない。@clack/prompts には依存せず、描画は自前で書く。
- 対応する Node.js は 22.18 以上である。
- hacksh から出る出力は、すべて同じ printer を通る（0022）。人間向けの見た目は、その printer の人間向け形式として決まる。

# Open Decisions

- 見た目（記号・色・罫線）を利用者が差し替えられるようにするか、その範囲。
- 開始・終了の罫線（`┌`・`└`）を hacksh が自動で出すか、作者が明示するか。
- ヘルプのような複数行の表示を、罫線の中に入れるか、罫線の外に出すか。

# Related Files

- `src/run.ts` — `console.log`・`console.error` による出力
- `src/usage.ts` — ヘルプの表示
- `docs/issues/0022-single-printer/issue.md` — すべての出力が通る printer
