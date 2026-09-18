import csv
import math

path = r'G:\내 드라이브\Work\P송산그린시티1-2공구_우오수공사\03_측량\맨홀DB_오수_좌표포함_수정본.csv'
with open(path, encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))

targets = [
    ("SEC-094/095 start", 176127.968, 418519.160),
    ("SEC-095/096 middle", 176092.663, 418464.595),
    ("SEC-110 start", 176051.391, 417281.056),
    ("SEC-127 start", 175355.034, 417882.312),
]

for label, tx, ty in targets:
    print(f"\nTarget: {label} ({tx}, {ty})")
    matches = []
    for r in rows:
        if r['X'].strip() and r['Y'].strip():
            d = math.hypot(float(r['X']) - tx, float(r['Y']) - ty)
            if d < 120:
                matches.append((d, r['맨홀명'], r['관저고'], r['비고']))
    matches.sort()
    for m in matches[:4]:
        print(f"  {m[1]}: dist={m[0]:.2f}m, 관저고={m[2]}, 비고={m[3]}")
