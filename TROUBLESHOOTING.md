# トラブルシューティング

このドキュメントでは、Markdown Mermaid PDF の使用時によくある問題とその解決方法を説明します。

## 日本語フォントが表示されない

コンテナ内でフォントを確認：

```bash
docker run --rm markdown-mermaid-pdf:latest fc-list | grep -i "noto sans cjk jp"
```

フォントが見つからない場合は、イメージを再ビルドしてください：

```bash
make rebuild
```

## Mermaid 図表が生成されない

Puppeteer のログを確認：

```bash
docker run --rm \
  -e PUPPETEER_DISABLE_HEADLESS_WARNING=false \
  -v $(pwd)/workspace:/workspace \
  markdown-mermaid-pdf:latest \
  document.md output.pdf
```

### よくある原因

1. **Chromium の起動に失敗している**
   - コンテナが `--no-sandbox` フラグで起動しているか確認
   - Docker が十分なメモリを確保しているか確認（推奨: 2GB以上）

2. **Mermaid 構文エラー**
   - Markdown ファイル内の Mermaid コードブロックの構文を確認
   - [Mermaid Live Editor](https://mermaid.live/) で構文を検証

3. **ネットワークタイムアウト**
   - Puppeteer がタイムアウトしている場合、`.puppeteer.json` の設定を調整

## PDF が生成されない

詳細ログを有効化：

```bash
docker run --rm \
  -v $(pwd)/workspace:/workspace \
  markdown-mermaid-pdf:latest \
  document.md output.pdf 2>&1 | tee conversion.log
```

### よくある原因

1. **LaTeX コンパイルエラー**
   - ログファイル内で `! LaTeX Error` を検索
   - 特殊文字やエスケープが必要な文字を確認

2. **ファイルパスの問題**
   - 入力ファイルが `/workspace` ディレクトリ内にあるか確認
   - ファイル名にスペースや特殊文字が含まれていないか確認

3. **メモリ不足**
   - Docker のメモリ制限を確認・増加
   - 大きな画像や複雑な図表がある場合は特に注意

## コンテナが起動しない

Docker のバージョンを確認：

```bash
docker --version
docker compose version
```

必要なバージョン：

- Docker 20.10 以上
- Docker Compose v2 以上

## パフォーマンスが遅い

### 変換速度の改善

1. **Docker のリソース割り当てを増やす**
   - Docker Desktop の設定で CPU とメモリを増やす

2. **ボリュームマウントの最適化**
   - 必要最小限のファイルのみ `workspace/` に配置
   - 大きな不要ファイルを削除

3. **Mermaid 図表の数を確認**
   - 各図表は Chromium を起動するため時間がかかる
   - 必要に応じて図表を外部画像として保存し埋め込む

## 権限エラー

コンテナがルートユーザーとして実行されるため、生成されたファイルの所有権が変更される場合があります：

```bash
# 所有権を変更
sudo chown -R $USER:$USER workspace/

# または、コンテナ実行時にユーザーを指定
docker run --rm --user $(id -u):$(id -g) \
  -v $(pwd)/workspace:/workspace \
  markdown-mermaid-pdf:latest \
  document.md output.pdf
```

## さらなるサポート

上記で解決しない場合：

1. [GitHub Issues](https://github.com/hwatanabe-jp/markdown-mermaid-pdf/issues) で既存の問題を検索
2. 新しい Issue を作成（以下の情報を含める）：
   - エラーメッセージ全文
   - 使用している OS とアーキテクチャ
   - Docker バージョン
   - 再現手順
