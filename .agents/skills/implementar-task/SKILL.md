---
name: implementar-task
description: 'Executa o fluxo padrão do Albion Profit Pro para implementar UMA task descrita em docs/tasks/{fase}/NN-slug.md. Use sempre que o usuário pedir para implementar, começar, continuar ou seguir com uma task específica — por caminho, fase, número, nome ou de forma genérica, como "implemente a próxima task". Valida a spec contra o repositório real, apresenta o escopo e espera confirmação explícita antes de editar, implementa, executa testes reais, atualiza a documentação e separa validações automatizadas das que ainda dependem do usuário. Não use apenas para criar ou revisar specs sem implementação.'
---

# Implementar uma task de spec

Execute uma única microtask de `docs/tasks/<fase>/NN-slug.md` por ciclo. Confirmar que a spec ainda corresponde ao projeto, alinhar o escopo antes de editar, testar de verdade e manter a documentação fazem parte da implementação.

Não pule a aprovação mesmo quando a task parecer trivial.

## 1. Identificar e validar

1. Resolva a task solicitada:
   - Com caminho, fase ou nome explícito, use essa identificação.
   - Com apenas um número, procure `docs/tasks/*/NN-*.md`. Use a fase ativa documentada quando ela eliminar a ambiguidade; pergunte se restarem candidatas plausíveis.
   - Para "a próxima task", leia `docs/README.md` e os READMEs das fases, identifique a fase prioritária e escolha a primeira task pendente cujas dependências estejam concluídas.
2. Leia por inteiro a spec da task, `AGENTS.md`, `docs/README.md`, `docs/00-plano-macro.md`, o README da fase e os documentos adicionais exigidos por eles.
3. Inspecione `git status`. Preserve mudanças existentes do usuário e não reverta, sobrescreva ou reformate arquivos fora do escopo.
4. Confira no código real, não apenas no checklist:
   - se as dependências da task estão implementadas;
   - se decisões de arquitetura ou versões tornaram a spec obsoleta;
   - se contratos externos citados pela spec continuam corretos;
   - se a task já está parcial ou totalmente implementada.
5. Se houver inconsistência, não implemente ainda. Registre a evidência e proponha a correção no resumo.

## 2. Resumir e pedir aprovação

Antes de qualquer edição, informe:

- task e objetivo em uma frase;
- arquivos que pretende criar ou alterar;
- decisões técnicas relevantes;
- inconsistências e solução proposta;
- testes automatizados previstos;
- verificações que provavelmente dependerão do usuário.

Termine perguntando explicitamente se pode prosseguir.

## 3. Esperar confirmação

Não edite implementação, specs nem checklists até receber confirmação clara. Inspeções somente leitura continuam permitidas. Se o usuário alterar o escopo, apresente o resumo revisado e peça nova confirmação. Não interprete silêncio ou resposta ambígua como autorização.

## 4. Implementar uma task

Depois da confirmação:

1. Implemente exatamente o escopo e os critérios de aceite da spec, respeitando as dependências e convenções do projeto.
2. Limite as mudanças a essa task. Não faça refactors oportunistas nem comece a próxima task.
3. Se a realidade exigir desvio da spec, faça o menor desvio correto, explique-o no relatório e atualize a documentação relevante.
4. Preserve alterações preexistentes do usuário.
5. Não crie commit, tag ou branch, salvo quando a task e a aprovação do usuário incluírem isso expressamente.

## 5. Executar testes reais

Rode os testes automatizados pedidos pela spec e os checks proporcionais às mudanças, como testes focados, lint, formatação ou build. Registre comandos e resultados reais.

Se algo falhar, investigue e corrija dentro do escopo. Se houver bloqueio externo, reporte-o claramente. Nunca declare sucesso para teste não executado.

## 6. Separar verificações disponíveis e humanas

Para cada teste manual:

- Se for executável com as capacidades disponíveis — por exemplo curl, banco, Docker, inspeção de arquivos ou navegador automatizado disponível — execute e reporte o resultado real.
- Se depender de ação in-game, credencial, dispositivo, percepção visual não verificável ou acesso externo indisponível, não simule nem presuma sucesso. Forneça passos exatos e o resultado esperado para o usuário.

## 7. Atualizar status e relatar

Marque a task como concluída no checklist de `docs/tasks/<fase>/README.md` somente quando o escopo e os critérios de aceite estiverem atendidos e todos os testes automatizados aplicáveis tiverem passado. Não conclua uma task com falha conhecida, teste aplicável omitido ou documentação obrigatória desatualizada.

Use esta estrutura no relatório final:

```markdown
## Task NN — <título>

### O que foi implementado

### Desvios da spec

### Testes automatizados

### Testes manuais executados

### Pendente para você testar
```

Em cada seção, informe arquivos, comandos, resultados e pendências objetivamente. Se não houver desvios ou pendências, diga isso explicitamente.

Pode mencionar que a próxima task está desbloqueada, mas não a implemente sem repetir este fluxo desde o início.
