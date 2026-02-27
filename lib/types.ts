// lib/types.ts
export interface FileMetadata {
    name: string
    type: string
    size: number
}

export interface TransmissionState {
    status: 'idle' | 'preparing' | 'transmitting' | 'complete' | 'error'
    progress: number
    currentBit: number
    totalBits: number
    estimatedTime: number
    elapsedTime: number
}

export interface ReceiverState {
    status: 'idle' | 'listening' | 'syncing' | 'receiving_header' | 'receiving_payload' | 'verifying' | 'complete' | 'error'
    progress: number
    bitsReceived: number
    totalBitsExpected: number
    signalStrength: number
    metadata: FileMetadata | null
    errorMessage?: string
}

export interface ProtocolFrame {
    preamble: number[]
    header: number[]
    payload: number[]
    checksum: number
    endMarker: number[]
}

export interface AudioConfig {
    spaceFreq: number
    markFreq: number
    baudRate: number
    sampleRate: number
    preambleLength: number
    syncPatternLength: number
    bitDuration: number
    rampDuration: number
}

export interface DecodedFile {
    metadata: FileMetadata
    data: Uint8Array
    blob: Blob
    url: string
}