import json, sys
d = json.load(sys.stdin)
def walk(n, depth=0):
    c = n.get('attributes', {}).get('entries') or []
    cls = next((x['value'] for x in c if x.get('key') == 'class' and not x.get('bound')), '')
    vfor = n.get('vfor')
    vcond = n.get('condition') or n.get('vif')
    tag = n.get('tag', '?')
    meta = []
    if vfor: meta.append('v-for')
    if vcond: meta.append(f'cond={vcond}')
    print(' ' * depth * 2, tag, cls, ' '.join(meta))
    for ch in n.get('children', []):
        walk(ch, depth + 1)
walk(d['struct'])
