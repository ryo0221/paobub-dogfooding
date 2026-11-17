"""The facts writer leaves out a state or share that never happened; read those as 0 %."""
class Zeros(dict):
    def __missing__(self, key): return 0
class Stations(dict):
    def __missing__(self, key): return Zeros()
def load(path):
    import json
    R = json.load(open(path))
    for r in R.values():
        if not isinstance(r, dict): continue
        if isinstance(r.get('states'), dict):
            r['states'] = Stations({k: Zeros(v) for k, v in r['states'].items()})
        f = r.get('fleet')
        if isinstance(f, dict) and isinstance(f.get('shares'), dict): f['shares'] = Zeros(f['shares'])
    return R
