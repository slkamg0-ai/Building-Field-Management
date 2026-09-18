import ezdxf
import json
import math

def dist(p1, p2):
    return math.hypot(p1[0]-p2[0], p1[1]-p2[1])

def main():
    doc = ezdxf.readfile('Osu_plan_2_simple.dxf')
    msp = doc.modelspace()

    # 1. 대상 레이어 탐색
    manhole_layer = None
    for e in msp:
        if e.dxftype() == 'TEXT' and 'M2-' in e.dxf.text:
            manhole_layer = e.dxf.layer
            break

    # 2. 엔티티 수집
    leaders = []
    mh_texts = []
    pipe_lines = []
    pipe_texts = []
    depth_texts = []
    road_lines = []

    for e in msp:
        l = e.dxf.layer
        dtype = e.dxftype()

        if l == manhole_layer:
            if dtype == 'LWPOLYLINE':
                leaders.append([tuple(p) for p in e.get_points('xy')])
            elif dtype == 'TEXT':
                txt = e.dxf.text.strip()
                if '(H' in txt or 'H =' in txt or 'H=' in txt:
                    depth_texts.append((txt, (e.dxf.insert[0], e.dxf.insert[1])))
                else:
                    mh_texts.append((txt, (e.dxf.insert[0], e.dxf.insert[1])))
        elif l == 'Osu_line' and dtype == 'LWPOLYLINE':
            pipe_lines.append([tuple(p) for p in e.get_points('xy')])
        elif l == 'd_line' and dtype == 'LWPOLYLINE':
            road_lines.append([tuple(p) for p in e.get_points('xy')])
        elif dtype == 'TEXT':
            txt = e.dxf.text.strip()
            if txt.startswith('D') and 'L=' in txt:
                pipe_texts.append((txt, (e.dxf.insert[0], e.dxf.insert[1])))
            elif '(H' in txt or 'H =' in txt:
                depth_texts.append((txt, (e.dxf.insert[0], e.dxf.insert[1])))

    # 3. 맨홀 중심 매칭
    raw_manholes = []
    for t_name, t_pos in mh_texts:
        best_leader = None
        min_d = float('inf')
        manhole_pt = None

        for pl in leaders:
            d0 = dist(t_pos, pl[0])
            d1 = dist(t_pos, pl[-1])
            cur_min = min(d0, d1)
            if cur_min < min_d:
                min_d = cur_min
                best_leader = pl
                manhole_pt = pl[-1] if d0 < d1 else pl[0]

        depth_val = ''
        min_depth_d = float('inf')
        for d_txt, d_pos in depth_texts:
            d = dist(t_pos, d_pos)
            if d < min_depth_d and d < 25.0:
                min_depth_d = d
                depth_val = d_txt

        raw_manholes.append({
            'name': t_name,
            'x': manhole_pt[0] if manhole_pt else t_pos[0],
            'y': manhole_pt[1] if manhole_pt else t_pos[1],
            'depth': depth_val
        })

    # 4. 좌표 바운딩 박스 계산 (관로 및 맨홀 기준)
    all_xs = [m['x'] for m in raw_manholes] + [p[0] for pipe in pipe_lines for p in pipe]
    all_ys = [m['y'] for m in raw_manholes] + [p[1] for pipe in pipe_lines for p in pipe]

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
        # Y축은 CAD(위로 갈수록 커짐) -> SVG(아래로 갈수록 커짐) 반전
        sx = offset_x + (x - min_x) * scale
        sy = target_h - offset_y - (y - min_y) * scale
        return round(sx, 1), round(sy, 1)

    # 5. 정규화된 맨홀 데이터
    svg_nodes = []
    for idx, m in enumerate(raw_manholes):
        sx, sy = to_svg(m['x'], m['y'])
        # 시공 상태 분배 (현장 리얼리티: 서쪽/시작부 완료 -> 중앙 진행 -> 동쪽 계획)
        ratio = (m['x'] - min_x) / span_x
        if ratio < 0.55:
            st = 'completed'
        elif ratio < 0.72:
            st = 'in_progress'
        else:
            st = 'planned'

        svg_nodes.append({
            'id': m['name'],
            'name': f"{m['name']} 맨홀",
            'x': sx,
            'y': sy,
            'rawX': round(m['x'], 2),
            'rawY': round(m['y'], 2),
            'depth': m['depth'],
            'status': st
        })

    # 6. 관로 세그먼트 매칭
    svg_segments = []
    for idx, pipe in enumerate(pipe_lines):
        # 시작/끝점
        p_start = pipe[0]
        p_end = pipe[-1]

        # 가장 가까운 맨홀 찾기
        def nearest_node(pt):
            best = None
            min_dist = float('inf')
            for m in raw_manholes:
                d = dist(pt, (m['x'], m['y']))
                if d < min_dist:
                    min_dist = d
                    best = m
            return best, min_dist

        m_from, d_from = nearest_node(p_start)
        m_to, d_to = nearest_node(p_end)

        from_name = m_from['name'] if m_from and d_from < 40 else f"N{idx*2+1}"
        to_name = m_to['name'] if m_to and d_to < 40 else f"N{idx*2+2}"

        # 관로 길이 계산
        length = 0.0
        for i in range(len(pipe)-1):
            length += dist(pipe[i], pipe[i+1])

        # 관로 스펙 텍스트 매칭
        mid_pt = pipe[len(pipe)//2]
        matched_spec = 'D300mm 고강도 PE관'
        min_spec_d = float('inf')
        for s_txt, s_pos in pipe_texts:
            d = dist(mid_pt, s_pos)
            if d < min_spec_d and d < 50.0:
                min_spec_d = d
                matched_spec = s_txt

        # SVG pathD 생성
        svg_pts = [to_svg(p[0], p[1]) for p in pipe]
        path_d = f"M {svg_pts[0][0]} {svg_pts[0][1]}"
        for pt in svg_pts[1:]:
            path_d += f" L {pt[0]} {pt[1]}"

        # 상태
        mid_ratio = (mid_pt[0] - min_x) / span_x
        if mid_ratio < 0.55:
            st = 'completed'
        elif mid_ratio < 0.72:
            st = 'in_progress'
        else:
            st = 'planned'

        svg_segments.append({
            'id': f"SEC-{idx+1:03d}",
            'name': f"{from_name} ~ {to_name}",
            'fromNode': from_name,
            'toNode': to_name,
            'status': st,
            'pipeType': matched_spec,
            'diameter': 400 if '400' in matched_spec else 300,
            'length': round(length, 1),
            'depth': 2.8,
            'pathD': path_d,
            'crew': '토목 1팀' if st == 'completed' else ('설비 2팀 (굴착기 06W)' if st == 'in_progress' else '예정'),
            'inspectionStatus': '합격' if st == 'completed' else ('검측중' if st == 'in_progress' else '예정')
        })

    # 7. 주요 도로 배경선 샘플링 (용량 최적화: 200개 주요 도로선)
    road_paths = []
    # 길이가 50m 이상인 주요 도로 중심선만 선별
    for r in road_lines:
        r_len = sum(dist(r[i], r[i+1]) for i in range(len(r)-1))
        if r_len > 40:
            pts = [to_svg(p[0], p[1]) for p in r]
            pd = f"M {pts[0][0]} {pts[0][1]}"
            for pt in pts[1:]:
                pd += f" L {pt[0]} {pt[1]}"
            road_paths.append(pd)

    road_paths = road_paths[:180] # 상위 180개 도로선

    result = {
        'viewBox': f"0 0 {target_w} {target_h}",
        'bounds': {
            'minX': round(min_x, 2), 'maxX': round(max_x, 2),
            'minY': round(min_y, 2), 'maxY': round(max_y, 2),
            'widthMeters': round(span_x, 1),
            'heightMeters': round(span_y, 1)
        },
        'nodes': svg_nodes,
        'segments': svg_segments,
        'roadPaths': road_paths
    }

    with open('src/data/actual_pipeline_cad.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)

    print(f"변환 완료: 맨홀 {len(svg_nodes)}개, 관로 {len(svg_segments)}개, 도로선 {len(road_paths)}개.")
    print("src/data/actual_pipeline_cad.json 생성 완료!")

if __name__ == '__main__':
    main()
