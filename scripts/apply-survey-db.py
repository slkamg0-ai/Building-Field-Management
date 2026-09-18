import csv
import json
import math
import shutil
import os
import ezdxf

survey_src = r'G:\내 드라이브\Work\P송산그린시티1-2공구_우오수공사\03_측량\맨홀DB_오수_좌표포함_수정본.csv'
survey_dst = 'src/data/survey_manhole_db.csv'
dxf_path = 'Osu_plan_2_simple.dxf'
output_json = 'src/data/actual_pipeline_cad.json'
backup_json = 'src/data/actual_pipeline_cad.backup.json'

# 1. Copy survey CSV locally
shutil.copyfile(survey_src, survey_dst)
print(f"Copied survey CSV to {survey_dst}")

# 2. Parse survey CSV
with open(survey_dst, encoding='utf-8-sig') as f:
    survey_rows = list(csv.DictReader(f))

survey_manholes = []
for r in survey_rows:
    x_str = r['X'].strip()
    y_str = r['Y'].strip()
    if x_str and y_str:
        invert_val = r['관저고'].strip()
        drop_val = r['유입관저고(낙차맨홀만)'].strip()
        survey_manholes.append({
            'id': r['맨홀명'].strip(),
            'name': f"{r['맨홀명'].strip()} 맨홀",
            'rawX': float(x_str),
            'rawY': float(y_str),
            'invertLevel': float(invert_val) if invert_val else None,
            'dropInvertLevel': float(drop_val) if drop_val else None,
            'isDropManhole': bool(drop_val),
            'surveyDist': float(r['거리'].strip()) if r['거리'].strip() else None,
            'zone': r['비고'].strip(),
            'branchRaw': r['분기정보'].strip(),
        })

print(f"Loaded {len(survey_manholes)} survey manholes with valid coordinates.")

# 3. Read DXF pipe lines (Osu_line) and road lines (d_line)
doc = ezdxf.readfile(dxf_path)
msp = doc.modelspace()

pipe_lines = []
road_lines = []

for e in msp:
    dtype = e.dxftype()
    l = e.dxf.layer
    if l == 'Osu_line' and dtype == 'LWPOLYLINE':
        pts = [tuple(p) for p in e.get_points('xy')]
        if len(pts) >= 2:
            pipe_lines.append(pts)
    elif l == 'd_line' and dtype == 'LWPOLYLINE':
        pts = [tuple(p) for p in e.get_points('xy')]
        if len(pts) >= 2:
            road_lines.append(pts)

print(f"Loaded {len(pipe_lines)} pipes and {len(road_lines)} road lines from DXF.")

