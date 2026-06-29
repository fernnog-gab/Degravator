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

    // --- PARSER BLINDADO (RegEx e Tokenização) ---
    function parseRawText(text) {
        const result = [];
        
        // 1. Limpeza brutal para evitar problemas de formatação da IA
        // Troca variações de marcadores por TOKENS absolutos e limpos.
        // O RegEx abaixo ignora marcações de citação (>), espaços extras e negritos (**)
        let normalizedText = text.replace(/(?:>|\*\*)*\s*📋\s*Depoimento de\s*(?:\*\*|:)?/gi, '|||PARTICIPANTE|||');
        normalizedText = normalizedText.replace(/(?:\*\*)*\s*📌\s*Tema:\s*(?:\*\*|:)?/gi, '|||TEMA|||');

        // 2. Separa por participantes
        const parts = normalizedText.split('|||PARTICIPANTE|||');
        
        parts.forEach(part => {
            if (!part.trim() || !part.includes('|||TEMA|||')) return;

            // Extrai o nome do participante (Tudo até o primeiro TEMA)
            const firstThemeIndex = part.indexOf('|||TEMA|||');
            const participantInfo = part.substring(0, firstThemeIndex)
                                        .replace(/---/g, '') // remove hifens
                                        .replace(/\n/g, '')  // remove quebras de linha no nome
                                        .trim();
            
            const restOfPart = part.substring(firstThemeIndex);

            // 3. Separa por temas
            const themesRaw = restOfPart.split('|||TEMA|||');
            const themes = [];

            themesRaw.forEach(themePart => {
                if (!themePart.trim()) return;

                const themeTitleEnd = themePart.indexOf('\n');
                let themeTitle = themePart.substring(0, themeTitleEnd).trim();
                let themeContent = themePart.substring(themeTitleEnd).trim();

                // Limpa marcações e divisórias que sobram
                themeTitle = themeTitle.replace(/\*\*/g, '').trim(); 
                themeContent = themeContent.replace(/---+/g, '').trim();

                if (themeTitle) {
                    const uniqueId = btoa(unescape(encodeURIComponent(participantInfo + themeTitle))).substring(0, 15);
                    
                    themes.push({
                        id: uniqueId,
                        title: themeTitle,
                        content: formatDialogue(themeContent),
                        rawContent: themeContent
                    });
                }
            });

            if (themes.length > 0 && participantInfo) {
                result.push({
                    participant: participantInfo,
                    themes: themes
                });
            }
        });

        return result;
    }

    // Estiliza os diálogos em tela
    function formatDialogue(content) {
        const lines = content.split('\n');
        return lines.map(line => {
            // Remove espaços e limpa
            line = line.trim();
            if (!line) return '';
            
            // Pinta o nome do interlocutor se houver negrito
            if (line.startsWith('**')) {
                const nameEndIndex = line.indexOf('**', 2) + 2;
                if(nameEndIndex > 1) {
                    const name = line.substring(0, nameEndIndex);
                    const text = line.substring(nameEndIndex);
                    return `<div class="dialogue-line"><strong>${name}</strong> ${text}</div>`;
                }
            }
            return `<div class="dialogue-line">${line}</div>`;
        }).join('');
    }

    // --- RENDERIZADOR ---
    function renderWorkspace() {
        panelsContainer.innerHTML = '';

        if (parsedData.length === 0) {
            panelsContainer.innerHTML = `
                <div style="background: #fee; color: #c00; padding: 20px; border-radius: 8px; text-align: center;">
                    <i class="ri-error-warning-line" style="font-size: 2rem;"></i>
                    <h3>Não encontramos os marcadores no texto!</h3>
                    <p>Verifique se o texto possui os emojis <strong>📋 Depoimento de</strong> e <strong>📌 Tema:</strong></p>
                </div>`;
            return;
        }

        parsedData.forEach(personBlock => {
            const blockDiv = document.createElement('div');
            blockDiv.classList.add('participant-block');

            const tag = document.createElement('div');
            tag.classList.add('participant-tag');
            tag.innerHTML = `<i class="ri-user-voice-fill"></i> <span>${personBlock.participant}</span>`;
            blockDiv.appendChild(tag);

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

                const titleEl = panel.querySelector('.theme-title');
                titleEl.addEventListener('click', () => {
                    panel.classList.toggle('open');
                });

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

    // --- GERAÇÃO DO RESUMO FINAL ---
    function generateFinalExport() {
        let finalHtml = `<h1>Resumo de Degravação Minutada</h1><br>`;
        let hasMarkedThemes = false;

        parsedData.forEach(personBlock => {
            let personHtml = `<h2><span style="background:#111;color:#f1c40f;padding:4px 8px;border-radius:4px;">👤 ${personBlock.participant}</span></h2>`;
            let hasThemesForPerson = false;

            personBlock.themes.forEach(theme => {
                const savedTime = localStorage.getItem(`deg_time_${theme.id}`);
                
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
            finalHtml = `
            <div style="text-align:center; padding: 50px; color: #666;">
                <i class="ri-time-line" style="font-size: 3rem;"></i>
                <h3>Nenhum tema foi minutado.</h3>
                <p>Volte para a área de painéis e adicione horários (ex: 12:45) nas caixas à esquerda de cada tema.</p>
            </div>`;
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
