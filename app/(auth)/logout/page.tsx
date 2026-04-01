'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.signOut().then(() => {
      router.push('/login')
      router.refresh()
    })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080C14]">
      <div className="text-center text-[#475569]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-400" />
        <p className="text-sm">Saindo do sistema...</p>
      </div>
    </div>
  )
}
