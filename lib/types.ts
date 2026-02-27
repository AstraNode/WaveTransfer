// lib/types.ts
export interface FileMetadata {
    name: string
    type: string
    size: number
}

export interface TransmissionState {
    status: 'idle' | 'handshake' | 'transmitting' | 'complete' | 'error'
    progress: number
    currentSymbol: number
    totalSymbols: number
    estimatedTime: number
    elapsedTime: number
    effectiveBPS: number
}

export interface ReceiverState {
    status: 'idle' | 'listening' | 'handshake_detected' | 'receiving' | 'verifying' | 'complete' | 'error'
    progress: number
    symbolsReceived: number
    totalSymbolsExpected: number
    signalStrength: number
    metadata: FileMetadata | null
    errorMessage?: string
}

export interface AudioConfig {
    sampleRate: number
    handshakeFreq: number
    handshakeDuration: number
    handshakeEndFreq: number
    handshakeEndDuration: number
    baseFreq: number
    freqStep: number
    symbolRate: number
    bitsPerSymbol: number
    symbolDuration: number
    rampDuration: number
    effectiveBPS: number
}

export interface DecodedFile {
    metadata: FileMetadata
    data: Uint8Array
    blob: Blob
    url: string
}