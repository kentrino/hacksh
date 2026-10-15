---
title: 公開物の動作確認が CI で実行されない
theme: oss-readiness
---

# Problem

`scripts/test-packed-consumers.mjs`（`pnpm test:packed`）は、pack した tarball を Node.js 22.18 と Deno の利用側から読み込んで確かめる。しかし `.github/workflows/ci.yml` は `vp run ready`（check、test、build）しか実行しないため、このテストは手元で実行しない限り走らない。

CI の Node.js は `22` 固定で、`engines` が下限とする `22.18.0` ちょうどや、それより新しいメジャーバージョンでは検証されていない。

解決後は、pull request ごとに、公開される tarball が下限バージョンの Node.js と Deno で動くことを確認できる。

# Open Decisions

- Node.js の新しいメジャーバージョン（24 など）も CI で検証するか。
- Deno のバージョンをどう固定するか。

# Related Files

- `.github/workflows/ci.yml` — `vp run ready` だけを実行する
- `.github/actions/setup/action.yml` — `node-version: "22"`
- `scripts/test-packed-consumers.mjs` — packed consumer テスト
- `package.json` — `engines.node` と `test:packed`
