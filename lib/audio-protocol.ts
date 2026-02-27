// lib/audio-protocol.ts
import { AudioConfig, FileMetadata } from './types'
import { crc8 } from './crc8'

// ============================================================
// FAST MULTI-TONE FSK PROTOCOL
// 4 frequencies = 4 bits per symbol = 800+ bps effective
// ============================================================

export const AUDIO_CONFIG: AudioConfig = {
    sampleRate: 44100,
    // Handshake tones
    handshakeFreq: 1800,
    handshakeDuration: 1.0,      // 1 second handshake
    handshakeEndFreq: 2500,
    handshakeEndDuration: 0.3,
    // Data encoding — 16-FSK (4 bits per symbol)
    baseFreq: 800,
    freqStep: 200,               // 16 frequencies: 800, 1000, 1200 ... 3800 Hz
    symbolRate: 150,              // 150 symbols/sec
    bitsPerSymbol: 4,             // 4 bits per symbol (16-FSK)
    symbolDuration: 1 / 150,
    rampDuration: 0.001,
    // Derived
    effectiveBPS: 150 * 4,       // 600 bps
}

// 16 frequencies for 4-bit symbols (0x0 to 0xF)
export const SYMBOL_FREQS: number[] = Array.from(
    { length: 16 },
    (_, i) => AUDIO_CONFIG.baseFreq + i * AUDIO_CONFIG.freqStep
)

// Special markers
export const HANDSHAKE_FREQ = AUDIO_CONFIG.handshakeFreq
export const HANDSHAKE_END_FREQ = AUDIO_CONFIG.handshakeEndFreq
export const END_TRANSMISSION_FREQ = 4200
export const END_DURATION = 0.5

// Delimiter bytes
const FIELD_DELIMITER = 0x1F
const HEADER_END = 0x1E

// ============================================================
// ENCODING: File → Symbol stream
// ============================================================

export function encodeFileToSymbols(
    fileData: Uint8Array,
    metadata: FileMetadata
): number[] {
    // Build header string: name|type|size
    const headerStr = `${metadata.name}${String.fromCharCode(FIELD_DELIMITER)}${metadata.type || 'application/octet-stream'}${String.fromCharCode(FIELD_DELIMITER)}${metadata.size}${String.fromCharCode(HEADER_END)}`

    const headerBytes = new TextEncoder().encode(headerStr)

    // Combine header + payload
    const allBytes = new Uint8Array(headerBytes.length + fileData.length)
    allBytes.set(headerBytes, 0)
    allBytes.set(fileData, headerBytes.length)

    // Compute CRC8 over all data
    const checksum = crc8(allBytes)

    // Convert bytes to 4-bit symbols (nibbles)
    const symbols: number[] = []
    for (let i = 0; i < allBytes.length; i++) {
        symbols.push((allBytes[i] >> 4) & 0x0F)  // High nibble
        symbols.push(allBytes[i] & 0x0F)          // Low nibble
    }

    // Append checksum as 2 symbols
    symbols.push((checksum >> 4) & 0x0F)
    symbols.push(checksum & 0x0F)

    return symbols
}

export function getTotalSymbols(metadata: FileMetadata): number {
    const headerEstimate = metadata.name.length + (metadata.type || '').length + String(metadata.size).length + 3
    const totalBytes = headerEstimate + metadata.size + 1 // +1 for CRC
    return totalBytes * 2 // 2 symbols per byte
}

export function getEstimatedDuration(metadata: FileMetadata): number {
    const symbols = getTotalSymbols(metadata)
    const dataDuration = symbols / AUDIO_CONFIG.symbolRate
    const overhead = AUDIO_CONFIG.handshakeDuration + AUDIO_CONFIG.handshakeEndDuration + END_DURATION + 0.2
    return dataDuration + overhead
}

// ============================================================
// DECODING: Symbols → File
// ============================================================

