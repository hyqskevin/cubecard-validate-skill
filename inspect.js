#!/usr/bin/env node
const fs = require('node:fs');
const path = process.argv[2];
const json = JSON.parse(fs.readFileSync(path, 'utf8'));
function walk(n, depth = 0) {
  const c = (n.attributes && n.attributes.entries) || [];
  const cls = c.find(x => x.key === 'class' && !x.bound);
  const vfor = n.vfor;
  const condKeys = Object.keys(n).filter(k => /cond|vif|vshow|v-/.test(k));
  const meta = [];
  if (vfor) meta.push('vfor');
  condKeys.forEach(k => {
    const v = n[k];
    if (typeof v === 'string') meta.push(`${k}=${v}`);
    else if (v && typeof v === 'object') meta.push(`${k}=${JSON.stringify(v).slice(0, 80)}`);
    else meta.push(`${k}=${v}`);
  });
  console.log(' '.repeat(depth * 2), n.tag || '?', cls ? cls.value : '', meta.join(' '));
  (n.children || []).forEach(ch => walk(ch, depth + 1));
}
walk(json.struct);
