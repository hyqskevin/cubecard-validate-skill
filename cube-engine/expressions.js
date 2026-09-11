/**
 * AST 表达式求值器（替代 vm.Script 字符串求值）
 *
 * 把任意 JS 表达式（如 'this.title + 1' / 'this.x > 0 ? "a" : "b"' /
 * 'Math.max(this.a, this.b)'）通过 espree 解成 ESTree AST，再用
 * evaluate() 解释执行。
 *
 * 与旧实现对比：
 *   - 旧：new vm.Script(`(function(){ return (${code}) })()`)
 *        问题：this. 字符串替换粗暴；每次求值都启动 vm.Script
 *   - 新：espree 解 AST → 解释执行
 *        好处：this 由 ctx 注入，不污染 sandbox；可拦截访问
 *
 * evaluate(ast, ctx) 的 ctx：
 *   - ctx.__state   当前数据状态（含 methods 平铺，getter 也可访问）
 *   - ctx.__eventObj  触发事件时注入的 event 对象
 *   - ctx.__vfor     当前 v-for 上下文 { item, idx, ... }
 *   - 其它（Math/Date/JSON/...）：通过 ctx['Math'] 等访问
 *
 * 注：ctx 必须是普通对象，避免与 state 冲突。
 */

const espree = require('espree');

const PARSE_OPTS = { ecmaVersion: 'latest', sourceType: 'script' };

function parseExpr(expr) {
  try {
    const ast = espree.parse(`(${expr})`, PARSE_OPTS);
    return ast.body[0].expression;
  } catch (e) {
    return { __parseError: e.message };
  }
}

/**
 * 求值表达式（在 ctx 上下文里）。
 *
 * 完整实现一套 ESTree 节点评估，覆盖 ACT DSL 用的所有形态。
 */
// 用于在 BlockStatement 里模拟 ReturnStatement 提前退出
const RETURN_SENTINEL = Symbol('__return__');