export function decodeSymbolsToFile(symbols: number[]): {
    metadata: FileMetadata
    data: Uint8Array
    checksumValid: boolean
} | null {
    try {
        if (symbols.length < 6) return null

        // Convert symbols back to bytes
        const byteCount = Math.floor(symbols.length / 2)
        const allBytes = new Uint8Array(byteCount)
        for (let i = 0; i < byteCount; i++) {
            allBytes[i] = ((symbols[i * 2] & 0x0F) << 4) | (symbols[i * 2 + 1] & 0x0F)
        }

        // Last byte is checksum
        const receivedChecksum = allBytes[allBytes.length - 1]
        const dataBytes = allBytes.slice(0, allBytes.length - 1)

        // Verify checksum
        const computedChecksum = crc8(dataBytes)
        const checksumValid = receivedChecksum === computedChecksum

        // Parse header
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(dataBytes)
        const headerEndIdx = decoded.indexOf(String.fromCharCode(HEADER_END))
        if (headerEndIdx === -1) return null

        const headerStr = decoded.substring(0, headerEndIdx)
        const fields = headerStr.split(String.fromCharCode(FIELD_DELIMITER))
        if (fields.length < 3) return null

        const metadata: FileMetadata = {
            name: fields[0],
            type: fields[1],
            size: parseInt(fields[2], 10),
        }

        if (isNaN(metadata.size) || metadata.size <= 0) return null

        // Extract payload
        const headerByteLength = new TextEncoder().encode(
            headerStr + String.fromCharCode(HEADER_END)
        ).length
        const payload = dataBytes.slice(headerByteLength, headerByteLength + metadata.size)

        return { metadata, data: payload, checksumValid }
    } catch (e) {
        console.error('Decode error:', e)
        return null
    }
}

// ============================================================
// FREQUENCY DETECTION — Goertzel (optimized)
// ============================================================

export function goertzel(
    samples: Float32Array,
    targetFreq: number,
    sampleRate: number
): number {
    const N = samples.length
    const k = Math.round((N * targetFreq) / sampleRate)
    const w = (2 * Math.PI * k) / N
    const coeff = 2 * Math.cos(w)

    let s1 = 0
    let s2 = 0

    for (let i = 0; i < N; i++) {
        const s0 = samples[i] + coeff * s1 - s2
        s2 = s1
        s1 = s0
    }

    return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / N
}

// Detect which of the 16 symbol frequencies is dominant
export function detectSymbol(
    samples: Float32Array,
    sampleRate: number
): { symbol: number; confidence: number; power: number } {
    let maxPower = 0
    let secondPower = 0
    let bestSymbol = -1

    for (let i = 0; i < 16; i++) {
        const power = goertzel(samples, SYMBOL_FREQS[i], sampleRate)
        if (power > maxPower) {
            secondPower = maxPower
            maxPower = power
            bestSymbol = i
        } else if (power > secondPower) {
            secondPower = power
        }
    }

    const confidence = maxPower > 0 ? (maxPower - secondPower) / maxPower : 0

    return { symbol: bestSymbol, confidence, power: maxPower }
}

// Detect handshake tone
export function detectHandshake(
    samples: Float32Array,
    sampleRate: number
): { detected: boolean; power: number } {
    const handshakePower = goertzel(samples, HANDSHAKE_FREQ, sampleRate)
    const noisePower = goertzel(samples, 500, sampleRate) + goertzel(samples, 3500, sampleRate)
    const ratio = handshakePower / (noisePower + 0.0001)

    return { detected: ratio > 3 && handshakePower > 0.02, power: handshakePower }
}

// Detect handshake end tone
export function detectHandshakeEnd(
    samples: Float32Array,
    sampleRate: number
): boolean {
    const endPower = goertzel(samples, HANDSHAKE_END_FREQ, sampleRate)
    const handshakePower = goertzel(samples, HANDSHAKE_FREQ, sampleRate)
    return endPower > 0.02 && endPower > handshakePower * 1.5
}

// Detect end of transmission
export function detectEndTransmission(
    samples: Float32Array,
    sampleRate: number
): boolean {
    const endPower = goertzel(samples, END_TRANSMISSION_FREQ, sampleRate)
    let maxDataPower = 0
    for (let i = 0; i < 16; i++) {
        maxDataPower = Math.max(maxDataPower, goertzel(samples, SYMBOL_FREQS[i], sampleRate))
    }
    return endPower > 0.02 && endPower > maxDataPower * 1.5
}