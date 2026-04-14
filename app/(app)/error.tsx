'use client'
import { SegmentError } from '@/components/ui/segment-error'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError error={error} reset={reset} title="Ocorreu um erro nesta página." />
}
