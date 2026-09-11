/**
 * 极简 Cube 引擎 v2 —— AST 版（替代 vm.Script 字符串求值）
 *
 * 关键升级（v1 → v2）：
 *   v1：vm.Script + this. 字符串替换 + sandbox 全局污染
 *   v2：espree 9 解 AST → evaluate 解释执行
 *
 * 行为保持：
 *   - loadCard(card)  返回 {json, js, mock} 同 v1
 *   - createEngine(card, opts)  返回 engine 实例
 *   - engine.evalExpr(expr)    表达式求值（公开 API 兼容 v1）
 *   - engine.trigger(nid, eventName, eventObj)
 *   - engine.vdom / state / log / events / lifecycleCalled
 *
 * 数据流：
 *   main.js (IIFE) → espree 解 AST
 *     → 找出 `return main` 那个 ReturnStatement
 *     → main 是 ObjectExpression → 走我们的 evaluate 在 ctx.__state
 *       上展开（this 指 ctx.__state，方法自动 bind 到 state）
 */

const espree = require('espree');
const path = require('node:path');
const { evaluate, evalExpression, parseExpr } = require('./expressions');

const PARSE_OPTS = { ecmaVersion: 'latest', sourceType: 'script' };

// 宿主（mPaas ACT 运行时）全局 API stub。评测引擎不跑真机/真 RPC，
// 但卡片会在生命周期或方法里访问宿主对象（cube.navigateTo / cube.getParams /
// mPaas.RPC），缺了会直接崩。这里给最小空实现，保持调用不抛异常。
function buildHostGlobals() {
  return {
    cube: {
      navigateTo() {},
      getParams() { return {}; },
    },
    mPaas: {
      RPC: {
        call() { return Promise.reject(new Error('mPaas.RPC 在评测引擎中不可用')); },
      },
    },
  };
}

/**
 * 从 main.js 源码里抓出 export main = {...} 那个 ObjectExpression，
 * 同时收集产物 IIFE 顶层的内联模块对象（import 编译后展开的 const X = {...}）。
 * ACT 产物 IIFE 形如：
 *   (function () {
 *     'use strict';
 *     const toast = { ... };       // import ... from '.../common/toast' 内联展开
 *     const ENV = { ... };         // import ENV from '.../env/env.sit.js' 内联展开
 *     var main = { data, methods, beforeCreate, ... };
 *     return main;
 *   })();
 */
function extractMainObjectExpression(mainJsCode) {
  let ast;
  try {
    ast = espree.parse(mainJsCode, PARSE_OPTS);
  } catch (e) {
    return { __parseError: e.message };
  }
  // 顶层是 ExpressionStatement (IIFE CallExpression)
  // IIFE 内部是 FunctionExpression，body 是 BlockStatement，里面有
  //   顶层 const/var X = {...}   → globals（import 内联的模块对象）
  //   VariableDeclarator(main = {...})
  //   ReturnStatement(main)
  for (const top of ast.body) {
    if (top.type !== 'ExpressionStatement') continue;
    const expr = top.expression;
    if (expr.type === 'CallExpression') {
      const callee = expr.callee;
      if (callee.type !== 'FunctionExpression') continue;
      const body = callee.body;
      if (!body || body.type !== 'BlockStatement') continue;

      // 收集顶层内联模块对象：const/let/var X = <ObjectExpression>
      // 排除叫 main 的对象（那是卡片本体，单独返回）。求值失败的跳过。
      const globals = [];
      for (const stmt of body.body) {
        if (stmt.type !== 'VariableDeclaration') continue;
        for (const decl of stmt.declarations) {
          const name = decl.id && decl.id.name;
          if (!name || name === 'main') continue;
          if (decl.init && decl.init.type === 'ObjectExpression') {
            globals.push({ name, ast: decl.init });
          }
        }
      }

      for (const stmt of body.body) {
        // 找 return main;
        if (stmt.type === 'ReturnStatement' && stmt.argument && stmt.argument.type === 'Identifier') {
          const returnName = stmt.argument.name;
          // 找 var main = {...}
          for (const s2 of body.body) {
            if (s2.type !== 'VariableDeclaration') continue;
            for (const decl of s2.declarations) {
              if (decl.id && decl.id.name === returnName && decl.init && decl.init.type === 'ObjectExpression') {
                return { mainObj: decl.init, globals };
              }
            }
          }
        }
      }
    }
    // 兜底：ExpressionStatement 直接是 ObjectExpression
    if (expr.type === 'ObjectExpression') return { mainObj: expr, globals: [] };
  }
  return { __parseError: '未找到 main 对象' };
}

