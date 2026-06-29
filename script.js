document.addEventListener('DOMContentLoaded', () => {
    const views = {
        input: document.getElementById('view-input'),
        workspace: document.getElementById('view-workspace'),
        export: document.getElementById('view-export')
    };
    const headerActions = document.getElementById('header-actions');
    const rawTextInput = document.getElementById('raw-text-input');
    const panelsContainer = document.getElementById('panels-container');
    const finalEditableContent = document.getElementById('final-editable-content');

    const btnProcessar = document.getElementById('btn-processar');
    const btnGerarResumo = document.getElementById('btn-gerar-resumo');
    const btnVoltarInicio = document.getElementById('btn-voltar-inicio');
    const btnVoltarWorkspace = document.getElementById('btn-voltar-workspace');
    const btnCopiar = document.getElementById('btn-copiar');

    let parsedData = [];

    // Gerencia a transição de telas
    function switchView(viewName) {
        Object.values(views).forEach(view => view.classList.remove('active'));
        views[viewName].classList.add('active');
        
        if (viewName === 'input') {
            headerActions.classList.add('hidden');
        } else {
            headerActions.classList.remove('hidden');
        }
    }

    // Parser à prova de falhas: ignora formatação Markdown e confia apenas nos emojis e limites definidos
    function parseRawText(text) {
        const lines = text.split('\n');
        const result = [];
        let currentPerson = null;
        let currentTheme = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            // Encerra imediatamente ao encontrar o marcador da Etapa 2
            if (line.includes('ETAPA 2') || line.includes('RELATÓRIO ANALÍTICO')) {
                break;
            }

            // Novo Participante
            if (line.includes('📋')) {
                let name = line.replace(/📋/g, '')
                               .replace(/Depoimento de/gi, '')
                               .replace(/[\*#>]/g, '') // Remove ruídos comuns de markdown
                               .replace(/^[:-]/, '')  // Remove traços/dois pontos iniciais
                               .trim();

                currentPerson = { participant: name, themes: [] };
                result.push(currentPerson);
                currentTheme = null; 
                continue;
            }

            // Novo Tema
            if (line.includes('📌')) {
                if (!currentPerson) continue; 

                let title = line.replace(/📌/g, '')
                                .replace(/Tema:/gi, '')
                                .replace(/[\*#>]/g, '')
                                .trim();
                
                // Gera uma chave segura para o LocalStorage
                const uniqueId = btoa(unescape(encodeURIComponent(currentPerson.participant + title))).substring(0, 20);

                currentTheme = {
                    id: uniqueId,
                    title: title,
                    rawDialogue: [] 
                };
                currentPerson.themes.push(currentTheme);
                continue;
            }

            // Falas / Diálogos
            if (currentTheme) {
                if (line.match(/^---+$/)) continue; // Ignora divisores horizontais isolados
                currentTheme.rawDialogue.push(line);
            }
        }

        result.forEach(person => {
            person.themes.forEach(theme => {
                theme.content = formatDialogue(theme.rawDialogue);
            });
        });

        return result.filter(p => p.themes.length > 0);
    }

    // Aplica negrito aos interlocutores com base na posição dos "dois pontos", dispensando RegEx de Markdown
    function formatDialogue(linesArray) {
        return linesArray.map(line => {
            // Remove o markdown nativo caso a LLM tenha gerado parcialmente
            const cleanLine = line.replace(/\*\*/g, ''); 
            
            const firstColon = cleanLine.indexOf(':');
            
            // Se houver dois pontos na primeira parte da string (limite razoável de 60 caracteres)
            if (firstColon > 0 && firstColon < 60) {
                const speaker = cleanLine.substring(0, firstColon + 1);
                const text = cleanLine.substring(firstColon + 1);
                return `<div class="dialogue-line"><strong>${speaker}</strong>${text}</div>`;
            }
            return `<div class="dialogue-line">${cleanLine}</div>`;
        }).join('');
    }

    // Renderiza a interface da Área de Trabalho
    function renderWorkspace() {
        panelsContainer.innerHTML = '';

        if (parsedData.length === 0) {
            panelsContainer.innerHTML = `
                <div style="background: #fee; color: #c00; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #fcc;">
                    <i class="ri-error-warning-line" style="font-size: 2rem;"></i>
                    <h3>Nenhum dado válido encontrado.</h3>
                    <p>Certifique-se de que o texto colado contém <strong>📋</strong> para as partes e <strong>📌</strong> para os temas.</p>
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
                const storageKey = `degravacao_time_${theme.id}`;
                const savedTime = localStorage.getItem(storageKey) || '';

                const panel = document.createElement('div');
                panel.classList.add('theme-panel');
                
                panel.innerHTML = `
                    <div class="theme-header">
                        <div class="time-input-container">
                            <i class="ri-time-line"></i>
                            <input type="text" class="time-input ${savedTime ? 'filled' : ''}" 
                                   placeholder="00:00" value="${savedTime}" 
                                   title="Insira a minutagem">
                        </div>
                        <div class="theme-title">
                            <span>${theme.title}</span> 
                            <i class="ri-arrow-down-s-line"></i>
                        </div>
                    </div>
                    <div class="theme-content">
                        ${theme.content}
                    </div>
                `;

                // Controle do Accordion
                const titleEl = panel.querySelector('.theme-title');
                titleEl.addEventListener('click', () => {
                    panel.classList.toggle('open');
                });

                // Salvamento automático da minutagem
                const inputEl = panel.querySelector('.time-input');
                inputEl.addEventListener('input', (e) => {
                    const val = e.target.value.trim();
                    if (val) {
                        localStorage.setItem(storageKey, val);
                        e.target.classList.add('filled');
                    } else {
                        localStorage.removeItem(storageKey);
                        e.target.classList.remove('filled');
                    }
                });

                blockDiv.appendChild(panel);
            });

            panelsContainer.appendChild(blockDiv);
        });
    }

    // Gera o Resumo Final baseado apenas nos temas com minutagem preenchida
    function generateFinalExport() {
        let finalHtml = `<h1>Resumo de Degravação Minutada</h1><br>`;
        let hasMarkedThemes = false;

        parsedData.forEach(personBlock => {
            let personHtml = `<h2><span style="background:#111;color:#f1c40f;padding:4px 8px;border-radius:4px;">👤 ${personBlock.participant}</span></h2>`;
            let hasThemesForPerson = false;

            personBlock.themes.forEach(theme => {
                const storageKey = `degravacao_time_${theme.id}`;
                const savedTime = localStorage.getItem(storageKey);
                
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

    // Listeners
    btnProcessar.addEventListener('click', () => {
        const text = rawTextInput.value;
        if (!text.trim()) {
            alert("Por favor, cole a degravação.");
            return;
        }
        parsedData = parseRawText(text);
        renderWorkspace();
        switchView('workspace');
    });

    btnGerarResumo.addEventListener('click', generateFinalExport);

    btnVoltarInicio.addEventListener('click', () => {
        if(confirm("Deseja importar um novo texto?")) {
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
            const originalHtml = btnCopiar.innerHTML;
            btnCopiar.innerHTML = `<i class="ri-check-line"></i> Copiado!`;
            btnCopiar.classList.remove('btn-success');
            btnCopiar.style.backgroundColor = "#219653"; // Feedback visual
            
            setTimeout(() => {
                btnCopiar.innerHTML = originalHtml;
                btnCopiar.style.backgroundColor = "";
                selection.removeAllRanges();
            }, 2500);
        } catch (err) {
            alert('Falha ao copiar. Pressione Ctrl+C para copiar o texto selecionado.');
        }
    });
});
