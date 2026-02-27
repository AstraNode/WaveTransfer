// components/sender-tab.tsx
"use client"

import React, { useState, useCallback } from 'react'
import { Radio, Zap, Clock, Hash, Volume2, StopCircle, Waves } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { FileDropzone } from '@/components/file-dropzone'
import { useAudioTransmitter } from '@/hooks/use-audio-transmitter'
import { useToast } from '@/hooks/use-toast'
import { formatFileSize, formatDuration } from '@/lib/utils'
import { AUDIO_CONFIG, getEstimatedDuration, getTotalSymbols } from '@/lib/audio-protocol'

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
            title: "🔊 Starting Transmission",
            description: "Turn up volume. 1-sec handshake then fast data transfer.",
        })

        try {
            await transmit(fileData, {
                name: selectedFile.name,
                type: selectedFile.type,
                size: selectedFile.size,
            })
            toast({ title: "✅ Transmission Complete", description: `Sent ${selectedFile.name} successfully.` })
        } catch {
            toast({ title: "❌ Transmission Error", description: "Failed to transmit.", variant: "destructive" })
        }
    }, [selectedFile, fileData, transmit, toast])

    const meta = selectedFile ? { name: selectedFile.name, type: selectedFile.type, size: selectedFile.size } : null
    const estimatedSymbols = meta ? getTotalSymbols(meta) : 0
    const estimatedDuration = meta ? getEstimatedDuration(meta) : 0

    const isWorking = state.status === 'handshake' || state.status === 'transmitting'
    const isComplete = state.status === 'complete'

    return (
        <div className="space-y-6">
            <FileDropzone
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                onClear={handleClear}
                disabled={isWorking}
            />

            {selectedFile && !isWorking && !isComplete && (
                <div className="glass rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Transfer Estimate
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-violet-400" />
                            <div>
                                <p className="text-xs text-muted-foreground">Duration</p>
                                <p className="text-sm font-medium">{formatDuration(estimatedDuration)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <div>
                                <p className="text-xs text-muted-foreground">Speed</p>
                                <p className="text-sm font-medium">{AUDIO_CONFIG.effectiveBPS} bps (16-FSK)</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Hash className="w-4 h-4 text-blue-400" />
                            <div>
                                <p className="text-xs text-muted-foreground">Symbols</p>
                                <p className="text-sm font-medium">{estimatedSymbols.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Volume2 className="w-4 h-4 text-green-400" />
                            <div>
                                <p className="text-xs text-muted-foreground">Freq Range</p>
                                <p className="text-sm font-medium">800–3800 Hz</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isWorking && (
                <div className="space-y-4">
                    <div className="glass rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {state.status === 'handshake' ? (
                                    <>
                                        <Waves className="w-5 h-5 text-amber-400 animate-pulse" />
                                        <span className="text-sm font-medium text-amber-400">
                                            Handshake — syncing with receiver...
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <div className="relative">
                                            <Radio className="w-5 h-5 text-primary animate-pulse" />
                                            <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping" />
                                        </div>
                                        <span className="text-sm font-medium">Transmitting data...</span>
                                    </>
                                )}
                            </div>
                            <span className="text-sm text-muted-foreground tabular-nums">
                                {state.progress.toFixed(1)}%
                            </span>
                        </div>
                        <Progress value={state.status === 'handshake' ? undefined : state.progress} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                                {state.currentSymbol.toLocaleString()} / {state.totalSymbols.toLocaleString()} symbols
                            </span>
                            <span>{formatDuration(state.elapsedTime)} elapsed</span>
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <div className="flex items-center gap-1">
                            {[...Array(9)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-1 bg-gradient-to-t from-blue-500 to-violet-500 rounded-full animate-pulse"
                                    style={{
                                        height: `${8 + Math.sin((state.currentSymbol * 0.3) + i * 0.7) * 20}px`,
                                        animationDelay: `${i * 0.08}s`,
                                        animationDuration: `${0.2 + Math.random() * 0.3}s`,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {isComplete && (
                <div className="glass rounded-xl p-6 text-center gradient-border">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 mb-4">
                        <Zap className="w-8 h-8 text-green-400" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">Sent!</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        {state.totalSymbols.toLocaleString()} symbols in {formatDuration(state.elapsedTime)}
                    </p>
                    <Button variant="outline" onClick={handleClear} size="sm">
                        Send Another File
                    </Button>
                </div>
            )}

            {selectedFile && !isComplete && (
                <div className="flex gap-3">
                    {isWorking ? (
                        <Button onClick={cancel} variant="destructive" size="lg" className="flex-1">
                            <StopCircle className="w-5 h-5 mr-2" />
                            Cancel
                        </Button>
                    ) : (
                        <Button onClick={handleTransmit} variant="glow" size="lg" className="flex-1" disabled={!fileData}>
                            <Radio className="w-5 h-5 mr-2" />
                            Transmit via Audio
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}