/**
 * 把 main.js 加载并求值，返回展开后的 instance 对象（data / methods / 生命周期 全部 ready）
 */
function loadInstance(mainJsCode) {
  const found = extractMainObjectExpression(mainJsCode);
  if (found.__parseError) return { __parseError: found.__parseError };
  const { mainObj, globals } = found;

  // 用一个一次性 state 求值 instance 对象（拿到 methods / lifecycle AST）。
  // 之后 createEngine 会把 engine.state 重新初始化为 instance.data 的副本，
  // 并把 methods 平铺上去。这里只关心 methods 和 lifecycle 函数 AST。
  const tmpState = {};
  const ctx = {
    __state: tmpState,
    Math, Date, JSON, Object, Array, String, Number, Boolean, Promise,
    parseInt, parseFloat, isNaN, isFinite,
    setTimeout, clearTimeout, setInterval, clearInterval,
    ...buildHostGlobals(),
    console: {
      log: (...args) => { /* swallowed */ },
      warn: (...args) => { /* swallowed */ },
      error: (...args) => { /* swallowed */ },
    },
  };

  // 依赖注入：先把产物顶层内联的模块对象（toast / format / ENV 等）求值出来，
  // 挂到 ctx 和返回的 instance 上，供 main 求值以及后续 createEngine 的
  // methods / template 表达式解析使用（buildEvalCtx 会展开 instance.__globals）。
  const globalsValues = {};
  for (const g of globals) {
    try {
      globalsValues[g.name] = evaluate(g.ast, ctx);
    } catch (_) {
      // 求值失败的模块对象不注入（保持幂等，不阻塞主流程）
    }
  }
  Object.assign(ctx, globalsValues);

  try {
    const instance = evaluate(mainObj, ctx);
    if (instance && typeof instance === 'object') {
      Object.defineProperty(instance, '__globals', {
        value: globalsValues,
        writable: false,
        configurable: true,
        enumerable: false,
      });
    }
    return { instance, __parseError: null };
  } catch (e) {
    return { __parseError: e.message };
  }
}

/**
 * 创建引擎实例。
 *
 * @param {{json, js, mock}} card
 * @param {{useMock?: boolean}} opts
 */