function evaluate(node, ctx) {
  if (node == null) return undefined;
  switch (node.type) {
    // ========== 字面量 ==========
    case 'Literal':
      return node.value;

    case 'Identifier': {
      const name = node.name;
      if (name === 'this') return ctx.__state;
      // ctx 上有就拿 ctx 上的（如 Math / Date / JSON）
      if (Object.prototype.hasOwnProperty.call(ctx, name)) return ctx[name];
      // 否则从 state 拿（包含 data / methods / v-for 局部）
      const v = ctx.__state[name];
      // getter 通过普通属性访问即可触发（state 用 Object.defineProperty
      // 注册了 getter；不过我们平铺的 state 上 getter 实际是 function value，
      // 这里不做特殊处理，调用方需要按方法名调）
      if (typeof v === 'function') return v.bind(ctx.__state);
      return v;
    }

    case 'ThisExpression':
      return ctx.__state;

    // ========== 复合 ==========
    case 'MemberExpression': {
      const obj = evaluate(node.object, ctx);
      // 对 `this.xxx` 形态：this 求值得到 ctx.__state，如果属性不在
      // state 上，fallback 到 ctx（v-for 局部变量如 item / idx / tag）
      if (obj != null && obj === ctx.__state) {
        const prop = node.computed ? evaluate(node.property, ctx) : node.property.name;
        if (Object.prototype.hasOwnProperty.call(ctx, prop)) {
          return ctx[prop];
        }
      }
      if (obj == null) {
        if (node.optional) return undefined;
        throw new TypeError(`Cannot read properties of ${obj} (reading '${node.property.name || '?'}')`);
      }
      let prop;
      if (node.computed) {
        prop = evaluate(node.property, ctx);
      } else {
        prop = node.property.name;
      }
      if (prop === undefined && node.optional) return undefined;
      return obj[prop];
    }

    case 'CallExpression': {
      const callee = evaluate(node.callee, ctx);
      if (typeof callee !== 'function') {
        throw new TypeError(`${node.callee.type} is not a function`);
      }
      const args = node.arguments.map((a) => {
        if (a.type === 'SpreadElement') {
          return evaluate(a.argument, ctx);
        }
        return evaluate(a, ctx);
      });
      // 关键：如果 callee 是 MemberExpression（如 this.items.map），
      // 需要把 receiver（this.items）作为 this 传过去，否则原生方法
      // 如 Array.prototype.map 会拿到 undefined 而炸。
      let receiver = null;
      if (node.callee.type === 'MemberExpression') {
        receiver = evaluate(node.callee.object, ctx);
      }
      // 判断是不是 state 上的 method：检查 receiver 是否就是 ctx.__state
      // 本身（说明是 state.foo()）；否则可能是 receiver 是数组 / 对象，
      // 调的是原生方法（map / filter / concat / push 等），用 receiver 当 this。
      const isStateMethod = receiver === ctx.__state;
      if (receiver != null && !isStateMethod) {
        return callee.apply(receiver, args);
      }
      return callee.apply(null, args);
    }

    case 'BinaryExpression': {
      const l = evaluate(node.left, ctx);
      const r = evaluate(node.right, ctx);
      switch (node.operator) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '%': return l % r;
        case '**': return l ** r;
        case '==': return l == r; // eslint-disable-line eqeqeq
        case '!=': return l != r; // eslint-disable-line eqeqeq
        case '===': return l === r;
        case '!==': return l !== r;
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        case '>=': return l >= r;
        case '&': return l & r;
        case '|': return l | r;
        case '^': return l ^ r;
        case '<<': return l << r;
        case '>>': return l >> r;
        case '>>>': return l >>> r;
        case 'in': return l in r;
        case 'instanceof': return l instanceof r;
      }
      throw new Error(`unsupported binary op: ${node.operator}`);
    }

    case 'LogicalExpression': {
      const l = evaluate(node.left, ctx);
      if (node.operator === '&&') return l ? evaluate(node.right, ctx) : l;
      if (node.operator === '||') return l ? l : evaluate(node.right, ctx);
      if (node.operator === '??') return l == null ? evaluate(node.right, ctx) : l;
      throw new Error(`unsupported logical op: ${node.operator}`);
    }

    case 'UnaryExpression': {
      const arg = evaluate(node.argument, ctx);
      switch (node.operator) {
        case '-': return -arg;
        case '+': return +arg;
        case '!': return !arg;
        case '~': return ~arg;
        case 'typeof': return typeof arg;
        case 'void': return void arg;
        case 'delete': {
          // 简化：只支持 delete obj.prop
          if (node.argument.type === 'MemberExpression') {
            const obj = evaluate(node.argument.object, ctx);
            const prop = node.argument.computed
              ? evaluate(node.argument.property, ctx)
              : node.argument.property.name;
            return delete obj[prop];
          }
          return true;
        }
      }
      throw new Error(`unsupported unary op: ${node.operator}`);
    }

    case 'ConditionalExpression':
      return evaluate(node.test, ctx)
        ? evaluate(node.consequent, ctx)
        : evaluate(node.alternate, ctx);

    case 'ArrayExpression':
      return node.elements.map((e) => (e && e.type === 'SpreadElement' ? evaluate(e.argument, ctx) : evaluate(e, ctx)));

    case 'ObjectExpression': {
      const obj = {};
      for (const p of node.properties) {
        if (p.type === 'SpreadElement') {
          Object.assign(obj, evaluate(p.argument, ctx));
          continue;
        }
        const key = p.computed ? evaluate(p.key, ctx) : (p.key.name || p.key.value);
        // 区分 kind: 'init' | 'get' | 'set'
        if (p.kind === 'get') {
          // ES6 getter：把函数体 AST 存到 obj 的 descriptor 里，
          // 让外层 (cube-engine/index.js) 用 callUserFunction 重新注入 state 后求值
          const getterNode = p.value;
          Object.defineProperty(obj, key, {
            get: function () {
              return evaluate(getterNode.body, { ...ctx });
            },
            enumerable: true,
            configurable: true,
          });
          // 同时把 AST 挂到 obj.__astGetters 上，供 callUserFunction 识别
          if (!obj.__astGetters) {
            Object.defineProperty(obj, '__astGetters', {
              value: {},
              writable: false,
              configurable: true,
              enumerable: false,
            });
          }
          obj.__astGetters[key] = getterNode;
        } else if (p.kind === 'set') {
          // 不支持 setter，先忽略
        } else {
          obj[key] = evaluate(p.value, ctx);
        }
      }
      return obj;
    }

    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      // 先声明计数器，再 map（避免在 lambda 里引用 TDZ 变量）
      let params_idx = 0;
      const params = node.params.map((p) => p.name || `__arg_${params_idx++}`);
      // 注：箭头函数不绑 this；普通函数绑 ctx.__state
      const isArrow = node.type === 'ArrowFunctionExpression';
      const capturedState = ctx.__state;
      const bodyNode = node.body;
      const errorSink = ctx.__errorSink; // 引擎在生命周期路径下注入；同步断言时为 undefined
      const wrapped = function (...callArgs) {
        const localCtx = { ...ctx };
        for (let i = 0; i < params.length; i++) localCtx[params[i]] = callArgs[i];
        // this 指向捕获时的 state
        localCtx.__state = capturedState;
        try {
          return evaluate(bodyNode, localCtx);
        } catch (e) {
          // 异步路径（didMount 的 setTimeout 回调里抛错）下不能冒到 unhandledRejection：
          // 把错推给 sink，让引擎能「错误日志」形式记录，调用者再据此断言。
          if (errorSink) {
            try { errorSink(e); } catch (_) {}
            return undefined;
          }
          throw e;
        }
      };
      // 打上标记，方便 callUserFunction 识别并重新注入当前 state
      wrapped.__astFn = true;
      wrapped.__astParams = params;
      wrapped.__astBody = bodyNode;
      return wrapped;
    }

    case 'BlockStatement': {
      // 遇到 ReturnStatement 要提前退出（模拟真实函数行为）
      for (const stmt of node.body) {
        const result = evaluate(stmt, ctx);
        if (result && result.__return__) {
          return result.value;
        }
      }
      return undefined;
    }

    // ========== 序列（Statement 序列） ==========
    case 'ReturnStatement':
      return { __return__: true, value: evaluate(node.argument, ctx) };

    case 'ExpressionStatement':
      return evaluate(node.expression, ctx);

    case 'VariableDeclaration': {
      // 处理 var/let/const 声明，把值绑到 ctx
      for (const decl of node.declarations) {
        const name = decl.id && decl.id.name;
        if (!name) continue; // 简化：不处理解构
        const value = decl.init ? evaluate(decl.init, ctx) : undefined;
        ctx[name] = value;
      }
      return undefined;
    }

    case 'NewExpression': {
      const ctor = evaluate(node.callee, ctx);
      const args = node.arguments.map((a) => evaluate(a, ctx));
      // 不支持 Reflect.construct；用 new
      return new ctor(...args);
    }

    case 'TemplateLiteral': {
      let out = '';
      for (let i = 0; i < node.quasis.length; i++) {
        out += node.quasis[i].value.cooked;
        if (i < node.expressions.length) out += String(evaluate(node.expressions[i], ctx));
      }
      return out;
    }

    case 'TaggedTemplateExpression': {
      const tag = evaluate(node.tag, ctx);
      const strings = node.quasi.quasis.map((q) => q.value.cooked);
      const raw = node.quasi.quasis.map((q) => q.value.raw);
      strings.raw = raw;
      const values = node.quasi.expressions.map((e) => evaluate(e, ctx));
      return tag(strings, ...values);
    }

    // ========== Sequence / Assignment ==========
    case 'SequenceExpression': {
      let last;
      for (const e of node.expressions) last = evaluate(e, ctx);
      return last;
    }

    case 'AssignmentExpression': {
      const v = evaluate(node.right, ctx);
      if (node.left.type === 'Identifier') {
        const name = node.left.name;
        if (name === 'this') throw new Error('Cannot assign to this');
        // 写到 state 上（ACT DSL 允许 this.xxx = yyy）
        if (ctx.__state && Object.prototype.hasOwnProperty.call(ctx.__state, name)) {
          ctx.__state[name] = v;
          return v;
        }
        ctx[name] = v;
        return v;
      }
      if (node.left.type === 'MemberExpression') {
        const obj = evaluate(node.left.object, ctx);
        const prop = node.left.computed
          ? evaluate(node.left.property, ctx)
          : node.left.property.name;
        if (node.operator === '=') { obj[prop] = v; return v; }
        if (node.operator === '+=') { obj[prop] = obj[prop] + v; return obj[prop]; }
        if (node.operator === '-=') { obj[prop] = obj[prop] - v; return obj[prop]; }
        if (node.operator === '*=') { obj[prop] = obj[prop] * v; return obj[prop]; }
        if (node.operator === '/=') { obj[prop] = obj[prop] / v; return obj[prop]; }
      }
      throw new Error(`unsupported assignment to ${node.left.type}`);
    }

    case 'UpdateExpression': {
      const arg = evaluate(node.argument, ctx);
      if (node.argument.type === 'Identifier') {
        const name = node.argument.name;
        const newVal = node.operator === '++' ? arg + 1 : arg - 1;
        if (ctx.__state && Object.prototype.hasOwnProperty.call(ctx.__state, name)) {
          ctx.__state[name] = newVal;
        } else {
          ctx[name] = newVal;
        }
        return node.prefix ? newVal : arg;
      }
      if (node.argument.type === 'MemberExpression') {
        const obj = evaluate(node.argument.object, ctx);
        const prop = node.argument.computed
          ? evaluate(node.argument.property, ctx)
          : node.argument.property.name;
        const newVal = node.operator === '++' ? obj[prop] + 1 : obj[prop] - 1;
        obj[prop] = newVal;
        return node.prefix ? newVal : obj[prop];
      }
      throw new Error(`unsupported update on ${node.argument.type}`);
    }

    case 'ChainExpression':
      return evaluate(node.expression, ctx);

    // ========== 控制流（v-for 偶尔用到三元里套函数） ==========
    case 'IfStatement': {
      if (evaluate(node.test, ctx)) return evaluate(node.consequent, ctx);
      if (node.alternate) return evaluate(node.alternate, ctx);
      return undefined;
    }

    case 'ForStatement': {
      // 处理 for (init; test; update) { body }
      if (node.init) evaluate(node.init, ctx);
      let last;
      while (true) {
        if (node.test && !evaluate(node.test, ctx)) break;
        last = evaluate(node.body, ctx);
        if (node.update) evaluate(node.update, ctx);
      }
      return last;
    }

    default:
      throw new Error(`evaluate: unsupported AST node type "${node.type}"`);
  }
}

/**
 * 直接对一个表达式字符串求值。
 *
 * @param {string} expr  表达式文本（如 'return this.title' 或 'this.title + 1'）
 * @param {object} ctx   上下文（含 __state / Math / Date / 等）
 * @param {object} opts  { raw: true 表示 expr 不需要 return 前缀 }
 */
function evalExpression(expr, ctx, opts = {}) {
  // 旧 vm 路径里有 "return xxx;" 的形态：剥掉 return 和末尾 ;
  let body = expr;
  if (!opts.raw) {
    const m = body.match(/^\s*return\s+/);
    if (m) body = body.slice(m[0].length);
    body = body.replace(/;\s*$/, '').trim();
  }
  // 处理 `this.xxx`：this 在 AST 求值里指向 ctx.__state，
  // 但成员访问 this.xxx 会 fallback 到 ctx（v-for 局部变量），
  // 所以把 `this.xxx` 替换成 `__state.xxx`，确保优先从 state 读
  body = body.replace(/\bthis\./g, '__state.');
  const ast = parseExpr(body);
  if (ast.__parseError) throw new Error(ast.__parseError);
  return evaluate(ast, ctx);
}

module.exports = {
  parseExpr,
  evaluate,
  evalExpression,
};
