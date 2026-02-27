// components/waveform-visualizer.tsx
"use client"

import React, { useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface WaveformVisualizerProps {
    analyserNode: AnalyserNode | null
    isActive: boolean
    className?: string
    mode?: 'waveform' | 'frequency'
}

export function WaveformVisualizer({
    analyserNode,
    isActive,
    className,
    mode = 'waveform',
}: WaveformVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const animationRef = useRef<number>(0)

    const draw = useCallback(() => {
        const canvas = canvasRef.current
        const analyser = analyserNode
        if (!canvas || !analyser || !isActive) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Set canvas resolution
        const dpr = window.devicePixelRatio || 1
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
        ctx.scale(dpr, dpr)

        const width = rect.width
        const height = rect.height

        if (mode === 'waveform') {
            const bufferLength = analyser.frequencyBinCount
            const dataArray = new Uint8Array(bufferLength)
            analyser.getByteTimeDomainData(dataArray)

            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0)'
            ctx.clearRect(0, 0, width, height)

            // Gradient for the waveform
            const gradient = ctx.createLinearGradient(0, 0, width, 0)
            gradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)')
            gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.9)')
            gradient.addColorStop(1, 'rgba(168, 85, 247, 0.8)')

            // Draw center line
            ctx.beginPath()
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
            ctx.lineWidth = 1
            ctx.moveTo(0, height / 2)
            ctx.lineTo(width, height / 2)
            ctx.stroke()

            // Draw waveform
            ctx.beginPath()
            ctx.lineWidth = 2.5
            ctx.strokeStyle = gradient
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            const sliceWidth = width / bufferLength
            let x = 0

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0
                const y = (v * height) / 2

                if (i === 0) {
                    ctx.moveTo(x, y)
                } else {
                    ctx.lineTo(x, y)
                }
                x += sliceWidth
            }

            ctx.stroke()

            // Draw glow effect
            ctx.beginPath()
            ctx.lineWidth = 6
            ctx.strokeStyle = gradient
            ctx.globalAlpha = 0.15
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            x = 0
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0
                const y = (v * height) / 2
                if (i === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
                x += sliceWidth
            }
            ctx.stroke()
            ctx.globalAlpha = 1
        } else {
            // Frequency bars mode
            const bufferLength = analyser.frequencyBinCount
            const dataArray = new Uint8Array(bufferLength)
            analyser.getByteFrequencyData(dataArray)

            ctx.clearRect(0, 0, width, height)

            const barCount = 64
            const barWidth = width / barCount - 2
            const step = Math.floor(bufferLength / barCount)

            for (let i = 0; i < barCount; i++) {
                const value = dataArray[i * step]
                const barHeight = (value / 255) * height * 0.9

                const hue = 220 + (i / barCount) * 80  // blue to purple
                const saturation = 70 + (value / 255) * 30
                const lightness = 40 + (value / 255) * 30

                ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`
                ctx.beginPath()
                ctx.roundRect(
                    i * (barWidth + 2),
                    height - barHeight,
                    barWidth,
                    barHeight,
                    [3, 3, 0, 0]
                )
                ctx.fill()

                // Glow
                ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`
                ctx.beginPath()
                ctx.roundRect(
                    i * (barWidth + 2) - 1,
                    height - barHeight - 2,
                    barWidth + 2,
                    barHeight + 4,
                    [4, 4, 0, 0]
                )
                ctx.fill()
            }
        }

        animationRef.current = requestAnimationFrame(draw)
    }, [analyserNode, isActive, mode])

    useEffect(() => {
        if (isActive && analyserNode) {
            animationRef.current = requestAnimationFrame(draw)
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
            }
        }
    }, [isActive, analyserNode, draw])

    return (
        <div className={cn("relative overflow-hidden rounded-xl", className)}>
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
            <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ display: 'block' }}
            />
            {!isActive && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className="w-1 bg-muted-foreground/20 rounded-full"
                                style={{
                                    height: `${20 + Math.random() * 30}px`,
                                    animationDelay: `${i * 0.1}s`,
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}