function createEngine(card, opts = {}) {
  const useMock = opts.useMock === true;
  const engine = {
    log: [],
    vdom: null,
    state: {},
    events: new Map(),
    logic: null,
    lifecycleCalled: [],
    useMock,
    __vForStack: [],

    /** 求值表达式（公开 API 兼容 v1）。extraCtx 用于注入 v-for 局部变量 */
    evalExpr(expr, extraCtx) {
      const ctx = buildEvalCtx(this);
      if (extraCtx) {
        for (const [k, v] of Object.entries(extraCtx)) ctx[k] = v;
      }
      try {
        return evalExpression(expr, ctx, { raw: false });
      } catch (e) {
        this.log.push(['error', `表达式求值失败 ${expr}:`, e.message]);
        throw e;
      }
    },

    /** 触发节点事件 */
    trigger(nid, eventName, eventObj) {
      const handlers = this.events.get(nid);
      if (!handlers) return null;
      const handler = handlers[eventName];
      if (!handler) return null;
      return handler(eventObj);
    },
  };

  // 1. 加载 main.js
  const loaded = loadInstance(card.js);
  if (loaded.__parseError) {
    engine.log.push(['error', 'main.js 解析失败:', loaded.__parseError]);
    return engine;
  }
  const instance = loaded.instance;
  engine.logic = instance;
  // 依赖注入：产物顶层内联的模块对象（toast / format / date / validator / ENV 等）
  // 存入 engine.modules，buildEvalCtx 会在每个表达式求值时展开，供 methods / 模板使用
  engine.modules = Object.assign({}, loaded.__globals || instance.__globals || {});

  // 2. 初始化 state = 初始 data
  engine.state = JSON.parse(JSON.stringify(instance.data || {}));

  // 2.5 合并 mock data
  if (useMock && card.mock && card.mock[0] && card.mock[0].data) {
    try {
      const mockData = JSON.parse(card.mock[0].data);
      Object.assign(engine.state, mockData);
    } catch (e) {
      engine.log.push(['warn', 'mock data 解析失败:', e.message]);
    }
  }

  // 3. 把 methods + getter 平铺到 state 上
  // ACT DSL 的 this 指向"合并后的 state"，所以 methods 需要 bind 到 state
  // 才能让 this.title 之类的访问成立。
  if (instance.methods) {
    const descs = Object.getOwnPropertyDescriptors(instance.methods);
    for (const [k, desc] of Object.entries(descs)) {
      if (typeof desc.value === 'function') {
        // 普通方法：用闭包包一层，调用时把 state 当 this
        Object.defineProperty(engine.state, k, {
          value: function (...args) {
            // 调用时入 ctx，this 由 evaluate 处理
            const ctx = buildEvalCtx(engine);
            return callUserFunction(desc.value, ctx, args);
          },
          writable: false,
          configurable: true,
          enumerable: false,
        });
      } else if (typeof desc.get === 'function') {
        // ES6 getter：包装成属性 getter
        // 检查 instance.methods 上有没有 __astGetters（来自 evaluate 的 ObjectExpression）
        const astGetters = instance.methods.__astGetters;
        if (astGetters && astGetters[k]) {
          // 有 AST：直接 evaluate AST 函数体，注入当前 state
          // 注意这里不走 evalExpression 的 this. → __state. 替换，
          // 因为 getter 内部访问 this.filter 等需要 MemberExpression fallback
          Object.defineProperty(engine.state, k, {
            get: function () {
              const ctx = buildEvalCtx(engine);
              // 用 try-catch 包装，避免 getter 求值失败导致整个引擎崩溃
              try {
                return evaluate(astGetters[k].body, ctx);
              } catch (e) {
                engine.log.push(['error', `getter ${k} 求值失败:`, e.message]);
                return undefined;
              }
            },
            configurable: true,
            enumerable: false,
          });
        } else {
          // 无 AST：闭包已捕获 state（可能是旧路径）
          Object.defineProperty(engine.state, k, {
            get: function () {
              const ctx = buildEvalCtx(engine);
              return callUserFunction(desc.get, ctx, []);
            },
            configurable: true,
            enumerable: false,
          });
        }
      }
    }
  }

  // 4. 生命周期调用
  callLifecycle(engine, instance, 'beforeCreate');
  callLifecycle(engine, instance, 'created');

  // 5. 构建 vdom
  engine.vdom = expandNode(card.json.struct, engine);

  // 6. didMount（asyncSafe: didMount 内的 setTimeout/Promise 回调 throw 时
  //    会通过 evaluate 的 __errorSink 落到 engine.log，不冒到 unhandledRejection）
  callLifecycle(engine, instance, 'didMount', { asyncSafe: true });

  // 6.5 didMount 可能改了 state，重新展开
  engine.vdom = expandNode(card.json.struct, engine);

  // 7. didAppear
  callLifecycle(engine, instance, 'didAppear', { asyncSafe: true });

  // 8. didMount/didAppear 里的 setTimeout/Promise 会在引擎返回后继续执行，
  //    若其中抛错会变 unhandledRejection → node:test 自身告警（计入「test did not
  //    finish before its parent」）。createEngine 默认挂一个 Node 全局
  //    unhandledRejection 哨兵，把卡内未捕获异步 throw 推到 engine.log，
  //    让调用者「错误日志」断言能拿到。调用方若想自己监听可传 opts.silenceAsync。
  if (!opts.silenceAsync) {
    attachAsyncGuard(engine);
  }

  return engine;
}

