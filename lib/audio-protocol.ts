// lib/audio-protocol.ts
import { AudioConfig, FileMetadata, ProtocolFrame } from './types'
import { crc8, bytesToBits, bitsToBytes } from './crc8'

// Protocol constants
export const AUDIO_CONFIG: AudioConfig = {
    spaceFreq: 1200,      // Bit 0 frequency in Hz
    markFreq: 2400,       // Bit 1 frequency in Hz
    baudRate: 75,          // Bits per second (conservative for reliability)
    sampleRate: 44100,     // Audio sample rate
    preambleLength: 32,   // Number of alternating bits in preamble
    syncPatternLength: 8, // Sync word after preamble
    bitDuration: 1 / 75,  // Duration of each bit in seconds
    rampDuration: 0.002,  // Smooth transitions to avoid clicking
}

// Special frequencies for protocol signaling
export const SYNC_FREQ = 1800        // Sync tone between preamble and data
export const END_FREQ = 3000         // End of transmission marker
export const PREAMBLE_PAUSE = 1000   // Brief silence freq (actually silence)

// Delimiter between header fields
const FIELD_DELIMITER = 0x1F  // Unit Separator ASCII
const HEADER_END = 0x1E      // Record Separator ASCII

// Sync word: 10110010
const SYNC_WORD = [1, 0, 1, 1, 0, 0, 1, 0]

// End marker: 8 bits of alternating at higher frequency
const END_MARKER = [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0]

export function stringToBits(str: string): number[] {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)
    return bytesToBits(bytes)
}

export function bitsToString(bits: number[]): string {
    const bytes = bitsToBytes(bits)
    const decoder = new TextDecoder()
    return decoder.decode(bytes)
}

export function numberToBits(num: number, bitLength: number = 32): number[] {
    const bits: number[] = []
    for (let i = bitLength - 1; i >= 0; i--) {
        bits.push((num >> i) & 1)
    }
    return bits
}

export function bitsToNumber(bits: number[]): number {
    let num = 0
    for (let i = 0; i < bits.length; i++) {
        num = (num << 1) | bits[i]
    }
    return num
}

export function encodeFileToFrame(
    fileData: Uint8Array,
    metadata: FileMetadata
): ProtocolFrame {
    // Build preamble: alternating 1s and 0s
    const preamble: number[] = []
    for (let i = 0; i < AUDIO_CONFIG.preambleLength; i++) {
        preamble.push(i % 2)
    }

    // Build header: filename | mimetype | filesize
    const headerString = `${metadata.name}${String.fromCharCode(FIELD_DELIMITER)}${metadata.type}${String.fromCharCode(FIELD_DELIMITER)}${metadata.size}${String.fromCharCode(HEADER_END)}`
    const header = stringToBits(headerString)

    // Build payload
    const payload = bytesToBits(fileData)

    // Compute checksum over header + payload bytes
    const allDataBits = [...header, ...payload]
    const allDataBytes = bitsToBytes(allDataBits)
    const checksum = crc8(allDataBytes)

    return {
        preamble,
        header,
        payload,
        checksum,
        endMarker: END_MARKER,
    }
}

export function frameToBitstream(frame: ProtocolFrame): number[] {
    const checksumBits = numberToBits(frame.checksum, 8)
    return [
        ...frame.preamble,
        ...SYNC_WORD,
        ...frame.header,
        ...frame.payload,
        ...checksumBits,
        ...frame.endMarker,
    ]
}

export function getTotalBits(frame: ProtocolFrame): number {
    return (
        frame.preamble.length +
        SYNC_WORD.length +
        frame.header.length +
        frame.payload.length +
        8 + // checksum
        frame.endMarker.length
    )
}

export function getEstimatedDuration(totalBits: number): number {
    return totalBits / AUDIO_CONFIG.baudRate
}

