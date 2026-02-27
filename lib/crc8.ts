// lib/crc8.ts
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