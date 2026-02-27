// hooks/use-audio-transmitter.ts
"use client"

import { useCallback, useRef, useState } from 'react'
import { TransmissionState, FileMetadata } from '@/lib/types'
import {
    AUDIO_CONFIG,
    SYMBOL_FREQS,
    HANDSHAKE_FREQ,
    HANDSHAKE_END_FREQ,
    END_TRANSMISSION_FREQ,
    END_DURATION,
    encodeFileToSymbols,
    getEstimatedDuration,
} from '@/lib/audio-protocol'

export function useAudioTransmitter() {
    const [state, setState] = useState<TransmissionState>({
        status: 'idle',
        progress: 0,
        currentSymbol: 0,
        totalSymbols: 0,
        estimatedTime: 0,
        elapsedTime: 0,
        effectiveBPS: 0,
    })

    const audioContextRef = useRef<AudioContext | null>(null)
    const oscillatorRef = useRef<OscillatorNode | null>(null)
    const gainNodeRef = useRef<GainNode | null>(null)
    const isTransmittingRef = useRef(false)
    const animFrameRef = useRef<number>(0)
    const startTimeRef = useRef(0)

    const cleanup = useCallback(() => {
        isTransmittingRef.current = false

        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current)
            animFrameRef.current = 0
        }

        if (oscillatorRef.current) {
            try {
                oscillatorRef.current.stop()
                oscillatorRef.current.disconnect()
            } catch { }
            oscillatorRef.current = null
        }

        if (gainNodeRef.current) {
            try { gainNodeRef.current.disconnect() } catch { }
            gainNodeRef.current = null
        }

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try { audioContextRef.current.close() } catch { }
            audioContextRef.current = null
        }
    }, [])

    const transmit = useCallback(async (
        fileData: Uint8Array,
        metadata: FileMetadata
    ): Promise<void> => {
        cleanup()

        return new Promise<void>((resolve, reject) => {
            try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
                const ctx = new AudioCtx({ sampleRate: AUDIO_CONFIG.sampleRate })
                audioContextRef.current = ctx

                // Encode file to 16-FSK symbol stream
                const symbols = encodeFileToSymbols(fileData, metadata)
                const totalSymbols = symbols.length
                const estimatedTime = getEstimatedDuration(metadata)

                setState({
                    status: 'handshake',
                    progress: 0,
                    currentSymbol: 0,
                    totalSymbols,
                    estimatedTime,
                    elapsedTime: 0,
                    effectiveBPS: AUDIO_CONFIG.effectiveBPS,
                })

                isTransmittingRef.current = true

                // Create oscillator + gain
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.type = 'sine'
                osc.connect(gain)
                gain.connect(ctx.destination)
                oscillatorRef.current = osc
                gainNodeRef.current = gain

                // ── Schedule the entire transmission ──
                let t = ctx.currentTime + 0.05
                const absoluteStart = t

                // Phase 1: HANDSHAKE — 1 second continuous tone at handshakeFreq
                osc.frequency.setValueAtTime(HANDSHAKE_FREQ, t)
                gain.gain.setValueAtTime(0, t)
                gain.gain.linearRampToValueAtTime(0.7, t + 0.03) // fade in
                t += AUDIO_CONFIG.handshakeDuration

                // Phase 2: HANDSHAKE END — short burst at different freq
                osc.frequency.setValueAtTime(HANDSHAKE_END_FREQ, t)
                gain.gain.setValueAtTime(0.7, t)
                t += AUDIO_CONFIG.handshakeEndDuration

                // Brief gap so receiver can prepare for data
                gain.gain.setValueAtTime(0, t)
                t += 0.06
                gain.gain.setValueAtTime(0.65, t)

                const dataStartTime = t
                const handshakeTotalDuration = dataStartTime - absoluteStart

                // Phase 3: DATA — each symbol maps to one of 16 frequencies
                const symDur = AUDIO_CONFIG.symbolDuration
                for (let i = 0; i < symbols.length; i++) {
                    const freq = SYMBOL_FREQS[symbols[i]]
                    osc.frequency.setValueAtTime(freq, t)
                    // Micro-ramp to reduce spectral splatter
                    gain.gain.setValueAtTime(0.6, t)
                    gain.gain.linearRampToValueAtTime(0.65, t + 0.0008)
                    t += symDur
                }

                // Phase 4: END MARKER — distinct high frequency burst
                gain.gain.setValueAtTime(0.65, t)
                osc.frequency.setValueAtTime(END_TRANSMISSION_FREQ, t)
                t += END_DURATION

                // Fade out
                gain.gain.setValueAtTime(0.65, t)
                gain.gain.linearRampToValueAtTime(0, t + 0.05)
                t += 0.1

                const totalDuration = t - absoluteStart

                // Start and stop
                osc.start(absoluteStart)
                osc.stop(t)

                // ── Realtime progress tracking ──
                startTimeRef.current = performance.now()

                const updateProgress = () => {
                    if (!isTransmittingRef.current) return

                    const elapsedMs = performance.now() - startTimeRef.current
                    const elapsed = elapsedMs / 1000

                    // Determine phase
                    const inHandshake = elapsed < handshakeTotalDuration
                    const dataElapsed = Math.max(0, elapsed - handshakeTotalDuration)
                    const currentSymbol = Math.min(
                        Math.floor(dataElapsed / symDur),
                        totalSymbols
                    )
                    const progress = totalSymbols > 0
                        ? Math.min((currentSymbol / totalSymbols) * 100, 100)
                        : 0

                    setState(prev => ({
                        ...prev,
                        status: inHandshake ? 'handshake' : 'transmitting',
                        currentSymbol,
                        progress: inHandshake ? 0 : progress,
                        elapsedTime: elapsed,
                    }))

                    if (elapsed < totalDuration + 0.5) {
                        animFrameRef.current = requestAnimationFrame(updateProgress)
                    }
                }

                animFrameRef.current = requestAnimationFrame(updateProgress)

                // Completion handler
                osc.onended = () => {
                    isTransmittingRef.current = false
                    if (animFrameRef.current) {
                        cancelAnimationFrame(animFrameRef.current)
                    }
                    setState(prev => ({
                        ...prev,
                        status: 'complete',
                        progress: 100,
                        currentSymbol: totalSymbols,
                        elapsedTime: totalDuration,
                    }))
                    // Clean up audio nodes but don't reset state
                    if (oscillatorRef.current) {
                        try { oscillatorRef.current.disconnect() } catch { }
                        oscillatorRef.current = null
                    }
                    if (gainNodeRef.current) {
                        try { gainNodeRef.current.disconnect() } catch { }
                        gainNodeRef.current = null
                    }
                    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                        try { audioContextRef.current.close() } catch { }
                        audioContextRef.current = null
                    }
                    resolve()
                }
            } catch (error) {
                cleanup()
                setState(prev => ({ ...prev, status: 'error' }))
                reject(error)
            }
        })
    }, [cleanup])

    const cancel = useCallback(() => {
        cleanup()
        setState({
            status: 'idle',
            progress: 0,
            currentSymbol: 0,
            totalSymbols: 0,
            estimatedTime: 0,
            elapsedTime: 0,
            effectiveBPS: 0,
        })
    }, [cleanup])

    const reset = useCallback(() => {
        setState({
            status: 'idle',
            progress: 0,
            currentSymbol: 0,
            totalSymbols: 0,
            estimatedTime: 0,
            elapsedTime: 0,
            effectiveBPS: 0,
        })
    }, [])

    return { state, transmit, cancel, reset }
}