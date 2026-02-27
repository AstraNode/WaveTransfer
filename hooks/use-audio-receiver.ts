// hooks/use-audio-receiver.ts
"use client"

import { useCallback, useRef, useState, useEffect } from 'react'
import { ReceiverState, DecodedFile } from '@/lib/types'
import {
    AUDIO_CONFIG,
    detectFSKBit,
    detectPreamble,
    detectSyncWord,
    detectEndMarker,
    decodeReceivedBits,
} from '@/lib/audio-protocol'

export type MicPermissionState = 'unknown' | 'granted' | 'denied' | 'prompt'

export function useAudioReceiver() {
    const [state, setState] = useState<ReceiverState>({
        status: 'idle',
        progress: 0,
        bitsReceived: 0,
        totalBitsExpected: 0,
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

    const receiverPhaseRef = useRef<'idle' | 'detecting_preamble' | 'detecting_sync' | 'receiving_data' | 'done'>('idle')
    const recentBitsRef = useRef<number[]>([])
    const dataBitsRef = useRef<number[]>([])
    const silenceCountRef = useRef(0)

    // ────────────────────────────────────────────
    // Safe permission check — never blocks, never throws
    // ────────────────────────────────────────────
    const checkMicrophonePermission = useCallback(async () => {
        // Try Permissions API first (non-blocking check)
        try {
            if (navigator?.permissions?.query) {
                const result = await navigator.permissions.query(
                    { name: 'microphone' as PermissionName }
                )
                setMicPermission(result.state as MicPermissionState)

                result.addEventListener('change', () => {
                    setMicPermission(result.state as MicPermissionState)
                })
                return
            }
        } catch {
            // Permissions API doesn't support microphone query — totally fine
        }

        // If we can't query, just set to 'unknown' — we'll ask when user clicks
        setMicPermission('unknown')
    }, [])

    useEffect(() => {
        checkMicrophonePermission()
    }, [checkMicrophonePermission])

    // ────────────────────────────────────────────
    // Cleanup
    // ────────────────────────────────────────────
    const cleanup = useCallback(() => {
        isListeningRef.current = false
        receiverPhaseRef.current = 'idle'
        recentBitsRef.current = []
        dataBitsRef.current = []

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

    useEffect(() => {
        return () => { cleanup() }
    }, [cleanup])

    // ────────────────────────────────────────────
    // Try parse header
    // ────────────────────────────────────────────
    const tryParseHeader = useCallback(() => {
        try {
            const bits = dataBitsRef.current
            const bytes = new Uint8Array(Math.floor(bits.length / 8))
            for (let i = 0; i < bytes.length; i++) {
                let byte = 0
                for (let j = 0; j < 8; j++) {
                    byte = (byte << 1) | bits[i * 8 + j]
                }
                bytes[i] = byte
            }

            const decoded = new TextDecoder().decode(bytes)
            const headerEndIdx = decoded.indexOf(String.fromCharCode(0x1E))
            if (headerEndIdx === -1) return

            const headerStr = decoded.substring(0, headerEndIdx)
            const fields = headerStr.split(String.fromCharCode(0x1F))
            if (fields.length < 3) return

            const metadata = {
                name: fields[0],
                type: fields[1],
                size: parseInt(fields[2], 10),
            }

            if (!isNaN(metadata.size) && metadata.size > 0) {
                const headerBits = (headerEndIdx + 1) * 8
                const totalExpected = headerBits + metadata.size * 8 + 8

                setState(prev => ({
                    ...prev,
                    status: 'receiving_payload',
                    metadata,
                    totalBitsExpected: totalExpected,
                }))
            }
        } catch {
            // Not complete yet
        }
    }, [])

    // ────────────────────────────────────────────
    // Finish receiving
    // ────────────────────────────────────────────
    const finishReceiving = useCallback(() => {
        receiverPhaseRef.current = 'done'
        isListeningRef.current = false

        setState(prev => ({ ...prev, status: 'verifying' }))

        const result = decodeReceivedBits(dataBitsRef.current)

        if (result) {
            if (result.checksumValid) {
                const blob = new Blob([result.data], {
                    type: result.metadata.type || 'application/octet-stream',
                })
                const url = URL.createObjectURL(blob)

                setDecodedFile({ metadata: result.metadata, data: result.data, blob, url })
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
                    errorMessage: 'Checksum verification failed. Data may be corrupted.',
                }))
            }
        } else {
            setState(prev => ({
                ...prev,
                status: 'error',
                errorMessage: 'Failed to decode received data.',
            }))
        }

        if (processorRef.current) try { processorRef.current.disconnect() } catch { }
        if (sourceNodeRef.current) try { sourceNodeRef.current.disconnect() } catch { }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop())
        }
    }, [])

    // ────────────────────────────────────────────
    // Process one bit window
    // ────────────────────────────────────────────
    const processOneBitWindow = useCallback(
        (samples: Float32Array, sampleRate: number) => {
            const { bit, confidence, signalStrength } = detectFSKBit(samples, sampleRate)

            setState(prev => ({
                ...prev,
                signalStrength: Math.min(signalStrength * 10, 1),
            }))

            if (bit === -1 || confidence < 0.15) {
                silenceCountRef.current++
                if (silenceCountRef.current > 20 && receiverPhaseRef.current === 'receiving_data') {
                    finishReceiving()
                }
                return
            }

            silenceCountRef.current = 0

            switch (receiverPhaseRef.current) {
                case 'detecting_preamble':
                    recentBitsRef.current.push(bit)
                    if (recentBitsRef.current.length > 100) {
                        recentBitsRef.current = recentBitsRef.current.slice(-100)
                    }
                    if (detectPreamble(recentBitsRef.current, 12)) {
                        setState(prev => ({ ...prev, status: 'syncing' }))
                        receiverPhaseRef.current = 'detecting_sync'
                    }
                    break

                case 'detecting_sync':
                    recentBitsRef.current.push(bit)
                    if (recentBitsRef.current.length > 100) {
                        recentBitsRef.current = recentBitsRef.current.slice(-100)
                    }
                    if (detectSyncWord(recentBitsRef.current)) {
                        receiverPhaseRef.current = 'receiving_data'
                        dataBitsRef.current = []
                        recentBitsRef.current = []
                        setState(prev => ({ ...prev, status: 'receiving_header' }))
                    }
                    break

                case 'receiving_data':
                    dataBitsRef.current.push(bit)
                    recentBitsRef.current.push(bit)
                    if (recentBitsRef.current.length > 50) {
                        recentBitsRef.current = recentBitsRef.current.slice(-50)
                    }

                    if (dataBitsRef.current.length > 24 && detectEndMarker(recentBitsRef.current)) {
                        dataBitsRef.current = dataBitsRef.current.slice(0, -16)
                        finishReceiving()
                        return
                    }

                    if (dataBitsRef.current.length > 0 && dataBitsRef.current.length % 8 === 0) {
                        tryParseHeader()
                    }

                    setState(prev => ({
                        ...prev,
                        bitsReceived: dataBitsRef.current.length,
                        progress: prev.totalBitsExpected > 0
                            ? Math.min((dataBitsRef.current.length / prev.totalBitsExpected) * 100, 99)
                            : 0,
                    }))
                    break
            }
        },
        [finishReceiving, tryParseHeader]
    )

    // ────────────────────────────────────────────
    // Start listening — requests mic directly on click
    // ────────────────────────────────────────────
    const startListening = useCallback(async () => {
        cleanup()
        setDecodedFile(null)

        // Reset state to show we're trying
        setState({
            status: 'idle',
            progress: 0,
            bitsReceived: 0,
            totalBitsExpected: 0,
            signalStrength: 0,
            metadata: null,
        })

        // Step 1: Request microphone — this IS the permission prompt
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
            console.error('Mic error:', error)

            let errorMessage: string
            const errorName = error?.name || ''

            switch (errorName) {
                case 'NotAllowedError':
                case 'PermissionDeniedError':
                    setMicPermission('denied')
                    errorMessage = 'Microphone access was denied. Please allow it in your browser settings (click the lock icon in the address bar) and try again.'
                    break
                case 'NotFoundError':
                case 'DevicesNotFoundError':
                    errorMessage = 'No microphone found. Please connect a microphone and try again.'
                    break
                case 'NotReadableError':
                case 'TrackStartError':
                    errorMessage = 'Microphone is in use by another app. Close other apps using the mic and try again.'
                    break
                case 'OverconstrainedError':
                    errorMessage = 'Microphone does not support the required settings. Retrying with defaults...'
                    break
                default:
                    errorMessage = `Microphone error: ${error?.message || 'Unknown error. Make sure you are on HTTPS or localhost.'}`
            }

            setState(prev => ({ ...prev, status: 'error', errorMessage }))
            return
        }

        // If we got here, permission was granted!
        setMicPermission('granted')
        mediaStreamRef.current = stream

        try {
            // Step 2: Set up audio processing
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
            const audioContext = new AudioCtx({ sampleRate: AUDIO_CONFIG.sampleRate })
            audioContextRef.current = audioContext

            if (audioContext.state === 'suspended') {
                await audioContext.resume()
            }

            const sourceNode = audioContext.createMediaStreamSource(stream)
            sourceNodeRef.current = sourceNode

            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            analyser.smoothingTimeConstant = 0.3
            analyserRef.current = analyser
            setAnalyserNode(analyser)
            sourceNode.connect(analyser)

            const sampleRate = audioContext.sampleRate
            const samplesPerBit = Math.round(sampleRate * AUDIO_CONFIG.bitDuration)
            const bufferSize = 1024
            const processor = audioContext.createScriptProcessor(bufferSize, 1, 1)
            processorRef.current = processor

            isListeningRef.current = true
            receiverPhaseRef.current = 'detecting_preamble'
            recentBitsRef.current = []
            dataBitsRef.current = []
            silenceCountRef.current = 0

            let accumulator = new Float32Array(0)

            processor.onaudioprocess = (event: AudioProcessingEvent) => {
                if (!isListeningRef.current) return

                const inputData = event.inputBuffer.getChannelData(0)
                const outputData = event.outputBuffer.getChannelData(0)
                outputData.set(inputData)

                const newAcc = new Float32Array(accumulator.length + inputData.length)
                newAcc.set(accumulator)
                newAcc.set(inputData, accumulator.length)
                accumulator = newAcc

                while (accumulator.length >= samplesPerBit) {
                    const bitSamples = accumulator.slice(0, samplesPerBit)
                    accumulator = accumulator.slice(samplesPerBit)
                    processOneBitWindow(bitSamples, sampleRate)
                }
            }

            sourceNode.connect(processor)
            processor.connect(audioContext.destination)

            setState({
                status: 'listening',
                progress: 0,
                bitsReceived: 0,
                totalBitsExpected: 0,
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
    }, [cleanup, processOneBitWindow])

    const stopListening = useCallback(() => {
        cleanup()
        setState({
            status: 'idle',
            progress: 0,
            bitsReceived: 0,
            totalBitsExpected: 0,
            signalStrength: 0,
            metadata: null,
        })
        setDecodedFile(null)
    }, [cleanup])

    const reset = useCallback(() => {
        cleanup()
        setState({
            status: 'idle',
            progress: 0,
            bitsReceived: 0,
            totalBitsExpected: 0,
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