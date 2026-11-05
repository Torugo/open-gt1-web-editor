"""Build app/data/gt1.json from the original BOSS TONE STUDIO for GT-1 install.

Pipeline:
  1. decompress the Flash file (BOSS_TONE_STUDIO_for_GT1.swf)
  2. disassemble its ActionScript bytecode (disasm.py)
  3. replay the ParameterDefinitionGT static initializer -> parameter table (evalcinit.py)
  4. read TemporaryParams.setData -> byte offset of every patch parameter
  5. write one JSON file the web app loads

Usage:  python -I tools/build_defs.py [path-to-installed-program]
Default path: backup/installed-program (inside this repo).
"""
import json, os, re, subprocess, sys, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "backup", "installed-program")
BUILD = os.path.join(ROOT, "tools", "build")
OUT = os.path.join(ROOT, "app", "data", "gt1.json")
TOOLS = os.path.join(ROOT, "tools")
os.makedirs(BUILD, exist_ok=True)

# 1. decompress SWF
raw = open(os.path.join(SRC, "BOSS_TONE_STUDIO_for_GT1.swf"), "rb").read()
body = zlib.decompress(raw[8:]) if raw[:3] == b"CWS" else raw[8:]
swf_body = os.path.join(BUILD, "swf_body.bin")
open(swf_body, "wb").write(body)

# 2. disassemble
dis = os.path.join(BUILD, "disasm.txt")
subprocess.run([sys.executable, "-I", os.path.join(TOOLS, "disasm.py"), swf_body, dis], check=True)

# 3. parameter definitions
subprocess.run([sys.executable, "-I", os.path.join(TOOLS, "evalcinit.py"), dis, BUILD, "ParameterDefinitionGT"], check=True)
defs = json.load(open(os.path.join(BUILD, "def_ParameterDefinitionGT.json"), encoding="utf-8"))

# Lists the original builds at runtime with helper functions
def mixer_balance():
    out = ["100:%d" % v for v in range(0, 100, 2)]
    out += ["%d:100" % v for v in range(100, -1, -2)]
    return out
GEN = {
    "createMixerChBalanceList": mixer_balance(),
    "createReverbTimeList": ["%.1fs" % (v / 10) for v in range(1, 101)],
    "createChorusPreDelayList": ["%.1fms" % (v / 10) for v in range(0, 401, 5)],
    "createNSThresholdList": ["OFF"] + [str(v) for v in range(1, 101)],
}
def resolve(x):
    if isinstance(x, dict):
        if "$call" in x: return GEN[x["$call"]]
        return {k: resolve(v) for k, v in x.items()}
    if isinstance(x, list): return [resolve(v) for v in x]
    return x
defs = resolve(defs)

# 4. byte offsets of patch parameters (offset = hex of last two address bytes, e.g. 0x0562)
lines = open(dis, encoding="utf-8").read().split("\n")
body_lines, on = [], False
for ln in lines:
    if ln.startswith("=== "):
        if on: break
        on = ln.startswith("=== TemporaryParams::setData")
        continue
    if on and ln.strip(): body_lines.append(ln.split(None, 1)[1])
offsets = {}
for i in range(len(body_lines) - 5):
    if body_lines[i].startswith("getlocal1") and re.match(r"push(byte|short|int) ", body_lines[i + 1]) and body_lines[i + 2].startswith("ifne"):
        off = int(body_lines[i + 1].split()[1])
        for j in range(i + 3, i + 7):
            m = re.match(r"initproperty (\w+)", body_lines[j])
            if m: offsets[m.group(1)] = off; break

addr = {}
for key, off in offsets.items():
    if key.endswith("_l") and key[:-2] + "_h" in offsets:
        continue  # low byte of a two-byte value, handled with its _h partner
    if key.endswith("_h") and key[:-2] + "_l" in offsets:
        assert offsets[key[:-2] + "_l"] == off + 1, key
        addr[key[:-2]] = [off >> 8, off & 0xFF, 2]
    else:
        addr[key] = [off >> 8, off & 0xFF, 1]

out = {"source": "BOSS TONE STUDIO for GT-1 v1.0.2 (extracted)", "addr": addr, "defs": defs}
json.dump(out, open(OUT, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
print("wrote", OUT, "params:", len(addr), "def tables:", len(defs))
