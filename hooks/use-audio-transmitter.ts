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
    const isTransmittingRef = useRef(false)
    const animFrameRef = useRef<number>(0)
    const startTimeRef = useRef(0)

    const cleanup = useCallback(() => {
        isTransmittingRef.current = false
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
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

                // Encode file to symbol stream
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

                // ── Build the audio schedule ──
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.type = 'sine'
                osc.connect(gain)
                gain.connect(ctx.destination)

                let t = ctx.currentTime + 0.05

                // 1) HANDSHAKE: 1 second continuous tone
                const handshakeStart = t
                osc.frequency.setValueAtTime(HANDSHAKE_FREQ, t)
                gain.gain.setValueAtTime(0, t)
                gain.gain.linearRampToValueAtTime(0.6, t + 0.05)
                t += AUDIO_CONFIG.handshakeDuration

                // 2) HANDSHAKE END: short different tone to signal "data starts"
                osc.frequency.setValueAtTime(HANDSHAKE_END_FREQ, t)
                gain.gain.setValueAtTime(0.6, t)
                t += AUDIO_CONFIG.handshakeEndDuration

                // Small gap
                gain.gain.setValueAtTime(0, t)
                t += 0.05
                gain.gain.setValueAtTime(0.6, t)

                const dataStartTime = t

                // 3) DATA: each symbol is one frequency for symbolDuration
                const symDur = AUDIO_CONFIG.symbolDuration
                for (let i = 0; i < symbols.length; i++) {
                    const freq = SYMBOL_FREQS[symbols[i]]
                    osc.frequency.setValueAtTime(freq, t)
                    // Tiny ramp to avoid click
                    gain.gain.setValueAtTime(0.55, t)
                    gain.gain.linearRampToValueAtTime(0.6, t + 0.0005)
                    t += symDur
                }

                // 4) END MARKER: distinct frequency for 0.5s
                gain.gain.setValueAtTime(0.6, t)
                osc.frequency.setValueAtTime(END_TRANSMISSION_FREQ, t)
                t += END_DURATION

                // Fade out
                gain.gain.linearRampToValueAtTime(0, t + 0.05)
                t += 0.1

                // Start and schedule stop
                osc.start(handshakeStart)
                osc.stop(t)

                // ── Progress tracking ──
                startTimeRef.current = performance.now()

                const updateProgress = () => {
                    if (!isTransmittingRef.current) return

                    const elapsed = (performance.now() - startTimeRef.current) / 1000
                    const handshakeTotal = AUDIO_CONFIG.handshakeDuration + AUDIO_CONFIG.handshakeEndDuration + 0.05
                    const dataElapsed = Math.max(0, elapsed - handshakeTotal)
                    const currentSymbol = Math.min(
                        Math.floor(dataElapsed / symDur),
                        totalSymbols
                    )
                    const progress = Math.min((currentSymbol / totalSymbols) * 100, 100)

                    setState(prev => ({
                        ...prev,
                        status: elapsed < handshakeTotal ? 'handshake' : 'transmitting',
                        currentSymbol,
                        progress,
                        elapsedTime: elapsed,
                    }))

                    if (elapsed < t - handshakeStart + 0.5) {
                        animFrameRef.current = requestAnimationFrame(updateProgress)
                    }
                }

                animFrameRef.current = requestAnimationFrame(updateProgress)

                osc.onended = () => {
                    isTransmittingRef.current = false
                    setState(prev => ({
                        ...prev,
                        status: 'complete',
                        progress: 100,
                        currentSymbol: totalSymbols,
                    }))
                    cleanup()
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