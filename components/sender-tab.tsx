// components/sender-tab.tsx
"use client"

import React, { useState, useCallback } from 'react'
import { Radio, Zap, Clock, Hash, Volume2, StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { FileDropzone } from '@/components/file-dropzone'
import { useAudioTransmitter } from '@/hooks/use-audio-transmitter'
import { useToast } from '@/hooks/use-toast'
import { formatFileSize, formatDuration } from '@/lib/utils'
import { AUDIO_CONFIG, getEstimatedDuration } from '@/lib/audio-protocol'

export function SenderTab() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [fileData, setFileData] = useState<Uint8Array | null>(null)
    const { state, transmit, cancel, reset } = useAudioTransmitter()
    const { toast } = useToast()

    const handleFileSelect = useCallback(async (file: File) => {
        setSelectedFile(file)
        const buffer = await file.arrayBuffer()
        setFileData(new Uint8Array(buffer))
    }, [])

    const handleClear = useCallback(() => {
        setSelectedFile(null)
        setFileData(null)
        reset()
    }, [reset])

    const handleTransmit = useCallback(async () => {
        if (!selectedFile || !fileData) return

        toast({
            title: "🔊 Transmission Starting",
            description: "Turn up your speaker volume and keep devices close together.",
        })

        try {
            await transmit(fileData, {
                name: selectedFile.name,
                type: selectedFile.type,
                size: selectedFile.size,
            })

            toast({
                title: "✅ Transmission Complete",
                description: `Successfully transmitted ${selectedFile.name}`,
                variant: "success" as any,
            })
        } catch (error) {
            toast({
                title: "❌ Transmission Error",
                description: "Failed to complete audio transmission.",
                variant: "destructive",
            })
        }
    }, [selectedFile, fileData, transmit, toast])

    const estimatedBits = selectedFile
        ? (selectedFile.name.length + (selectedFile.type || 'application/octet-stream').length + String(selectedFile.size).length + 2 + 1) * 8 + selectedFile.size * 8 + 8 + AUDIO_CONFIG.preambleLength + 8 + 16
        : 0
    const estimatedDuration = getEstimatedDuration(estimatedBits)

    const isTransmitting = state.status === 'transmitting'
    const isPreparing = state.status === 'preparing'
    const isComplete = state.status === 'complete'

    return (
        <div className="space-y-6">
            {/* File Selection */}
            <FileDropzone
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                onClear={handleClear}
                disabled={isTransmitting || isPreparing}
            />

            {/* Transmission Info */}
            {selectedFile && !isTransmitting && !isComplete && (
                <div className="glass rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Transmission Details
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                            <Hash className="w-4 h-4 text-blue-400" />
                            <div>
                                <p className="text-xs text-muted-foreground">Total Bits</p>
                                <p className="text-sm font-medium">{estimatedBits.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-violet-400" />
                            <div>
                                <p className="text-xs text-muted-foreground">Est. Duration</p>
                                <p className="text-sm font-medium">{formatDuration(estimatedDuration)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <div>
                                <p className="text-xs text-muted-foreground">Baud Rate</p>
                                <p className="text-sm font-medium">{AUDIO_CONFIG.baudRate} bps</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Volume2 className="w-4 h-4 text-green-400" />
                            <div>
                                <p className="text-xs text-muted-foreground">FSK Freqs</p>
                                <p className="text-sm font-medium">{AUDIO_CONFIG.spaceFreq}/{AUDIO_CONFIG.markFreq} Hz</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress */}
            {(isTransmitting || isPreparing) && (
                <div className="space-y-4">
                    <div className="glass rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Radio className="w-5 h-5 text-primary animate-pulse" />
                                    <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping" />
                                </div>
                                <span className="text-sm font-medium">Transmitting...</span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                                {state.progress.toFixed(1)}%
                            </span>
                        </div>
                        <Progress value={state.progress} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Bit {state.currentBit.toLocaleString()} / {state.totalBits.toLocaleString()}</span>
                            <span>{formatDuration(state.elapsedTime)} elapsed</span>
                        </div>
                    </div>

                    {/* Live audio indicator */}
                    <div className="flex justify-center">
                        <div className="flex items-center gap-1">
                            {[...Array(7)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-1 bg-gradient-to-t from-blue-500 to-violet-500 rounded-full animate-pulse"
                                    style={{
                                        height: `${12 + Math.sin((state.currentBit + i) * 0.5) * 16}px`,
                                        animationDelay: `${i * 0.1}s`,
                                        animationDuration: `${0.3 + Math.random() * 0.5}s`,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Complete State */}
            {isComplete && (
                <div className="glass rounded-xl p-6 text-center gradient-border">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 mb-4">
                        <Zap className="w-8 h-8 text-green-400" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">Transmission Complete!</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        All {state.totalBits.toLocaleString()} bits transmitted successfully.
                    </p>
                    <Button variant="outline" onClick={handleClear} size="sm">
                        Send Another File
                    </Button>
                </div>
            )}

            {/* Transmit / Cancel Button */}
            {selectedFile && !isComplete && (
                <div className="flex gap-3">
                    {isTransmitting ? (
                        <Button
                            onClick={cancel}
                            variant="destructive"
                            size="lg"
                            className="flex-1"
                        >
                            <StopCircle className="w-5 h-5 mr-2" />
                            Cancel Transmission
                        </Button>
                    ) : (
                        <Button
                            onClick={handleTransmit}
                            variant="glow"
                            size="lg"
                            className="flex-1"
                            disabled={isPreparing || !fileData}
                        >
                            <Radio className="w-5 h-5 mr-2" />
                            Transmit via Audio
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}