document.addEventListener('DOMContentLoaded', () => {
    // Referências de Telas
    const views = {
        input: document.getElementById('view-input'),
        tagging: document.getElementById('view-tagging'),
        workspace: document.getElementById('view-workspace'),
        export: document.getElementById('view-export')
    };

    // Referências de Containers
    const taggingContainer = document.getElementById('tagging-list');
    const panelsContainer = document.getElementById('panels-container');
    const finalEditableContent = document.getElementById('final-editable-content');

    // Estado da Aplicação
    let rawLinesData = []; 
    let parsedData = [];   

    // --- FUNÇÕES UTILITÁRIAS ---
    const storage = {
        get: (key) => { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } },
        set: (key, val) => { try { localStorage.setItem(key, val); } catch (e) { } },
        remove: (key) => { try { localStorage.removeItem(key); } catch (e) { } }
    };

    function generateSafeId(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    }

    function switchView(viewName) {
        Object.values(views).forEach(view => view.classList.remove('active'));
        views[viewName].classList.add('active');
        document.getElementById('header-actions').classList.toggle('hidden', viewName === 'input');
    }

    // --- ETAPA 1: PREPARAR TEXTO PARA MARCAÇÃO MANUAL ---
    document.getElementById('btn-preparar').addEventListener('click', () => {
        const text = document.getElementById('raw-text-input').value;
        if (!text.trim()) { alert("Por favor, cole a degravação."); return; }

        // Converte o texto bruto em um Array de objetos
        const lines = text.split('\n');
        rawLinesData = [];
        
        lines.forEach((line, index) => {
            const cleanLine = line.trim();
            if (cleanLine) {
                rawLinesData.push({
                    id: index,
                    text: cleanLine,
                    type: 'text' // Todas as linhas começam como Texto Normal por padrão
                });
            }
        });

        renderTaggingList();
        switchView('tagging');
    });

    // Renderiza a lista para o usuário clicar e marcar
    function renderTaggingList() {
        let html = '';
        rawLinesData.forEach(line => {
            // Escapa HTML para segurança
            const safeText = line.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            html += `
                <div class="tag-row type-${line.type}" data-index="${line.id}">
                    <div class="tag-controls">
                        <button class="t-btn btn-p" onclick="setLineType(${line.id}, 'participant')" title="Definir como Parte">👤 Parte</button>
                        <button class="t-btn btn-t" onclick="setLineType(${line.id}, 'theme')" title="Definir como Tema">📌 Tema</button>
                        <button class="t-btn btn-txt" onclick="setLineType(${line.id}, 'text')" title="Definir como Texto">💬 Texto</button>
                        <button class="t-btn btn-i" onclick="setLineType(${line.id}, 'ignore')" title="Ignorar esta linha">🗑️ Ignorar</button>
                    </div>
                    <div class="tag-content">${safeText}</div>
                </div>
            `;
        });
        taggingContainer.innerHTML = html;
    }

    // Exposta globalmente para ser chamada pelos botões inline
    window.setLineType = function(id, type) {
        const line = rawLinesData.find(l => l.id === id);
        if (line) {
            line.type = type;
            // Atualiza apenas a classe da linha no DOM para performance
            const rowElement = document.querySelector(`.tag-row[data-index="${id}"]`);
            if (rowElement) {
                rowElement.className = `tag-row type-${type}`;
            }
        }
    };

    // --- ETAPA 2: MONTAR PAINÉIS BASEADO NA MARCAÇÃO ---
    document.getElementById('btn-montar-paineis').addEventListener('click', () => {
        parsedData = [];
        let currentPerson = null;
        let currentTheme = null;

        // Constrói a hierarquia seguindo a ordem das linhas marcadas
        rawLinesData.forEach(line => {
            if (line.type === 'ignore') return;

            // Remove resquícios visuais que a IA possa ter gerado, mantendo apenas o texto útil
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
                    // Prevenção: Se marcar um tema antes de uma parte, cria uma parte genérica
                    currentPerson = { participant: "Parte Não Identificada", themes: [] };
                    parsedData.push(currentPerson);
                }
                const uniqueId = generateSafeId(currentPerson.participant + cleanString).substring(0, 30);
                currentTheme = { id: uniqueId, title: cleanString, rawDialogue: [] };
                currentPerson.themes.push(currentTheme);
            } 
            else if (line.type === 'text') {
                if (currentTheme) {
                    // Sanitiza o texto de diálogo
                    let safeDialog = line.text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*/g, '');
                    currentTheme.rawDialogue.push(safeDialog);
                }
            }
        });

        // Aplica o negrito na primeira parte do diálogo (nome de quem fala)
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

        // Limpa partes vazias
        parsedData = parsedData.filter(p => p.themes.length > 0);

        renderWorkspace();
        switchView('workspace');
    });

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
            tag.innerHTML = `<i class="ri-user-voice-fill"></i> <span>${personBlock.participant}</span>`;
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

                // Expansão do painel
                panel.querySelector('.theme-title').addEventListener('click', () => {
                    panel.classList.toggle('open');
                });

                // Salvamento Automático
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

    // --- ETAPA 3: GERAÇÃO DO RESUMO FINAL ---
    document.getElementById('btn-gerar-resumo').addEventListener('click', () => {
        let finalHtml = `<h1>Resumo de Degravação Minutada</h1><br>`;
        let hasMarkedThemes = false;

        parsedData.forEach(personBlock => {
            let personHtml = `<h2><span style="background:#111;color:#f1c40f;padding:4px 8px;border-radius:4px;">👤 ${personBlock.participant}</span></h2>`;
            let hasThemesForPerson = false;

            personBlock.themes.forEach(theme => {
                const savedTime = storage.get(`deg_manual_${theme.id}`);
                
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
                <h3>Nenhum tema minutado.</h3>
                <p>Volte para a área de painéis e adicione os horários.</p>
            </div>`;
        }

        finalEditableContent.innerHTML = finalHtml;
        switchView('export');
    });

    // --- NAVEGAÇÃO SECUNDÁRIA ---
    document.getElementById('btn-voltar-inicio').addEventListener('click', () => {
        if(confirm("Deseja importar um novo texto e perder a marcação atual?")) {
            document.getElementById('raw-text-input').value = '';
            switchView('input');
        }
    });

    document.getElementById('btn-voltar-tagging').addEventListener('click', () => {
        switchView('tagging');
    });

    document.getElementById('btn-voltar-workspace').addEventListener('click', () => {
        switchView('workspace');
    });

    document.getElementById('btn-copiar').addEventListener('click', () => {
        const range = document.createRange();
        range.selectNodeContents(finalEditableContent);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        
        try {
            document.execCommand('copy');
            const btn = document.getElementById('btn-copiar');
            const origHTML = btn.innerHTML;
            btn.innerHTML = `<i class="ri-check-line"></i> Copiado!`;
            btn.style.backgroundColor = "#219653"; 
            setTimeout(() => { 
                btn.innerHTML = origHTML; 
                btn.style.backgroundColor = ""; 
                window.getSelection().removeAllRanges(); 
            }, 2500);
        } catch (err) {
            alert('Falha ao copiar. Pressione Ctrl+C para copiar o texto selecionado.');
        }
    });
});