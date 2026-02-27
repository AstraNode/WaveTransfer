// app/page.tsx
"use client"

import React from 'react'
import { Radio, Waves, Zap, Shield, Wifi, WifiOff } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SenderTab } from '@/components/sender-tab'
import { ReceiverTab } from '@/components/receiver-tab'

export default function HomePage() {
    return (
        <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
            {/* Hero Header */}
            <div className="text-center mb-8 space-y-4">
                <div className="inline-flex items-center justify-center p-3 rounded-2xl glass mb-4">
                    <Waves className="w-10 h-10 text-primary" />
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                    <span className="gradient-text">SonicTransfer</span>
                </h1>
                <p className="text-muted-foreground max-w-md mx-auto text-sm sm:text-base">
                    Transfer files between devices using nothing but sound waves.
                    No WiFi, no Bluetooth — just pure audio.
                </p>

                {/* Feature pills */}
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                    {[
                        { icon: WifiOff, label: 'No Internet' },
                        { icon: Shield, label: 'Air-Gapped' },
                        { icon: Zap, label: 'FSK Modulation' },
                    ].map(({ icon: Icon, label }) => (
                        <div
                            key={label}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs font-medium text-muted-foreground"
                        >
                            <Icon className="w-3 h-3" />
                            {label}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Application Card */}
            <Card className="w-full max-w-lg glass gradient-border shadow-2xl shadow-black/40">
                <CardHeader className="text-center pb-4">
                    <CardTitle className="text-xl font-semibold">
                        Data-over-Audio Transfer
                    </CardTitle>
                    <CardDescription>
                        Choose a mode to send or receive files via sound
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="send" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-6">
                            <TabsTrigger value="send" className="gap-2">
                                <Radio className="w-4 h-4" />
                                Send
                            </TabsTrigger>
                            <TabsTrigger value="receive" className="gap-2">
                                <Waves className="w-4 h-4" />
                                Receive
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="send">
                            <SenderTab />
                        </TabsContent>

                        <TabsContent value="receive">
                            <ReceiverTab />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Footer */}
            <footer className="mt-8 text-center">
                <p className="text-xs text-muted-foreground/50">
                    FSK Protocol · {1200}Hz / {2400}Hz · {75} baud · CRC-8 Error Detection
                </p>
            </footer>
        </main>
    )
}