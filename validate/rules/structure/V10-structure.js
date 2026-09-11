/**
 * V10: 模板 / script / style 三段完整性
 *
 * 实现：直接从 ctx 拿（ctx.scriptAst / ctx.templateAst / ctx.vueContent
 * 里有无 <style>），不需要正则匹配。
 *
 * 4.0 升级：用 ctx.blockLines 给每段提示具体行号。找不到时报"末尾附近"
 * （ctx.vueContent 总行数 +1）。
 */

function lineOrEnd(ctx, line) {
  if (line) return `第 ${line} 行附近`;
  return `文件末尾附近（共 ${ctx.vueContent.split('\n').length} 行）`;
}

function check(ctx, result) {
  // vue-eslint-parser 总是给出 Program AST，没 <script> 时 body=[]。
  // 这里区分两种情况：
  //   1) 完全没有 <script> 段（vueContent 不含 "<script"） → warning
  //   2) 有 <script> 但解析失败（ctx.parseError 已记） → 已在 V0 报
  //   3) 有 <script> 且 body 空 → 仍记 info，避免误伤带空 script 的卡
  if (!/<script[\s>]/.test(ctx.vueContent)) {
    result.warnings.push(`V10: 缺少 <script>（${lineOrEnd(ctx, ctx.blockLines.script)}）`);
  } else if (ctx.scriptAst && (!ctx.scriptAst.body || ctx.scriptAst.body.length === 0)) {
    result.info.push(`V10: <script> 为空（${lineOrEnd(ctx, ctx.blockLines.script)}）`);
  }
  if (!ctx.templateAst) {
    result.warnings.push(`V10: 缺少 <template> 或 template 解析失败（${lineOrEnd(ctx, ctx.blockLines.template)}）`);
  }
  if (!/<style[\s>]/.test(ctx.vueContent)) {
    result.info.push(`V10: 缺少 <style>（${lineOrEnd(ctx, ctx.blockLines.style)}）`);
  }
}

module.exports = { check };