"""Builds packages/target-wal/data/{a360-ibm-rules,ibm-catalog-30}.json.

Inputs (not stored in the repo):
  - mapping dictionary v2 (aa_to_ibm_rpa_mapping_v2.json, validated 2026-11-02, A-27)
  - IBM RPA 30.0.x command catalog scraped from the reference (ibm_catalog.json, 598 commands
    with syntax), patched with commands it lacks that the generator writes.

Usage: python3 scripts/build-wal-rules.py <dictionary_v2.json> <ibm_catalog.json>
"""
import json, re, sys, os

dict_path, cat_path = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.join(here, '..', 'packages', 'target-wal', 'data')
os.makedirs(out_dir, exist_ok=True)

# ---------- IBM catalog ----------
def strip(t):
    t = (t or '').strip()
    m = re.match(r'^Nullable<(.+)>$', t)
    return m.group(1) if m else t

cat = {}
for c in json.load(open(cat_path)):
    if not c.get('syntax'):
        continue
    cat[c['command']] = {
        'p': {p['name']: strip(p['type']) for p in c['params']},
        'o': {o['name']: strip(o['type']) for o in c.get('outputs', [])},
    }
# Commands missing from the scraped catalog; parameters from the 30.0.x reference pages
# (2026-11-02). `null` params = verb exists, parameter list not captured: names are not checked.
PATCH = {
    'runCSharpCode': {'p': {'code': 'String', 'assemblies': 'List<String>', 'input': 'String', 'output': 'String'}, 'o': {}},
    'getClipboardContent': {'p': None, 'o': {'value': 'String'}},
    'clearClipboard': {'p': {}, 'o': {}},
    'getDefaultPrinter': {'p': {}, 'o': {'value': 'String'}},
    'printScreen': {'p': None, 'o': {'value': 'Image'}},
    'printWindow': {'p': None, 'o': {'value': 'Image'}},
    'lockWorkStation': {'p': {}, 'o': {}},
    'logoff': {'p': None, 'o': {}},
    'webGetHtmlSource': {'p': None, 'o': {'value': 'String'}},
    'ftpCreateDir': {'p': None, 'o': {}},
    'continue': {'p': {}, 'o': {}},
    'newGuid': {'p': {}, 'o': {'value': 'String'}},
}
for k, v in PATCH.items():
    cat.setdefault(k, v)

# ---------- conversion rules ----------
d = json.load(open(dict_path))
VERB = re.compile(r'^[a-z][A-Za-z0-9]+$')

def verbs(target):
    return [t for t in re.split(r'[^A-Za-z0-9]+', target or '') if VERB.match(t) and t in cat]

def norm(path):
    return re.sub(r'\[[^\]]*\]', '', path or '')

rules = {}
for k, a in list(d['actions'].items()) + list(d.get('botstore_candidates', {}).items()):
    key = f"{a['package'].strip()}/{a['action_name'].strip()}"
    if key in rules:
        continue
    vs = verbs(a['target'])
    r = {'s': a['strategy'], 't': a['target']}
    if vs:
        r['v'] = vs
    params = {}
    for attr, p in (a.get('params') or {}).items():
        ibm = re.match(r'--([A-Za-z0-9]+)', p.get('ibm_param') or '')
        params[norm(p.get('attribute_path') or attr)] = [ibm.group(1) if ibm else '', p.get('rule', ''), (p.get('note') or '')[:120]]
    if params:
        r['p'] = params
    if a.get('required_defaults'):
        r['d'] = {kk.lstrip('-'): vv for kk, vv in a['required_defaults'].items()}
    if a.get('emit_after_flow'):
        r['after'] = a['emit_after_flow']
    rules[key] = r

for ek, em in d.get('enum_maps', {}).items():
    akey, _, attr = ek.partition('|')
    parts = akey.split('::')
    if len(parts) >= 3:
        key = f'{parts[0].strip()}/{parts[2].strip()}'
        if key in rules:
            rules[key].setdefault('e', {})[norm(attr)] = em

json.dump(cat, open(os.path.join(out_dir, 'ibm-catalog-30.json'), 'w'), separators=(',', ':'), sort_keys=True)
json.dump(rules, open(os.path.join(out_dir, 'a360-ibm-rules.json'), 'w'), separators=(',', ':'), sort_keys=True)
print(len(cat), 'IBM commands;', len(rules), 'rules')
