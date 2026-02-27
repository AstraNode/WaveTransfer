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

    const phaseRef = useRef<'waiting_handshake' | 'in_handshake' | 'waiting_data' | 'receiving_data' | 'done'>('waiting_handshake')
    const symbolsRef = useRef<number[]>([])
    const handshakeCountRef = useRef(0)
    const silenceCountRef = useRef(0)
    const metadataRef = useRef<{ name: string; type: string; size: number } | null>(null)

    const checkMicrophonePermission = useCallback(async () => {
        try {
            if (navigator?.permissions?.query) {
                const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
                setMicPermission(result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'unknown')
                result.addEventListener('change', () => {
                    setMicPermission(result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'unknown')
                })
            }
        } catch {
            setMicPermission('unknown')
        }
    }, [])

    useEffect(() => { checkMicrophonePermission() }, [checkMicrophonePermission])

    const cleanup = useCallback(() => {
        isListeningRef.current = false
        phaseRef.current = 'waiting_handshake'
        symbolsRef.current = []
        handshakeCountRef.current = 0
        silenceCountRef.current = 0
        metadataRef.current = null

        if (processorRef.current) { try { processorRef.current.disconnect() } catch { } processorRef.current = null }
        if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect() } catch { } sourceNodeRef.current = null }
        if (analyserRef.current) { try { analyserRef.current.disconnect() } catch { } analyserRef.current = null; setAnalyserNode(null) }
        if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') { try { audioContextRef.current.close() } catch { } audioContextRef.current = null }
    }, [])

    useEffect(() => () => { cleanup() }, [cleanup])

    // ── Try to parse metadata from received symbols ──
    const tryParseMetadata = useCallback(() => {
        if (metadataRef.current) return // Already parsed

        const syms = symbolsRef.current
        if (syms.length < 10) return

        const byteCount = Math.floor(syms.length / 2)
        const bytes = new Uint8Array(byteCount)
        for (let i = 0; i < byteCount; i++) {
            bytes[i] = ((syms[i * 2] & 0x0F) << 4) | (syms[i * 2 + 1] & 0x0F)
        }

        try {
            const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
            const headerEndIdx = decoded.indexOf(String.fromCharCode(0x1E))
            if (headerEndIdx === -1) return

            const fields = decoded.substring(0, headerEndIdx).split(String.fromCharCode(0x1F))
            if (fields.length < 3) return

            const size = parseInt(fields[2], 10)
            if (isNaN(size) || size <= 0) return

            const meta = { name: fields[0], type: fields[1], size }
            metadataRef.current = meta

            const headerBytes = new TextEncoder().encode(decoded.substring(0, headerEndIdx + 1)).length
            const totalSymbols = (headerBytes + size + 1) * 2 // +1 for CRC

            setState(prev => ({
                ...prev,
                metadata: meta,
                totalSymbolsExpected: totalSymbols,
            }))
        } catch { }
    }, [])

    // ── Finish and decode ──
    const finishReceiving = useCallback(() => {
        phaseRef.current = 'done'
        isListeningRef.current = false

        setState(prev => ({ ...prev, status: 'verifying' }))

        const result = decodeSymbolsToFile(symbolsRef.current)

        if (result) {
            if (result.checksumValid) {
                const blob = new Blob([result.data], { type: result.metadata.type || 'application/octet-stream' })
                const url = URL.createObjectURL(blob)
                setDecodedFile({ metadata: result.metadata, data: result.data, blob, url })
                setState(prev => ({ ...prev, status: 'complete', progress: 100, metadata: result.metadata }))
            } else {
                setState(prev => ({ ...prev, status: 'error', errorMessage: 'Checksum failed. Move devices closer and try again.' }))
            }
        } else {
            setState(prev => ({ ...prev, status: 'error', errorMessage: 'Could not decode data. Transmission may be incomplete.' }))
        }

        if (processorRef.current) try { processorRef.current.disconnect() } catch { }
        if (sourceNodeRef.current) try { sourceNodeRef.current.disconnect() } catch { }
        if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop())
    }, [])

    // ── Process audio window ──
    const processWindow = useCallback((samples: Float32Array, sampleRate: number) => {
        switch (phaseRef.current) {
            case 'waiting_handshake': {
                const { detected, power } = detectHandshake(samples, sampleRate)
                setState(prev => ({ ...prev, signalStrength: Math.min(power * 5, 1) }))
                if (detected) {
                    handshakeCountRef.current++
                    // Need several consecutive detections to confirm
                    if (handshakeCountRef.current > 5) {
                        phaseRef.current = 'in_handshake'
                        setState(prev => ({ ...prev, status: 'handshake_detected' }))
                    }
                } else {
                    handshakeCountRef.current = Math.max(0, handshakeCountRef.current - 1)
                }
                break
            }

            case 'in_handshake': {
                // Wait for handshake end tone
                if (detectHandshakeEnd(samples, sampleRate)) {
                    phaseRef.current = 'waiting_data'
                    silenceCountRef.current = 0
                }
                break
            }

            case 'waiting_data': {
                // Small gap after handshake end, then data starts
                silenceCountRef.current++
                if (silenceCountRef.current > 3) {
                    phaseRef.current = 'receiving_data'
                    symbolsRef.current = []
                    silenceCountRef.current = 0
                    setState(prev => ({ ...prev, status: 'receiving' }))
                }
                break
            }

            case 'receiving_data': {
                // Check for end of transmission
                if (detectEndTransmission(samples, sampleRate)) {
                    silenceCountRef.current++
                    if (silenceCountRef.current > 3) {
                        finishReceiving()
                        return
                    }
                } else {
                    silenceCountRef.current = 0
                }

                const { symbol, confidence, power } = detectSymbol(samples, sampleRate)
                setState(prev => ({ ...prev, signalStrength: Math.min(power * 5, 1) }))

                if (symbol >= 0 && confidence > 0.2 && power > 0.01) {
                    symbolsRef.current.push(symbol)

                    // Try parsing metadata periodically
                    if (symbolsRef.current.length % 20 === 0) {
                        tryParseMetadata()
                    }

                    setState(prev => ({
                        ...prev,
                        symbolsReceived: symbolsRef.current.length,
                        progress: prev.totalSymbolsExpected > 0
                            ? Math.min((symbolsRef.current.length / prev.totalSymbolsExpected) * 100, 99)
                            : 0,
                    }))
                }
                break
            }
        }
    }, [finishReceiving, tryParseMetadata])

    // ── Start listening ──
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

        let stream: MediaStream
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            })
        } catch (error: any) {
            const name = error?.name || ''
            let msg: string
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                setMicPermission('denied')
                msg = 'Microphone access denied. Click the lock icon in your address bar to allow it.'
            } else if (name === 'NotFoundError') {
                msg = 'No microphone found. Connect one and try again.'
            } else if (name === 'NotReadableError') {
                msg = 'Microphone busy. Close other apps using it.'
            } else {
                msg = `Mic error: ${error?.message || 'Unknown. Use HTTPS or localhost.'}`
            }
            setState(prev => ({ ...prev, status: 'error', errorMessage: msg }))
            return
        }

        setMicPermission('granted')
        mediaStreamRef.current = stream

        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
            const ctx = new AudioCtx({ sampleRate: AUDIO_CONFIG.sampleRate })
            audioContextRef.current = ctx
            if (ctx.state === 'suspended') await ctx.resume()

            const source = ctx.createMediaStreamSource(stream)
            sourceNodeRef.current = source

            const analyser = ctx.createAnalyser()
            analyser.fftSize = 2048
            analyser.smoothingTimeConstant = 0.2
            analyserRef.current = analyser
            setAnalyserNode(analyser)
            source.connect(analyser)

            const sampleRate = ctx.sampleRate
            const samplesPerSymbol = Math.round(sampleRate * AUDIO_CONFIG.symbolDuration)
            const bufferSize = 2048
            const processor = ctx.createScriptProcessor(bufferSize, 1, 1)
            processorRef.current = processor

            isListeningRef.current = true
            phaseRef.current = 'waiting_handshake'
            symbolsRef.current = []
            handshakeCountRef.current = 0
            silenceCountRef.current = 0
            metadataRef.current = null

            let accumulator = new Float32Array(0)

            processor.onaudioprocess = (event: AudioProcessingEvent) => {
                if (!isListeningRef.current) return

                const input = event.inputBuffer.getChannelData(0)
                const output = event.outputBuffer.getChannelData(0)
                output.set(input)

                // During handshake detection, use larger windows
                if (phaseRef.current === 'waiting_handshake' || phaseRef.current === 'in_handshake' || phaseRef.current === 'waiting_data') {
                    processWindow(input, sampleRate)
                    return
                }

                // During data reception, accumulate exact symbol-length windows
                const newAcc = new Float32Array(accumulator.length + input.length)
                newAcc.set(accumulator)
                newAcc.set(input, accumulator.length)
                accumulator = newAcc

                while (accumulator.length >= samplesPerSymbol) {
                    const symbolSamples = accumulator.slice(0, samplesPerSymbol)
                    accumulator = accumulator.slice(samplesPerSymbol)
                    processWindow(symbolSamples, sampleRate)
                }
            }

            source.connect(processor)
            processor.connect(ctx.destination)

            setState({
                status: 'listening',
                progress: 0,
                symbolsReceived: 0,
                totalSymbolsExpected: 0,
                signalStrength: 0,
                metadata: null,
            })
        } catch (error: any) {
            cleanup()
            setState(prev => ({
                ...prev,
                status: 'error',
                errorMessage: `Audio setup failed: ${error?.message || 'Unknown'}`,
            }))
        }
    }, [cleanup, processWindow])

    const stopListening = useCallback(() => {
        cleanup()
        setState({ status: 'idle', progress: 0, symbolsReceived: 0, totalSymbolsExpected: 0, signalStrength: 0, metadata: null })
        setDecodedFile(null)
    }, [cleanup])

    const reset = useCallback(() => {
        cleanup()
        setState({ status: 'idle', progress: 0, symbolsReceived: 0, totalSymbolsExpected: 0, signalStrength: 0, metadata: null })
        setDecodedFile(null)
    }, [cleanup])

    return {
        state, decodedFile, analyserNode, micPermission,
        startListening, stopListening, reset, checkMicrophonePermission,
    }
}