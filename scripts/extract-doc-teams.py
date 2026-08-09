#!/usr/bin/env python3
"""
Pulls the boss teams out of the Radical Red documentation PDF.

The documentation lives in a Google Sheet that the build environment cannot
reach, so a PDF export of the "Default Mode Bosses" sheet is kept in the repo
and parsed here. The output, scripts/data/doc-teams.json, is committed and read
by build-data.mjs to settle which dump entry belongs to which fight — the
trainer dumps repeat a name across several fights and the sheet is the only
thing that says which team is which.

    pip install pypdf && python3 scripts/extract-doc-teams.py <pdf>
"""
import json, re, sys, os

PDF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'data/rr41-default-mode-bosses.pdf'
)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from pypdf import PdfReader
pages = [(p.extract_text() or '') for p in PdfReader(PDF).pages]

dex = json.load(open(os.path.join(ROOT, 'src/data/dex.json')))
game = json.load(open(os.path.join(ROOT, 'src/data/game.json')))

def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

# doc species spellings -> our slugs
SUFFIX = {'a':'alola','g':'galar','h':'hisui','p':'paldea','mega':'mega','f':'f','m':'m',
          'megax':'megax','megay':'megay','s':'sevii'}
by_name = {}
for slug, e in dex.items():
    by_name.setdefault(norm(e['name']), slug)
    by_name.setdefault(norm(slug), slug)

def resolve(token):
    t = token.strip()
    if norm(t) in by_name: return by_name[norm(t)]
    m = re.match(r'^(.*?)-([A-Za-z]+)$', t)
    if m:
        base, suf = norm(m.group(1)), norm(m.group(2))
        cand = SUFFIX.get(suf)
        for probe in ([f'{base}{cand}'] if cand else []) + [base]:
            if probe in by_name: return by_name[probe]
    return None

def tokenise_from(words, start):
    """Unresolved words become placeholders rather than killing the row: the
    doc spells a few forms its own way (Ogerpon-H) and one unknown should not
    cost a whole team."""
    out, i = [], start
    while i < len(words):
        hit = None
        for span in (3, 2, 1):
            if i + span > len(words): continue
            slug = resolve(' '.join(words[i:i+span]))
            if slug: hit = (slug, span); break
        if hit:
            out.append(hit[0]); i += hit[1]
        else:
            out.append('?' + words[i].lower()); i += 1
    known = sum(1 for o in out if not o.startswith('?'))
    return out if known * 2 >= len(out) else None

def tokenise(line, want=None):
    """Species rows often carry the trainer class first ("GYM LEADER Armarouge
    ..."), so try every start offset and keep the run that yields the wanted
    number of species."""
    words = line.split()
    for start in range(0, min(len(words), 4)):
        got = tokenise_from(words, start)
        if got and (want is None or len(got) == want):
            return got
    return None

# every fight we ship, by uppercase label
def labels(trainer):
    """Our fights carry variant suffixes the sheet does not: "Jasmine (Team A)"
    is three pages under one name there."""
    upper = trainer.upper()
    return {upper, re.sub(r'\s*\(.*?\)', '', upper).strip()}

ours = {}
for step in game['modes']['normal']:
    if step.get('kind') != 'boss': continue
    for label in labels(step['trainer']): ours.setdefault(label, []).append(step)
for fight in game['extras']['normal']:
    for label in labels(fight['trainer']): ours.setdefault(label, []).append(fight)

def find_trainer(page_lines):
    for line in page_lines:
        u = line.strip().upper()
        if u in ours: return u
        # "SUPER NERD MIGUEL" -> MIGUEL
        last = u.split()[-1] if u.split() else ''
        if last in ours and len(u) < 40: return last
    return None

results, unparsed = [], []
for idx, page in enumerate(pages):
    if 'CLICK ON TRAINER' in page: continue
    lines = [l.strip() for l in page.split('\n') if l.strip()]
    team = None
    for i, line in enumerate(lines):
        if i == 0: continue
        toks = line.split()
        levels = None
        if toks and len(toks) <= 6 and all(
            re.fullmatch(r'\d{1,3}', t) and 1 <= int(t) <= 100 for t in toks
        ):
            levels = [int(t) for t in toks]
        else:
            # Cap-scaled fights write "Highest Lv -2" per Pokémon instead.
            scaled = re.findall(r'Highest\s+Lv\s*(-?\d+)?', line)
            if scaled and re.fullmatch(r'(?:Highest\s+Lv\s*-?\d*\s*)+', line.strip()):
                levels = [int(v) if v else 0 for v in scaled]
        if not levels: continue
        species = tokenise(lines[i-1], want=len(levels))
        if species and len(species) == len(levels):
            team = (species, levels, i)
            break
    if not team: continue
    who = find_trainer(lines)
    if not who:
        unparsed.append((idx+1, lines[:3]))
        continue
    results.append({'page': idx+1, 'trainer': who, 'species': team[0], 'levels': team[1]})

print('team pages parsed:', len(results), '| team found but trainer unknown:', len(unparsed))
json.dump(results, open(os.path.join(ROOT, 'scripts/data/doc-teams.json'), 'w'), indent=1)
for r in results[:6]:
    print(' ', r['page'], r['trainer'], list(zip(r['species'], r['levels'])))
