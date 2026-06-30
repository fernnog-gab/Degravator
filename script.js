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
        Object.values(views).forEach(view => {
            view.classList.remove('active');
            view.classList.remove('hidden');
        });
        
        if (views[viewName]) {
            views[viewName].classList.add('active');
        }
        
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
    // ETAPA 1: PREPARAR TEXTO PARA MARCAÇÃO MANUAL
    // =====================================================================
    const btnPreparar = document.getElementById('btn-preparar');
    if (btnPreparar) {
        btnPreparar.addEventListener('click', () => {
            const text = document.getElementById('raw-text-input').value;
            if (!text.trim()) { alert("Por favor, cole a degravação."); return; }

            const lines = text.split('\n');
            rawLinesData = [];
            
            lines.forEach((line, index) => {
                const cleanLine = line.trim();
                if (cleanLine) {
                    let initialType = 'text';
                    const uppercaseText = cleanLine.toUpperCase();
                    
                    // Lógica Heurística PROATIVA (Define o tipo real em vez de sugerir cor)
                    if (uppercaseText.includes('👤') || uppercaseText.includes('DEPOIMENTO DE')) {
                        initialType = 'participant';
                    } else if (uppercaseText.includes('📌') || uppercaseText.includes('TEMA:')) {
                        initialType = 'theme';
                    }
                    
                    rawLinesData.push({ id: index, text: cleanLine, type: initialType });
                }
            });

            renderTaggingList();
        });
    }

    function generateRowHTML(line) {
        const safeText = escapeHTML(line.text);
        return `
            <div class="tag-row type-${line.type}" data-index="${line.id}">
                <div class="tag-controls">
                    <button class="t-btn btn-p" data-type="participant" title="Definir como Parte"><i class="ri-user-3-line"></i> Parte</button>
                    <button class="t-btn btn-t" data-type="theme" title="Definir como Tema"><i class="ri-pushpin-line"></i> Tema</button>
                    <button class="t-btn btn-txt" data-type="text" title="Definir como Texto"><i class="ri-message-3-line"></i> Texto</button>
                    <button class="t-btn btn-i" data-type="ignore" title="Ignorar este trecho"><i class="ri-eye-off-line"></i> Ignorar</button>
                </div>
                <div class="tag-content" data-original-text="${safeText}">${safeText}</div>
            </div>
        `;
    }

    function renderTaggingList() {
        let html = '';
        let textBuffer = [];
        
        const flushTextBuffer = () => {
            if (textBuffer.length > 0) {
                html += `
                    <div class="text-group-wrapper">
                        <div class="text-group-header">
                            <i class="ri-arrow-right-s-line"></i> Textos Ocultos Automáticos (${textBuffer.length} linhas)
                        </div>
                        <div class="text-group-content">
                            ${textBuffer.map(line => generateRowHTML(line)).join('')}
                        </div>
                    </div>
                `;
                textBuffer = [];
            }
        };

        rawLinesData.forEach(line => {
            if (line.type === 'text') {
                textBuffer.push(line);
            } else {
                flushTextBuffer();
                html += generateRowHTML(line);
            }
        });
        flushTextBuffer();

        try {
            taggingContainer.innerHTML = html;
            switchView('tagging');
        } catch (error) {
            console.error("ERRO AO INJETAR DOM:", error);
        }
    }

    // =====================================================================
    // INTELIGÊNCIA DE DELEGAÇÃO DE EVENTOS E IGNORAR EM MASSA
    // =====================================================================
    if (taggingContainer) {
        taggingContainer.addEventListener('click', (e) => {
            // 1. Tratamento do clique no Header do Acordeão (Event Delegation)
            const header = e.target.closest('.text-group-header');
            if (header) {
                header.parentElement.classList.toggle('open');
                return; // Interrompe a execução
            }

            // 2. Tratamento da reclassificação manual (Mutação Cirúrgica, Sem Re-render)
            const btn = e.target.closest('.t-btn');
            if (!btn) return;

            const targetType = btn.getAttribute('data-type');
            const rowElement = btn.closest('.tag-row');
            const id = parseInt(rowElement.getAttribute('data-index'), 10);

            const currentIndex = rawLinesData.findIndex(l => l.id === id);
            if (currentIndex === -1) return;

            const line = rawLinesData[currentIndex];
            const previousType = line.type;

            // Limpeza de estado UI caso a linha fosse um sumário e está sendo reclassificada
            if (rowElement.classList.contains('is-summary')) {
                rowElement.classList.remove('is-summary');
                const contentEl = rowElement.querySelector('.tag-content');
                contentEl.innerHTML = contentEl.dataset.originalText; // Restaura estado com segurança
            }

            line.type = targetType;
            // Atualiza o estado da aplicação e o DOM individual (Performance ganha aqui)
            rowElement.className = `tag-row type-${targetType}`; 

            // UX: Se um texto escondido virou Tema/Parte, força a abertura do contêiner para o usuário ver
            const parentWrapper = rowElement.closest('.text-group-wrapper');
            if (parentWrapper && targetType !== 'text' && targetType !== 'ignore') {
                parentWrapper.classList.add('open');
            } 

            if (targetType === 'ignore') {
                let endIndex = rawLinesData.length;

                if (previousType === 'theme') {
                    for (let i = currentIndex + 1; i < rawLinesData.length; i++) {
                        if (rawLinesData[i].type === 'theme' || rawLinesData[i].type === 'participant') {
                            endIndex = i; break;
                        }
                    }
                } else if (previousType === 'participant') {
                    for (let i = currentIndex + 1; i < rawLinesData.length; i++) {
                        if (rawLinesData[i].type === 'participant') {
                            endIndex = i; break;
                        }
                    }
                } else {
                    endIndex = -1; // Se era texto simples, ignora apenas a si mesmo.
                }

                if (endIndex !== -1 && endIndex > currentIndex + 1) {
                    const countIgnored = endIndex - currentIndex - 1;
                    
                    // Muta visualmente a linha atual para ser o cabeçalho do colapso
                    rowElement.classList.add('is-summary');
                    rowElement.querySelector('.tag-content').innerHTML = `
                        <i class="ri-eye-off-fill"></i> Trecho ocultado em massa (${countIgnored} linhas)
                    `;

                    // Colapsa os filhos no DOM e altera estado
                    for (let i = currentIndex + 1; i < endIndex; i++) {
                        rawLinesData[i].type = 'ignore';
                        const siblingRow = taggingContainer.querySelector(`.tag-row[data-index="${rawLinesData[i].id}"]`);
                        if (siblingRow) {
                            siblingRow.className = 'tag-row type-ignore is-collapsed';
                        }
                    }
                }
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
                        let safeDialog = escapeHTML(line.text).replace(/\*\*/g, '');
                        currentTheme.rawDialogue.push(safeDialog);
                    }
                }
            });

            parsedData.forEach(person => {
                person.themes.forEach(theme => {
                    // 1. Inteligência: Descobrir quem são os oradores únicos deste tema
                    const speakersSet = new Set();
                    theme.rawDialogue.forEach(dialogLine => {
                        const firstColon = dialogLine.indexOf(':');
                        if (firstColon > 0 && firstColon < 80) {
                            speakersSet.add(dialogLine.substring(0, firstColon + 1).trim());
                        }
                    });
                    
                    // Transforma o Set em Array e codifica para o HTML
                    const themeSpeakers = Array.from(speakersSet);
                    const safeSpeakersJSON = escapeHTML(JSON.stringify(themeSpeakers));

                    // 2. Montagem do HTML com as Tags Interativas
                    theme.content = theme.rawDialogue.map(dialogLine => {
                        const firstColon = dialogLine.indexOf(':');
                        if (firstColon > 0 && firstColon < 80) {
                            const currentSpeaker = escapeHTML(dialogLine.substring(0, firstColon + 1).trim());
                            const speechText = escapeHTML(dialogLine.substring(firstColon + 1));
                            
                            // Cria a tag com o dataset de opções
                            return `<div class="dialogue-line">
                                        <span class="speaker-tag" data-options="${safeSpeakersJSON}" title="Clique para trocar o orador">${currentSpeaker}</span>
                                        <span class="editable-text" contenteditable="true">${speechText}</span>
                                    </div>`;
                        }
                        return `<div class="dialogue-line"><span class="editable-text" contenteditable="true">${escapeHTML(dialogLine)}</span></div>`;
                    }).join('');
                });
            });

            parsedData = parsedData.filter(p => p.themes.length > 0);

            renderWorkspace();
            switchView('workspace');
        });
    }

    // Utilitário seguro para reverter Entities
    const decodeHTML = (html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return doc.documentElement.textContent;
    };

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
                        <div class="theme-title" style="display:flex; align-items:center; flex-grow:1; justify-content:space-between;">
                            <div>
                                <span class="editable-text theme-name" contenteditable="true">${escapeHTML(theme.title)}</span>
                                <i class="ri-pencil-line edit-icon"></i>
                            </div>
                            <div style="display:flex; align-items:center; gap: 8px;">
                                <button class="btn-copy-theme" title="Copiar bloco de texto do tema">
                                    <i class="ri-clipboard-line"></i>
                                </button>
                                <div class="accordion-toggle" style="cursor:pointer; padding: 5px;">
                                    <i class="ri-arrow-down-s-line" style="font-size:1.5rem;"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="theme-content">
                        ${theme.content}
                    </div>
                `;

                // CORREÇÃO CRÍTICA DO EVENT BUBBLING: Restrito apenas ao ícone/div do botão
                panel.querySelector('.accordion-toggle').addEventListener('click', (e) => {
                    panel.classList.toggle('open');
                });

                // Evento de cópia do tema (com sanitização reversa)
                const copyBtn = panel.querySelector('.btn-copy-theme');
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Evita conflito com o abrir/fechar do painel
                    
                    // Lê o texto atualizado diretamente do DOM (garantindo que edições inline e trocas de tag sejam capturadas)
                    const linesToCopy = Array.from(panel.querySelectorAll('.dialogue-line')).map(line => {
                        return line.innerText.trim();
                    });
                    const textToCopy = linesToCopy.join('\n\n');
                    
                    navigator.clipboard.writeText(textToCopy).then(() => {
                        copyBtn.innerHTML = '<i class="ri-check-double-line"></i>';
                        copyBtn.style.color = 'var(--success-color)';
                        setTimeout(() => { 
                            copyBtn.innerHTML = '<i class="ri-clipboard-line"></i>'; 
                            copyBtn.style.color = '';
                        }, 2000);
                    }).catch(err => alert('Erro ao copiar texto.'));
                });

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

            const participantBlocks = panelsContainer.querySelectorAll('.participant-block');

            participantBlocks.forEach(blockDiv => {
                // Se houvesse contenteditable no nome da parte, leríamos daqui. Como padrão, pega o original
                const participantName = blockDiv.querySelector('.participant-tag span').innerText.trim();
                
                let personHtml = `<h2><span style="background:#111;color:#f1c40f;padding:4px 8px;border-radius:4px;">👤 ${escapeHTML(participantName)}</span></h2>`;
                let hasThemesForPerson = false;

                const themes = blockDiv.querySelectorAll('.theme-panel');
                themes.forEach(panel => {
                    const timeInput = panel.querySelector('.time-input');
                    const savedTime = timeInput ? timeInput.value.trim() : '';
                    
                    if (savedTime) {
                        hasMarkedThemes = true;
                        hasThemesForPerson = true;
                        
                        const themeTitleEl = panel.querySelector('.theme-name');
                        const themeTitle = themeTitleEl ? themeTitleEl.innerText.trim() : 'Sem Título';
                        
                        // Clonagem profunda para limpar propriedades de UI (contenteditable) antes do print
                        const contentClone = panel.querySelector('.theme-content').cloneNode(true);
                        contentClone.querySelectorAll('.editable-text').forEach(el => {
                            el.removeAttribute('contenteditable');
                            el.classList.remove('editable-text');
                        });

                        personHtml += `
                            <h3 style="color:#2c3e50; margin-top: 15px;">⏱️ [${escapeHTML(savedTime)}] - 📌 ${escapeHTML(themeTitle)}</h3>
                            <div style="padding-left:15px; border-left: 3px solid #ccc; margin-bottom: 20px;">
                                ${contentClone.innerHTML}
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
    // MOTOR DAS TAGS DE PALESTRANTES (SPEAKER CYCLING)
    // =====================================================================
    if (panelsContainer) {
        panelsContainer.addEventListener('click', (e) => {
            const speakerTag = e.target.closest('.speaker-tag');
            if (speakerTag) {
                try {
                    // Recupera o array de oradores únicos daquele tema
                    const rawOptions = speakerTag.getAttribute('data-options');
                    // Desfaz o escape HTML (para aspas duplas) e gera o Array
                    const options = JSON.parse(rawOptions.replace(/&quot;/g, '"'));
                    
                    // Se a IA só detectou 1 pessoa falando no tema inteiro, não há o que alternar
                    if (options.length <= 1) return; 

                    const currentSpeaker = speakerTag.innerText.trim();
                    let currentIndex = options.indexOf(currentSpeaker);
                    
                    // Se não achar (segurança), volta pro índice 0. Se achar, pula +1.
                    let nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % options.length;
                    
                    // Atualiza o texto na tela
                    speakerTag.innerText = options[nextIndex];
                    
                    // Feedback visual animado
                    speakerTag.classList.add('changed');
                    setTimeout(() => speakerTag.classList.remove('changed'), 250);

                } catch (err) {
                    console.error('Erro ao rotacionar palestrante:', err);
                }
            }
        });
    }

    // =====================================================================
    // NAVEGAÇÃO E BOTÕES DE AÇÃO
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