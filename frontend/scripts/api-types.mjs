import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import openapiTS, { astToString } from 'openapi-typescript'

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:8000'
const endpoint = new URL('/openapi.json', baseUrl).toString()
const outputPath = resolve(
  process.cwd(),
  process.env.OPENAPI_OUTPUT ?? 'src/api/schema.d.ts',
)

try {
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`API respondeu HTTP ${response.status}`)
  }

  const schema = await response.json()
  const ast = await openapiTS(schema)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${astToString(ast)}\n`, 'utf8')
  console.log(`OpenAPI gerado em ${outputPath}`)
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(
    `Não foi possível gerar o OpenAPI em ${endpoint}: ${detail}. ` +
      'Suba o backend e confirme API_BASE_URL.',
  )
  process.exitCode = 1
}
