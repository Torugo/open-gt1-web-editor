"""Replay a static initializer (cinit) from disasm text and dump all static constants as JSON.
Also extracts AddressMap.setAllAddress index->key mappings."""
import sys, json, re, ast

dis = open(sys.argv[1], encoding="utf-8").read().split("\n")
outdir = sys.argv[2]
classes = sys.argv[3:]

def method_lines(header_prefix):
    out = []; on = False
    for ln in dis:
        if ln.startswith("=== "):
            if on: break
            on = ln.startswith("=== " + header_prefix)
            continue
        if on and ln.strip(): out.append(ln)
    return out

def parse(ln):
    parts = ln.split(None, 2)
    op = parts[1]; arg = parts[2] if len(parts) > 2 else ""
    return op, arg

def eval_cinit(cls):
    statics = {}
    st = []
    for ln in method_lines(cls + "::<cinit>"):
        op, arg = parse(ln)
        if op == "pushstring": st.append(ast.literal_eval(arg))
        elif op in ("pushbyte", "pushshort", "pushint", "pushuint"): st.append(int(arg))
        elif op == "pushdouble": st.append(float(arg))
        elif op == "pushtrue": st.append(True)
        elif op == "pushfalse": st.append(False)
        elif op == "pushnull": st.append(None)
        elif op == "negate": st.append(-st.pop())
        elif op == "newobject":
            n = int(arg); items = st[-2 * n:]; del st[-2 * n:]
            st.append({items[i]: items[i + 1] for i in range(0, 2 * n, 2)})
        elif op == "newarray":
            n = int(arg); items = st[-n:] if n else []
            if n: del st[-n:]
            st.append(items)
        elif op == "getlex": st.append(statics.get(arg, {"$ref": arg}))
        elif op in ("findproperty", "findpropstrict"): st.append({"$scope": arg})
        elif op in ("initproperty", "setproperty"):
            v = st.pop(); o = st.pop()
            if isinstance(o, dict) and "$scope" in o: statics[arg] = v
        elif op in ("callproperty", "constructprop"):
            nm, n = arg.rsplit(" ", 1); n = int(n)
            args = st[-n:] if n else []
            if n: del st[-n:]
            st.pop()
            st.append({"$call": nm, "args": args})
        elif op in ("getlocal0", "pushscope", "returnvoid", "coerce", "convert_i", "convert_d", "coerce_a"): pass
        else:
            print("unhandled", cls, op, arg); st.append({"$unk": op})
    return statics

for cls in classes:
    s = eval_cinit(cls)
    json.dump(s, open(outdir + "\\def_" + cls + ".json", "w", encoding="utf-8"), indent=1)
    print(cls, len(s), "statics:", list(s.keys())[:400])

# address map index -> key
mp = {}
section = None
lines = method_lines("AddressMap::setAllAddress")
for i, ln in enumerate(lines):
    op, arg = parse(ln)
    if op == "getproperty" and arg in ("setup", "system", "midi", "temporary", "command"):
        section = arg; mp.setdefault(section, {})
    if op == "getlocal2" and i + 2 < len(lines):
        o1, a1 = parse(lines[i + 1]); o2, a2 = parse(lines[i + 2])
        if o1 in ("pushbyte", "pushshort", "pushint") and o2 == "ifne":
            idx = int(a1)
            for j in range(i + 3, i + 8):
                o3, a3 = parse(lines[j])
                if o3 == "getproperty":
                    mp[section].setdefault(idx, a3); break
        elif o1 == "ifne" or (o1 == "pushbyte" and o2 != "ifne"):
            pass
# index 0 case uses 'pushbyte 0 / ifne'; handled. Some use 'getlocal2 / ifne' (zero test)?
json.dump(mp, open(outdir + "\\addrkeys.json", "w"), indent=1)
print({k: len(v) for k, v in mp.items()})
