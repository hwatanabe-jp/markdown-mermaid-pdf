# サンプルドキュメント

このドキュメントは、Markdown to PDF Containerの動作確認用サンプルです。

## テキストの装飾

**太字**、*イタリック*、~~取り消し線~~などの基本的な装飾が使用できます。

- リスト項目1
- リスト項目2
  - ネストしたリスト
  - サブ項目

1. 番号付きリスト
2. 2番目の項目
3. 3番目の項目

## コードブロック

```python
def hello_world():
    print("Hello, World!")
    return True

if __name__ == "__main__":
    hello_world()
```

## Mermaid図表の例

### ガントチャート

```mermaid
gantt
    title プロジェクトスケジュール
    dateFormat  YYYY-MM-DD
    axisFormat  %Y-%m
    tickInterval 1month
    section フェーズ1
    要件定義           :a1, 2024-01-01, 30d
    基本設計           :a2, after a1, 20d
    section フェーズ2
    詳細設計           :a3, after a2, 25d
    実装               :a4, after a3, 40d
    section フェーズ3
    テスト             :a5, after a4, 20d
    リリース           :a6, after a5, 5d
```

### フローチャート

```mermaid
flowchart TD
    A[開始] --> B{条件分岐}
    B -->|はい| C[処理A実行]
    B -->|いいえ| D[処理B実行]
    C --> E{エラー?}
    D --> E
    E -->|なし| F[正常終了]
    E -->|あり| G[エラー処理]
    G --> H[異常終了]
    F --> I[完了]
```

### シーケンス図

```mermaid
sequenceDiagram
    participant ユーザー
    participant システム
    participant データベース

    ユーザー->>システム: ログイン要求
    システム->>データベース: 認証情報確認
    データベース-->>システム: 認証結果
    alt 認証成功
        システム-->>ユーザー: ログイン成功
    else 認証失敗
        システム-->>ユーザー: エラーメッセージ
    end
```

### クラス図

```mermaid
classDiagram
    class 動物 {
        +名前: string
        +年齢: int
        +鳴く()
    }
    class 犬 {
        +犬種: string
        +吠える()
    }
    class 猫 {
        +毛色: string
        +ニャーと鳴く()
    }

    動物 <|-- 犬
    動物 <|-- 猫
```

## 引用

> これは引用文です。
> 複数行にわたって記述できます。
>
> 引用の中に段落を含めることもできます。

## テーブル

| 項目 | 説明 | 価格 |
|------|------|------|
| 商品A | 高品質な商品 | ¥1,000 |
| 商品B | お手頃価格 | ¥500 |
| 商品C | プレミアム品 | ¥2,000 |

## まとめ

このドキュメントでは、以下の機能を確認できます：

1. 日本語テキストの表示
2. Markdown基本構文のサポート
3. Mermaid図表の埋め込み（ガント、フロー、シーケンス、クラス）
4. コードブロックのシンタックスハイライト
5. テーブル、リスト、引用などの要素

PDFが正常に生成されれば、すべての機能が動作していることを意味します。
