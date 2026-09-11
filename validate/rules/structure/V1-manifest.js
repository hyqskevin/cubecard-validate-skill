/**
 * V1: manifest.json schema 校验
 *
 * 实现：用 ajv 跑 JSON Schema。这跟 ACT 4.0 cube-lint 里走 ajv 的
 * 路径一致；规则只声明 schema，校验由 ajv 完成。
 *
 * 4.0 升级：用 json-to-ast-ext 给 ajv 错误挂上行号。
 * ajv 的 error 给的是 `instancePath`（如 "/version"），我们在 ctx.manifestAst
 * 上按字段名查 Property 节点的 loc，生成"第 N 行第 M 列"提示。
 *
 * 注意：manifest 字段集是参考 ACT 2.2.0 / 4.0.0 公开产物推断的最小集合，
 * 实际 ACT 内部可能有更多必填/选填字段，调用方可按需扩展。
 */

const Ajv = require('ajv');

const MANIFEST_SCHEMA = {
  type: 'object',
  required: ['name', 'version'],
  additionalProperties: true,
  properties: {
    name: { type: 'string', minLength: 1 },
    version: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+([.-].+)?$' },
    compilerType: { enum: [1, 2] },
    jsformat: { enum: [0, 1, 2] },
    __scene: { type: 'string' },
    description: { type: 'string' },
  },
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(MANIFEST_SCHEMA);

/**
 * 在 json-to-ast-ext 的 AST 里按 instancePath（如 "/version" / "/compilerType"）
 * 找出对应节点，返回 {line, column}。
 */
function locateByInstancePath(ast, instancePath) {
  if (!ast || !instancePath) return null;
  // path 是 "/foo/bar" 形式，切成 ['foo', 'bar']
  const parts = instancePath.split('/').filter(Boolean);
  let cur = ast;
  for (const part of parts) {
    if (!cur || cur.type !== 'Object') return null;
    const prop = cur.children && cur.children.find((c) => c.type === 'Property' && c.key && c.key.value === part);
    if (!prop) return null;
    cur = prop.value;
  }
  if (cur && cur.loc && cur.loc.start) {
    return { line: cur.loc.start.line, column: cur.loc.start.column + 1 };
  }
  return null;
}

/**
 * 在 json-to-ast-ext 的 AST 里按字段名取 Property 的 loc（顶层字段专用）。
 */
function locateTopField(ast, fieldName) {
  if (!ast || ast.type !== 'Object') return null;
  const prop = ast.children && ast.children.find((c) => c.type === 'Property' && c.key && c.key.value === fieldName);
  if (prop && prop.key && prop.key.loc) {
    return { line: prop.key.loc.start.line, column: prop.key.loc.start.column + 1 };
  }
  return null;
}

/**
 * @param {object} ctx  buildContext 返回值
 * @param {{errors:string[],warnings:string[],info:string[]}} result
 * @param {string} cardName
 */
function check(ctx, result, cardName) {
  if (ctx.manifestRaw === null) {
    result.errors.push('V1: manifest.json 缺失');
    return;
  }
  if (ctx.manifestError) {
    result.errors.push(`V1: manifest.json 解析失败（comment-json）: ${ctx.manifestError}`);
    return;
  }
  const ok = validateSchema(ctx.manifestObj);
  if (!ok) {
    for (const err of validateSchema.errors || []) {
      const path = err.instancePath || '/';
      // 行号定位（先按 instancePath，再 fallback 到 required missingProperty）
      let loc = locateByInstancePath(ctx.manifestAst, path);
      if (!loc && err.keyword === 'required' && err.params && err.params.missingProperty) {
        loc = locateTopField(ctx.manifestAst, err.params.missingProperty);
      }
      const locStr = loc ? `第 ${loc.line} 行第 ${loc.column} 列` : path;
      const msg = err.message || 'invalid';
      if (err.keyword === 'required') {
        result.errors.push(`V1: manifest.json ${locStr} 缺必填字段 "${err.params.missingProperty}"`);
      } else {
        result.errors.push(`V1: manifest.json ${locStr} (${path}) ${msg}`);
      }
    }
    return;
  }
  // 软警告：name 与目录名不一致
  if (ctx.manifestObj.name !== cardName) {
    const nameLoc = locateTopField(ctx.manifestAst, 'name');
    const locStr = nameLoc ? `第 ${nameLoc.line} 行第 ${nameLoc.column} 列` : 'name 字段';
    result.warnings.push(`V1: manifest.json ${locStr} name "${ctx.manifestObj.name}" 与目录名 "${cardName}" 不一致`);
  }
}

module.exports = { check, MANIFEST_SCHEMA, locateByInstancePath, locateTopField };