// Decode received bits back into file data
export function decodeReceivedBits(bits: number[]): {
    metadata: FileMetadata
    data: Uint8Array
    checksumValid: boolean
} | null {
    try {
        // Convert bits to bytes first to find delimiters
        const bytes = bitsToBytes(bits)
        const decoder = new TextDecoder()
        const fullString = decoder.decode(bytes)

        // Find the header end marker
        const headerEndIndex = fullString.indexOf(String.fromCharCode(HEADER_END))
        if (headerEndIndex === -1) return null

        const headerString = fullString.substring(0, headerEndIndex)
        const fields = headerString.split(String.fromCharCode(FIELD_DELIMITER))
        if (fields.length < 3) return null

        const metadata: FileMetadata = {
            name: fields[0],
            type: fields[1],
            size: parseInt(fields[2], 10),
        }

        // Calculate bit positions
        const headerBytesLength = headerEndIndex + 1  // +1 for the HEADER_END char
        const headerBitsLength = headerBytesLength * 8
        const payloadBitsLength = metadata.size * 8
        const checksumBitsStart = headerBitsLength + payloadBitsLength
        const checksumBitsEnd = checksumBitsStart + 8

        if (bits.length < checksumBitsEnd) return null

        const payloadBits = bits.slice(headerBitsLength, headerBitsLength + payloadBitsLength)
        const checksumBits = bits.slice(checksumBitsStart, checksumBitsEnd)

        const data = bitsToBytes(payloadBits)
        const receivedChecksum = bitsToNumber(checksumBits)

        // Verify checksum
        const dataBitsForChecksum = bits.slice(0, checksumBitsStart)
        const dataBytesForChecksum = bitsToBytes(dataBitsForChecksum)
        const computedChecksum = crc8(dataBytesForChecksum)

        return {
            metadata,
            data: data.slice(0, metadata.size),
            checksumValid: receivedChecksum === computedChecksum,
        }
    } catch (e) {
        console.error('Decode error:', e)
        return null
    }
}

// Goertzel algorithm for efficient single-frequency detection
export function goertzel(
    samples: Float32Array,
    targetFreq: number,
    sampleRate: number
): number {
    const N = samples.length
    const k = Math.round((N * targetFreq) / sampleRate)
    const w = (2 * Math.PI * k) / N
    const cosW = Math.cos(w)
    const coeff = 2 * cosW

    let s0 = 0
    let s1 = 0
    let s2 = 0

    for (let i = 0; i < N; i++) {
        s0 = samples[i] + coeff * s1 - s2
        s2 = s1
        s1 = s0
    }

    const power = s1 * s1 + s2 * s2 - coeff * s1 * s2
    return Math.sqrt(Math.abs(power) / N)
}

// Detect dominant frequency using Goertzel on both FSK frequencies
export function detectFSKBit(
    samples: Float32Array,
    sampleRate: number
): { bit: number; confidence: number; signalStrength: number } {
    const spacePower = goertzel(samples, AUDIO_CONFIG.spaceFreq, sampleRate)
    const markPower = goertzel(samples, AUDIO_CONFIG.markFreq, sampleRate)

    const totalPower = spacePower + markPower
    const signalStrength = totalPower

    if (totalPower < 0.01) {
        return { bit: -1, confidence: 0, signalStrength: 0 }
    }

    const bit = markPower > spacePower ? 1 : 0
    const confidence = Math.abs(markPower - spacePower) / totalPower

    return { bit, confidence, signalStrength }
}

// Check if samples contain sync pattern
export function detectSyncWord(recentBits: number[]): boolean {
    if (recentBits.length < SYNC_WORD.length) return false
    const lastBits = recentBits.slice(-SYNC_WORD.length)
    return lastBits.every((bit, i) => bit === SYNC_WORD[i])
}

// Check for preamble pattern (alternating bits)
export function detectPreamble(recentBits: number[], minLength: number = 8): boolean {
    if (recentBits.length < minLength) return false
    const check = recentBits.slice(-minLength)
    for (let i = 1; i < check.length; i++) {
        if (check[i] === check[i - 1]) return false
    }
    return true
}

// Check for end marker pattern
export function detectEndMarker(recentBits: number[]): boolean {
    if (recentBits.length < END_MARKER.length) return false
    const lastBits = recentBits.slice(-END_MARKER.length)
    return lastBits.every((bit, i) => bit === END_MARKER[i])
}