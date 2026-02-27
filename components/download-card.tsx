// components/download-card.tsx
"use client"

import React from 'react'
import { Download, CheckCircle2, File, Image, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatFileSize } from '@/lib/utils'
import { DecodedFile } from '@/lib/types'

interface DownloadCardProps {
    decodedFile: DecodedFile
}

function getFileIcon(mimeType: string) {
    if (mimeType.startsWith('image/')) return <Image className="w-10 h-10 text-violet-400" />
    if (mimeType.startsWith('text/')) return <FileText className="w-10 h-10 text-blue-400" />
    return <File className="w-10 h-10 text-slate-400" />
}

export function DownloadCard({ decodedFile }: DownloadCardProps) {
    const handleDownload = () => {
        const a = document.createElement('a')
        a.href = decodedFile.url
        a.download = decodedFile.metadata.name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    const isImage = decodedFile.metadata.type.startsWith('image/')

    return (
        <Card className="glass gradient-border overflow-hidden">
            <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    <span className="text-sm font-medium text-green-400">
                        File received successfully!
                    </span>
                </div>

                {isImage && (
                    <div className="mb-4 rounded-lg overflow-hidden bg-black/30">
                        <img
                            src={decodedFile.url}
                            alt={decodedFile.metadata.name}
                            className="max-w-full max-h-48 object-contain mx-auto"
                        />
                    </div>
                )}

                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 rounded-lg bg-white/5">
                        {getFileIcon(decodedFile.metadata.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                            {decodedFile.metadata.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                                {formatFileSize(decodedFile.metadata.size)}
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">
                                {decodedFile.metadata.type}
                            </span>
                        </div>
                    </div>
                </div>

                <Button
                    onClick={handleDownload}
                    variant="glow"
                    size="lg"
                    className="w-full"
                >
                    <Download className="w-5 h-5 mr-2" />
                    Download File
                </Button>
            </CardContent>
        </Card>
    )
}