/**
 * zip.ts
 *
 * Minimal ZIP writer for the Playground project export. STORE method only
 * (no compression) — prototype sources are small, and a dependency-free
 * writer keeps the client bundle lean. Produces a spec-valid ZIP 2.0 archive
 * (local file headers + central directory + EOCD, UTF-8 names).
 */

export interface ZipEntry {
    path: string;
    content: string;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** Current local time as a DOS date/time pair for the archive headers. */
function dosDateTime(now: Date): { time: number; date: number } {
    const time =
        ((now.getHours() & 0x1f) << 11) |
        ((now.getMinutes() & 0x3f) << 5) |
        ((now.getSeconds() >> 1) & 0x1f);
    const date =
        (((now.getFullYear() - 1980) & 0x7f) << 9) |
        (((now.getMonth() + 1) & 0xf) << 5) |
        (now.getDate() & 0x1f);
    return { time, date };
}

/**
 * Build a downloadable ZIP Blob from a set of text entries. Paths may
 * contain slashes — folders are implied, as ZIP requires.
 */
export function buildZipBlob(entries: ZipEntry[]): Blob {
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.path.replace(/\\/g, '/'));
        const data = encoder.encode(entry.content);
        const crc = crc32(data);

        // Local file header
        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);        // version needed
        lv.setUint16(6, 0x0800, true);    // UTF-8 names
        lv.setUint16(8, 0, true);         // method: store
        lv.setUint16(10, time, true);
        lv.setUint16(12, date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);        // extra len
        local.set(nameBytes, 30);
        chunks.push(local, data);

        // Central directory record
        const cd = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(cd.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);        // version made by
        cv.setUint16(6, 20, true);        // version needed
        cv.setUint16(8, 0x0800, true);
        cv.setUint16(10, 0, true);        // method: store
        cv.setUint16(12, time, true);
        cv.setUint16(14, date, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        // extra len, comment len, disk start, internal attrs → 0
        cv.setUint32(38, 0, true);        // external attrs
        cv.setUint32(42, offset, true);   // local header offset
        cd.set(nameBytes, 46);
        central.push(cd);

        offset += local.length + data.length;
    }

    const centralSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob([...chunks, ...central, eocd] as BlobPart[], { type: 'application/zip' });
}
