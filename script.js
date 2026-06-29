document.addEventListener('DOMContentLoaded', () => {
    // Referências do DOM
    const views = {
        input: document.getElementById('view-input'),
        workspace: document.getElementById('view-workspace'),
        export: document.getElementById('view-export')
    };
    const headerActions = document.getElementById('header-actions');
    const rawTextInput = document.getElementById('raw-text-input');
    const panelsContainer = document.getElementById('panels-container');
    const finalEditableContent = document.getElementById('final-editable-content');

    // Botões
    const btnProcessar = document.getElementById('btn-processar');
    const btnGerarResumo = document.getElementById('btn-gerar-resumo');
    const btnVoltarInicio = document.getElementById('btn-voltar-inicio');
    const btnVoltarWorkspace = document.getElementById('btn-voltar-workspace');
    const btnCopiar = document.getElementById('btn-copiar');

    // Estrutura de dados em memória
    let parsedData = [];

    // --- FUNÇÕES DE NAVEGAÇÃO ---
    function switchView(viewName) {
        Object.values(views).forEach(view => view.classList.remove('active'));
        views[viewName].classList.add('active');

        if (viewName === 'input') {
            headerActions.classList.add('hidden');
        } else {
            headerActions.classList.remove('hidden');
        }
    }

    // --- PARSER: Transforma texto em dados estruturados ---
    function parseRawText(text) {
        const result = [];
        // Divide o texto pelos blocos principais de Depoimento
        const parts = text.split(/> 📋 Depoimento de /);
        
        parts.forEach(part => {
            if (!part.trim()) return;

            // Extrai o nome do participante e seu cargo/papel
            const firstLineEnd = part.indexOf('\n');
            const participantInfo = part.substring(0, firstLineEnd).trim();
            const restOfPart = part.substring(firstLineEnd);

            // Divide os temas dentro deste participante
            const themesRaw = restOfPart.split(/📌 Tema: /);
            const themes = [];

            themesRaw.forEach(themePart => {
                if (!themePart.trim() || themePart.includes('---')) return; // Ignora blocos de separação vazios

                const themeTitleEnd = themePart.indexOf('\n');
                const themeTitle = themePart.substring(0, themeTitleEnd).trim();
                let themeContent = themePart.substring(themeTitleEnd).trim();

                // Limpeza rápida para remover "---" do final do conteúdo
                themeContent = themeContent.replace(/---+/g, '').trim();

                if (themeTitle) {
                    // ID único para salvar no localStorage (Base64 simples do nome + tema)
                    const uniqueId = btoa(unescape(encodeURIComponent(participantInfo + themeTitle))).substring(0, 15);
                    
                    themes.push({
                        id: uniqueId,
                        title: themeTitle,
                        content: formatDialogue(themeContent),
                        rawContent: themeContent // Guardamos o original para edição
                    });
                }
            });

            if (themes.length > 0) {
                result.push({
                    participant: participantInfo,
                    themes: themes
                });
            }
        });

        return result;
    }

    // Função auxiliar para estilizar os diálogos com HTML
    function formatDialogue(content) {
        const lines = content.split('\n');
        return lines.map(line => {
            if (line.startsWith('**')) {
                const nameEndIndex = line.indexOf('**', 2) + 2;
                const name = line.substring(0, nameEndIndex);
                const text = line.substring(nameEndIndex);
                return `<div class="dialogue-line">${name} ${text}</div>`;
            }
            if (line.trim()) {
                return `<div class="dialogue-line">${line}</div>`;
            }
            return '';
        }).join('');
    }

    // --- RENDERIZADOR: Constrói os painéis visuais ---
    function renderWorkspace() {
        panelsContainer.innerHTML = '';

        parsedData.forEach(personBlock => {
            // Bloco do Participante
            const blockDiv = document.createElement('div');
            blockDiv.classList.add('participant-block');

            // Tag Preta e Amarela
            const tag = document.createElement('div');
            tag.classList.add('participant-tag');
            tag.innerHTML = `<i class="ri-user-voice-fill"></i> <span>${personBlock.participant}</span>`;
            blockDiv.appendChild(tag);

            // Temas (Painéis Recolhíveis)
            personBlock.themes.forEach(theme => {
                const savedTime = localStorage.getItem(`deg_time_${theme.id}`) || '';

                const panel = document.createElement('div');
                panel.classList.add('theme-panel');
                
                panel.innerHTML = `
                    <div class="theme-header">
                        <div class="time-input-container">
                            <i class="ri-time-line"></i>
                            <input type="text" class="time-input ${savedTime ? 'filled' : ''}" 
                                   placeholder="00:00" value="${savedTime}" 
                                   data-id="${theme.id}" title="Minutagem">
                        </div>
                        <div class="theme-title">
                            ${theme.title} <i class="ri-arrow-down-s-line"></i>
                        </div>
                    </div>
                    <div class="theme-content">
                        ${theme.content}
                    </div>
                `;

                // Evento para Expandir/Recolher (apenas clicando no título)
                const titleEl = panel.querySelector('.theme-title');
                titleEl.addEventListener('click', () => {
                    panel.classList.toggle('open');
                });

                // Evento para Salvar Minutagem Automaticamente
                const inputEl = panel.querySelector('.time-input');
                inputEl.addEventListener('input', (e) => {
                    const val = e.target.value.trim();
                    if (val) {
                        localStorage.setItem(`deg_time_${theme.id}`, val);
                        e.target.classList.add('filled');
                    } else {
                        localStorage.removeItem(`deg_time_${theme.id}`);
                        e.target.classList.remove('filled');
                    }
                });

                blockDiv.appendChild(panel);
            });

            panelsContainer.appendChild(blockDiv);
        });
    }

    // --- GERAÇÃO DO RELATÓRIO FINAL ---
    function generateFinalExport() {
        let finalHtml = `<h1>Resumo de Degravação Minutada</h1><br>`;
        let hasMarkedThemes = false;

        parsedData.forEach(personBlock => {
            let personHtml = `<h2><span style="background:#111;color:#f1c40f;padding:4px 8px;border-radius:4px;">👤 ${personBlock.participant}</span></h2>`;
            let hasThemesForPerson = false;

            personBlock.themes.forEach(theme => {
                const savedTime = localStorage.getItem(`deg_time_${theme.id}`);
                
                // Só adiciona se tiver tempo preenchido
                if (savedTime) {
                    hasMarkedThemes = true;
                    hasThemesForPerson = true;
                    
                    personHtml += `
                        <h3 style="color:#2c3e50; margin-top: 15px;">⏱️ [${savedTime}] - 📌 ${theme.title}</h3>
                        <div style="padding-left:15px; border-left: 3px solid #ccc; margin-bottom: 20px;">
                            ${theme.content}
                        </div>
                    `;
                }
            });

            if (hasThemesForPerson) {
                finalHtml += personHtml + `<hr style="margin:20px 0;">`;
            }
        });

        if (!hasMarkedThemes) {
            finalHtml = `<h3>Nenhum tema foi minutado. Volte e adicione horários nos campos de tempo.</h3>`;
        }

        finalEditableContent.innerHTML = finalHtml;
        switchView('export');
    }

    // --- EVENT LISTENERS GERAIS ---
    btnProcessar.addEventListener('click', () => {
        const text = rawTextInput.value;
        if (!text.trim()) {
            alert("Por favor, cole a degravação gerada pelo NotebookLM.");
            return;
        }
        parsedData = parseRawText(text);
        renderWorkspace();
        switchView('workspace');
    });

    btnGerarResumo.addEventListener('click', generateFinalExport);

    btnVoltarInicio.addEventListener('click', () => {
        if(confirm("Iniciar nova degravação? (Os tempos da degravação atual não serão apagados da memória do navegador automaticamente).")) {
            rawTextInput.value = '';
            switchView('input');
        }
    });

    btnVoltarWorkspace.addEventListener('click', () => {
        switchView('workspace');
    });

    btnCopiar.addEventListener('click', () => {
        // Copia o texto do HTML renderizado (preserva formatação ao colar no Word)
        const range = document.createRange();
        range.selectNodeContents(finalEditableContent);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        try {
            document.execCommand('copy');
            btnCopiar.innerHTML = `<i class="ri-check-line"></i> Copiado com Sucesso!`;
            btnCopiar.style.backgroundColor = "#219653";
            setTimeout(() => {
                btnCopiar.innerHTML = `<i class="ri-clipboard-line"></i> Copiar para Área de Transferência`;
                btnCopiar.style.backgroundColor = "";
            }, 3000);
        } catch (err) {
            alert('Falha ao copiar. Tente selecionar o texto e copiar manualmente (Ctrl+C).');
        }
    });
});
