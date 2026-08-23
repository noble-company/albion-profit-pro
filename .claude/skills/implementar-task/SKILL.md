---
name: implementar-task
description: Executa o fluxo padrão deste projeto (Albion Profit Pro) para implementar UMA task de spec a partir de docs/tasks/<fase>/NN-slug.md (ex: docs/tasks/backend/07-modelo-user-fastapi-users.md). Use esta skill sempre que o usuário pedir pra implementar, começar, continuar, ou seguir com uma task específica — por número ("implementa a task 07", "bora pra task 3"), por nome, ou de forma genérica ("pode seguir com a próxima task", "implementa a próxima"). Vale pra qualquer fase (backend, frontend, client) que tenha tasks quebradas em docs/tasks/. Garante o fluxo obrigatório: ler e validar a spec contra o estado real do projeto → resumir pro usuário → esperar confirmação explícita → implementar → rodar os testes automatizados de verdade → identificar e reportar o que só um humano pode testar (navegador, in-game, visual).
---

# Implementar uma task de spec

Este projeto quebra cada fase de trabalho (backend, e futuramente frontend/client) em microetapas — uma task por arquivo, em `docs/tasks/<fase>/NN-slug.md`, cada uma seguindo o mesmo template (Objetivo, Por que, O que implementar, Bibliotecas/dependências, Depende de, Testes manuais, Testes automatizados). Essa skill existe porque implementar uma task não é só "escrever o código descrito" — é confirmar que a spec ainda faz sentido, alinhar com o usuário antes de mexer em arquivos, implementar de verdade, provar que funciona rodando os testes, e ser honesto sobre o que ainda depende de um humano verificar.

Não pule etapas deste fluxo, mesmo quando a task parecer trivial — é exatamente nas tasks "óbvias" que se acumula divergência silenciosa entre spec e código se ninguém checar.

## Passo 1 — Ler e validar a task contra o projeto real

1. Identifique qual arquivo de task o usuário quer (ex: "task 07" → procure `docs/tasks/*/07-*.md`; se houver mais de uma fase com esse número, pergunte qual). Se o pedido for "a próxima task", abra `docs/tasks/<fase>/README.md`, ache a primeira não marcada no checklist de status, e confirme que as tasks listadas em "Depende de" dela já estão marcadas como concluídas.
2. Leia o arquivo da task inteiro.
3. Leia (ou releia, se fizer tempo) `CLAUDE.md` na raiz do projeto — as convenções valem pra toda task, não só pra essa.
4. Verifique, olhando os arquivos reais do repositório (não assuma pelo checklist sozinho), que:
   - As tasks listadas em "Depende de" realmente estão implementadas — os arquivos/estruturas que elas deveriam ter criado existem de fato.
   - Nada mudou desde que a task foi escrita que invalide alguma premissa dela (ex: uma decisão de arquitetura documentada em `docs/00-plano-macro.md` mudou, uma dependência de outra task saiu diferente do esperado).
   - Se a task referencia código externo (ex: structs do `albiondata-client`), confirme rapidamente que o código real ainda bate com o que a spec descreve — código de terceiros pode ter sido atualizado.
5. Se achar qualquer inconsistência (dependência não satisfeita, spec desatualizada, conflito com o que já existe), não prossiga direto pra implementação — leve isso pro resumo do Passo 2 e proponha como resolver.

## Passo 2 — Resumo pra aprovação

Apresente um resumo objetivo, **sem implementar nada ainda**:
- Qual task é, em uma frase.
- O que vai ser criado/alterado (lista de arquivos, não o código inteiro).
- Decisões-chave da spec que valem destacar (bibliotecas específicas, formato de dados, etc.) — só o que for relevante pra essa task, não repita o plano macro inteiro.
- Qualquer inconsistência encontrada no Passo 1, com a solução proposta.
- Termine perguntando explicitamente se pode prosseguir.

## Passo 3 — Esperar confirmação

Não crie nem edite nenhum arquivo de implementação até o usuário confirmar de forma clara. Se o usuário pedir ajuste no escopo, atualize o resumo e pergunte de novo — não interprete silêncio ou uma resposta ambígua como "pode seguir".

## Passo 4 — Implementar

Implemente exatamente o que a seção "O que implementar" da task descreve, usando as bibliotecas/versões da seção "Bibliotecas/dependências". Se a realidade forçar um desvio da spec (ex: uma versão de biblioteca não existe mais, um caminho de arquivo mudou), resolva com bom senso, mas:
- Registre o desvio claramente no relatório final (Passo 7).
- Se o desvio for relevante pra quem for ler a spec depois, atualize o próprio arquivo `docs/tasks/<fase>/NN-slug.md` (ou o doc macro relevante) pra refletir a realidade — a documentação deste projeto é viva, não um registro histórico congelado.

## Passo 5 — Rodar os testes automatizados de verdade

Rode o que a seção "Testes automatizados" da task pede — de verdade, não descreva o que "deveria" passar. Se algo falhar, tente corrigir dentro do razoável antes de reportar; se travar em algo que não consegue resolver sozinho, pare e explique o problema em vez de reportar sucesso.

## Passo 6 — Identificar testes manuais: o que você consegue rodar, o que é pro usuário

Passe pela seção "Testes manuais" da task e, pra cada item, decida:
- **Você consegue rodar sozinho** (curl, psql, `docker compose ps`, ler um arquivo, checar uma linha no banco, etc.) → rode e reporte o resultado real.
- **Só um humano consegue** (abrir navegador e olhar a tela, verificar visual/UX, fazer uma ação dentro do próprio jogo Albion Online, qualquer coisa que exija olhos/mãos ou acesso que você não tem) → **não simule nem assuma que passaria** — liste como pendente, com o passo a passo exato de como o usuário deve testar.

## Passo 7 — Relatório final

Estruture a resposta final sempre assim:

```markdown
## Task NN — <título>

### O que foi implementado
(lista objetiva de arquivos criados/alterados e o que cada um faz)

### Desvios da spec (se houver)
(o que mudou em relação ao arquivo de task, e por quê)

### Testes automatizados
(quais rodou, comando usado, resultado — passou/falhou)

### Testes manuais que você já rodou
(quais itens da seção "Testes manuais" você conseguiu verificar sozinho, e o resultado)

### Pendente pra você testar
(itens que só um humano consegue verificar — passo a passo exato de como testar)
```

Depois, marque a task como concluída no checklist de `docs/tasks/<fase>/README.md` (só se os testes automatizados passaram — não marque uma task com testes falhando ou pulados). Se a próxima task da lista já tiver as dependências dela satisfeitas, pode mencionar que ela está pronta pra começar, mas não a implemente sem passar de novo pelo Passo 1-3 dessa mesma skill.
