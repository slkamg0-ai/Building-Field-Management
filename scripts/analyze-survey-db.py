import csv
import json
import os

path = r'G:\내 드라이브\Work\P송산그린시티1-2공구_우오수공사\03_측량\맨홀DB_오수_좌표포함_수정본.csv'

with open(path, encoding='utf-8-sig') as f:
    survey_rows = list(csv.DictReader(f))

survey_map = {r['맨홀명'].strip(): r for r in survey_rows}

print(f"Total survey rows: {len(survey_rows)}")
print(f"Total unique manholes: {len(survey_map)}")

# Check 2공구 manholes
osu2_survey = [r for r in survey_rows if r['X'].strip() and ('2공구' in r['비고'] or '2' in r['비고'] or r['맨홀명'].startswith('M2') or r['맨홀명'].startswith('M-002'))]
print(f"2공구 valid coordinate survey manholes: {len(osu2_survey)}")

with open('src/data/actual_pipeline_cad.json', encoding='utf-8') as f:
    cad = json.load(f)

print(f"Current CAD segments: {len(cad['segments'])}, nodes: {len(cad['nodes'])}")

# Check branches in survey
branches = []
for name, r in survey_map.items():
    b = r['분기정보'].strip()
    if b:
        # e.g. M2-211:in:-1.17;M2-235:in:-0.43;M2-213:out:-1.17
        parts = b.split(';')
        for p in parts:
            if not p.strip(): continue
            items = p.strip().split(':')
            if len(items) >= 2:
                other_mh = items[0].strip()
                flow = items[1].strip() # in or out
                level = items[2].strip() if len(items) > 2 else ''
                branches.append((name, other_mh, flow, level))

print(f"\nTotal branch links found in survey: {len(branches)}")
for b in branches[:10]:
    print(f"  {b[0]} <-> {b[1]} ({b[2]}, level={b[3]})")

# Check same-node segments in CAD
same_node = [s for s in cad['segments'] if s['fromNode'] == s['toNode']]
print(f"\nSame-node segments in CAD: {len(same_node)}")
for s in same_node[:10]:
    mh = s['fromNode']
    sr = survey_map.get(mh)
    print(f"  {s['id']}: {mh} ~ {mh}, length={s['length']}m, Survey info: {sr['비고'] if sr else 'None'}")
