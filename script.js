document.addEventListener('DOMContentLoaded', () => {
    // --- REFERÊNCIAS DE TELAS E CONTAINERS ---
    const views = {
        input: document.getElementById('view-input'),
        tagging: document.getElementById('view-tagging'),
        workspace: document.getElementById('view-workspace'),
        export: document.getElementById('view-export')
    };

    const taggingContainer = document.getElementById('tagging-list');
    const panelsContainer = document.getElementById('panels-container');
    const finalEditableContent = document.getElementById('final-editable-content');

    // --- ESTADO DA APLICAÇÃO ---
    let rawLinesData = []; 
    let parsedData = [];   

    // --- FUNÇÕES UTILITÁRIAS ---
    const storage = {
        get: (key) => { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } },
        set: (key, val) => { try { localStorage.setItem(key, val); } catch (e) { } },
        remove: (key) => { try { localStorage.removeItem(key); } catch (e) { } }
    };

    function generateSafeId(str) {
        return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    }

    function switchView(viewName) {
        Object.values(views).forEach(view => view.classList.remove('active'));
        views[viewName].classList.add('active');
        const headerActions = document.getElementById('header-actions');
        if (headerActions) {
            headerActions.classList.toggle('hidden', viewName === 'input');
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag));
    }

    // =====================================================================
    // ETAPA 1: PREPARAR TEXTO PARA MARCAÇÃO MANUAL (COM RASTREAMENTO)
    // =====================================================================
    const btnPreparar = document.getElementById('btn-preparar');
    if (btnPreparar) {
        btnPreparar.addEventListener('click', () => {
            const text = document.getElementById('raw-text-input').value;
            if (!text.trim()) { alert("Por favor, cole a degravação."); return; }

            console.log("=== INICIANDO RASTREAMENTO DE PERFORMANCE ===");
            console.time("Tempo Total da Etapa 1");
            
            console.time("1. Divisão do texto em linhas");
            const lines = text.split('\n');
            console.timeEnd("1. Divisão do texto em linhas");
            console.log(`-> Total de linhas identificadas: ${lines.length}`);

            console.time("2. Criação do Array de Objetos");
            rawLinesData = [];
            lines.forEach((line, index) => {
                const cleanLine = line.trim();
                if (cleanLine) {
                    rawLinesData.push({ id: index, text: cleanLine, type: 'text' });
                }
            });
            console.timeEnd("2. Criação do Array de Objetos");
            console.log(`-> Total de linhas não-vazias para renderizar: ${rawLinesData.length}`);

            renderTaggingList();
        });
    }

    function renderTaggingList() {
        console.time("3. Construção da String HTML");
        const html = rawLinesData.map(line => {
            const safeText = escapeHTML(line.text);
            return `
                <div class="tag-row type-${line.type}" data-index="${line.id}">
                    <div class="tag-controls">
                        <button class="t-btn btn-p" data-type="participant" title="Definir como Parte">👤 Parte</button>
                        <button class="t-btn btn-t" data-type="theme" title="Definir como Tema">📌 Tema</button>
                        <button class="t-btn btn-txt" data-type="text" title="Definir como Texto">💬 Texto</button>
                        <button class="t-btn btn-i" data-type="ignore" title="Ignorar esta linha">🗑️ Ignorar</button>
                    </div>
                    <div class="tag-content">${safeText}</div>
                </div>
            `;
        }).join('');
        console.timeEnd("3. Construção da String HTML");
        console.log(`-> Tamanho aproximado da string HTML: ${(html.length / 1024 / 1024).toFixed(2)} MB`);

        console.time("4. Injeção no DOM (innerHTML)");
        try {
            taggingContainer.innerHTML = html;
            console.timeEnd("4. Injeção no DOM (innerHTML)");
            
            console.time("5. Troca de Tela");
            switchView('tagging');
            console.timeEnd("5. Troca de Tela");
            
            console.timeEnd("Tempo Total da Etapa 1");
            console.log("=== SUCESSO! RENDERIZAÇÃO CONCLUÍDA ===");
        } catch (error) {
            console.error("CRASH CAPTURADO NO TRY/CATCH:", error);
        }
    }

    // EVENT DELEGATION: Apenas um listener para todos os milhares de botões
    if (taggingContainer) {
        taggingContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.t-btn');
            if (!btn) return;

            const type = btn.getAttribute('data-type');
            const rowElement = btn.closest('.tag-row');
            const id = parseInt(rowElement.getAttribute('data-index'), 10);

            const line = rawLinesData.find(l => l.id === id);
            if (line) {
                line.type = type;
                rowElement.className = `tag-row type-${type}`;
            }
        });
    }

    // =====================================================================
    // ETAPA 2: MONTAR PAINÉIS E ACCORDIONS
    // =====================================================================
    const btnMontarPaineis = document.getElementById('btn-montar-paineis');
    if (btnMontarPaineis) {
        btnMontarPaineis.addEventListener('click', () => {
            parsedData = [];
            let currentPerson = null;
            let currentTheme = null;

            rawLinesData.forEach(line => {
                if (line.type === 'ignore') return;

                let cleanString = line.text.replace(/📋|📌|\[DEPOIMENTO\]|\[TEMA\]|>\||\|<|>#|#</gi, '')
                                           .replace(/Depoimento de/gi, '')
                                           .replace(/Tema:/gi, '')
                                           .replace(/\*\*/g, '').trim();

                if (line.type === 'participant') {
                    cleanString = cleanString.replace(/^[:-]/, '').trim();
                    currentPerson = { participant: cleanString, themes: [] };
                    parsedData.push(currentPerson);
                    currentTheme = null;
                } 
                else if (line.type === 'theme') {
                    if (!currentPerson) {
                        currentPerson = { participant: "Parte Não Identificada", themes: [] };
                        parsedData.push(currentPerson);
                    }
                    const uniqueId = generateSafeId(currentPerson.participant + cleanString).substring(0, 30);
                    currentTheme = { id: uniqueId, title: cleanString, rawDialogue: [] };
                    currentPerson.themes.push(currentTheme);
                } 
                else if (line.type === 'text') {
                    if (currentTheme) {
                        // Sanitiza o texto de diálogo também na montagem
                        let safeDialog = escapeHTML(line.text).replace(/\*\*/g, '');
                        currentTheme.rawDialogue.push(safeDialog);
                    }
                }
            });

            // Aplica o negrito na primeira parte do diálogo
            parsedData.forEach(person => {
                person.themes.forEach(theme => {
                    theme.content = theme.rawDialogue.map(dialogLine => {
                        const firstColon = dialogLine.indexOf(':');
                        if (firstColon > 0 && firstColon < 80) {
                            return `<div class="dialogue-line"><strong>${dialogLine.substring(0, firstColon + 1)}</strong>${dialogLine.substring(firstColon + 1)}</div>`;
                        }
                        return `<div class="dialogue-line">${dialogLine}</div>`;
                    }).join('');
                });
            });

            // Limpa participantes sem temas
            parsedData = parsedData.filter(p => p.themes.length > 0);

            renderWorkspace();
            switchView('workspace');
        });
    }

    function renderWorkspace() {
        panelsContainer.innerHTML = '';

        if (parsedData.length === 0) {
            panelsContainer.innerHTML = `
                <div style="background: #fee; color: #c00; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #fcc;">
                    <i class="ri-error-warning-line" style="font-size: 2rem;"></i>
                    <h3>Nenhum painel montado.</h3>
                    <p>Você precisa marcar pelo menos uma linha como <strong>Parte</strong> e uma como <strong>Tema</strong> na etapa anterior.</p>
                </div>`;
            return;
        }

        parsedData.forEach(personBlock => {
            const blockDiv = document.createElement('div');
            blockDiv.classList.add('participant-block');

            const tag = document.createElement('div');
            tag.classList.add('participant-tag');
            tag.innerHTML = `<i class="ri-user-voice-fill"></i> <span>${escapeHTML(personBlock.participant)}</span>`;
            blockDiv.appendChild(tag);

            personBlock.themes.forEach(theme => {
                const storageKey = `deg_manual_${theme.id}`;
                const savedTime = storage.get(storageKey);

                const panel = document.createElement('div');
                panel.classList.add('theme-panel');
                
                panel.innerHTML = `
                    <div class="theme-header">
                        <div class="time-input-container">
                            <i class="ri-time-line"></i>
                            <input type="text" class="time-input ${savedTime ? 'filled' : ''}" 
                                   placeholder="00:00" value="${escapeHTML(savedTime)}" 
                                   title="Insira a minutagem">
                        </div>
                        <div class="theme-title">
                            <span>${escapeHTML(theme.title)}</span> 
                            <i class="ri-arrow-down-s-line"></i>
                        </div>
                    </div>
                    <div class="theme-content">
                        ${theme.content}
                    </div>
                `;

                // Accordion (Abrir/Fechar painel)
                panel.querySelector('.theme-title').addEventListener('click', () => {
                    panel.classList.toggle('open');
                });

                // Auto-save do Input de Tempo
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

    // =====================================================================
    // ETAPA 3: GERAÇÃO DO RESUMO FINAL
    // =====================================================================
    const btnGerarResumo = document.getElementById('btn-gerar-resumo');
    if (btnGerarResumo) {
        btnGerarResumo.addEventListener('click', () => {
            let finalHtml = `<h1>Resumo de Degravação Minutada</h1><br>`;
            let hasMarkedThemes = false;

            parsedData.forEach(personBlock => {
                let personHtml = `<h2><span style="background:#111;color:#f1c40f;padding:4px 8px;border-radius:4px;">👤 ${escapeHTML(personBlock.participant)}</span></h2>`;
                let hasThemesForPerson = false;

                personBlock.themes.forEach(theme => {
                    const savedTime = storage.get(`deg_manual_${theme.id}`);
                    
                    if (savedTime) {
                        hasMarkedThemes = true;
                        hasThemesForPerson = true;
                        personHtml += `
                            <h3 style="color:#2c3e50; margin-top: 15px;">⏱️ [${escapeHTML(savedTime)}] - 📌 ${escapeHTML(theme.title)}</h3>
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
                    <h3>Nenhum tema minutado.</h3>
                    <p>Volte para a área de painéis e adicione os horários para gerar o resumo.</p>
                </div>`;
            }

            finalEditableContent.innerHTML = finalHtml;
            switchView('export');
        });
    }

    // =====================================================================
    // NAVEGAÇÃO E AÇÕES EXTRAS
    // =====================================================================
    const btnVoltarInicio = document.getElementById('btn-voltar-inicio');
    if (btnVoltarInicio) {
        btnVoltarInicio.addEventListener('click', () => {
            if(confirm("Deseja importar um novo texto e perder a marcação atual?")) {
                document.getElementById('raw-text-input').value = '';
                switchView('input');
            }
        });
    }

    const btnVoltarTagging = document.getElementById('btn-voltar-tagging');
    if (btnVoltarTagging) {
        btnVoltarTagging.addEventListener('click', () => switchView('tagging'));
    }

    const btnVoltarWorkspace = document.getElementById('btn-voltar-workspace');
    if (btnVoltarWorkspace) {
        btnVoltarWorkspace.addEventListener('click', () => switchView('workspace'));
    }

    const btnCopiar = document.getElementById('btn-copiar');
    if (btnCopiar) {
        btnCopiar.addEventListener('click', () => {
            const range = document.createRange();
            range.selectNodeContents(finalEditableContent);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            
            try {
                document.execCommand('copy');
                const origHTML = btnCopiar.innerHTML;
                btnCopiar.innerHTML = `<i class="ri-check-line"></i> Copiado!`;
                btnCopiar.style.backgroundColor = "#219653"; 
                setTimeout(() => { 
                    btnCopiar.innerHTML = origHTML; 
                    btnCopiar.style.backgroundColor = ""; 
                    window.getSelection().removeAllRanges(); 
                }, 2500);
            } catch (err) {
                alert('Falha ao copiar. Pressione Ctrl+C para copiar o texto selecionado.');
            }
        });
    }
});