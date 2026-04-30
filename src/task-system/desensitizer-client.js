/**
 * Local Desensitizer Client
 * 
 * Client for the Local Desensitizer API service.
 * Base URL: http://localhost:8080
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

class DesensitizerClient {
  /**
   * @param {string} baseUrl - Base URL of the desensitizer service (e.g., http://localhost:8080)
   */
  constructor(baseUrl = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
  }

  /**
   * 检测并脱敏文本中的 PII 信息
   * 
   * @param {string} text - 待脱敏的文本
   * @param {object} options - 可选配置
   * @param {string} options.language - 语言代码："en" / "zh" / "auto"，默认 "auto"
   * @param {number} options.threshold - 置信度阈值，范围 0.0 ~ 1.0，默认 0.5
   * @returns {Promise<object>} 脱敏结果
   */
  async desensitize(text, options = {}) {
    if (!text || text.trim().length === 0) {
      throw new Error('输入文本为空');
    }

    const {
      language = 'auto',
      threshold = 0.5,
    } = options;

    const requestBody = {
      text: text,
      language,
      threshold,
    };

    try {
      const response = await this._post('/desensitize', requestBody);
      return response;
    } catch (error) {
      throw new Error(`脱敏服务调用失败: ${error.message}`);
    }
  }

  /**
   * 健康检查
   * @returns {Promise<object>} 健康状态
   */
  async healthCheck() {
    try {
      const response = await this._get('/health');
      return response;
    } catch (error) {
      throw new Error(`脱敏服务不可用: ${error.message}`);
    }
  }

  /**
   * 批量脱敏多个片段
   * 
   * 将所有片段的文本用分隔符连接，一次性发送给脱敏服务
   * 
   * @param {object[]} segments - 片段数组，每个片段包含 { text, speaker, start, end }
   * @param {object} options - 可选配置
   * @returns {Promise<object>} 脱敏结果，包含 desensitizedText 和 segments 映射
   */
  async desensitizeSegments(segments, options = {}) {
    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error('输入片段数组为空');
    }

    const {
      language = 'auto',
      threshold = 0.5,
    } = options;

    // 使用特殊分隔符连接所有片段，格式：[index]text
    const SEPARATOR = '\n---SEGMENT_BREAK---\n';
    const combinedText = segments
      .map((segment, index) => `[${index}]${segment.text || ''}`)
      .join(SEPARATOR);

    if (!combinedText.trim()) {
      throw new Error('所有片段文本均为空');
    }

    const requestBody = {
      text: combinedText,
      language,
      threshold,
    };

    console.log('[DesensitizerClient] 合并后的完整文本:');
    console.log(combinedText);
    console.log('[DesensitizerClient] 请求体:', JSON.stringify(requestBody, null, 2));

    try {
      const response = await this._post('/desensitize', requestBody);
      
      console.log('[DesensitizerClient] 脱敏后的完整文本:');
      console.log(response.desensitized_text);
      console.log('[DesensitizerClient] 检测到实体:', JSON.stringify(response.entities, null, 2));

      return response;
    } catch (error) {
      throw new Error(`脱敏服务调用失败: ${error.message}`);
    }
  }

  /**
   * 批量脱敏文本
   * 
   * @param {string[]} texts - 待脱敏的文本数组
   * @param {object} options - 可选配置
   * @returns {Promise<object[]>} 脱敏结果数组
   */
  async desensitizeBatch(texts, options = {}) {
    if (!Array.isArray(texts)) {
      throw new Error('输入必须是文本数组');
    }

    const results = [];
    for (const text of texts) {
      try {
        const result = await this.desensitize(text, options);
        results.push(result);
      } catch (error) {
        console.error('[DesensitizerClient] 批量脱敏失败:', error.message);
        results.push({
          original_text: text,
          desensitized_text: text,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * 发送 GET 请求
   * @private
   */
  _get(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
    });
  }

  /**
   * 发送 POST 请求
   * @private
   */
  _post(path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const postData = JSON.stringify(body);

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else if (res.statusCode === 400) {
              reject(new Error(`输入文本为空`));
            } else if (res.statusCode === 422) {
              reject(new Error(`请求参数校验失败: ${JSON.stringify(json)}`));
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      req.write(postData);
      req.end();
    });
  }
}

module.exports = { DesensitizerClient };
