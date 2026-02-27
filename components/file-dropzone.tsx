// components/file-dropzone.tsx
"use client"

import React, { useCallback, useState, useRef } from 'react'
import { Upload, File, Image, FileText, X } from 'lucide-react'
import { cn, formatFileSize } from '@/lib/utils'
import { FileMetadata } from '@/lib/types'
import { Button } from '@/components/ui/button'

interface FileDropzoneProps {
    onFileSelect: (file: File) => void
    selectedFile: File | null
    onClear: () => void
    disabled?: boolean
}

const FILE_ICONS: Record<string, React.ReactNode> = {
    image: <Image className="w-8 h-8 text-violet-400" />,
    text: <FileText className="w-8 h-8 text-blue-400" />,
    default: <File className="w-8 h-8 text-slate-400" />,
}

function getFileIcon(mimeType: string) {
    if (mimeType.startsWith('image/')) return FILE_ICONS.image
    if (mimeType.startsWith('text/')) return FILE_ICONS.text
    return FILE_ICONS.default
}

export function FileDropzone({ onFileSelect, selectedFile, onClear, disabled }: FileDropzoneProps) {
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!disabled) setIsDragging(true)
    }, [disabled])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        if (disabled) return

        const files = e.dataTransfer.files
        if (files && files.length > 0) {
            onFileSelect(files[0])
        }
    }, [disabled, onFileSelect])

    const handleClick = useCallback(() => {
        if (!disabled && fileInputRef.current) {
            fileInputRef.current.click()
        }
    }, [disabled])

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (files && files.length > 0) {
            onFileSelect(files[0])
        }
        // Reset input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }, [onFileSelect])

    if (selectedFile) {
        return (
            <div className="glass rounded-xl p-6 gradient-border">
                <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 p-3 rounded-lg bg-white/5">
                        {getFileIcon(selectedFile.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                            {selectedFile.name}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground">
                                {formatFileSize(selectedFile.size)}
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">
                                {selectedFile.type || 'unknown type'}
                            </span>
                        </div>
                    </div>
                    {!disabled && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation()
                                onClear()
                            }}
                            className="flex-shrink-0 hover:bg-destructive/20 hover:text-destructive"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>
        )
    }

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileInput}
                disabled={disabled}
            />
            <div
                onClick={handleClick}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={cn(
                    "relative rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300",
                    isDragging
                        ? "border-primary bg-primary/5 scale-[1.02]"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-white/[0.02]",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
            >
                <div className="flex flex-col items-center gap-4">
                    <div className={cn(
                        "p-4 rounded-2xl transition-all duration-300",
                        isDragging ? "bg-primary/10 scale-110" : "bg-white/5"
                    )}>
                        <Upload className={cn(
                            "w-8 h-8 transition-colors duration-300",
                            isDragging ? "text-primary" : "text-muted-foreground"
                        )} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-foreground">
                            {isDragging ? 'Drop your file here' : 'Drag & drop a file here'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            or click to browse · Any file type supported
                        </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-2">
                        Recommended: Small files (&lt; 1KB) for fastest transfer
                    </p>
                </div>
            </div>
        </>
    )
}