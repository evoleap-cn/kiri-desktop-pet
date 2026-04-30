# Local Desensitizer API

Base URL: `http://localhost:8080`

---

## GET `/health`

健康检查。

### Response

| Field     | Type   | Description   |
| --------- | ------ | ------------- |
| `status`  | string | `"ok"`        |
| `timestamp` | string | ISO 8601 时间戳 |

### Example

```bash
curl http://localhost:8080/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-04-29T17:57:49.971116"
}
```

---

## POST `/desensitize`

检测并脱敏文本中的 PII（个人身份信息）信息。

### Request Body

| Field     | Type   | Required | Default | Description              |
| --------- | ------ | -------- | ------- | ------------------------ |
| `text`    | string | 是       | —       | 待脱敏的文本             |
| `language`| string | 否       | `"auto"`| 语言代码：`"en"` / `"zh"` / `"auto"` |
| `threshold`| number | 否      | `0.5`   | 置信度阈值，范围 `0.0` ~ `1.0` |

### Response 200

| Field                | Type           | Description              |
| -------------------- | -------------- | ------------------------ |
| `original_text`      | string         | 原始文本                 |
| `desensitized_text`  | string         | 脱敏后的文本             |
| `total_entities`     | int            | 检测到的实体总数         |
| `entities`           | EntitySample[] | 实体列表                 |
| `low_confidence_count`| int           | 低置信度实体数（未脱敏） |

### EntitySample

| Field         | Type   | Description                      |
| ------------- | ------ | -------------------------------- |
| `entity_type` | string | 实体类型，如 `PERSON`、`PHONE_NUMBER`、`DATE_TIME` |
| `original`    | string | 原始内容                         |
| `replacement` | string | 替换后的占位符，如 `<PERSON>`    |
| `confidence`  | float  | 置信度 `0.0` ~ `1.0`             |
| `char_offset` | int    | 在原文中的字符偏移量             |

### Error Responses

| Status | Description      |
| ------ | ---------------- |
| `400`  | 输入文本为空     |
| `422`  | 请求参数校验失败 |
| `500`  | 处理异常         |

### Examples

#### 中文脱敏

```bash
curl -X POST http://localhost:8080/desensitize \
  -H "Content-Type: application/json" \
  -d '{"text": "我是王雪梅，电话13857126043", "language": "zh"}'
```

```json
{
  "original_text": "我是王雪梅，电话13857126043",
  "desensitized_text": "我是<PERSON>，电话<PHONE_NUMBER>",
  "total_entities": 2,
  "entities": [
    {
      "entity_type": "PERSON",
      "original": "王雪梅",
      "replacement": "<PERSON>",
      "confidence": 0.95,
      "char_offset": 2
    },
    {
      "entity_type": "PHONE_NUMBER",
      "original": "13857126043",
      "replacement": "<PHONE_NUMBER>",
      "confidence": 0.9,
      "char_offset": 7
    }
  ],
  "low_confidence_count": 0
}
```

#### 英文脱敏

```bash
curl -X POST http://localhost:8080/desensitize \
  -H "Content-Type: application/json" \
  -d '{"text": "My name is John Smith, email john@example.com", "language": "en", "threshold": 0.7}'
```

```json
{
  "original_text": "My name is John Smith, email john@example.com",
  "desensitized_text": "My name is <PERSON>, email <EMAIL_ADDRESS>",
  "total_entities": 2,
  "entities": [
    {
      "entity_type": "PERSON",
      "original": "John Smith",
      "replacement": "<PERSON>",
      "confidence": 0.9,
      "char_offset": 11
    },
    {
      "entity_type": "EMAIL_ADDRESS",
      "original": "john@example.com",
      "replacement": "<EMAIL_ADDRESS>",
      "confidence": 0.9,
      "char_offset": 30
    }
  ],
  "low_confidence_count": 0
}
```

---

## 支持的实体类型

| 类别     | 英文                | 中文         |
| -------- | ------------------- | ------------ |
| 人名     | `PERSON`            | `PERSON`     |
| 邮箱     | `EMAIL_ADDRESS`     | —            |
| 电话     | `PHONE_NUMBER`      | `PHONE_NUMBER` |
| 日期时间 | `DATE_TIME`         | `DATE_TIME`  |
| 地址     | `LOCATION`          | `LOCATION`   |
| 组织     | `ORGANIZATION`      | `ORGANIZATION` |
| 身份证号 | —                   | `ID_CARD`    |
| 病历号   | `MEDICAL_RECORD_NUMBER` | —        |
| 保险号   | —                   | `INSURANCE_ID` |

---

## 交互式文档

服务启动后访问 [http://localhost:8080/docs](http://localhost:8080/docs) 可查看 Swagger UI 并在线测试。