/**
 * 给 engine 挂一个 process-level unhandledRejection 哨兵。
 * 把后续短窗口内的 reject（直到下次 createEngine / silenceAsync 触发）
 * 转到 engine.log。注意：Node 的 unhandledRejection 没有 owner 上下文，
 * 我们用「注册时间 < 50ms 才接」匹配刚跑完的 createEngine。这是 best-effort，
 * 配合 cards/lib-level 防御（如 _fetchPayableOrder 兜底 null）一起生效。
 */
let _asyncGuardEngine = null;
let _asyncGuardUntil = 0;
function attachAsyncGuard(engine) {
  _asyncGuardEngine = engine;
  _asyncGuardUntil = Date.now() + 250;
  // 只装一次
  if (attachAsyncGuard._installed) return;
  attachAsyncGuard._installed = true;
  process.on('unhandledRejection', (e) => {
    const now = Date.now();
    if (now > _asyncGuardUntil) return; // 已过期，放行
    const eng = _asyncGuardEngine;
    if (!eng) return;
    eng.log.push(['error', '生命周期异步回调异常 (unhandledRejection):', e && e.message]);
  });
}

function buildEvalCtx(engine) {
  // ctx：Math/Date 全局；this = state；v-for 局部变量也通过 state 注入
  // （state 上有 vfor 时直接定义 get/set 即可，但简单做法是用临时 ctx）
  const ctx = {
    __state: engine.state,
    Math, Date, JSON, Object, Array, String, Number, Boolean, Promise,
    parseInt, parseFloat, isNaN, isFinite,
    setTimeout, clearTimeout, setInterval, clearInterval,
    ...buildHostGlobals(),
    console: {
      log: (...args) => engine.log.push(['log', ...args]),
      warn: (...args) => engine.log.push(['warn', ...args]),
      error: (...args) => engine.log.push(['error', ...args]),
    },
  };
  // 依赖注入：把产物顶层内联的模块对象展开到 ctx 顶层，供裸标识符解析
  if (engine.modules) {
    for (const [k, v] of Object.entries(engine.modules)) ctx[k] = v;
  }
  return ctx;
}

function callUserFunction(fn, ctx, args) {
  // fn 可能是两种形态：
  //   1) AST 节点（type='FunctionExpression'），来自 main.js 里未被 evaluate 的源码
  //   2) 已经是 evaluate 出来的 JavaScript 函数（instance.methods.foo 被 evaluate
  //      后变成函数闭包）
  // 区分方式：看 fn.type === 'FunctionExpression'
  if (fn && fn.type === 'FunctionExpression' || fn && fn.type === 'ArrowFunctionExpression') {
    const fnBody = fn.body;
    const params = fn.params.map((p) => p.name);
    const fnCtx = { ...ctx };
    for (let i = 0; i < params.length; i++) fnCtx[params[i]] = args[i];
    return evaluate(fnBody, fnCtx);
  }
  // 否则是 evaluate 出来的闭包：先试探它是否有 __astFn 标记
  if (fn && fn.__astFn) {
    const fnCtx = { ...ctx };
    for (let i = 0; i < fn.__astParams.length; i++) fnCtx[fn.__astParams[i]] = args[i];
    return evaluate(fn.__astBody, fnCtx);
  }
  // 兜底：普通 JS 函数，this 指向 state
  return fn.apply(ctx.__state, args);
}

