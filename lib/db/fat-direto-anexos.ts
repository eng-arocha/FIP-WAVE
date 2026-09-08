import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

/**
 * Reconciliação entre a lista de anexos gravada em
 * `solicitacoes_fat_direto.pedido_anexos` e o que está fisicamente no
 * Storage.
 *
 * Por que isso existe: o upload de anexo do pedido é feito em dois passos —
 * (1) o arquivo sobe DIRETO pro bucket via signed URL e (2) o cliente chama
 * POST /api/fat-direto/upload pra registrar a lista no banco. O passo (2)
 * pode falhar sozinho (foi o que aconteceu enquanto a coluna `pedido_anexos`
 * não existia em produção — migration 016 nunca rodou, ver 083). Quando isso
 * acontece o arquivo fica órfão: existe no bucket, some da tela.
 *
 * Aqui o bucket vira fonte de RESGATE — nunca fonte de verdade. A lista do
 * banco continua mandando na ordem e nos metadados; o Storage só acrescenta
 * o que ficou de fora, e o self-heal regrava a lista pra não precisar
 * resgatar de novo na próxima leitura.
 */

export const BUCKET_FAT_DIRETO = 'faturamento-direto'

export interface AnexoPedido {
  nome: string
  url: string
  tamanho?: number
  tipo?: string
  /**
   * Derivado na LEITURA, nunca persistido: marca um anexo que estava no
   * bucket mas não na lista do banco. A UI usa pra sinalizar o resgate.
   */
  origem?: 'storage'
}

/** Shape mínimo que aceitamos na entrada — o legado nem sempre tem `url`. */
export interface AnexoParcial {
  nome?: string | null
  url?: string | null
  tamanho?: number | null
  tipo?: string | null
  origem?: string | null
}

/** Pasta do bucket onde ficam os anexos do pedido de uma solicitação. */
export function prefixoAnexosPedido(solId: string): string {
  return `pedidos/${solId}`
}

/**
 * Extrai o storage path (`pedidos/{solId}/{arquivo}`) de uma URL pública do
 * Supabase. Em fallback (anexo legado, gravado só com nome), monta a partir
 * de solId + nome.
 *
 * O path é a chave de identidade dos anexos: dois uploads do MESMO arquivo
 * têm nomes iguais mas paths diferentes (o sign-pedido-upload prefixa com
 * `Date.now()`), então casar por nome duplicaria ou esconderia arquivos.
 */
export function anexoStoragePath(
  anexo: AnexoParcial | null | undefined,
  solId: string,
): string | null {
  if (!anexo) return null
  if (anexo.url) {
    const marker = `/object/public/${BUCKET_FAT_DIRETO}/`
    const i = anexo.url.indexOf(marker)
    if (i >= 0) {
      const bruto = anexo.url.slice(i + marker.length)
      try {
        return decodeURIComponent(bruto)
      } catch {
        // URL malformada (% solto): fica com o path cru, melhor que nada.
        return bruto
      }
    }
  }
  if (anexo.nome) return `${prefixoAnexosPedido(solId)}/${anexo.nome}`
  return null
}

/** Normaliza a entrada num AnexoPedido completo (sem `origem`). */
function normalizar(anexo: AnexoParcial): AnexoPedido {
  return {
    nome: String(anexo.nome ?? 'arquivo'),
    url: String(anexo.url ?? ''),
    tamanho: anexo.tamanho ?? undefined,
    tipo: anexo.tipo ?? undefined,
  }
}

/**
 * Junta a lista do pedido com o que existe no bucket.
 *
 * PURA — sem I/O, testável isoladamente. Preserva a ordem da lista do pedido
 * e acrescenta ao final só os arquivos do Storage que não estão nela,
 * marcados `origem: 'storage'`.
 */
export function mergeAnexos(
  doPedido: AnexoParcial[] | null | undefined,
  doStorage: AnexoParcial[] | null | undefined,
  solId: string,
): { anexos: AnexoPedido[]; recuperados: number } {
  const registrados = Array.isArray(doPedido) ? doPedido : []
  const noBucket = Array.isArray(doStorage) ? doStorage : []

  const anexos: AnexoPedido[] = registrados.map(normalizar)

  const pathsRegistrados = new Set(
    registrados
      .map(a => anexoStoragePath(a, solId))
      .filter((p): p is string => !!p),
  )

  let recuperados = 0
  for (const doBucket of noBucket) {
    const path = anexoStoragePath(doBucket, solId)
    if (!path || pathsRegistrados.has(path)) continue
    pathsRegistrados.add(path)
    anexos.push({ ...normalizar(doBucket), origem: 'storage' })
    recuperados++
  }

  return { anexos, recuperados }
}

