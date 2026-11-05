"""Minimal AVM2 (ActionScript 3) disassembler: dumps every method body with resolved constants."""
import sys, struct

body = open(sys.argv[1], "rb").read()
outpath = sys.argv[2]

nbits = body[0] >> 3
pos = (5 + nbits * 4 + 7) // 8 + 4
abcs = []
while pos < len(body):
    tc = struct.unpack_from("<H", body, pos)[0]; pos += 2
    code, ln = tc >> 6, tc & 0x3F
    if ln == 0x3F:
        ln = struct.unpack_from("<I", body, pos)[0]; pos += 4
    data = body[pos:pos + ln]; pos += ln
    if code == 82:
        e = data.index(b"\0", 4)
        abcs.append((data[4:e].decode(), data[e + 1:]))
    if code == 0:
        break


class R:
    def __init__(s, b): s.b = b; s.p = 0
    def u8(s): v = s.b[s.p]; s.p += 1; return v
    def u16(s): v = struct.unpack_from("<H", s.b, s.p)[0]; s.p += 2; return v
    def s24(s):
        v = s.b[s.p] | (s.b[s.p + 1] << 8) | (s.b[s.p + 2] << 16); s.p += 3
        return v - (1 << 24) if v & 0x800000 else v
    def u30(s):
        r = 0; sh = 0
        while True:
            x = s.u8(); r |= (x & 0x7F) << sh; sh += 7
            if not x & 0x80 or sh >= 35: return r
    def s32(s):
        r = 0; sh = 0
        while True:
            x = s.u8(); r |= (x & 0x7F) << sh; sh += 7
            if not x & 0x80 or sh >= 35: break
        if sh < 35 and r & (1 << (sh - 1)): r -= 1 << sh
        return r if r < 2**31 else r - 2**32
    def d64(s): v = struct.unpack_from("<d", s.b, s.p)[0]; s.p += 8; return v


OPS = {}
def op(c, name, *args): OPS[c] = (name, args)
for c, n in [(1,"bkpt"),(2,"nop"),(3,"throw"),(7,"dxnslate"),(9,"label"),(0x1C,"pushwith"),(0x1D,"popscope"),(0x1E,"nextname"),(0x1F,"hasnext"),(0x20,"pushnull"),(0x21,"pushundefined"),(0x23,"nextvalue"),(0x26,"pushtrue"),(0x27,"pushfalse"),(0x28,"pushnan"),(0x29,"pop"),(0x2A,"dup"),(0x2B,"swap"),(0x30,"pushscope"),(0x47,"returnvoid"),(0x48,"returnvalue"),(0x57,"newactivation"),(0x64,"getglobalscope"),(0x87,"astypelate"),(0xF3,"timestamp")]:
    op(c, n)
for c in list(range(0x35, 0x3F)) + list(range(0x50, 0x53)) + list(range(0x70, 0x79)) + [0x81,0x82,0x83,0x84,0x85,0x88,0x89] + list(range(0x90, 0xB4)) + [0xB3,0xB4] + list(range(0xC0, 0xC8)) + list(range(0xD0, 0xD8)):
    OPS.setdefault(c, ("op_%02x" % c, ()))