function callLifecycle(engine, instance, name, opts = {}) {
  if (typeof instance[name] !== 'function') return;
  try {
    const ctx = buildEvalCtx(engine);
    // 异步路径（didMount/didAppear 里的 setTimeout/Promise 回调）：把异步 throw
    // 推到 engine.log，避免 unhandledRejection 跨测试边界。
    if (opts.asyncSafe) {
      ctx.__errorSink = (e) => {
        engine.log.push(['error', `生命周期 ${name} 异步回调异常:`, e && e.message]);
      };
    }
    callUserFunction(instance[name], ctx, []);
    engine.lifecycleCalled.push(name);
  } catch (e) {
    engine.log.push(['error', `生命周期 ${name} 调用失败:`, e.message]);
  }
}

/**
 * 展开 struct 节点 → vnode。
 * 关键变化：v-for 上下文不再污染 engine.sandbox，
 * 而是给每个 vnode 打 _vForCtx（事件触发时按 ctx 求值）。
 */
function expandNode(node, engine, inheritedCtx) {
  if (!node) return null;

  // v-if 编译期评估
  if (typeof node.vIf === 'string') {
    let cond;
    try {
      cond = engine.evalExpr(node.vIf, inheritedCtx);
    } catch (e) {
      engine.log.push(['error', `v-if 求值失败 ${node.vIf}:`, e.message]);
      cond = false;
    }
    if (!cond) return null;
  }

  const vnode = {
    nid: node.nid,
    tag: node.tag,
    className: null,
    attributes: {},
    boundAttributes: {},
    events: {},
    text: node.text || '',
    children: [],
    vfor: node.vfor,
    vif: node.vIf,
    _raw: node,
    _vForCtx: inheritedCtx ? { ...inheritedCtx } : {}, // 嵌套 v-for 的上下文（item / idx / ...）
  };

  // 属性
  for (const attr of node.attributes?.entries || []) {
    if (attr.isEvent) {
      // ACT 产物形态：'this.fn.bind(this)' 或 'this.fn.bind(this,\'all\')'
      // 或 'this.fn.bind(this,this.gIdx,this.idx)'（this 引用预置）
      const handler = compileEventHandler(attr.value, engine, vnode);
      if (handler) {
        vnode.events[attr.key] = handler;
        if (!engine.events.has(node.nid)) engine.events.set(node.nid, vnode.events);
      }
    } else if (attr.bound) {
      // bind 属性（把 v-for 上下文注入表达式求值）
      vnode.boundAttributes[attr.key] = attr.value;
      try {
        vnode.attributes[attr.key] = engine.evalExpr(attr.value, vnode._vForCtx);
      } catch (e) {
        vnode.attributes[attr.key] = `__ERR__: ${e.message}`;
      }
    } else {
      vnode.attributes[attr.key] = attr.value;
      if (attr.key === 'class') vnode.className = attr.value;
    }
  }

  // v-for 展开
  if (node.vfor) {
    try {
      const items = engine.evalExpr(node.vfor.items, vnode._vForCtx);
      if (Array.isArray(items)) {
        vnode.children = items.map((item, idx) => {
          const childClone = JSON.parse(JSON.stringify(node));
          delete childClone.vfor;
          // 把外层 v-for 上下文带过去
          const ctx = { ...vnode._vForCtx, [node.vfor.item]: item, [node.vfor.index]: idx };
          const expanded = expandNode(childClone, engine, ctx);
          if (expanded) {
            expanded._vForCtx = ctx;
            // 子节点也要继承这个 ctx
            for (const c of expanded.children || []) assignVForCtx(c, ctx);
          }
          return expanded;
        });
      }
    } catch (e) {
      engine.log.push(['error', 'v-for 展开失败:', e.message]);
    }
    return vnode;
  }

  // 普通 children
  if (node.children) {
    vnode.children = node.children
      .map((c) => expandNode(c, engine, vnode._vForCtx))
      .filter((c) => c !== null);
    // 继承父 v-for 上下文
    for (const c of vnode.children) {
      if (c && Object.keys(vnode._vForCtx).length) c._vForCtx = { ...vnode._vForCtx };
    }
  }
  return vnode;
}

