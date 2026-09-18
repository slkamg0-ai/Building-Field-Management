import csv
import json
import math
import ezdxf

survey_path = r'G:\내 드라이브\Work\P송산그린시티1-2공구_우오수공사\03_측량\맨홀DB_오수_좌표포함_수정본.csv'
dxf_path = 'Osu_plan_2_simple.dxf'

# 1. Load survey manholes
with open(survey_path, encoding='utf-8-sig') as f:
    survey_rows = list(csv.DictReader(f))

survey_manholes = []
for r in survey_rows:
    x_str = r['X'].strip()
    y_str = r['Y'].strip()
    if x_str and y_str:
        survey_manholes.append({
            'name': r['맨홀명'].strip(),
            'x': float(x_str),
            'y': float(y_str),
            'invert': r['관저고'].strip(),
            'drop_invert': r['유입관저고(낙차맨홀만)'].strip(),
            'distance': r['거리'].strip(),
            'zone': r['비고'].strip(),
            'branch': r['분기정보'].strip(),
        })

print(f"Loaded {len(survey_manholes)} survey manholes.")

# 2. Load DXF pipe lines from Osu_line layer
doc = ezdxf.readfile(dxf_path)
msp = doc.modelspace()

pipe_lines = []
for e in msp:
    if e.dxf.layer == 'Osu_line' and e.dxftype() == 'LWPOLYLINE':
        pipe_lines.append([tuple(p) for p in e.get_points('xy')])

print(f"Loaded {len(pipe_lines)} pipe polylines from Osu_line layer.")

def dist(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def find_nearest_survey_mh(pt, max_dist=30):
    best = None
    min_d = float('inf')
    for m in survey_manholes:
        d = dist(pt, (m['x'], m['y']))
        if d < min_d:
            min_d = d
            best = m
    if min_d <= max_dist:
        return best, min_d
    return None, min_d

matched_segments = []
same_node = []
unmatched = []

for idx, pipe in enumerate(pipe_lines):
    p_start = pipe[0]
    p_end = pipe[-1]
    
    mh_from, d_from = find_nearest_survey_mh(p_start, max_dist=30)
    mh_to, d_to = find_nearest_survey_mh(p_end, max_dist=30)
    
    from_name = mh_from['name'] if mh_from else "Unknown"
    to_name = mh_to['name'] if mh_to else "Unknown"
    
    poly_len = sum(dist(pipe[i], pipe[i+1]) for i in range(len(pipe)-1))
    
    seg = {
        'id': f"SEC-{idx+1:03d}",
        'from': from_name,
        'to': to_name,
        'd_from': round(d_from, 2) if mh_from else None,
        'd_to': round(d_to, 2) if mh_to else None,
        'len': round(poly_len, 2),
        'start_pt': p_start,
        'end_pt': p_end
    }
    
    if from_name == to_name and mh_from:
        same_node.append(seg)
    if not mh_from or not mh_to:
        unmatched.append(seg)
        
    matched_segments.append(seg)

print(f"Total Osu_line pipes: {len(pipe_lines)}")
print(f"Both ends matched to distinct survey manholes: {len(pipe_lines) - len(same_node) - len(unmatched)}")
print(f"Same-node (from == to): {len(same_node)}")
print(f"Unmatched (<30m): {len(unmatched)}")

print("\n--- Same-node details (first 5) ---")
for s in same_node[:5]:
    print(f"  {s['id']}: {s['from']} -> {s['to']}, len={s['len']}m, start={s['start_pt']}, end={s['end_pt']}")

print("\n--- Unmatched details (first 5) ---")
for s in unmatched[:5]:
    print(f"  {s['id']}: {s['from']} -> {s['to']}, len={s['len']}m, start={s['start_pt']}, end={s['end_pt']}")
