"""Inspect the user-owned original without executing or redistributing it.
Usage: python tools/verify_b236_envelope.py GXSCC-B236E.zip [output.json]
The checks reproduce the byte provenance; interpreting instructions still requires analysis.
"""
import hashlib, json, struct, sys, zipfile
from pathlib import Path
EXPECTED = '1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a'
with zipfile.ZipFile(sys.argv[1]) as z:
    name = next(n for n in z.namelist() if n.lower().endswith('gxscc.exe'))
    binary = z.read(name)
assert hashlib.sha256(binary).hexdigest() == EXPECTED, 'Different original build'
# This fixed B236E image maps these .text/.data virtual addresses to VA - 0x400000.
anchors = {
    0x413a94: ('8b7010', 'Key-off reads program-record +0x10'),
    0x413aa5: ('f7f6', 'Current envelope is divided by that duration'),
    0x414000: ('8b790c', 'Held-stage initialization reads record +0x0c'),
    0x401adb: ('8b8eb40000002bc8', 'Decay subtracts a fixed increment'),
    0x401b11: ('8b86b40000002bc1', 'Held stage subtracts a fixed increment'),
    0x401ca2: ('99b9ffff0000f7f9', 'Noise uses signed division by 65535'),
}
checks=[]
for va,(hex_bytes,description) in anchors.items():
    expected=bytes.fromhex(hex_bytes); actual=binary[va-0x400000:va-0x400000+len(expected)]
    checks.append({'va':hex(va),'bytes':actual.hex(),'description':description,'pass':actual==expected})
assert all(c['pass'] for c in checks), 'Instruction anchors differ'
records={str(p):list(struct.unpack_from('<5I',binary,0x551b0+p*20)) for p in [0,16,24,29,40]}
result={'sha256':EXPECTED,'instructionAnchors':checks,'rawProgramRecords':records,
        'fieldOrder':['attack','decayToSustain','sustainLevel','heldDecay','normalKeyOffRelease'],
        'referenceSampleRate':44100,'limits':'Not an exhaustive equivalence proof; Hold1 alternate branch and mixer are not reconstructed.'}
text=json.dumps(result,indent=2)
if len(sys.argv)>2:Path(sys.argv[2]).write_text(text)
print(text)
