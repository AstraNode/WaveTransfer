// lib/crc8.ts
// CRC-8/MAXIM polynomial 0x31
const CRC8_TABLE: number[] = []

function initCRC8Table(): void {
    const polynomial = 0x31
    for (let i = 0; i < 256; i++) {
        let crc = i
        for (let j = 0; j < 8; j++) {
            if (crc & 0x80) {
                crc = ((crc << 1) ^ polynomial) & 0xff
            } else {
                crc = (crc << 1) & 0xff
            }
        }
        CRC8_TABLE[i] = crc
    }
}

initCRC8Table()

export function crc8(data: Uint8Array): number {
    let crc = 0x00
    for (let i = 0; i < data.length; i++) {
        crc = CRC8_TABLE[(crc ^ data[i]) & 0xff]
    }
    return crc
}

export function crc8FromBits(bits: number[]): number {
    const bytes = bitsToBytes(bits)
    return crc8(bytes)
}

export function bitsToBytes(bits: number[]): Uint8Array {
    const byteCount = Math.ceil(bits.length / 8)
    const bytes = new Uint8Array(byteCount)
    for (let i = 0; i < bits.length; i++) {
        if (bits[i]) {
            bytes[Math.floor(i / 8)] |= (1 << (7 - (i % 8)))
        }
    }
    return bytes
}

export function bytesToBits(bytes: Uint8Array): number[] {
    const bits: number[] = []
    for (let i = 0; i < bytes.length; i++) {
        for (let j = 7; j >= 0; j--) {
            bits.push((bytes[i] >> j) & 1)
        }
    }
    return bits
}