def dist(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def find_nearest_survey_mh(pt, max_dist=45):
    best = None
    min_d = float('inf')
    for m in survey_manholes:
        d = dist(pt, (m['rawX'], m['rawY']))
        if d < min_d:
            min_d = d
            best = m
    if min_d <= max_dist:
        return best, min_d
    return None, min_d

# 4. Coordinate normalization and bounding box (centered in 920x520)
# We calculate bounds based on 2공구 manholes & pipes
all_xs = [m['rawX'] for m in survey_manholes if '2공구' in m['zone'] or m['id'].startswith('M2')] + [p[0] for pipe in pipe_lines for p in pipe]
all_ys = [m['rawY'] for m in survey_manholes if '2공구' in m['zone'] or m['id'].startswith('M2')] + [p[1] for pipe in pipe_lines for p in pipe]

min_x, max_x = min(all_xs), max(all_xs)
min_y, max_y = min(all_ys), max(all_ys)
span_x = max_x - min_x
span_y = max_y - min_y

padding = 35
target_w = 920
target_h = 520

scale = min((target_w - 2 * padding) / span_x, (target_h - 2 * padding) / span_y)
used_w = span_x * scale
used_h = span_y * scale
offset_x = (target_w - used_w) / 2
offset_y = (target_h - used_h) / 2

def to_svg(x, y):
    sx = offset_x + (x - min_x) * scale
    sy = target_h - offset_y - (y - min_y) * scale
    return round(sx, 1), round(sy, 1)

# 5. Build Final SVG Nodes from Survey Manholes
svg_nodes = []
for m in survey_manholes:
    # Only include manholes within or near the project viewport
    if min_x - 150 <= m['rawX'] <= max_x + 150 and min_y - 150 <= m['rawY'] <= max_y + 150:
        sx, sy = to_svg(m['rawX'], m['rawY'])
        
        # Default status: planned (사용자가 직접 시공완료로 변경한 것 외에는 미진행/계획 상태)
        st = 'planned'
            
        depth_str = f"관저고 {m['invertLevel']}m" if m['invertLevel'] is not None else ""
        if m['isDropManhole']:
            depth_str += f" (낙차: 유입 {m['dropInvertLevel']}m)"

        svg_nodes.append({
            'id': m['id'],
            'name': m['name'],
            'x': sx,
            'y': sy,
            'rawX': round(m['rawX'], 3),
            'rawY': round(m['rawY'], 3),
            'invertLevel': m['invertLevel'],
            'dropInvertLevel': m['dropInvertLevel'],
            'isDropManhole': m['isDropManhole'],
            'depth': depth_str,
            'zone': m['zone'],
            'branch': m['branchRaw'],
            'status': st
        })

print(f"Generated {len(svg_nodes)} survey-backed SVG manhole nodes.")

# 6. Build Final Segments by matching DXF pipes to Survey Manholes
svg_segments = []
survey_mh_map = {m['id']: m for m in survey_manholes}

for idx, pipe in enumerate(pipe_lines):
    p_start = pipe[0]
    p_end = pipe[-1]
    
    mh_from, d_from = find_nearest_survey_mh(p_start, max_dist=40)
    mh_to, d_to = find_nearest_survey_mh(p_end, max_dist=40)
    
    # Calculate length along polyline
    poly_len = sum(dist(pipe[i], pipe[i+1]) for i in range(len(pipe)-1))
    
    from_name = mh_from['id'] if mh_from else f"N{idx*2+1}"
    to_name = mh_to['id'] if mh_to else f"N{idx*2+2}"
    
    # If from and to matched the same manhole, try finding the 2nd nearest for the end
    if mh_from and mh_to and from_name == to_name and poly_len > 8.0:
        # Find 2nd nearest manhole for p_end
        candidates = []
        for m in survey_manholes:
            d = dist(p_end, (m['rawX'], m['rawY']))
            if d < 60:
                candidates.append((d, m))
        candidates.sort(key=lambda x: x[0])
        if len(candidates) > 1 and candidates[0][1]['id'] == from_name:
            # pick 2nd nearest
            second_best = candidates[1][1]
            to_name = second_best['id']
            mh_to = second_best
    
    # SVG Path string
    svg_pts = [to_svg(p[0], p[1]) for p in pipe]
    path_d = f"M {svg_pts[0][0]} {svg_pts[0][1]}"
    for p in svg_pts[1:]:
        path_d += f" L {p[0]} {p[1]}"
        
    # Default status: planned (사용자가 직접 수정한 것 외에는 미진행/시공계획 상태)
    st = 'planned'
    cr = '미착공'
    insp = '미착공'

    # Determine pipe diameter / type
    diameter = 400 if '400' in from_name or '3-' in from_name.lower() or poly_len > 65 else 300
    pipe_type = f"D{diameter}mm 고강도 PE관"
    
    # Invert levels and slope calculation
    inv_from = mh_from['invertLevel'] if mh_from else None
    inv_to = mh_to['invertLevel'] if mh_to else None
    slope = None
    if inv_from is not None and inv_to is not None and poly_len > 0:
        slope = round(abs(inv_from - inv_to) / poly_len * 100, 2)
        
    depth_val = 2.8
    if inv_from is not None:
        # approximate depth from invert level (ground ~ GL 2.5m - 4.5m)
        depth_val = round(max(1.8, 3.5 - inv_from), 1)

    svg_segments.append({
        'id': f"SEC-{idx+1:03d}",
        'name': f"{from_name} ~ {to_name}",
        'fromNode': from_name,
        'toNode': to_name,
        'status': st,
        'pipeType': pipe_type,
        'diameter': diameter,
        'length': round(poly_len, 1),
        'depth': depth_val,
        'invertFrom': inv_from,
        'invertTo': inv_to,
        'slope': slope,
        'pathD': path_d,
        'crew': cr,
        'inspectionStatus': insp
    })

# 7. Road paths
road_paths = []
for rd in road_lines:
    if len(rd) >= 2:
        svg_pts = [to_svg(p[0], p[1]) for p in rd]
        d_str = f"M {svg_pts[0][0]} {svg_pts[0][1]}"
        for p in svg_pts[1:]:
            d_str += f" L {p[0]} {p[1]}"
        road_paths.append(d_str)

# 8. Save final JSON
output_data = {
    'viewBox': '0 0 920 520',
    'bounds': {
        'minX': round(min_x, 2),
        'maxX': round(max_x, 2),
        'minY': round(min_y, 2),
        'maxY': round(max_y, 2),
        'widthMeters': round(span_x, 1),
        'heightMeters': round(span_y, 1),
        'source': '맨홀DB_오수_좌표포함_수정본.csv (정밀 측량 좌표 연동)'
    },
    'nodes': svg_nodes,
    'segments': svg_segments,
    'roadPaths': road_paths
}

# Backup existing if not already backed up
if not os.path.exists(backup_json):
    shutil.copyfile(output_json, backup_json)

with open(output_json, 'w', encoding='utf-8') as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

print(f"\nSuccessfully generated {output_json}!")
print(f"Total nodes: {len(svg_nodes)}")
print(f"Total segments: {len(svg_segments)}")
same_cnt = len([s for s in svg_segments if s['fromNode'] == s['toNode']])
print(f"Remaining same-node segments: {same_cnt}")