names = {0x70:"convert_s",0x73:"convert_i",0x74:"convert_u",0x75:"convert_d",0x76:"convert_b",0x77:"convert_o",0x82:"coerce_a",0x85:"coerce_s",0x90:"negate",0x91:"increment",0x93:"decrement",0x95:"typeof",0x96:"not",0x97:"bitnot",0xA0:"add",0xA1:"subtract",0xA2:"multiply",0xA3:"divide",0xA4:"modulo",0xA5:"lshift",0xA6:"rshift",0xA7:"urshift",0xA8:"bitand",0xA9:"bitor",0xAA:"bitxor",0xAB:"equals",0xAC:"strictequals",0xAD:"lessthan",0xAE:"lessequals",0xAF:"greaterthan",0xB0:"greaterequals",0xB1:"instanceof",0xB3:"istypelate",0xB4:"in",0xC0:"increment_i",0xC1:"decrement_i",0xC4:"negate_i",0xC5:"add_i",0xC6:"subtract_i",0xC7:"multiply_i",0xD0:"getlocal0",0xD1:"getlocal1",0xD2:"getlocal2",0xD3:"getlocal3",0xD4:"setlocal0",0xD5:"setlocal1",0xD6:"setlocal2",0xD7:"setlocal3"}
for c, n in names.items(): OPS[c] = (n, ())
for c, n in [(4,"getsuper"),(5,"setsuper"),(0x59,"getdescendants"),(0x5D,"findpropstrict"),(0x5E,"findproperty"),(0x5F,"finddef"),(0x60,"getlex"),(0x61,"setproperty"),(0x66,"getproperty"),(0x68,"initproperty"),(0x6A,"deleteproperty"),(0x80,"coerce"),(0x86,"astype"),(0xB2,"istype")]:
    op(c, n, "mn")
for c, n in [(6,"dxns"),(8,"kill"),(0x25,"pushshort"),(0x31,"pushnamespace"),(0x40,"newfunction"),(0x41,"call"),(0x42,"construct"),(0x49,"constructsuper"),(0x53,"applytype"),(0x55,"newobject"),(0x56,"newarray"),(0x58,"newclass"),(0x5A,"newcatch"),(0x62,"getlocal"),(0x63,"setlocal"),(0x6C,"getslot"),(0x6D,"setslot"),(0x6E,"getglobalslot"),(0x6F,"setglobalslot"),(0x92,"inclocal"),(0x94,"declocal"),(0xC2,"inclocal_i"),(0xC3,"declocal_i"),(0xF0,"debugline"),(0xF2,"bkptline")]:
    op(c, n, "u30")
op(0x2C, "pushstring", "str"); op(0x2D, "pushint", "int"); op(0x2E, "pushuint", "uint"); op(0x2F, "pushdouble", "dbl")
op(0x24, "pushbyte", "s8"); op(0x65, "getscopeobject", "u8"); op(0xF1, "debugfile", "str")
for c, n in [(0x43,"callmethod"),(0x44,"callstatic")]: op(c, n, "u30", "u30")
for c, n in [(0x45,"callsuper"),(0x46,"callproperty"),(0x4A,"constructprop"),(0x4C,"callproplex"),(0x4E,"callsupervoid"),(0x4F,"callpropvoid")]: op(c, n, "mn", "u30")
op(0x32, "hasnext2", "u30", "u30")
op(0xEF, "debug", "u8", "u30", "u8", "u30")
for c, n in zip(range(0x0C, 0x1B), ["ifnlt","ifnle","ifngt","ifnge","jump","iftrue","iffalse","ifeq","ifne","iflt","ifle","ifgt","ifge","ifstricteq","ifstrictne"]):
    op(c, n, "s24")


