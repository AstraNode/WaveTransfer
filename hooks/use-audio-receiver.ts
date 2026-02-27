// hooks/use-audio-receiver.ts
"use client"

import { useCallback, useRef, useState, useEffect } from 'react'
import { ReceiverState, DecodedFile } from '@/lib/types'
import {
    AUDIO_CONFIG,
    detectSymbol,
    detectHandshake,
    detectHandshakeEnd,
    detectEndTransmission,
    decodeSymbolsToFile,
} from '@/lib/audio-protocol'

export type MicPermissionState = 'unknown' | 'granted' | 'denied'

export function useAudioReceiver() {
    const [state, setState] = useState<ReceiverState>({
        status: 'idle',
        progress: 0,
        symbolsReceived: 0,
        totalSymbolsExpected: 0,
        signalStrength: 0,
        metadata: null,
    })

    const [decodedFile, setDecodedFile] = useState<DecodedFile | null>(null)
    const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)
    const [micPermission, setMicPermission] = useState<MicPermissionState>('unknown')

    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const mediaStreamRef = useRef<MediaStream | null>(null)
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
    const processorRef = useRef<ScriptProcessorNode | null>(null)
    const isListeningRef = useRef(false)

    // State machine refs
    const phaseRef = useRef<
        'waiting_handshake' | 'in_handshake' | 'waiting_data' | 'receiving_data' | 'done'
    >('waiting_handshake')
    const symbolsRef = useRef<number[]>([])
    const handshakeCountRef = useRef(0)
    const silenceCountRef = useRef(0)
    const endDetectCountRef = useRef(0)
    const metadataParsedRef = useRef(false)
    const metadataRef = useRef<{ name: string; type: string; size: number } | null>(null)

    // ────────────────────────────────────────────
    // Permission check (non-blocking, best-effort)
    // ────────────────────────────────────────────
    const checkMicrophonePermission = useCallback(async () => {
        try {
            if (navigator?.permissions?.query) {
                const result = await navigator.permissions.query({
                    name: 'microphone' as PermissionName,
                })
                setMicPermission(
                    result.state === 'granted'
                        ? 'granted'
                        : result.state === 'denied'
                            ? 'denied'
                            : 'unknown'
                )
                result.addEventListener('change', () => {
                    setMicPermission(
                        result.state === 'granted'
                            ? 'granted'
                            : result.state === 'denied'
                                ? 'denied'
                                : 'unknown'
                    )
                })
            }
        } catch {
            setMicPermission('unknown')
        }
    }, [])

    useEffect(() => {
        checkMicrophonePermission()
    }, [checkMicrophonePermission])

    // ────────────────────────────────────────────
    // Cleanup all audio resources
    // ────────────────────────────────────────────
    const cleanup = useCallback(() => {
        isListeningRef.current = false
        phaseRef.current = 'waiting_handshake'
        symbolsRef.current = []
        handshakeCountRef.current = 0
        silenceCountRef.current = 0
        endDetectCountRef.current = 0
        metadataParsedRef.current = false
        metadataRef.current = null

        if (processorRef.current) {
            try { processorRef.current.disconnect() } catch { }
            processorRef.current = null
        }
        if (sourceNodeRef.current) {
            try { sourceNodeRef.current.disconnect() } catch { }
            sourceNodeRef.current = null
        }
        if (analyserRef.current) {
            try { analyserRef.current.disconnect() } catch { }
            analyserRef.current = null
            setAnalyserNode(null)
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop())
            mediaStreamRef.current = null
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try { audioContextRef.current.close() } catch { }
            audioContextRef.current = null
        }
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup()
        }
    }, [cleanup])

    // ────────────────────────────────────────────
    // Try to extract metadata from partial symbols
    // ────────────────────────────────────────────
    const tryParseMetadata = useCallback(() => {
        if (metadataParsedRef.current) return
        const syms = symbolsRef.current
        if (syms.length < 10) return

        try {
            const byteCount = Math.floor(syms.length / 2)
            const bytes = new Uint8Array(byteCount)
            for (let i = 0; i < byteCount; i++) {
                bytes[i] = ((syms[i * 2] & 0x0F) << 4) | (syms[i * 2 + 1] & 0x0F)
            }

            const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
            const headerEndIdx = decoded.indexOf(String.fromCharCode(0x1E))
            if (headerEndIdx === -1) return

            const fields = decoded
                .substring(0, headerEndIdx)
                .split(String.fromCharCode(0x1F))
            if (fields.length < 3) return

            const size = parseInt(fields[2], 10)
            if (isNaN(size) || size <= 0) return

            const meta = { name: fields[0], type: fields[1], size }
            metadataRef.current = meta
            metadataParsedRef.current = true

            // Calculate expected total symbols
            const headerBytes = new TextEncoder().encode(
                decoded.substring(0, headerEndIdx + 1)
            ).length
            const totalSymbols = (headerBytes + size + 1) * 2 // +1 CRC byte, *2 nibbles

            setState(prev => ({
                ...prev,
                metadata: meta,
                totalSymbolsExpected: totalSymbols,
            }))
        } catch {
            // Not enough data yet
        }
    }, [])

    // ────────────────────────────────────────────
    // Finish receiving and decode the full payload
    // ────────────────────────────────────────────
    const finishReceiving = useCallback(() => {
        if (phaseRef.current === 'done') return
        phaseRef.current = 'done'
        isListeningRef.current = false

        setState(prev => ({ ...prev, status: 'verifying' }))

        const result = decodeSymbolsToFile(symbolsRef.current)

        if (result) {
            if (result.checksumValid) {
                // Fix TS 5.7 Uint8Array<ArrayBufferLike> → Blob issue
                const buffer = result.data.buffer.slice(
                    result.data.byteOffset,
                    result.data.byteOffset + result.data.byteLength
                )
                const blob = new Blob([buffer], {
                    type: result.metadata.type || 'application/octet-stream',
                })
                const url = URL.createObjectURL(blob)

                setDecodedFile({
                    metadata: result.metadata,
                    data: result.data,
                    blob,
                    url,
                })
                setState(prev => ({
                    ...prev,
                    status: 'complete',
                    progress: 100,
                    metadata: result.metadata,
                }))
            } else {
                setState(prev => ({
                    ...prev,
                    status: 'error',
                    errorMessage:
                        'Checksum failed. Data corrupted. Move devices closer and try again.',
                }))
            }
        } else {
            setState(prev => ({
                ...prev,
                status: 'error',
                errorMessage:
                    'Could not decode data. Transmission may have been incomplete or too noisy.',
            }))
        }

        // Release audio resources (keep decoded state)
        if (processorRef.current) {
            try { processorRef.current.disconnect() } catch { }
            processorRef.current = null
        }
        if (sourceNodeRef.current) {
            try { sourceNodeRef.current.disconnect() } catch { }
            sourceNodeRef.current = null
        }
        if (analyserRef.current) {
            try { analyserRef.current.disconnect() } catch { }
            analyserRef.current = null
            setAnalyserNode(null)
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop())
            mediaStreamRef.current = null
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try { audioContextRef.current.close() } catch { }
            audioContextRef.current = null
        }
    }, [])

    // ────────────────────────────────────────────
    // Process one audio window based on current phase
    // ────────────────────────────────────────────
    const processWindow = useCallback(
        (samples: Float32Array, sampleRate: number) => {
            if (!isListeningRef.current) return

            switch (phaseRef.current) {
                // ── Waiting for the 1-sec handshake tone ──
                case 'waiting_handshake': {
                    const { detected, power } = detectHandshake(samples, sampleRate)
                    setState(prev => ({
                        ...prev,
                        signalStrength: Math.min(power * 5, 1),
                    }))

                    if (detected) {
                        handshakeCountRef.current++
                        // Need consecutive detections to avoid false positives
                        if (handshakeCountRef.current > 5) {
                            phaseRef.current = 'in_handshake'
                            setState(prev => ({ ...prev, status: 'handshake_detected' }))
                        }
                    } else {
                        // Decay slowly so brief noise doesn't reset
                        handshakeCountRef.current = Math.max(
                            0,
                            handshakeCountRef.current - 1
                        )
                    }
                    break
                }

                // ── Inside the handshake, waiting for the end tone ──
                case 'in_handshake': {
                    const { power } = detectHandshake(samples, sampleRate)
                    setState(prev => ({
                        ...prev,
                        signalStrength: Math.min(power * 5, 1),
                    }))

                    if (detectHandshakeEnd(samples, sampleRate)) {
                        phaseRef.current = 'waiting_data'
                        silenceCountRef.current = 0
                    }
                    break
                }

                // ── Brief gap between handshake and data ──
                case 'waiting_data': {
                    silenceCountRef.current++
                    if (silenceCountRef.current > 3) {
                        phaseRef.current = 'receiving_data'
                        symbolsRef.current = []
                        silenceCountRef.current = 0
                        endDetectCountRef.current = 0
                        metadataParsedRef.current = false
                        metadataRef.current = null
                        setState(prev => ({ ...prev, status: 'receiving' }))
                    }
                    break
                }

                // ── Receiving 16-FSK data symbols ──
                case 'receiving_data': {
                    // Check for end-of-transmission marker
                    if (detectEndTransmission(samples, sampleRate)) {
                        endDetectCountRef.current++
                        if (endDetectCountRef.current > 3) {
                            finishReceiving()
                            return
                        }
                        // Don't add this window as a data symbol
                        break
                    } else {
                        endDetectCountRef.current = Math.max(
                            0,
                            endDetectCountRef.current - 1
                        )
                    }

                    // Detect which of the 16 frequencies is dominant
                    const { symbol, confidence, power } = detectSymbol(
                        samples,
                        sampleRate
                    )

                    setState(prev => ({
                        ...prev,
                        signalStrength: Math.min(power * 5, 1),
                    }))

                    if (symbol >= 0 && symbol < 16 && confidence > 0.15 && power > 0.008) {
                        symbolsRef.current.push(symbol)

                        // Try parsing metadata every 20 symbols until found
                        if (!metadataParsedRef.current && symbolsRef.current.length % 20 === 0) {
                            tryParseMetadata()
                        }

                        const totalExpected = metadataRef.current
                            ? (new TextEncoder().encode(
                                `${metadataRef.current.name}\x1F${metadataRef.current.type}\x1F${metadataRef.current.size}\x1E`
                            ).length +
                                metadataRef.current.size +
                                1) *
                            2
                            : 0

                        setState(prev => ({
                            ...prev,
                            symbolsReceived: symbolsRef.current.length,
                            progress:
                                totalExpected > 0
                                    ? Math.min(
                                        (symbolsRef.current.length / totalExpected) * 100,
                                        99
                                    )
                                    : 0,
                        }))
                    } else if (power < 0.003) {
                        // Very low power — might be silence / end
                        silenceCountRef.current++
                        if (silenceCountRef.current > 30 && symbolsRef.current.length > 10) {
                            // Extended silence after receiving data = transmission ended
                            finishReceiving()
                            return
                        }
                    } else {
                        silenceCountRef.current = 0
                    }
                    break
                }

                case 'done':
                    // Nothing to do
                    break
            }
        },
        [finishReceiving, tryParseMetadata]
    )

    // ────────────────────────────────────────────
    // Start listening — requests mic on button click
    // ────────────────────────────────────────────
    const startListening = useCallback(async () => {
        cleanup()
        setDecodedFile(null)

        setState({
            status: 'idle',
            progress: 0,
            symbolsReceived: 0,
            totalSymbolsExpected: 0,
            signalStrength: 0,
            metadata: null,
        })

        // ── Step 1: Request microphone (triggers browser permission prompt) ──
        let stream: MediaStream
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            })
        } catch (error: any) {
            console.error('Microphone error:', error)

            const errorName = error?.name || ''
            let errorMessage: string

            switch (errorName) {
                case 'NotAllowedError':
                case 'PermissionDeniedError':
                    setMicPermission('denied')
                    errorMessage =
                        'Microphone access denied. Click the lock/tune icon in your address bar to allow microphone, then try again.'
                    break
                case 'NotFoundError':
                case 'DevicesNotFoundError':
                    errorMessage =
                        'No microphone found. Please connect a microphone and try again.'
                    break
                case 'NotReadableError':
                case 'TrackStartError':
                    errorMessage =
                        'Microphone is in use by another application. Close other apps using the mic and retry.'
                    break
                case 'OverconstrainedError':
                    errorMessage =
                        'Microphone does not support required audio settings.'
                    break
                default:
                    errorMessage = `Microphone error: ${error?.message || 'Unknown error. Ensure you are on HTTPS or localhost.'}`
                    break
            }

            setState(prev => ({
                ...prev,
                status: 'error',
                errorMessage,
            }))
            return
        }

        // Permission granted
        setMicPermission('granted')
        mediaStreamRef.current = stream

        // ── Step 2: Set up Web Audio pipeline ──
        try {
            const AudioCtx =
                window.AudioContext || (window as any).webkitAudioContext
            const ctx = new AudioCtx({ sampleRate: AUDIO_CONFIG.sampleRate })
            audioContextRef.current = ctx

            // Resume if suspended (Chrome autoplay policy)
            if (ctx.state === 'suspended') {
                await ctx.resume()
            }

            // Source from microphone
            const source = ctx.createMediaStreamSource(stream)
            sourceNodeRef.current = source

            // Analyser for waveform visualization
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 2048
            analyser.smoothingTimeConstant = 0.2
            analyserRef.current = analyser
            setAnalyserNode(analyser)
            source.connect(analyser)

            // Calculate samples per symbol for precise windowing
            const sampleRate = ctx.sampleRate
            const samplesPerSymbol = Math.round(
                sampleRate * AUDIO_CONFIG.symbolDuration
            )

            // ScriptProcessor for real-time audio processing
            const bufferSize = 2048
            const processor = ctx.createScriptProcessor(bufferSize, 1, 1)
            processorRef.current = processor

            // Reset all state machine variables
            isListeningRef.current = true
            phaseRef.current = 'waiting_handshake'
            symbolsRef.current = []
            handshakeCountRef.current = 0
            silenceCountRef.current = 0
            endDetectCountRef.current = 0
            metadataParsedRef.current = false
            metadataRef.current = null

            // Accumulator for building exact symbol-sized windows
            let accumulator = new Float32Array(0)

            processor.onaudioprocess = (event: AudioProcessingEvent) => {
                if (!isListeningRef.current) return

                const input = event.inputBuffer.getChannelData(0)
                const output = event.outputBuffer.getChannelData(0)
                // Pass through so analyser gets data
                output.set(input)

                // During handshake phases, process raw buffers (larger = better freq resolution)
                if (
                    phaseRef.current === 'waiting_handshake' ||
                    phaseRef.current === 'in_handshake' ||
                    phaseRef.current === 'waiting_data'
                ) {
                    processWindow(input, sampleRate)
                    return
                }

                // During data reception, accumulate into exact symbol-length windows
                const newAcc = new Float32Array(accumulator.length + input.length)
                newAcc.set(accumulator)
                newAcc.set(input, accumulator.length)
                accumulator = newAcc

                // Process complete symbol windows
                while (accumulator.length >= samplesPerSymbol) {
                    const symbolSamples = accumulator.slice(0, samplesPerSymbol)
                    accumulator = accumulator.slice(samplesPerSymbol)
                    processWindow(symbolSamples, sampleRate)

                    // Safety: stop if we're done
                    if (phaseRef.current === 'done') {
                        accumulator = new Float32Array(0)
                        break
                    }
                }

                // Prevent accumulator from growing unbounded
                if (accumulator.length > samplesPerSymbol * 10) {
                    accumulator = accumulator.slice(-samplesPerSymbol * 2)
                }
            }

            // Connect the processing chain
            source.connect(processor)
            processor.connect(ctx.destination)

            // Update UI to listening state
            setState({
                status: 'listening',
                progress: 0,
                symbolsReceived: 0,
                totalSymbolsExpected: 0,
                signalStrength: 0,
                metadata: null,
            })
        } catch (error: any) {
            console.error('Audio setup error:', error)
            cleanup()
            setState(prev => ({
                ...prev,
                status: 'error',
                errorMessage: `Audio setup failed: ${error?.message || 'Unknown error'}`,
            }))
        }
    }, [cleanup, processWindow])

    // ────────────────────────────────────────────
    // Stop listening
    // ────────────────────────────────────────────
    const stopListening = useCallback(() => {
        cleanup()
        setState({
            status: 'idle',
            progress: 0,
            symbolsReceived: 0,
            totalSymbolsExpected: 0,
            signalStrength: 0,
            metadata: null,
        })
        setDecodedFile(null)
    }, [cleanup])

    // ────────────────────────────────────────────
    // Reset to initial state
    // ────────────────────────────────────────────
    const reset = useCallback(() => {
        cleanup()
        setState({
            status: 'idle',
            progress: 0,
            symbolsReceived: 0,
            totalSymbolsExpected: 0,
            signalStrength: 0,
            metadata: null,
        })
        setDecodedFile(null)
    }, [cleanup])

    return {
        state,
        decodedFile,
        analyserNode,
        micPermission,
        startListening,
        stopListening,
        reset,
        checkMicrophonePermission,
    }
}