// hooks/use-audio-transmitter.ts
"use client"

import { useCallback, useRef, useState } from 'react'
import { TransmissionState, FileMetadata } from '@/lib/types'
import {
    AUDIO_CONFIG,
    encodeFileToFrame,
    frameToBitstream,
    getTotalBits,
    getEstimatedDuration,
} from '@/lib/audio-protocol'

export function useAudioTransmitter() {
    const [state, setState] = useState<TransmissionState>({
        status: 'idle',
        progress: 0,
        currentBit: 0,
        totalBits: 0,
        estimatedTime: 0,
        elapsedTime: 0,
    })

    const audioContextRef = useRef<AudioContext | null>(null)
    const oscillatorRef = useRef<OscillatorNode | null>(null)
    const gainNodeRef = useRef<GainNode | null>(null)
    const isTransmittingRef = useRef(false)
    const startTimeRef = useRef(0)
    const animationFrameRef = useRef<number>(0)

    const cleanup = useCallback(() => {
        isTransmittingRef.current = false

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }

        if (oscillatorRef.current) {
            try {
                oscillatorRef.current.stop()
                oscillatorRef.current.disconnect()
            } catch (e) {
                // Already stopped
            }
            oscillatorRef.current = null
        }

        if (gainNodeRef.current) {
            gainNodeRef.current.disconnect()
            gainNodeRef.current = null
        }

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close()
            audioContextRef.current = null
        }
    }, [])

    const transmit = useCallback(async (
        fileData: Uint8Array,
        metadata: FileMetadata
    ): Promise<void> => {
        // Clean up any previous transmission
        cleanup()

        return new Promise<void>((resolve, reject) => {
            try {
                // Initialize AudioContext after user interaction
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
                audioContextRef.current = audioContext

                setState({
                    status: 'preparing',
                    progress: 0,
                    currentBit: 0,
                    totalBits: 0,
                    estimatedTime: 0,
                    elapsedTime: 0,
                })

                // Encode file to protocol frame
                const frame = encodeFileToFrame(fileData, metadata)
                const bitstream = frameToBitstream(frame)
                const totalBits = bitstream.length
                const estimatedTime = getEstimatedDuration(totalBits)
                const bitDuration = AUDIO_CONFIG.bitDuration

                setState(prev => ({
                    ...prev,
                    totalBits,
                    estimatedTime,
                    status: 'transmitting',
                }))

                // Create oscillator and gain node
                const oscillator = audioContext.createOscillator()
                const gainNode = audioContext.createGain()

                oscillator.type = 'sine'
                oscillator.connect(gainNode)
                gainNode.connect(audioContext.destination)

                // Set initial gain
                gainNode.gain.setValueAtTime(0.5, audioContext.currentTime)

                oscillatorRef.current = oscillator
                gainNodeRef.current = gainNode
                isTransmittingRef.current = true

                // Schedule all frequency changes
                const startTime = audioContext.currentTime + 0.05 // Small buffer
                startTimeRef.current = performance.now()

                // Smooth ramp duration for each bit transition
                const rampTime = AUDIO_CONFIG.rampDuration

                for (let i = 0; i < bitstream.length; i++) {
                    const bitTime = startTime + i * bitDuration
                    const freq = bitstream[i] === 1 ? AUDIO_CONFIG.markFreq : AUDIO_CONFIG.spaceFreq

                    // Smooth frequency transition
                    oscillator.frequency.setValueAtTime(freq, bitTime)

                    // Slight volume dip at transitions for cleaner signal
                    if (i > 0) {
                        gainNode.gain.setValueAtTime(0.3, bitTime)
                        gainNode.gain.linearRampToValueAtTime(0.5, bitTime + rampTime)
                    }
                }

                // Schedule end: silence after all bits
                const endTime = startTime + totalBits * bitDuration
                gainNode.gain.setValueAtTime(0.5, endTime)
                gainNode.gain.linearRampToValueAtTime(0, endTime + 0.05)

                // Start oscillator
                oscillator.start(startTime)
                oscillator.stop(endTime + 0.1)

                // Progress update loop
                const updateProgress = () => {
                    if (!isTransmittingRef.current) return

                    const elapsed = (performance.now() - startTimeRef.current) / 1000
                    const currentBit = Math.min(
                        Math.floor(elapsed / bitDuration),
                        totalBits
                    )
                    const progress = Math.min((currentBit / totalBits) * 100, 100)

                    setState(prev => ({
                        ...prev,
                        currentBit,
                        progress,
                        elapsedTime: elapsed,
                    }))

                    if (currentBit < totalBits) {
                        animationFrameRef.current = requestAnimationFrame(updateProgress)
                    }
                }

                animationFrameRef.current = requestAnimationFrame(updateProgress)

                // Handle completion
                oscillator.onended = () => {
                    isTransmittingRef.current = false
                    setState(prev => ({
                        ...prev,
                        status: 'complete',
                        progress: 100,
                        currentBit: totalBits,
                    }))
                    cleanup()
                    resolve()
                }
            } catch (error) {
                cleanup()
                setState(prev => ({
                    ...prev,
                    status: 'error',
                }))
                reject(error)
            }
        })
    }, [cleanup])

    const cancel = useCallback(() => {
        cleanup()
        setState({
            status: 'idle',
            progress: 0,
            currentBit: 0,
            totalBits: 0,
            estimatedTime: 0,
            elapsedTime: 0,
        })
    }, [cleanup])

    const reset = useCallback(() => {
        setState({
            status: 'idle',
            progress: 0,
            currentBit: 0,
            totalBits: 0,
            estimatedTime: 0,
            elapsedTime: 0,
        })
    }, [])

    return {
        state,
        transmit,
        cancel,
        reset,
    }
}