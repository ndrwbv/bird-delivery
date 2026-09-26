# Пачка точных замен в файле: каждая пара должна найтись ровно один раз
# (или столько раз, сколько указано третьим элементом).
import sys, json
def run(path, pairs):
    s = open(path).read()
    bad = []
    for pr in pairs:
        old, new = pr[0], pr[1]
        cnt = pr[2] if len(pr) > 2 else 1
        c = s.count(old)
        if c != cnt:
            bad.append((c, old[:90]))
            continue
        s = s.replace(old, new)
    open(path, 'w').write(s)
    for c, o in bad: print('!! найдено', c, ':', o)
    print('замен:', len(pairs) - len(bad), 'из', len(pairs))
