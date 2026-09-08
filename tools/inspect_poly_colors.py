"""Read the seven POLY lamp RGB colors from the unmodified GXSCC B236E.
Static inspection only. Does not execute, patch, or redistribute the program.
Usage: python tools/inspect_poly_colors.py /path/to/GXSCC.exe
Also accepts the original ZIP. Requires Python 3.10+, standard library only.
"""
import argparse
import hashlib
import json
import struct
import zipfile
from pathlib import Path

EXPECTED_SHA256 = '1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a'

def inspect(path: Path) -> dict:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            names = [n for n in archive.namelist() if Path(n).name.lower() == 'gxscc.exe']
            if len(names) != 1:
                raise ValueError('ZIP must contain exactly one GXSCC.exe')
            binary = archive.read(names[0])
    else:
        binary = path.read_bytes()
    digest = hashlib.sha256(binary).hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError('Unsupported EXE: expected the verified unmodified B236E SHA-256')
    def u16(offset): return struct.unpack_from('<H', binary, offset)[0]
    def u32(offset): return struct.unpack_from('<I', binary, offset)[0]
    pe = u32(0x3c)
    optional = pe + 24
    image_base = u32(optional + 28)
    section_header = optional + u16(pe + 20)
    sections = []
    for index in range(u16(pe + 6)):
        off = section_header + index * 40
        size, rva, raw_size, raw_off = struct.unpack_from('<IIII', binary, off + 8)
        sections.append((rva, max(size, raw_size), raw_off))
    def file_offset(rva):
        for start, size, offset in sections:
            if start <= rva < start + size:
                return offset + rva - start
        raise ValueError('RVA outside known sections')
    # Check the relevant instructions against the independently inspected disassembly.
    signatures = {
        0x402192: '8b84b380050000408984b380050000',  # count++ in active voice loop
        0x40a695: '8b84a980050000',                  # read count[channel]
        0x40a6a7: '83f8067e05b8060000008d44c012688a020000d1e0',  # min6,18n+36,y650
        0x409aec: 'b988614c00536885000000',          # renderer loads bitmap133
    }
    for address, expected in signatures.items():
        value = bytes.fromhex(expected)
        start = file_offset(address - image_base)
        if binary[start:start+len(value)] != value:
            raise ValueError(f'Instruction verification failed at {address:#x}')
    resource = file_offset(u32(optional + 96 + 2 * 8))
    def entries(relative):
        start = resource + relative
        count = u16(start + 12) + u16(start + 14)
        return [struct.unpack_from('<II', binary, start + 16 + i*8) for i in range(count)]
    node = 0
    for resource_id in (2, 133):  # RT_BITMAP / ID133
        child = next(value for key, value in entries(node) if key == resource_id)
        if not child & 0x80000000:
            raise ValueError('Expected resource directory')
        node = child & 0x7fffffff
    languages = entries(node)
    leaf = next(value for key, value in languages if key == 0x411)
    data_rva, data_length = struct.unpack_from('<II', binary, resource + leaf)
    start = file_offset(data_rva)
    dib = binary[start:start+data_length]
    header, width, height, planes, bits, compression = struct.unpack_from('<IiiHHI', dib)
    if (header,width,height,planes,bits,compression) != (40,640,2095,1,8,0):
        raise ValueError('Unexpected bitmap representation')
    colors = struct.unpack_from('<I', dib, 32)[0] or 256
    pixel_start = header + colors*4
    stride = ((width*bits+31)//32)*4
    levels = []
    for voices in range(7):
        sx, sy = 36+18*voices, 650
        # Center of the actual 10x4 lamp interior; not the surrounding frame.
        x, y = sx+8, sy+5
        index = dib[pixel_start+(height-1-y)*stride+x]
        blue,green,red,_ = struct.unpack_from('<BBBB', dib, header+index*4)
        levels.append({'voices':str(voices) if voices<6 else '6+',
                       'rgb':[red,green,blue], 'hex':f'#{red:02x}{green:02x}{blue:02x}',
                       'spriteRect':[sx,sy,16,10]})
    return {'method':'static original executable inspection; no native execution',
            'exeSha256':digest,'bitmapResourceId':133,'languageId':1041,
            'voiceCounterAddress':'0x402192','drawAddress':'0x40a68d',
            'selector':'min(channelActiveVoices, 6)',
            'verifiedInstructionAddresses':[f'{a:#x}' for a in signatures],
            'levels':levels}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args=parser.parse_args()
    try:
        print(json.dumps(inspect(args.source),indent=2))
    except (OSError, ValueError, StopIteration, struct.error) as error:
        parser.exit(1,f'Cannot inspect POLY colors: {error}\n')

if __name__ == '__main__':
    main()