/**
 * 编译事件处理器：从 'this.fn.bind(this,...)' 解析出 method 名 + 预置参数 AST，
 * 返回一个 function(eventObj) 闭包。
 *
 * 用 espree 而不是正则，能正确处理任意表达式预置（如 `onAdd(() => foo())`）。
 */
function compileEventHandler(value, engine, vnode) {
  let ast;
  try {
    ast = espree.parse(value, PARSE_OPTS);
  } catch (e) {
    engine.log.push(['error', `事件表达式无法解析 ${value}:`, e.message]);
    return null;
  }
  // 期望：MemberExpression(this.fn, .bind) 然后 CallExpression(... this, arg1, arg2)
  // 但 ACT 产物里整体就是一个 ExpressionStatement：this.fn.bind(this, ...)
  const expr = ast.body[0] && ast.body[0].expression;
  if (!expr || expr.type !== 'CallExpression') {
    engine.log.push(['error', `事件表达式不是调用形态: ${value}`]);
    return null;
  }
  const callee = expr.callee;
  if (callee.type !== 'MemberExpression' || callee.property.name !== 'bind') {
    engine.log.push(['error', `事件表达式不是 .bind(...) 形态: ${value}`]);
    return null;
  }
  // callee.object 应该是 this.fn
  const methodAst = callee.object; // MemberExpression(this, fn) 或 Identifier('fn')
  // 第一个参数 this（不重要，引擎注入）
  // 其余参数是预置表达式（AST 节点）
  const presetArgs = expr.arguments.slice(1);

  return function (eventObj) {
    // 把 v-for 上下文注入临时 ctx（item / idx / gIdx 等）
    const ctx = buildEvalCtx(engine);
    for (const [k, v] of Object.entries(vnode._vForCtx || {})) {
      ctx[k] = v;
    }
    // 求预置参数
    const presets = [];
    for (const arg of presetArgs) {
      try {
        presets.push(evaluate(arg, ctx));
      } catch (e) {
        engine.log.push(['error', `事件预置参数求值失败:`, e.message]);
        presets.push(undefined);
      }
    }
    // 找到 method 在 state 上的引用（保持 this 指向 state）
    const methodName = methodAst.property && methodAst.property.name;
    if (!methodName) {
      engine.log.push(['error', `事件方法名提取失败`]);
      return null;
    }
    const fn = engine.state[methodName];
    if (typeof fn !== 'function') {
      engine.log.push(['error', `事件方法 ${methodName} 未找到`]);
      return null;
    }
    return fn.apply(engine.state, [...presets, eventObj]);
  };
}

function assignVForCtx(vnode, ctx) {
  if (!vnode) return;
  vnode._vForCtx = { ...ctx };
  for (const c of vnode.children || []) assignVForCtx(c, ctx);
}

function findByNid(vdom, nid) {
  if (!vdom) return null;
  if (vdom.nid === nid) return vdom;
  for (const child of vdom.children || []) {
    const found = findByNid(child, nid);
    if (found) return found;
  }
  return null;
}

function findByClass(vdom, cls) {
  const results = [];
  if (!vdom) return results;
  if (!vdom.vfor && vdom.className) {
    const classes = vdom.className.split(/\s+/);
    if (classes.includes(cls)) results.push(vdom);
  }
  for (const child of vdom.children || []) {
    results.push(...findByClass(child, cls));
  }
  return results;
}

module.exports = {
  createEngine,
  findByNid,
  findByClass,
  expandNode,
  assignVForCtx,
  // 内部导出方便调试
  loadInstance,
  extractMainObjectExpression,
};
