# Designs

## 確定した契約

`dryRun` は `exec` のオプションだけである。CLI のフラグや `context.args` からは読まない。グローバルな dry-run、コマンド名の allowlist、変更操作の自動判定は置かない。作者が呼び出しごとに指定する。

### 戻り値

`dryRun` を省略したときと `dryRun: false` のときは、0023 と同じ成功または失敗を返す。`reject` の規則も変えない。

`dryRun: true` は子を起動せず、`input` も書かない。省略そのものは例外にしない。`reject` は省略結果には適用しない。

```ts
interface ExecSkipped {
  status: "skipped";
  command: ExecCommand; // redact 済み。cwd を渡していなければ undefined
}
```

`stdout`、`stderr`、`exitCode` は持たない。成功したことにする終了コードは作らない。

`dryRun` の型が `boolean` であるときは、省略結果と、実際に実行したときの結果とのユニオンを返す。呼び出し側は `status` で絞り込む。`reject: false` なら実行側は `ExecResult` である。`reject` を省略するか `true` なら、実行側は `ExecSuccess` である。`const dryRun = false` と `const dryRun: boolean = false` はリテラルの `false` になり、ユニオンにはならない。

`dryRun: true` かつ `reject: false` の戻り値だけは、`ExecSkipped` と、すでに中断された signal の失敗を合わせた型になる。その失敗は `status: "failed"` と `reason: "aborted"` を持つ。それ以外の `dryRun: true` は `ExecSkipped` だけを解決値にする。中断時に `reject` が省略または `true` なら、0023 と同じく `HackshExecError` を投げる。

`ExecOptions` 型の値を渡すと `dryRun` も `reject` も未確定なので、戻り値は `ExecSkipped | ExecResult` になる。

### 検査の順序

1. 引数とオプションの検査を行う。0024 の検査 1 と同じである。`input` と `stdin: "inherit"` の組み合わせは、`dryRun: true` でも `reject: false` でも `TypeError` になる。未知のキーも `TypeError` になる。実行ファイルや `cwd` が存在するかは見ない。
2. 呼び出しの signal がすでに中断されていれば、省略イベントより前に `reason: "aborted"` で失敗する。`reject` はこの失敗に 0023 と同じく適用する。省略結果も省略イベントも出さない。
3. `dryRun: true` ならここで省略する。`json-output`、`non-interactive`、`overlapping` は適用しない。JSON モードでも非対話環境でも、実行予定のイベントを出して `skipped` を返す。子は起動しない。
4. それ以外は 0024 の検査 3 以降と、子の起動に進む。

### 表示

イベントの `phase` は `"start"` または `"skip"` だけである。省略イベントは開始イベントと同じ `command`、`stdio`、`interactive` を持つ。`command` は結果の `command` と同じ秘匿済みの値である。

`display: false` は開始イベントと同じく、省略イベントを出さない。

pretty では開始を `$`、省略を `#` で示す。unicode と ascii で印は同じである。JSON では `phase` が `"skip"` か `"start"` かで区別する。互換用の素のストリーム表示も同じ二つの印を使う。

### 呼び出し例

```ts
const fetched = await exec("git", ["rev-parse", "HEAD"], { reject: false });
if (fetched.status === "failed") return 1;

const pushed = await exec("git", ["push", "origin", branch], { dryRun });
if (pushed.status === "skipped") return;
```

`dryRun` が `boolean` なので、`pushed` は省略と実行結果のユニオンである。`status` を見てから `stdout` を読む。
