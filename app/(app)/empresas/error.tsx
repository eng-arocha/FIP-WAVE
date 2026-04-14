'use client'
import { SegmentError } from '@/components/ui/segment-error'

export default function EmpresasError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError error={error} reset={reset} title="Não foi possível carregar as empresas." />
}
