// Testes de guarda (contrast.test.ts, no-color-literals.test.ts, theme.test.tsx, via
// theme-tokens.ts) precisam ler src/index.css como texto cru. O plugin @tailwindcss/vite
// intercepta qualquer import de CSS — inclusive `?raw` — e devolve string vazia, então a
// única via confiável é o fs do Node em tempo de teste. Os guards de assets também leem a
// assinatura binária e o tamanho dos arquivos gerados. O tsconfig do app não inclui os tipos de
// "node" de propósito (achado W6, mantém o ambiente do browser limpo); esta declaração mínima
// cobre só o que os testes usam.
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function statSync(path: string): { size: number }
}
