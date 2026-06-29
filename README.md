# ⚖️ Sistematizador de Degravações Judiciais
**Versão:** 1.0.0
**Stack Técnica:** HTML5, CSS3, JavaScript (Vanilla / Sem frameworks)
**Ambiente:** Offline (Roda nativamente em qualquer navegador moderno)

---

## ⚠️ TÓPICO PRELIMINAR: CONTEXTO EXAUSTIVO (LEIA ANTES DE ALTERAR O CÓDIGO)

**Para Desenvolvedores ou IAs Assistentes que forem atualizar este código no futuro:**

Esta seção detalha o ecossistema, o problema de negócio e a filosofia arquitetural deste software. **Não altere a lógica principal do parser (extração de texto) sem ler isto.**

### 1. O Problema de Negócio (Legal Tech)
O usuário deste software atua na área jurídica (advocacia/magistratura trabalhista). O fluxo de trabalho atual dele é:
1. Pega o áudio/vídeo de uma audiência longa.
2. Insere no **NotebookLM** (ou outra IA) com um prompt estrito para degravar o texto dividindo-o por **Participantes** (Juiz, Reclamante, Preposto, Testemunhas) e dividindo as falas em **Temas** (Jornada, Insalubridade, etc.).
3. O NotebookLM entrega um texto gigantesco ("parede de texto").
4. O usuário precisa ler esse texto, encontrar os momentos relevantes e **anotar a minutagem (tempo do áudio)** onde aquela fala ocorreu para usar em suas peças processuais.

### 2. O Problema de UX (User Experience)
Ler textos longos brutos é exaustivo. O usuário precisava de um conceito de **"Divulgação Progressiva" (Progressive Disclosure)**:
- Transformar as partes em **Tags visuais** (fundo preto, letra amarela).
- Transformar os temas em **Painéis Recolhíveis (Accordions)** para esconder diálogos irrelevantes.
- Adicionar um **Input de Tempo (Minutagem)** ao lado de cada tema.
- Ao final, compilar **apenas** os temas que receberam marcação de tempo.

### 3. O "Trauma" Técnico e a Arquitetura do Parser (CRÍTICO)
Nas primeiras versões, tentamos usar expressões regulares (RegEx) complexas e funções de `split()` baseadas em formatação Markdown (ex: buscar por `**`, `>`, ou `---`). 
**Isso falhou miseravelmente.** As IAs generativas (LLMs) são não-determinísticas. O NotebookLM frequentemente "alucina" a formatação: às vezes adiciona um espaço duplo, às vezes esquece um negrito, às vezes troca o símbolo de citação. Isso quebrava o JavaScript e deixava a tela em branco.

**A Solução Definitiva adotada no `script.js`:**
O Parser foi construído com a abordagem **"Line-by-Line Relaxado" (Caçador de Emojis)**:
1. O código itera sobre o texto linha por linha.
2. A única fonte da verdade para encontrar um participante é o emoji **📋**.
3. A única fonte da verdade para encontrar um tema é o emoji **📌**.
4. Diálogos são simplesmente as linhas que existem entre um tema e o próximo marcador.
5. **O "Hard Stop":** O prompt do NotebookLM gera uma seção chamada `ETAPA 2 — RELATÓRIO ANALÍTICO`. O nosso parser tem uma trava: se ler a palavra `ETAPA 2`, ele interrompe a extração imediatamente, ignorando o restante do documento.

**Regra Absoluta de Manutenção:** Nunca tente reverter o parser para uma lógica rígida baseada em marcações de Markdown. Mantenha o parser orientado aos Emojis e à leitura linha a linha.

---

## 🚀 Funcionalidades Atuais

* **Processamento de Linguagem Natural (Simulado):** Estruturação automática de texto bruto para interface visual (UI) baseado em heurística de emojis.
* **Salvamento Persistente (Offline):** Utiliza o `localStorage` do navegador para salvar as minutagens digitadas. Se o usuário fechar a aba acidentalmente, não perde os tempos anotados (a chave é gerada via hash em Base64 cruzando Nome + Tema).
* **Filtro de Exportação:** Gera um documento final estilo *WYSIWYG (What You See Is What You Get)*.
* **Edição Pós-Filtro:** A tela de exportação é `contenteditable`, permitindo que o usuário corrija pequenas "alucinações" do texto gerado pela IA antes de copiar para o seu editor de texto oficial (Word, PJe, etc.).
* **Preservação de Formatação (Clipboard API):** Ao clicar em copiar, o software injeta o HTML no clipboard do sistema operacional, mantendo os negritos e quebras de linha ao colar no Word.

---

## 📁 Estrutura de Arquivos

O projeto foi mantido intencionalmente como *Vanilla* (sem React, Vue, Node.js ou Bancos de Dados) para garantir que o usuário não precise de conhecimento técnico para rodar. Basta o navegador.

* `index.html` - Estrutura as 3 telas principais (Input, Workspace e Export). Utiliza Remix Icons (via CDN) para iconografia amigável.
* `style.css` - Design System simples e voltado para leitura prolongada (Alto contraste, fundo neutro, inputs visíveis).
* `script.js` - O cérebro da aplicação. Contém o gerenciamento de Views (telas), o Parser (Caçador de Emojis), a injeção no DOM, a gestão do LocalStorage e a geração do resumo.

---

## 📖 Como Utilizar (Guia Rápido)

1. Pegue a transcrição (Etapa 1) gerada no seu NotebookLM.
2. Dê duplo clique no arquivo `index.html` para abrir no Chrome/Edge/Safari.
3. Cole o texto bruto na caixa de texto da primeira tela e clique em **"Organizar e Estilizar Painéis"**.
4. Navegue pelos painéis (abra e feche os temas).
5. Quando identificar um tema importante para a sua tese jurídica, digite o tempo do áudio (Ex: `12:45` ou `1h05`) na caixa localizada à esquerda do título do tema. A caixa ficará verde, indicando que foi salva automaticamente.
6. Ao terminar sua análise, vá ao cabeçalho (topo da página) e clique em **"Gerar Resumo"**.
7. Na tela final, revise o texto, corrija eventuais erros de português digitando diretamente na caixa tracejada, e clique no botão verde **"Copiar para Área de Transferência"**.
8. Cole no seu documento de trabalho (Word/Google Docs).

---

## 🛠 Ideias para Evolução Futura (Roadmap)

Se você desejar expandir este projeto, aqui estão ideias já compatíveis com a arquitetura atual:
1. **Limpeza de Memória (Clear Storage):** Um botão nas configurações para "Apagar Minutagens Antigas", útil se você trabalhar com múltiplos processos no mesmo dia.
2. **Exportação Direta para PDF ou DOCX:** Integração com bibliotecas como `html2pdf.js` ou `docx.js` para não depender apenas do "Copiar/Colar".
3. **Modo Escuro (Dark Mode):** Adicionar um switch de CSS Variables para leitura noturna, diminuindo o cansaço visual.
4. **Calculadora de Horas Extras:** Se o sistema ler formatos de tempo válidos, poderia gerar tabelas com a contagem da jornada de trabalho entre o tempo X e Y.
