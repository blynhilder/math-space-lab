from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SOURCE = BASE / 'math-lab-src'

def script(text):
    return '<script>\n' + text.replace('</script', '<\\/script') + '\n</script>'

fragment = (SOURCE / 'shell.html').read_text(encoding='utf-8')
for name in ['geometry', 'coordinates', 'matrix', 'crystal']:
    fragment = fragment.replace('<!--' + name.upper() + '-->', (SOURCE / (name + '.html')).read_text(encoding='utf-8'))
fragment = fragment.replace('<!--MODULES-->', '\n'.join(script((SOURCE / (name + '.js')).read_text(encoding='utf-8')) for name in ['expression', 'geometry', 'coordinates', 'matrix', 'crystal', 'app']))
theme = '''
:root { color-scheme:light; --background:#fafaf7; --foreground:#202b33; --muted:#e8eceb; --muted-foreground:#53616d; --border:#ced7d6; --primary:#22776b; --primary-foreground:#fff; --secondary:#e9f1ef; --secondary-foreground:#28443f; --card:#fff; --card-foreground:#202b33; --ring:#22776b; --radius:12px; --chart-1:#22776b; --chart-2:#d4773b; --chart-3:#657bc0; --chart-4:#a35c9b; --chart-5:#b88a23; }
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);line-height:1.5}button,input,select{font:inherit;color:inherit}button,select{background:var(--card);border:1px solid var(--border);border-radius:7px;padding:6px 10px}button{cursor:pointer}button:hover{background:var(--secondary)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary);outline-offset:2px}input{max-width:100%;background:var(--card);border:1px solid var(--border);border-radius:5px;padding:5px}canvas{max-width:100%}h1,h2,h3,p{margin-top:0}small{color:var(--muted-foreground)}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--background:#142126;--foreground:#e7efed;--muted:#27383e;--muted-foreground:#b1c1c5;--border:#405359;--primary:#6ce2c3;--primary-foreground:#10251f;--secondary:#243b36;--secondary-foreground:#d7eee7;--card:#1b2b30;--card-foreground:#e7efed;--chart-1:#6ce2c3;--chart-2:#ffb477;--chart-3:#9db0ff}}
'''
bridge = BASE / 'math-plugin/public/bridge.js'
if not bridge.exists():
    raise SystemExit('First run npm ci && npm run build:bridge inside math-plugin.')
document = (SOURCE / 'plugin-document.html').read_text(encoding='utf-8')
document = document.replace('/*__STYLES__*/', theme).replace('<!--FRAGMENT-->', fragment).replace('<!--BRIDGE-->',script(bridge.read_text(encoding='utf-8')))
for path in [BASE/'math-plugin/public/math-lab.html', BASE/'math-site/src/math-lab.html']:
    path.write_text(document,encoding='utf-8')
print('Generated local and Worker UI from maintained scene modules.')
