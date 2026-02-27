// components/receiver-tab.tsx
"use client"

import React, { useEffect } from 'react'
import {
    Mic,
    MicOff,
    Radio,
    Signal,
    AlertCircle,
    Loader2,
    RefreshCw,
    Lock,
    ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { WaveformVisualizer } from '@/components/waveform-visualizer'
import { DownloadCard } from '@/components/download-card'
import { useAudioReceiver } from '@/hooks/use-audio-receiver'
import { useToast } from '@/hooks/use-toast'
import { cn, formatFileSize } from '@/lib/utils'

export function ReceiverTab() {
    const {
        state,
        decodedFile,
        analyserNode,
        micPermission,
        startListening,
        stopListening,
        reset,
        checkMicrophonePermission,
    } = useAudioReceiver()
    const { toast } = useToast()

    useEffect(() => {
        if (state.status === 'complete' && decodedFile) {
            toast({
                title: '✅ File Received!',
                description: `${decodedFile.metadata.name} (${formatFileSize(decodedFile.metadata.size)}) decoded successfully.`,
            })
        }
        if (state.status === 'error') {
            toast({
                title: '❌ Reception Error',
                description: state.errorMessage || 'Failed to decode audio transmission.',
                variant: 'destructive',
            })
        }
    }, [state.status]) // eslint-disable-line react-hooks/exhaustive-deps

    const isActive = [
        'listening',
        'syncing',
        'receiving_header',
        'receiving_payload',
        'verifying',
    ].includes(state.status)

    const getStatusLabel = () => {
        switch (state.status) {
            case 'idle': return 'Ready to receive'
            case 'listening': return 'Listening for signal...'
            case 'syncing': return 'Preamble detected! Syncing...'
            case 'receiving_header': return 'Receiving header data...'
            case 'receiving_payload': return 'Receiving file data...'
            case 'verifying': return 'Verifying checksum...'
            case 'complete': return 'Transfer complete!'
            case 'error': return 'Error occurred'
            default: return ''
        }
    }

    const getStatusColor = () => {
        switch (state.status) {
            case 'listening': return 'text-blue-400'
            case 'syncing': return 'text-amber-400'
            case 'receiving_header':
            case 'receiving_payload': return 'text-violet-400'
            case 'verifying': return 'text-amber-400'
            case 'complete': return 'text-green-400'
            case 'error': return 'text-red-400'
            default: return 'text-muted-foreground'
        }
    }

    const isDenied = micPermission === 'denied' && state.status === 'error'

    return (
        <div className="space-y-6">
            {/* ─── Mic Denied Help Card ─── */}
            {isDenied && (
                <Card className="border-red-500/20 bg-red-950/20">
                    <CardContent className="p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-red-500/10 flex-shrink-0">
                                <Lock className="w-6 h-6 text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-red-400">
                                    Microphone Access Blocked
                                </h3>
                                <p className="text-xs text-muted-foreground mt-1">
                                    You denied microphone access. To fix this:
                                </p>
                            </div>
                        </div>

                        {typeof window !== 'undefined' &&
                            window.location.protocol !== 'https:' &&
                            window.location.hostname !== 'localhost' && (
                                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                        <p className="text-xs text-amber-400">
                                            <strong>HTTPS required.</strong> Microphone only works on
                                            HTTPS or localhost.
                                        </p>
                                    </div>
                                </div>
                            )}

                        <ol className="space-y-2 text-xs text-muted-foreground">
                            <li className="flex items-start gap-2">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold">
                                    1
                                </span>
                                Click the <strong className="text-foreground">lock/tune icon</strong> in the address bar
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold">
                                    2
                                </span>
                                Set <strong className="text-foreground">Microphone</strong> to{' '}
                                <strong className="text-green-400">Allow</strong>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold">
                                    3
                                </span>
                                Reload the page or click &quot;Try Again&quot; below
                            </li>
                        </ol>

                        <div className="flex gap-2">
                            <Button
                                onClick={() => {
                                    checkMicrophonePermission()
                                    startListening()
                                }}
                                variant="outline"
                                size="sm"
                                className="flex-1"
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Try Again
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    window.open(
                                        'https://support.google.com/chrome/answer/2693767',
                                        '_blank'
                                    )
                                }
                            >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Help
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ─── Waveform Visualizer ─── */}
            <div className="glass rounded-xl overflow-hidden gradient-border">
                <div className="p-4 border-b border-white/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div
                                className={cn(
                                    'w-2 h-2 rounded-full',
                                    isActive ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground/30'
                                )}
                            />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Audio Monitor
                            </span>
                        </div>
                        {isActive && (
                            <div className="flex items-center gap-2">
                                <Signal className="w-3.5 h-3.5 text-muted-foreground" />
                                <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-150"
                                        style={{ width: `${state.signalStrength * 100}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <WaveformVisualizer
                    analyserNode={analyserNode}
                    isActive={isActive}
                    className="h-40 bg-black/30"
                />
            </div>

            {/* ─── Status ─── */}
            {state.status !== 'idle' && (
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        {state.status === 'verifying' ? (
                            <Loader2 className={cn('w-5 h-5 animate-spin', getStatusColor())} />
                        ) : state.status === 'error' ? (
                            <AlertCircle className={cn('w-5 h-5', getStatusColor())} />
                        ) : isActive ? (
                            <div className="relative">
                                <Radio className={cn('w-5 h-5', getStatusColor())} />
                                {state.status !== 'listening' && (
                                    <div
                                        className={cn(
                                            'absolute inset-0 rounded-full animate-ping opacity-30',
                                            getStatusColor().replace('text-', 'bg-')
                                        )}
                                    />
                                )}
                            </div>
                        ) : (
                            <Mic className={cn('w-5 h-5', getStatusColor())} />
                        )}
                        <div className="flex-1">
                            <p className={cn('text-sm font-medium', getStatusColor())}>
                                {getStatusLabel()}
                            </p>
                            {state.metadata && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {state.metadata.name} · {formatFileSize(state.metadata.size)}
                                </p>
                            )}
                        </div>
                        {isActive && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                                {state.bitsReceived.toLocaleString()} bits
                            </span>
                        )}
                    </div>

                    {(state.status === 'receiving_payload' || state.status === 'verifying') && (
                        <div className="mt-3 space-y-2">
                            <Progress value={state.progress} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{state.progress.toFixed(1)}% received</span>
                                <span>
                                    {state.bitsReceived.toLocaleString()} / {state.totalBitsExpected.toLocaleString()} bits
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Error (non-permission) ─── */}
            {state.status === 'error' && !isDenied && (
                <div className="glass rounded-xl p-4 border border-red-500/20">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-red-400">Transfer Failed</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {state.errorMessage}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Download ─── */}
            {state.status === 'complete' && decodedFile && (
                <DownloadCard decodedFile={decodedFile} />
            )}

            {/* ─── Action Buttons ─── */}
            <div className="flex gap-3">
                {state.status === 'idle' ? (
                    <Button
                        onClick={startListening}
                        variant="glow"
                        size="lg"
                        className="flex-1"
                    >
                        <Mic className="w-5 h-5 mr-2" />
                        Start Listening
                    </Button>
                ) : isActive ? (
                    <Button
                        onClick={stopListening}
                        variant="destructive"
                        size="lg"
                        className="flex-1"
                    >
                        <MicOff className="w-5 h-5 mr-2" />
                        Stop Listening
                    </Button>
                ) : (
                    <Button
                        onClick={() => {
                            reset()
                            // Small delay so state clears before re-listening
                            setTimeout(() => startListening(), 100)
                        }}
                        variant="outline"
                        size="lg"
                        className="flex-1"
                    >
                        <RefreshCw className="w-5 h-5 mr-2" />
                        Listen Again
                    </Button>
                )}
            </div>

            {/* ─── Tips ─── */}
            {state.status === 'idle' && (
                <div className="glass rounded-xl p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Tips for Best Reception
                    </h4>
                    <ul className="space-y-2 text-xs text-muted-foreground">
                        <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-0.5">•</span>
                            Keep devices within 1–2 feet of each other
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-violet-400 mt-0.5">•</span>
                            Minimize background noise during transfer
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-purple-400 mt-0.5">•</span>
                            Turn up sender volume to maximum
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-pink-400 mt-0.5">•</span>
                            Start listening before beginning transmission
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-emerald-400 mt-0.5">•</span>
                            Your browser will ask for microphone permission when you click Start
                        </li>
                    </ul>
                </div>
            )}
        </div>
    )
}