def dump_abc(tag, a, out):
    r = R(a); r.u16(); r.u16()
    ints = [0] + [r.s32() for _ in range(max(r.u30() - 1, 0))]
    uints = [0] + [r.u30() for _ in range(max(r.u30() - 1, 0))]
    dbls = [0.0] + [r.d64() for _ in range(max(r.u30() - 1, 0))]
    strs = [None]
    for _ in range(max(r.u30() - 1, 0)):
        l = r.u30(); strs.append(a[r.p:r.p + l].decode("utf-8", "replace")); r.p += l
    nss = [None]
    for _ in range(max(r.u30() - 1, 0)):
        k = r.u8(); nss.append(strs[r.u30()])
    nssets = [None]
    for _ in range(max(r.u30() - 1, 0)):
        nssets.append([r.u30() for _ in range(r.u30())])
    mns = [None]
    for _ in range(max(r.u30() - 1, 0)):
        k = r.u8()
        if k in (0x07, 0x0D): ns = r.u30(); nm = r.u30(); mns.append(strs[nm] or "*")
        elif k in (0x0F, 0x10): mns.append(strs[r.u30()])
        elif k in (0x11, 0x12): mns.append("[rtl]")
        elif k in (0x09, 0x0E): nm = r.u30(); r.u30(); mns.append(strs[nm])
        elif k in (0x1B, 0x1C): r.u30(); mns.append("[late]")
        elif k == 0x1D:
            q = r.u30(); ps = [r.u30() for _ in range(r.u30())]
            mns.append((q, ps))
        else: raise ValueError("mn kind %x" % k)
    def mn(i):
        v = mns[i] if i < len(mns) else "?"
        if isinstance(v, tuple):
            return "%s.<%s>" % (mn(v[0]), ",".join(mn(x) for x in v[1]))
        return v
    nmeth = r.u30()
    mnames = []
    for _ in range(nmeth):
        pc = r.u30(); r.u30()
        for _ in range(pc): r.u30()
        mnames.append(strs[r.u30()])
        fl = r.u8()
        if fl & 0x08:
            for _ in range(r.u30()): r.u30(); r.u8()
        if fl & 0x80:
            for _ in range(pc): r.u30()
    for _ in range(r.u30()):
        r.u30()
        n = r.u30()
        for _ in range(2 * n): r.u30()
    meth_owner = {}
    def traits(owner):
        for _ in range(r.u30()):
            name = mn(r.u30()); kind = r.u8(); t = kind & 0xF
            if t in (0, 6):
                r.u30(); r.u30(); vi = r.u30()
                if vi: r.u8()
            elif t in (1, 2, 3):
                r.u30(); m = r.u30(); meth_owner[m] = "%s::%s%s" % (owner, {2: "get ", 3: "set "}.get(t, ""), name)
            elif t in (4, 5):
                r.u30(); r.u30()
            if kind & 0x40:
                for _ in range(r.u30()): r.u30()
    ncls = r.u30()
    inst = []
    for _ in range(ncls):
        name = mn(r.u30()); r.u30(); fl = r.u8()
        if fl & 0x08: r.u30()
        for _ in range(r.u30()): r.u30()
        ii = r.u30(); meth_owner[ii] = name + "::<init>"
        inst.append(name)
        traits(name)
    for i in range(ncls):
        ci = r.u30(); meth_owner[ci] = inst[i] + "::<cinit>"
        traits(inst[i] + "$")
    for i in range(r.u30()):
        si = r.u30(); meth_owner[si] = "script%d::<init>" % i
        traits("script%d" % i)
    for _ in range(r.u30()):
        m = r.u30(); r.u30(); r.u30(); r.u30(); r.u30()
        cl = r.u30(); code = a[r.p:r.p + cl]; r.p += cl
        for _ in range(r.u30()):
            for _ in range(5): r.u30()
        traits("body")
        out.write("\n=== %s  [%s]\n" % (meth_owner.get(m, "anon_%d" % m), tag))
        c = R(code)
        while c.p < len(code):
            at = c.p
            o = c.u8()
            if o == 0x1B:
                d = c.s24(); n = c.u30(); [c.s24() for _ in range(n + 1)]
                out.write("  %5d lookupswitch\n" % at); continue
            if o not in OPS:
                out.write("  %5d ??? %02x\n" % (at, o)); break
            nm, args = OPS[o]
            vals = []
            for k in args:
                if k == "mn": vals.append(mn(c.u30()))
                elif k == "u30": vals.append(c.u30())
                elif k == "str": vals.append(repr(strs[c.u30()]))
                elif k == "int": vals.append(ints[c.u30()])
                elif k == "uint": vals.append(uints[c.u30()])
                elif k == "dbl": vals.append(dbls[c.u30()])
                elif k == "s8": v = c.u8(); vals.append(v - 256 if v > 127 else v)
                elif k == "u8": vals.append(c.u8())
                elif k == "s24": vals.append(c.s24())
            if nm in ("debugline", "debugfile", "debug"): continue
            out.write("  %5d %s %s\n" % (at, nm, " ".join(str(v) for v in vals)))


with open(outpath, "w", encoding="utf-8") as f:
    for tag, a in abcs:
        dump_abc(tag, a, f)
print("done")
