# トラブルシューティング

Markdown Mermaid PDF の使用時によくある問題と対処方法をまとめています。
以下のコマンド例は、リポジトリのルートで、ローカルの `markdown-mermaid-pdf:latest` を使って実行します。
公開イメージを使う場合は、イメージ名を `ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest` に置き換えてください。

## 日本語フォントが表示されない

コンテナ内に日本語フォントがあるか確認します。

```bash
docker run --rm --entrypoint fc-list markdown-mermaid-pdf:latest | grep -i "noto sans cjk jp"
```

フォントが見つからない場合は、イメージを再ビルドしてください。

```bash
make rebuild
```

## formalの図が縦長・横長になる

`--style formal`では、サイズ未指定の図を本文幅・本文高さの65%以内に縮小します。
縦横比を保持し、キャプションや説明を置く余地を残します。図全体がページの残りに
収まらなければ次ページへ移ります。PNG・PDF形式のMermaid図に同じ上限が適用されます。

図を縮小すると文字も小さくなります。読みにくい場合は、工程や役割ごとに図を分割するか、
縦横の配置を見直してください。極端に長いキャプションや、明示した画像の寸法も確認してください。
古いformal書式には高さの上限がないため、幅が収まっても縦長の図がページ下端で欠ける場合があります。

## Mermaid 図表が生成されない

Puppeteer のログを確認します。

```bash
docker run --rm \
  -e PUPPETEER_DISABLE_HEADLESS_WARNING=false \
  -v "$(pwd)/workspace:/workspace" \
  markdown-mermaid-pdf:latest \
  document.md output.pdf
```

### よくある原因

1. **Chromium の起動に失敗している**
   - このイメージは既定で Puppeteer/Chromium に `--no-sandbox --disable-setuid-sandbox` を渡します
   - ワークスペースに独自の `.puppeteer.json` や `.mermaid-config.json` を置いている場合は、既定の設定を上書きしていないか確認してください
   - Docker に十分なメモリを割り当てているか確認してください（推奨: 2GB以上）

