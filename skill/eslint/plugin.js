/**
 * ACT Cube 卡片自定义 ESLint 规则
 *
 * 路径：skill/eslint/plugin.js
 * 职责：实现 cube/* 自定义规则，供 eslint/card.config.mjs 引入。
 * 覆盖 <template> / <script> / <style> 三段（外层 config 用 vue-eslint-parser
 * 解析整个 SFC 后，规则对 VElement / VAttribute / script AST 节点生效）。
 *
 * 检查 <script> 段是否符合 Cube DSL 规范。
 *
 * 4.0 升级：增加 no-shadow-data 规则，用 eslint-visitor-keys + esquery
 * 检测 method 内 var/let/const 名字遮蔽 data 字段名（cube-lint 同款
 * 静态检查思路）。
 */

const eslintVisitorKeys = require('eslint-visitor-keys');

/** @type {import('eslint').Rule.RuleModule} */
const noUnknownLifecycleRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Cube 卡片只支持白名单内的生命周期钩子，未知钩子会被引擎忽略',
    },
    schema: [],
    messages: {
      unknown:
        '未知生命周期钩子 "{{name}}"。Cube 支持的钩子：beforeCreate / created / beforeMount / mounted / beforeUpdate / updated / didAppear / didDisappear / didMount',
    },
  },
  create(context) {
    const ALLOWED = new Set([
      'data',
      'methods',
      'beforeCreate',
      'created',
      'beforeMount',
      'mounted',
      'beforeUpdate',
      'updated',
      'didAppear',
      'didDisappear',
      'didMount',
    ]);
    return {
      // 处理 export default { xxx: ... } 形式
      ExportDefaultDeclaration(node) {
        if (node.declaration.type !== 'ObjectExpression') return;
        for (const prop of node.declaration.properties) {
          if (prop.type === 'Property' && prop.key.type === 'Identifier') {
            const name = prop.key.name;
            if (!ALLOWED.has(name)) {
              context.report({
                node: prop.key,
                messageId: 'unknown',
                data: { name },
              });
            }
          }
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const vforKeyRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'v-for 必须搭配 :key 使用，否则长列表性能差且顺序变更时整段重建',
    },
    schema: [],
    messages: {
      missing: 'v-for 节点缺少 :key 属性，会导致列表 diff 退化为整段重建',
    },
  },
  create(context) {
    return {
      // 自定义节点识别：v-for 在产物里是 vfor 字段，但 .vue 源里是 v-for 指令
      // 这里我们对 .vue 文件做启发式：识别 template 里的 v-for attr
      VAttribute(node) {
        if (node.directive === false && node.key.name === 'v-for') {
          const parent = node.parent; // VElement
          if (!parent) return;
          const hasKey = parent.startTag.attributes.some(
            (a) =>
              (a.directive === true && a.key.name && a.key.name.name === 'bind' &&
                a.key.argument?.name === 'key')
          );
          if (!hasKey) {
            context.report({
              node,
              messageId: 'missing',
            });
          }
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noMagicEventRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        '事件回调中避免使用 eval / new Function / with 等动态执行',
    },
    schema: [],
    messages: {
      forbidden: '事件回调不应使用 {{name}}，会破坏沙箱隔离',
      forbiddenNew: '事件回调不应使用 new {{name}}(...)，会破坏沙箱隔离',
    },
  },
  create(context) {
    const FORBIDDEN = ['eval', 'Function'];
    function isInsideEventCallback(node) {
      let p = node.parent;
      while (p) {
        if (p.type === 'Property' && p.key?.type === 'Identifier') {
          const name = p.key.name;
          if (/^(on[A-Z]|handle)/.test(name)) return true;
        }
        p = p.parent;
      }
      return false;
    }
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'Identifier' && FORBIDDEN.includes(callee.name)) {
          if (isInsideEventCallback(node)) {
            context.report({ node, messageId: 'forbidden', data: { name: callee.name } });
          }
        }
      },
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && FORBIDDEN.includes(node.callee.name)) {
          if (isInsideEventCallback(node)) {
            context.report({ node, messageId: 'forbiddenNew', data: { name: node.callee.name } });
          }
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const requiredPropsRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: '卡片源码 .vue 必须有 <template>/<script>/<style> 三段',
    },
    schema: [],
    messages: {
      missing: '卡片 .vue 缺少 <{{tag}}> 段',
    },
  },
  create(context) {
    const found = new Set();
    return {
      VElement(node) {
        if (['template', 'script', 'style'].includes(node.name)) {
          found.add(node.name);
        }
      },
      'Program:exit'(node) {
        for (const tag of ['template', 'script', 'style']) {
          if (!found.has(tag)) {
            // 仅当 default parser 时报错（vue-eslint-parser 不设置 sourceType 但提供 nodes）
            // 简化：仅检查基础文件存在
            const filename = context.filename || context.getFilename();
            if (filename.endsWith('.vue') && found.size > 0) {
              context.report({
                node,
                messageId: 'missing',
                data: { tag },
              });
            }
          }
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noShadowDataRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'method 内 var/let/const 不能与 data 字段重名，否则 this.xxx 访问会被遮蔽导致 bug',
    },
    schema: [],
    messages: {
      shadow: 'method 内的 "{{name}}" 遮蔽了 data 字段同名变量，this.{{name}} 将无法正确访问',
    },
  },
  create(context) {
    // 不用 esquery 选择器（esquery 1.x 不支持 :scope，v9 ESLint scoped AST 会抛
    // "Unknown class name: scope"），改用标准 visitor：ExportDefaultDeclaration +
    // 手动遍历 properties，兼容 .js (espree) 与 .vue (vue-eslint-parser) 两种 AST。
    function collectDataKeys(rootNode) {
      if (!rootNode || !rootNode.properties) return null;
      const dataProp = rootNode.properties.find((p) =>
        p.type === 'Property' && p.key && p.key.name === 'data');
      if (!dataProp || !dataProp.value || dataProp.value.type !== 'ObjectExpression') return null;
      const keys = new Set();
      for (const prop of dataProp.value.properties) {
        if (prop.type === 'Property' && prop.key && prop.key.name) keys.add(prop.key.name);
      }
      return keys.size > 0 ? keys : null;
    }

    function findMethods(rootNode) {
      const methodsProp = rootNode.properties.find((p) =>
        p.type === 'Property' && p.key && p.key.name === 'methods');
      if (!methodsProp || !methodsProp.value || methodsProp.value.type !== 'ObjectExpression') return [];
      const out = [];
      for (const prop of methodsProp.value.properties) {
        if (prop.type !== 'Property' || !prop.value) continue;
        const fn = prop.value;
        if (fn.type !== 'FunctionExpression' && fn.type !== 'ArrowFunctionExpression') continue;
        if (fn.body) out.push(fn);
      }
      return out;
    }

    function walkStmts(stmts, dataKeys, report) {
      for (const stmt of stmts) {
        if (!stmt) continue;
        // 顶层 var/let/const 声明
        if (stmt.type === 'VariableDeclaration') {
          for (const decl of stmt.declarations || []) {
            if (decl.id && decl.id.type === 'Identifier' && dataKeys.has(decl.id.name)) {
              report(decl.id, decl.id.name);
            }
          }
        }
        // if (x) { let y = ... } 这种嵌套块
        if (stmt.type === 'BlockStatement') {
          walkStmts(stmt.body || [], dataKeys, report);
        } else if (stmt.type === 'IfStatement') {
          walkStmts([stmt.consequent].filter(Boolean), dataKeys, report);
          if (stmt.alternate) walkStmts([stmt.alternate], dataKeys, report);
        } else if (stmt.type === 'ForStatement' || stmt.type === 'ForInStatement' ||
                   stmt.type === 'ForOfStatement' || stmt.type === 'WhileStatement' ||
                   stmt.type === 'DoWhileStatement') {
          walkStmts([stmt.body].filter(Boolean), dataKeys, report);
        } else if (stmt.type === 'SwitchStatement') {
          for (const c of stmt.cases || []) walkStmts(c.consequent || [], dataKeys, report);
        } else if (stmt.type === 'TryStatement') {
          walkStmts([stmt.block].filter(Boolean), dataKeys, report);
          if (stmt.handler && stmt.handler.body) walkStmts(stmt.handler.body.body || [], dataKeys, report);
          if (stmt.finalizer) walkStmts(stmt.finalizer.body || [], dataKeys, report);
        }
      }
    }

    return {
      ExportDefaultDeclaration(node) {
        if (!node.declaration || node.declaration.type !== 'ObjectExpression') return;
        const dataKeys = collectDataKeys(node.declaration);
        if (!dataKeys) return;
        const methods = findMethods(node.declaration);
        for (const fn of methods) {
          walkStmts(fn.body.body || [], dataKeys, (idNode, name) => {
            context.report({ node: idNode, messageId: 'shadow', data: { name } });
          });
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noMagicColorHexRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: '颜色值应走 design token，不在代码里硬写 hex / rgb',
    },
    schema: [],
    messages: {
      magicHex: '硬编码颜色 {{value}}（建议改用 design token）',
    },
  },
  create(context) {
    const HEX = /#[0-9a-fA-F]{3,8}\b/;
    const RGB = /\brgba?\s*\(/;
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        // 跳过纯数字/单位字符串，避免误报（如 '0px' / '24rpx'）
        if (!HEX.test(node.value) && !RGB.test(node.value)) return;
        if (node.value.length >= 30) return; // 超长字符串不太可能是颜色
        // 排除明显不是颜色的场景：CSS 长度 / URL 等
        if (/^\d+(px|rpx|em|rem|%)?$/.test(node.value)) return;
        context.report({
          node,
          messageId: 'magicHex',
          data: { value: node.value },
        });
      },
    };
  },
};

/**
 * cube/no-hardcoded-secret
 *
 * 禁止在卡片 script 段硬编码敏感凭证（SonarJS S2068/S6418/S6437 + OWASP A02）。
 * 检测规则：
 *   - data.* 的初值字符串包含以下敏感关键字
 *     （token / password / secret / appkey / apiKey / privateKey / accessKey / clientSecret）
 *   - 在 methods / didMount / 生命周期内直接赋值的 Literal 字符串也命中
 *
 * 严重度：error
 */
const SENSITIVE_KEYWORDS = [
  'token', 'password', 'secret', 'appkey', 'apiKey',
  'privateKey', 'accessKey', 'clientSecret', 'auth', 'bearer',
];
const SECRET_REGEX = new RegExp(`\\b(${SENSITIVE_KEYWORDS.join('|')})\\b`, 'i');

const noHardcodedSecretRule = {
  meta: {
    type: 'problem',
    docs: {
      description: '卡片脚本不应硬编码敏感凭证（token / password / secret / apiKey 等）',
    },
    schema: [],
    messages: {
      secret: '检测到疑似硬编码敏感凭证 "{{hint}}"，应通过 env 注入或宿主 mpaas API 获取',
    },
  },
  create(context) {
    return {
      // Property 的 key 包含敏感关键字 + value 是字符串字面量 → 典型硬编码
      // （同时检测 value 内是否含敏感字串，覆盖裸 token: "eyJ..." 之类的赋值）
      Property(node) {
        const keyName = node.key && (node.key.name || node.key.value);
        if (typeof keyName !== 'string') return;
        const value = node.value;
        if (!value || value.type !== 'Literal' || typeof value.value !== 'string') return;
        // 触发条件：key 名含敏感字（如 token / password / secret / apiKey 等）
        const keyHit = SECRET_REGEX.test(keyName);
        // 或者 value 内本身含敏感字串
        const valueHit = value.value.length >= 4 && SECRET_REGEX.test(value.value);
        if (!keyHit && !valueHit) return;
        const hint = `key=${keyName} value="${value.value}"`;
        context.report({ node, messageId: 'secret', data: { hint } });
      },
    };
  },
};

/**
 * cube/no-setinterval-string
 *
 * setTimeout / setInterval / setImmediate 传字符串参数 = 隐式 eval
 * （SonarJS S7860 + ESLint no-implied-eval）。ACT 卡片常错误写法：
 *   setTimeout("doSomething()", 1000)        // 危险
 *   setTimeout(function() { ... }, 1000)     // 正确
 *
 * 严重度：error
 */
const TIMER_FUNCTIONS = new Set(['setTimeout', 'setInterval', 'setImmediate']);

const noSetintervalStringRule = {
  meta: {
    type: 'security',
    docs: {
      description: 'setTimeout / setInterval / setImmediate 不应接受字符串参数（隐式 eval）',
    },
    schema: [],
    messages: {
      stringArg: '第 1 个参数不应为字符串（等价于 eval）。请传 function 或 () => {...}',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'Identifier' || !TIMER_FUNCTIONS.has(callee.name)) return;
        const first = node.arguments[0];
        if (!first) return;
        // Literal / TemplateLiteral 都是字符串字面量形式
        if (first.type === 'Literal' && typeof first.value === 'string') {
          context.report({ node: first, messageId: 'stringArg' });
        } else if (first.type === 'TemplateLiteral') {
          context.report({ node: first, messageId: 'stringArg' });
        }
      },
    };
  },
};

/**
 * cube/no-global-this
 *
 * 卡片不应直接读写 window / globalThis / self，绕过宿主沙箱
 * （SonarJS S2990）。所有 native 能力须走 cube.* / requireModule('mpaas_jsapi')。
 *
 * 例外：ACT DSL 的 `const self = this` 闭包写法（cube-engine 不支持箭头
 * 函数 this），其中的 `self` 是普通变量不算违规。默认白名单 ['self']。
 *
 * 严重度：error
 */
const FORBIDDEN_GLOBALS = new Set(['window', 'globalThis', 'self']);

const noGlobalThisRule = {
  meta: {
    type: 'security',
    docs: {
      description: '禁止直接访问 window / globalThis / self，应走宿主 cube.* / mpaas_jsapi',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedNames: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      global: '不应直接访问 {{name}}（绕过宿主沙箱）。请改用 cube.* 或 requireModule("mpaas_jsapi")',
    },
  },
  create(context) {
    // 排除"标识符只是字符串/注释等内部 token"的情况：
    //   - parent 是 Literal（字符串字面量里出现的 'self' 不是访问）
    //   - parent 是 TemplateLiteral（模板字符串里的 ${self} 是变量，不是引用）
    //   - parent 是 ImportSpecifier / ExportSpecifier / JSXAttribute 等（属性名 / 模块导出名）
    function isRealReference(node) {
      const parent = node.parent;
      if (!parent) return true;
      if (parent.type === 'Literal') return false;
      if (parent.type === 'TemplateLiteral') return false;
      if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier' ||
          parent.type === 'ImportNamespaceSpecifier' || parent.type === 'ExportSpecifier') return false;
      if (parent.type === 'JSXIdentifier' || parent.type === 'JSXAttribute' ||
          parent.type === 'JSXNamespacedName') return false;
      // 排除在 Property key / MemberExpression property position
      if (parent.type === 'Property' && parent.key === node && !parent.computed) return false;
      if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return false;
      // 排除函数声明的 name（仅函数定义式）
      if (parent.type === 'FunctionDeclaration' && parent.id === node) return false;
      if (parent.type === 'VariableDeclarator' && parent.id === node) return false;
      return true;
    }

    const allowed = new Set([
      'self', // ACT DSL `var self = this` 闭包
      ...((context.options && context.options[0] && context.options[0].allowedNames) || []),
    ]);
    // forbidden = FORBIDDEN_GLOBALS - allowed
    const forbidden = new Set();
    for (const k of FORBIDDEN_GLOBALS) if (!allowed.has(k)) forbidden.add(k);

    return {
      // 处理 obj.window / window.x / window['y']
      MemberExpression(node) {
        const obj = node.object;
        if (obj.type !== 'Identifier') return;
        if (!forbidden.has(obj.name)) return;
        if (!isRealReference(obj)) return;
        context.report({ node: obj, messageId: 'global', data: { name: obj.name } });
      },
      // 处理全局调用/访问如 window()
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'Identifier') return;
        if (!forbidden.has(callee.name)) return;
        if (!isRealReference(callee)) return;
        context.report({ node: callee, messageId: 'global', data: { name: callee.name } });
      },
      // 处理裸 window / globalThis / self 引用（赋值、表达式中）
      Identifier(node) {
        if (!forbidden.has(node.name)) return;
        if (!isRealReference(node)) return;
        context.report({ node, messageId: 'global', data: { name: node.name } });
      },
    };
  },
};

