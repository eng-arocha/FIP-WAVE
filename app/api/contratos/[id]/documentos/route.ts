import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

const BUCKET = 'contratos-documentos'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('contratos_documentos')
      .select('*')
      .eq('contrato_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const admin = createAdminClient()
    const formData = await req.formData()

    const file = formData.get('file') as File | null
    const tipo = (formData.get('tipo') as string) || 'outro'
    const descricao = (formData.get('descricao') as string) || ''

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const ext = file.name.split('.').pop() ?? 'bin'
    const nomeStorage = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(nomeStorage, buffer, { contentType: file.type, upsert: false })

    if (uploadError) throw uploadError

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(nomeStorage)

    const { data: doc, error: dbError } = await admin
      .from('contratos_documentos')
      .insert({
        contrato_id: id,
        nome_original: file.name,
        nome_storage: nomeStorage,
        storage_path: nomeStorage,
        url: urlData?.publicUrl ?? null,
        tipo,
        tamanho_bytes: file.size,
        mime_type: file.type,
        descricao: descricao || null,
      })
      .select()
      .single()

    if (dbError) throw dbError
    return NextResponse.json(doc, { status: 201 })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const docId = searchParams.get('docId')
    if (!docId) return NextResponse.json({ error: 'docId obrigatório' }, { status: 400 })

    const admin = createAdminClient()

    const { data: doc } = await admin
      .from('contratos_documentos')
      .select('storage_path')
      .eq('id', docId)
      .eq('contrato_id', id)
      .single()

    if (doc?.storage_path) {
      await admin.storage.from(BUCKET).remove([doc.storage_path])
    }

    const { error } = await admin
      .from('contratos_documentos')
      .delete()
      .eq('id', docId)
      .eq('contrato_id', id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
