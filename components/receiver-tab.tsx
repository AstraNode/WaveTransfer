// components/receiver-tab.tsx
"use client"

import React, { useEffect } from 'react'
import {
  Mic, MicOff, Radio, Signal, AlertCircle,
  Loader2, RefreshCw, Lock, ExternalLink, Waves,
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
    state, decodedFile, analyserNode, micPermission,
    startListening, stopListening, reset, checkMicrophonePermission,
  } = useAudioReceiver()
  const { toast } = useToast()

  useEffect(() => {
    if (state.status === 'complete' && decodedFile) {
      toast({ title: '✅ File Received!', description: `${decodedFile.metadata.name} (${formatFileSize(decodedFile.metadata.size)})` })
    }
    if (state.status === 'error') {
      toast({ title: '❌ Error', description: state.errorMessage || 'Transfer failed.', variant: 'destructive' })
    }
  }, [state.status]) // eslint-disable-line

  const isActive = ['listening', 'handshake_detected', 'receiving', 'verifying'].includes(state.status)

  const statusConfig: Record<string, { label: string; color: string }> = {
    idle: { label: 'Ready', color: 'text-muted-foreground' },
    listening: { label: 'Listening for handshake...', color: 'text-blue-400' },
    handshake_detected: { label: '🤝 Handshake detected! Syncing...', color: 'text-amber-400' },
    receiving: { label: 'Receiving data...', color: 'text-violet-400' },
    verifying: { label: 'Verifying checksum...', color: 'text-amber-400' },
    complete: { label: 'Transfer complete!', color: 'text-green-400' },
    error: { label: 'Error', color: 'text-red-400' },
  }

  const { label: statusLabel, color: statusColor } = statusConfig[state.status] || statusConfig.idle
  const isDenied = micPermission === 'denied' && state.status === 'error'

  return (
    <div className="space-y-6">
      {/* Denied help */}
      {isDenied && (
        <Card className="border-red-500/20 bg-red-950/20">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-red-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-400">Microphone Blocked</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click the lock icon in your address bar → set Microphone to Allow → reload.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => { checkMicrophonePermission(); startListening() }} variant="outline" size="sm" className="flex-1">
                <RefreshCw className="w-4 h-4 mr-1" /> Retry
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open('https://support.google.com/chrome/answer/2693767', '_blank')}>
                <ExternalLink className="w-4 h-4 mr-1" /> Help
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Waveform */}
      <div className="glass rounded-xl overflow-hidden gradient-border">
        <div className="p-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full', isActive ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground/30')} />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Audio Monitor</span>
          </div>
          {isActive && (
            <div className="flex items-center gap-2">
              <Signal className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-100" style={{ width: `${state.signalStrength * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        <WaveformVisualizer analyserNode={analyserNode} isActive={isActive} className="h-36 bg-black/30" />
      </div>

      {/* Status */}
      {state.status !== 'idle' && (
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            {state.status === 'verifying' ? (
              <Loader2 className={cn('w-5 h-5 animate-spin', statusColor)} />
            ) : state.status === 'error' ? (
              <AlertCircle className={cn('w-5 h-5', statusColor)} />
            ) : state.status === 'handshake_detected' ? (
              <Waves className={cn('w-5 h-5 animate-pulse', statusColor)} />
            ) : isActive ? (
              <Radio className={cn('w-5 h-5', statusColor)} />
            ) : (
              <Mic className={cn('w-5 h-5', statusColor)} />
            )}
            <div className="flex-1">
              <p className={cn('text-sm font-medium', statusColor)}>{statusLabel}</p>
              {state.metadata && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {state.metadata.name} · {formatFileSize(state.metadata.size)}
                </p>
              )}
            </div>
            {state.status === 'receiving' && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {state.symbolsReceived.toLocaleString()} sym
              </span>
            )}
          </div>

          {state.status === 'receiving' && state.totalSymbolsExpected > 0 && (
            <div className="mt-3 space-y-1">
              <Progress value={state.progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{state.progress.toFixed(1)}%</span>
                <span>{state.symbolsReceived} / {state.totalSymbolsExpected}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {state.status === 'error' && !isDenied && (
        <div className="glass rounded-xl p-4 border border-red-500/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">{state.errorMessage}</p>
          </div>
        </div>
      )}

      {state.status === 'complete' && decodedFile && <DownloadCard decodedFile={decodedFile} />}

      {/* Buttons */}
      <div className="flex gap-3">
        {state.status === 'idle' ? (
          <Button onClick={startListening} variant="glow" size="lg" className="flex-1">
            <Mic className="w-5 h-5 mr-2" /> Start Listening
          </Button>
        ) : isActive ? (
          <Button onClick={stopListening} variant="destructive" size="lg" className="flex-1">
            <MicOff className="w-5 h-5 mr-2" /> Stop
          </Button>
        ) : (
          <Button onClick={() => { reset(); setTimeout(startListening, 100) }} variant="outline" size="lg" className="flex-1">
            <RefreshCw className="w-5 h-5 mr-2" /> Listen Again
          </Button>
        )}
      </div>

      {state.status === 'idle' && (
        <div className="glass rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quick Tips</h4>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• Start listening <strong className="text-foreground">before</strong> transmitting</li>
            <li>• Keep devices 1–3 feet apart</li>
            <li>• Max sender volume, minimize background noise</li>
            <li>• 1-sec handshake tone, then fast 16-FSK data</li>
          </ul>
        </div>
      )}
    </div>
  )
}