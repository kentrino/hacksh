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

解決後は、人間向け形式での出力が重要度ごとに見分けられ、対話入力（0021）とも見た目が揃う。色を使えない環境でも、記号だけで区別できる。

# Rules

- hacksh の依存は現在 `zod`（peer）だけである。
- 対応する Node.js は 22.18 以上である。

# Open Decisions

- @clack/prompts に依存するか、同等の表示を自前で書くか。
- 見た目（記号・色・罫線）を利用者が差し替えられるようにするか、その範囲。
- 開始・終了の罫線（`┌`・`└`）を hacksh が自動で出すか、作者が明示するか。
- hacksh 自身のヘルプやエラーの表示も同じ見た目にするか。

# Related Files

- `src/run.ts` — `console.log`・`console.error` による出力
- `src/usage.ts` — ヘルプの表示