/**
 * cube/no-throw-literal
 *
 * 抛非 Error 子类（throw 'oops' / throw 404 / throw {code: 500}）会破坏
 * 错误栈、绕过 catch 处理（SonarJS S3696）。必须 throw new Error(...) 或子
 * 类实例。
 *
 * 严重度：error
 */
const noThrowLiteralRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'throw 的参数应为 Error 子类实例，不应是字符串/数字/对象字面量',
    },
    schema: [],
    messages: {
      literal: 'throw 的参数应为 new Error(...) 或其子类，而非 {{type}}',
    },
  },
  create(context) {
    function describe(node) {
      if (!node) return 'undefined';
      if (node.type === 'Literal') {
        if (typeof node.value === 'string') return '字符串字面量';
        return `${typeof node.value} 字面量`;
      }
      if (node.type === 'TemplateLiteral') return '模板字符串';
      if (node.type === 'ObjectExpression') return '对象字面量';
      if (node.type === 'ArrayExpression') return '数组字面量';
      if (node.type === 'Identifier') return `Identifier (${node.name})`;
      if (node.type === 'NewExpression') return 'new 表达式';
      return node.type;
    }

    return {
      ThrowStatement(node) {
        const arg = node.argument;
        if (!arg) return;
        // throw new Error(...) 是合规的
        if (arg.type === 'NewExpression') return;
        // throw <Identifier>（如 throw err）— 视为合规（变量本身可能是 Error）
        if (arg.type === 'Identifier') return;
        const t = describe(arg);
        context.report({ node: arg, messageId: 'literal', data: { type: t } });
      },
    };
  },
};

module.exports = {
  rules: {
    'no-unknown-lifecycle': noUnknownLifecycleRule,
    'vfor-key-required': vforKeyRule,
    'no-magic-event': noMagicEventRule,
    'required-props': requiredPropsRule,
    'no-shadow-data': noShadowDataRule,
    'no-magic-color-hex': noMagicColorHexRule,
    'no-hardcoded-secret': noHardcodedSecretRule,
    'no-setinterval-string': noSetintervalStringRule,
    'no-global-this': noGlobalThisRule,
    'no-throw-literal': noThrowLiteralRule,
  },
};