2. **Mermaid 構文エラー**
   - Markdown ファイル内の Mermaid コードブロックの構文を確認してください
   - [Mermaid Live Editor](https://mermaid.live/) で構文を検証できます

3. **ネットワークタイムアウト**
   - Puppeteer がタイムアウトしている場合は、`.puppeteer.json` の設定を調整してください

### 入力に関する注意

このコンテナは Chromium を `--no-sandbox` 付きで起動するため、信頼できる入力だけを処理してください。
外部から受け取った未検証の Markdown / Mermaid をそのまま処理しないでください。

### スタイルを切り替えても Mermaid のテーマが変わらない

作業ディレクトリの `.mermaid-config.json` は、スタイルの既定設定より優先されます。
旧版が自動コピーしたファイルも同様に扱われます。自分でカスタマイズしていないことを確認して
そのファイルを削除または退避すると、`--style` に応じた既定設定が使われます。
`MERMAID_FILTER_MERMAID_CONFIG` を明示している場合は、さらにそちらが優先されます。
現在の変換処理は、既定設定をワークスペースへ自動コピーしません。

## PDF が生成されない

変換ログを画面に表示し、`conversion.log` にも保存します。

```bash
docker run --rm \
  -v "$(pwd)/workspace:/workspace" \
  markdown-mermaid-pdf:latest \
  document.md output.pdf 2>&1 | tee conversion.log
```

### よくある原因

1. **LaTeX コンパイルエラー**
   - ログファイル内で `! LaTeX Error` を検索してください
   - 特殊文字やエスケープが必要な文字を確認してください

2. **ファイルパスの問題**
   - 入力ファイルがコンテナの `/workspace` ディレクトリ内にあるか確認してください
   - 空白や特殊文字を含むファイル名は、`'設計 書.md'` のように引用符で囲んでください

3. **メモリ不足**
   - Docker のメモリ制限を確認し、必要に応じて増やしてください
   - 大きな画像や複雑な図表がある場合は、特にメモリ使用量に注意してください

## 目次のページ番号がずれる・相互参照が確定しない

旧版では、特に目次が複数ページになる文書で、PDF が生成されても
`Rerun to get cross-references right` が最終実行のログに残り、目次と本文のページ番号が
ずれることがありました。修正版では latexmk が同じ補助ファイルを使って XeLaTeX を再実行し、
目次・相互参照が安定してから出力します。修正を含むイメージで文書を再生成してください。

途中の実行に再実行の警告が出るのは正常です。収束しない場合は latexmk の上限（既定5回）で
エラーになります。未定義・重複した参照が最後まで残る場合もエラーになるため、ログに出た
ラベル名と本文の `\label`・`\ref`・`\pageref` などを確認してください。
ページ番号に応じてレイアウトを変更する独自 LaTeX がある場合は、その処理も確認します。
文書一式の生成では、1件でも失敗すると出力先に一式を保存しません。

再実行の判定を一定に保つため、作業ディレクトリなどの `latexmkrc` は読み込みません。

## formal の見出しへのリンクが1ページ前を指す

v1.4.1 以前では、目次の印字ページ番号が正しくても、章の開始や自然な改ページの位置で
見出しへの内部リンクが前ページを指すことがありました。再実行回数を増やしても直りません。
修正版では、Markdown の見出し ID と自動生成されるリンク先を見出し行に配置します。
修正を含むイメージで PDF を再生成してください。文書一式の場合は一式を再生成します。

確認には `pdfinfo -dests output.pdf` と `pdftotext -layout output.pdf -` を使えます。
前者のページ番号は表紙から数えた物理ページです。本文のフッター番号とは異なります。

## formal スタイルで変換が中止される

`--style formal` は、スキーマに適合しない文書の変換を中止し、0 以外の終了コードを返します。
エラーメッセージには違反内容がまとめて表示されます。

```
[formal] スキーマ検証エラー:
- 必須メタデータ 'doc-number' がありません
- 見出し「検証の自動化」(3階層目) : 直前の見出し(1階層目)から階層が飛んでいます
```

### よくある原因

1. **必須フロントマターの欠落**
   - `doc-number` / `title` / `date` / `organization` / `revision-history` は必須です
2. **日付形式の誤り**
   - `date` と `revision-history[].date` は `YYYY-MM-DD` 形式で指定します（例: `2026-07-15`）
3. **見出し階層の違反**
   - `#`(章) → `##`(節) → `###`(項) → `####`(細目) を飛ばさずに使います
   - 最初の見出し（章）より前に本文を書くことはできません

スキーマの定義は [formal モードの仕様](docs/formal-mode.md) を参照してください。

### formal スタイルで表の列幅を調整したい

YAML フロントマターに `table-column-widths: auto` を追加すると、内容に応じて列幅が
調整されます。特定の表を調整する場合は `.table-layout` の Div で表を1つだけ囲み、
`column-widths="20,30,50"` のように列数と同じ個数の比率を指定してください。

自動調整は文字の幅の推定に基づくため、長いURLや改行できない文字列、画像を含むセルでは
はみ出す場合があります。その列の比率を大きくするか、文言を短くする・表を分割するなどで
調整してください。列数が非常に多い表や、狭い比率を指定した表も同様です。

未指定または `default` の場合は、Pandoc がパイプ表の区切り行から読み取った幅を使用します。
長い行がある表では、ハイフンの比率が幅に反映されます。
列幅を明確に指定したい場合は上記の比率指定を使用してください。
詳細は [キャプション位置と表の列幅](docs/formal-mode.md#キャプション位置と表の列幅) を参照してください。

### formal スタイルでキャプション位置を変更したい

YAML フロントマターの `figure-caption-position` と `table-caption-position` に
`top`／`bottom` を指定します。Markdown 内でキャプションを記述する場所は変更しません。
`bottom` を指定すると、表が複数ページにまたがる場合も、キャプションは表全体の末尾に一度だけ表示されます。

### 見本の公開文書と細部が異なる

formal スタイルは公開文書の構成・書式・トーンの再現を目的としており、Word 原本との
ピクセル単位の一致は目標にしていません。詳細は [再現の方針と制限事項](docs/formal-mode.md#再現の方針と制限事項) を参照してください。

## コンテナが起動しない

Docker と Docker Compose のバージョンを確認します。

```bash
docker --version
docker compose version
```

必要なバージョンは次のとおりです。

- Docker 20.10 以上
- Docker Compose v2 以上（Compose を使う場合）

## 変換に時間がかかる

### 変換速度の改善

1. **Docker のリソース割り当てを増やす**
   - Docker Desktop の設定で CPU とメモリを増やしてください

2. **ボリュームマウントの最適化**
   - `workspace/` に置くファイルを必要最小限にしてください
   - 大きな不要ファイルを削除してください

3. **Mermaid 図表の数を確認**
   - 図表ごとに Chromium を起動するため時間がかかります
   - 必要に応じて図表を外部画像として保存し、埋め込んでください

## CI の lint (Hadolint / Dockle) が失敗する

`build-main.yml` の `lint` ジョブは Dockerfile を Hadolint で検査します。
Dockle (CIS ベースのチェック) は amd64 の検証・公開ジョブで、smoke test と同じ候補イメージを検査します。
いずれかが失敗すると、公開タグ `:main` の更新を止めます。

- ローカルでは `make lint` で再現できます。Dockerfile のみなら `make lint-dockerfile`、
  イメージのみなら `make lint-image` を使います。ツールのバージョンと引数は CI と同じです。
- `make lint-image` はローカルにある対象イメージを `docker image save` で一時アーカイブにし、
  Dockle の `--input` で検査します。対象がまだなければ先に `docker pull <image-ref>` が必要です。
  この方法で、digest 指定の公開候補を読み取る際の `Manifest does not match provided manifest digest`
  エラーを避け、smoke test と同じ候補を検査します。
  一時アーカイブ分の空き容量が必要です。一時アーカイブは成功・失敗にかかわらず終了時に削除します。
- ツールのバージョンを固定する digest と許容リストは `Makefile` に、
  Hadolint のルール除外は `.hadolint.yaml` に理由コメント付きでまとめています。
- 意図的に許容しているチェックは次のとおりです。
  - `DL3008`: apt パッケージは非ピン方針(CVE は週次 Trivy が担当)
  - `CIS-DI-0001`: root 実行は bind-mount 出力の所有権を考慮した仕様
  - `DKL-DI-0006`: `latest` タグは「安定版のみ」のタグポリシー
  - `-ae mdf`: texlive mdframed の `*.mdf` を資格情報と誤検知するため
- 新しい指摘が出た場合は、まず Dockerfile / イメージ側の修正を検討し、
  仕様として受け入れる場合のみ理由コメント付きで許容リストへ追加してください。

## GitHub Actions の arm64 CI が遅い

Mermaid 描画（Chromium）は CPU とメモリを使うため、build や smoke test に時間がかかることがあります。

- `main` / release CI は `ubuntu-24.04-arm` の native runner で `linux/arm64` を検証します
- runner が混み合うと待機時間も加わります
- `linux/amd64` と `linux/arm64` は別 job なので、どちらが遅いかを run ごとに切り分けられます

## 権限エラー

コンテナは既定で root として動作するため、生成されたファイルの所有者がホスト側のユーザーと異なる場合があります。
生成済みファイルの所有権を変更するか、実行時にホスト側のユーザーを指定してください。

```bash
# 所有権を変更
sudo chown -R $USER:$USER workspace/

# または、コンテナ実行時にユーザーを指定
docker run --rm --user $(id -u):$(id -g) \
  -v "$(pwd)/workspace:/workspace" \
  markdown-mermaid-pdf:latest \
  document.md output.pdf
```

Docker Compose を使う場合も `--user` を指定できます。

```bash
docker compose run --rm \
  --user $(id -u):$(id -g) \
  markdown-mermaid-pdf \
  document.md output.pdf
```

## 文書一式の生成で失敗する・リンクで移動できない

`--set documents.json [出力ディレクトリ]` は、全件の検証と変換に成功した場合だけ
出力先に PDF 一式を保存します。`[document-set]` の後に表示される文書と理由を確認してください。

- `output directory already exists`: 成果物の上書きを防ぐため停止しています。
  別の出力先を指定するか、以前の成果物を移動してから再実行してください。
- `duplicate` / `ambiguous heading`: 文書 ID・番号・入力・出力名、明示的な見出し ID の
  重複を確認してください。出力名は大文字小文字の違いと Unicode 正規化も考慮して重複を検査します。
- `unknown document` / `unknown heading`: `doc:ID#見出しID` の ID と設定・Markdown を照合してください。
- 画像が見つからない: 画像パスは元の Markdown のディレクトリを基準に指定してください。
  Mermaid の設定は従来どおりコマンドの実行ディレクトリにあるものを使用します。
- PDF のリンクで別文書を開けない: 一式を同じディレクトリに置き、生成後に PDF を改名していないか
  確認してください。ブラウザ・メールのプレビューではなく、ローカルの PDF 間移動に対応する
  デスクトップビューアで開いてください。閲覧ソフトによる制限時や印刷物では、表示された
  文書番号・タイトル・見出し情報から参照先を特定できます。

通常の変換失敗では一時ディレクトリを削除します。プロセスの強制終了や電源断では、
出力先の親に `.document-set-*` が残ることがあります。稼働中の変換がないことを確認してから
残った一時ディレクトリを削除できます。詳細は [formal モード](docs/formal-mode.md#文書一式の生成) を参照してください。

## 解決しない場合

[GitHub Issues](https://github.com/hwatanabe-jp/markdown-mermaid-pdf/issues) で同じ問題が報告されていないか検索してください。
新しい Issue を作成する場合は、次の情報を含めてください。

- エラーメッセージ全文
- 使用している OS とアーキテクチャ
- Docker バージョン
- 再現手順