/** Descarta campos derivados (ex.: `origem`) antes de gravar no banco. */
export function sanitizarParaPersistir(anexos: AnexoParcial[]): AnexoPedido[] {
  return anexos.map(normalizar)
}

interface ObjetoStorage {
  name: string
  id: string | null
  metadata?: { size?: number; mimetype?: string } | null
}

/**
 * Lista os arquivos que estão fisicamente no bucket para a solicitação.
 *
 * Falha do Storage NÃO pode derrubar a página do pedido — a lista do banco
 * já é suficiente pro caso normal. Erro vira log + lista vazia.
 */
export async function listarAnexosNoStorage(solId: string): Promise<AnexoPedido[]> {
  const prefixo = prefixoAnexosPedido(solId)
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from(BUCKET_FAT_DIRETO)
      .list(prefixo, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
    if (error) {
      log.warn('anexos_storage_list_falhou', { solId, erro: error.message })
      return []
    }

    const objetos = (data ?? []) as ObjetoStorage[]
    return objetos
      // `.emptyFolderPlaceholder` é o arquivo fantasma que o Supabase cria
      // pra manter pasta vazia; `id === null` é subpasta, não arquivo.
      .filter(o => o.name && o.name !== '.emptyFolderPlaceholder' && o.id !== null)
      .map(o => {
        const path = `${prefixo}/${o.name}`
        const { data: pub } = admin.storage.from(BUCKET_FAT_DIRETO).getPublicUrl(path)
        return {
          nome: o.name,
          url: pub?.publicUrl ?? '',
          tamanho: o.metadata?.size ?? undefined,
          tipo: o.metadata?.mimetype ?? undefined,
        }
      })
  } catch (e) {
    log.warn('anexos_storage_list_excecao', { solId, erro: String(e) })
    return []
  }
}

/**
 * Lista efetiva de anexos do pedido: banco + resgate do Storage.
 *
 * Quando encontra órfão, regrava a lista no banco (self-heal). A regravação
 * é best-effort: se falhar, a leitura continua devolvendo os anexos
 * resgatados — só vai resgatar de novo na próxima vez.
 */
export async function reconciliarAnexosPedido(
  solId: string,
  doPedido: AnexoParcial[] | null | undefined,
): Promise<{ anexos: AnexoPedido[]; recuperados: number }> {
  const doStorage = await listarAnexosNoStorage(solId)
  const { anexos, recuperados } = mergeAnexos(doPedido, doStorage, solId)

  if (recuperados > 0) {
    try {
      const paraGravar = sanitizarParaPersistir(anexos)
      const admin = createAdminClient()
      const { error } = await admin
        .from('solicitacoes_fat_direto')
        .update({
          pedido_anexos: paraGravar,
          pedido_pdf_url: paraGravar[0]?.url ?? null,
          pedido_pdf_nome: paraGravar[0]?.nome ?? null,
        })
        .eq('id', solId)
      if (error) {
        log.warn('anexos_self_heal_falhou', { solId, recuperados, erro: error.message })
      } else {
        log.info('anexos_recuperados_do_storage', { solId, recuperados })
      }
    } catch (e) {
      log.warn('anexos_self_heal_excecao', { solId, recuperados, erro: String(e) })
    }
  }

  return { anexos, recuperados }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Set de solIds que têm pasta em `pedidos/` no bucket.
 *
 * Uma listagem paginada só, pra listagem de pedidos poder marcar
 * "tem arquivo no Storage" sem N chamadas. Falha vira Set vazio.
 */
export async function solIdsComAnexoNoStorage(): Promise<Set<string>> {
  const encontrados = new Set<string>()
  try {
    const admin = createAdminClient()
    const limite = 1000
    let offset = 0
    for (;;) {
      const { data, error } = await admin.storage
        .from(BUCKET_FAT_DIRETO)
        .list('pedidos', { limit: limite, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) {
        log.warn('anexos_storage_scan_falhou', { erro: error.message })
        break
      }
      const objetos = (data ?? []) as ObjetoStorage[]
      for (const o of objetos) {
        // Pastas vêm com id null; o nome da pasta é o solId.
        if (o.name && (o.id === null || UUID_RE.test(o.name))) encontrados.add(o.name)
      }
      if (objetos.length < limite) break
      offset += limite
    }
  } catch (e) {
    log.warn('anexos_storage_scan_excecao', { erro: String(e) })
  }
  return encontrados
}
