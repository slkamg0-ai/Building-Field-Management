import ezdxf
import math
import json

def dist(p1, p2):
    return math.hypot(p1[0]-p2[0], p1[1]-p2[1])

def main():
    doc = ezdxf.readfile('Osu_plan_2_simple.dxf')
    msp = doc.modelspace()

    # 1. 대상 레이어 탐색 (맨홀 이름 M2-212가 있는 레이어)
    manhole_layer = None
    for e in msp:
        if e.dxftype() == 'TEXT' and 'M2-' in e.dxf.text:
            manhole_layer = e.dxf.layer
            break

    print(f'Manhole Layer identified: {repr(manhole_layer)}')

    # 2. 지시선(폴리선) 및 텍스트 수집
    leaders = []
    texts = []
    pipe_lines = []
    pipe_texts = []
    depth_texts = []

    for e in msp:
        l = e.dxf.layer
        dtype = e.dxftype()

        if l == manhole_layer:
            if dtype == 'LWPOLYLINE':
                leaders.append([tuple(p) for p in e.get_points('xy')])
            elif dtype == 'TEXT':
                texts.append((e.dxf.text.strip(), (e.dxf.insert[0], e.dxf.insert[1])))
        
        elif l == 'Osu_line' and dtype == 'LWPOLYLINE':
            pipe_lines.append([tuple(p) for p in e.get_points('xy')])
        
        elif dtype == 'TEXT':
            txt = e.dxf.text.strip()
            if txt.startswith('D') and 'L=' in txt:
                pipe_texts.append((txt, (e.dxf.insert[0], e.dxf.insert[1])))
            elif '(H' in txt or 'H =' in txt:
                depth_texts.append((txt, (e.dxf.insert[0], e.dxf.insert[1])))

    print(f'Collected: {len(texts)} manhole names, {len(leaders)} leaders, {len(pipe_lines)} pipes, {len(pipe_texts)} pipe specs, {len(depth_texts)} depth specs')

    # 3. 지시선 추적: [맨홀 텍스트] -> [지시선 시작점] -> [지시선 끝점 (맨홀 중심)]
    manholes = []
    for t_name, t_pos in texts:
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
                # 텍스트와 가까운 쪽이 텍스트측 지시선 끝, 반대쪽이 실제 맨홀 위치
                manhole_pt = pl[-1] if d0 < d1 else pl[0]

        # 주변 심도 텍스트 매칭
        depth_val = None
        min_depth_d = float('inf')
        for d_txt, d_pos in depth_texts:
            d = dist(t_pos, d_pos)
            if d < min_depth_d and d < 20.0:
                min_depth_d = d
                depth_val = d_txt

        manholes.append({
            'name': t_name,
            'x': round(manhole_pt[0], 2) if manhole_pt else round(t_pos[0], 2),
            'y': round(manhole_pt[1], 2) if manhole_pt else round(t_pos[1], 2),
            'text_x': round(t_pos[0], 2),
            'text_y': round(t_pos[1], 2),
            'leader_dist': round(min_d, 2),
            'depth': depth_val or ''
        })

    print('\n=== 맨홀 자동 매칭 결과 샘플 (10개) ===')
    for m in manholes[:10]:
        print(f"맨홀명: {m['name']:<8} | 좌표: ({m['x']:<9}, {m['y']:<9}) | 심도: {m['depth']:<12} | 지시선거리: {m['leader_dist']}m")

    # JSON 저장
    with open('extracted_manholes.json', 'w', encoding='utf-8') as f:
        json.dump(manholes, f, ensure_ascii=False, indent=2)

    print(f'\n총 {len(manholes)}개 맨홀 자동 매칭 성공! extracted_manholes.json 저장 완료.')

if __name__ == '__main__':
    main()
