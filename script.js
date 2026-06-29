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

    const btnProcessar = document.getElementById('btn-processar');
    const btnGerarResumo = document.getElementById('btn-gerar-resumo');
    const btnVoltarInicio = document.getElementById('btn-voltar-inicio');
    const btnVoltarWorkspace = document.getElementById('btn-voltar-workspace');
    const btnCopiar = document.getElementById('btn-copiar');

    let parsedData = [];

    // --- FUNÇÕES UTILITÁRIAS ---

    // Gerenciador de LocalStorage à prova de falhas (evita crash em file:///)
    const storage = {
        get: (key) => {
            try { return localStorage.getItem(key) || ''; } 
            catch (e) { return ''; }
        },
        set: (key, val) => {
            try { localStorage.setItem(key, val); } 
            catch (e) { console.warn('Salvamento local bloqueado pelo navegador.'); }
        },
        remove: (key) => {
            try { localStorage.removeItem(key); } 
            catch (e) { }
        }
    };

    // Gera IDs seguros sem usar btoa() que pode falhar com acentuação
    function generateSafeId(str) {
        return str.normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "") // Remove acentos
                  .replace(/[^a-zA-Z0-9]/g, '_')   // Mantém só alfanuméricos
                  .toLowerCase();
    }

    // --- NAVEGAÇÃO ---
    function switchView(viewName) {
        Object.values(views).forEach(view => view.classList.remove('active'));
        views[viewName].classList.add('active');
        
        if (viewName === 'input') {
            headerActions.classList.add('hidden');
        } else {
            headerActions.classList.remove('hidden');
        }
    }

    // --- PARSER ---
    function parseRawText(text) {
        const lines = text.split('\n');
        const result = [];
        let currentPerson = null;
        let currentTheme = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            // Trava de segurança: Encerra ao atingir etapas posteriores
            if (line.toUpperCase().includes('ETAPA 2') || line.toUpperCase().includes('RELATÓRIO ANALÍTICO')) {
                break;
            }

            // Novo Participante (📋)
            if (line.includes('📋')) {
                let name = line.replace(/📋/g, '')
                               .replace(/Depoimento de/gi, '')
                               .replace(/[\*#>]/g, '')
                               .replace(/^[:-]/, '')
                               .trim();

                currentPerson = { participant: name, themes: [] };
                result.push(currentPerson);
                currentTheme = null; 
                continue;
            }

            // Novo Tema (📌)
            if (line.includes('📌')) {
                if (!currentPerson) continue; 

                let title = line.replace(/📌/g, '')
                                .replace(/Tema:/gi, '')
                                .replace(/[\*#>]/g, '')
                                .trim();
                
                const uniqueId = generateSafeId(currentPerson.participant + title).substring(0, 30);

                currentTheme = {
                    id: uniqueId,
                    title: title,
                    rawDialogue: [] 
                };
                currentPerson.themes.push(currentTheme);
                continue;
            }

            // Diálogos da Degravação
            if (currentTheme) {
                if (line.match(/^---+$/)) continue; // Ignora divisores horizontais 
                
                // Sanitiza tags < e > acidentais (ex: <DEGRAVAÇÃO>) para não quebrar o DOM
                line = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                currentTheme.rawDialogue.push(line);
            }
        }

        // Processa o HTML de cada fala
        result.forEach(person => {
            person.themes.forEach(theme => {
                theme.content = formatDialogue(theme.rawDialogue);
            });
        });

        return result.filter(p => p.themes.length > 0);
    }

    // Identifica quem está falando e aplica negrito
    function formatDialogue(linesArray) {
        return linesArray.map(line => {
            const cleanLine = line.replace(/\*\*/g, ''); 
            const firstColon = cleanLine.indexOf(':');
            
            // Heurística: se houver dois pontos no início da frase, é a indicação de interlocutor
            if (firstColon > 0 && firstColon < 80) {
                const speaker = cleanLine.substring(0, firstColon + 1);
                const text = cleanLine.substring(firstColon + 1);
                return `<div class="dialogue-line"><strong>${speaker}</strong>${text}</div>`;
            }
            return `<div class="dialogue-line">${cleanLine}</div>`;
        }).join('');
    }

    // --- RENDERIZAÇÃO DA ÁREA DE TRABALHO ---
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
                const storageKey = `deg_v2_${theme.id}`;
                const savedTime = storage.get(storageKey);

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

                // Expansão do Accordion
                const titleEl = panel.querySelector('.theme-title');
                titleEl.addEventListener('click', () => {
                    panel.classList.toggle('open');
                });

                // Salvamento no LocalStorage 
                const inputEl = panel.querySelector('.time-input');
                inputEl.addEventListener('input', (e) => {
                    const val = e.target.value.trim();
                    if (val) {
                        storage.set(storageKey, val);
                        e.target.classList.add('filled');
                    } else {
                        storage.remove(storageKey);
                        e.target.classList.remove('filled');
                    }
                });

                blockDiv.appendChild(panel);
            });

            panelsContainer.appendChild(blockDiv);
        });
    }

    // --- GERAÇÃO DO RESUMO ---
    function generateFinalExport() {
        let finalHtml = `<h1>Resumo de Degravação Minutada</h1><br>`;
        let hasMarkedThemes = false;

        parsedData.forEach(personBlock => {
            let personHtml = `<h2><span style="background:#111;color:#f1c40f;padding:4px 8px;border-radius:4px;">👤 ${personBlock.participant}</span></h2>`;
            let hasThemesForPerson = false;

            personBlock.themes.forEach(theme => {
                const storageKey = `deg_v2_${theme.id}`;
                const savedTime = storage.get(storageKey);
                
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

    // --- EVENT LISTENERS ---
    btnProcessar.addEventListener('click', () => {
        try {
            const text = rawTextInput.value;
            if (!text.trim()) {
                alert("Por favor, cole a degravação.");
                return;
            }
            parsedData = parseRawText(text);
            renderWorkspace();
            switchView('workspace');
        } catch (error) {
            console.error(error);
            alert("Ocorreu um erro ao processar o texto: " + error.message);
        }
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
            btnCopiar.style.backgroundColor = "#219653"; 
            
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