document.addEventListener('DOMContentLoaded', () => {
    const views = {
        input: document.getElementById('view-input'),
        workspace: document.getElementById('view-workspace'),
        export: document.getElementById('view-export')
    };
    const panelsContainer = document.getElementById('panels-container');
    const finalEditableContent = document.getElementById('final-editable-content');

    // Estado central da aplicação (Virtual DOM)
    let linesState = [];

    // --- UTILITÁRIOS ---
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

    // --- PARSER INICIAL (Tenta adivinhar, mas deixa a decisão final para o humano) ---
    function processInitialText(rawText) {
        const rawLines = rawText.split('\n');
        
        linesState = rawLines.map((line) => {
            let clean = line.trim();
            if (!clean) return null;
            if (clean.toUpperCase().includes('ETAPA 2')) return 'STOP'; // Trava

            let type = 'text';

            // Auto-detecção permissiva (para poupar seu tempo)
            if (clean.includes('📋') || clean.includes('>|') || clean.includes('[DEPOIMENTO]')) type = 'participant';
            if (clean.includes('📌') || clean.includes('>#') || clean.includes('[TEMA]')) type = 'theme';

            // Limpa as sujeiras geradas pela IA
            clean = clean.replace(/📋|📌|\[DEPOIMENTO\]|\[TEMA\]|>\||\|<|>#|#</gi, '')
                         .replace(/Depoimento de/gi, '')
                         .replace(/Tema:/gi, '')
                         .replace(/\*\*/g, '')
                         .replace(/^[:-]/, '')
                         .trim();

            return {
                rawText: line,
                cleanText: clean,
                type: type,
                time: '',
                isOpen: true
            };
        });

        // Remove nulos e linhas após ETAPA 2
        const stopIndex = linesState.indexOf('STOP');
        if (stopIndex !== -1) linesState = linesState.slice(0, stopIndex);
        linesState = linesState.filter(l => l !== null);

        recalculateContext();
    }

    // Vincula a minutagem do LocalStorage baseada no contexto atual (Participante + Tema)
    function recalculateContext() {
        let currentPart = 'desconhecido';
        linesState.forEach(line => {
            if (line.type === 'participant') {
                currentPart = line.cleanText;
            } else if (line.type === 'theme') {
                line.storageKey = `deg_ui_${generateSafeId(currentPart + '_' + line.cleanText).substring(0, 30)}`;
                line.time = storage.get(line.storageKey);
            }
        });
    }

    // --- RENDERIZADOR DO WORKSPACE ---
    function renderWorkspace() {
        let html = '';
        let hideText = false;

        if (linesState.length === 0) {
            panelsContainer.innerHTML = `<div style="padding: 20px; text-align: center;">Nenhum texto inserido.</div>`;
            return;
        }

        linesState.forEach((line, i) => {
            // Lógica de sanfona (Accordion)
            if (line.type === 'participant') hideText = false;
            else if (line.type === 'theme') hideText = !line.isOpen;
            else if (line.type === 'text' && hideText) return; // Pula a renderização se o tema estiver fechado

            // Menu Flutuante de Edição Rápida
            const controls = `
                <div class="line-controls">
                    <button class="btn-ctrl ${line.type === 'participant' ? 'active' : ''}" data-action="set-type" data-index="${i}" data-type="participant" title="Transformar em Participante">👤</button>
                    <button class="btn-ctrl ${line.type === 'theme' ? 'active' : ''}" data-action="set-type" data-index="${i}" data-type="theme" title="Transformar em Tema">📌</button>
                    <button class="btn-ctrl ${line.type === 'text' ? 'active' : ''}" data-action="set-type" data-index="${i}" data-type="text" title="Rebaixar para Texto Normal">💬</button>
                </div>
            `;

            let contentHTML = '';
            if (line.type === 'participant') {
                contentHTML = `<div class="participant-tag"><i class="ri-user-voice-fill"></i> <span>${line.cleanText}</span></div>`;
            } else if (line.type === 'theme') {
                contentHTML = `
                    <div class="theme-panel">
                        <div class="time-input-container">
                            <i class="ri-time-line"></i>
                            <input type="text" class="time-input ${line.time ? 'filled' : ''}" data-action="time" data-index="${i}" placeholder="00:00" value="${line.time}">
                        </div>
                        <div class="theme-title" data-action="toggle" data-index="${i}">
                            <span>${line.cleanText}</span> 
                            <i class="ri-arrow-down-s-line" style="transform: ${line.isOpen ? 'rotate(180deg)' : 'rotate(0)'}"></i>
                        </div>
                    </div>`;
            } else {
                // Heurística visual de formatação do diálogo
                let formattedText = line.rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const firstColon = formattedText.indexOf(':');
                if (firstColon > 0 && firstColon < 60) {
                    formattedText = `<strong>${formattedText.substring(0, firstColon + 1)}</strong>${formattedText.substring(firstColon + 1)}`;
                }
                contentHTML = `<div class="dialogue-content">${formattedText}</div>`;
            }

            html += `<div class="line-row type-${line.type}">${controls}<div class="line-wrapper">${contentHTML}</div></div>`;
        });

        panelsContainer.innerHTML = html;
    }

    // --- DELEGAÇÃO DE EVENTOS (Performance e Código Limpo) ---
    panelsContainer.addEventListener('click', (e) => {
        const btnType = e.target.closest('[data-action="set-type"]');
        if (btnType) {
            const index = parseInt(btnType.dataset.index);
            linesState[index].type = btnType.dataset.type;
            recalculateContext();
            renderWorkspace();
            return;
        }

        const btnToggle = e.target.closest('[data-action="toggle"]');
        if (btnToggle) {
            const index = parseInt(btnToggle.dataset.index);
            linesState[index].isOpen = !linesState[index].isOpen;
            renderWorkspace();
        }
    });

    panelsContainer.addEventListener('input', (e) => {
        const inputTime = e.target.closest('[data-action="time"]');
        if (inputTime) {
            const index = parseInt(inputTime.dataset.index);
            const val = inputTime.value.trim();
            const line = linesState[index];
            
            line.time = val;
            if (val) {
                storage.set(line.storageKey, val);
                inputTime.classList.add('filled');
            } else {
                storage.remove(line.storageKey);
                inputTime.classList.remove('filled');
            }
        }
    });

    // --- GERAÇÃO DO RESUMO FINAL (Estruturado em Árvore) ---
    function generateFinalExport() {
        let exportTree = [];
        let currP = null;
        let currT = null;

        // Reconstrói a árvore baseado no estado linear
        linesState.forEach(line => {
            if (line.type === 'participant') {
                currP = { name: line.cleanText, themes: [] };
                exportTree.push(currP);
                currT = null;
            } else if (line.type === 'theme') {
                if (!currP) return;
                currT = { title: line.cleanText, time: line.time, texts: [] };
                currP.themes.push(currT);
            } else if (line.type === 'text') {
                if (currT) currT.texts.push(line);
            }
        });

        let finalHtml = `<h1>Resumo de Degravação Minutada</h1><br>`;
        let hasData = false;

        exportTree.forEach(person => {
            const validThemes = person.themes.filter(t => t.time); // Só exporta se tiver tempo preenchido
            if (validThemes.length === 0) return;

            hasData = true;
            finalHtml += `<h2><span style="background:#111;color:#f1c40f;padding:4px 8px;border-radius:4px;">👤 ${person.name}</span></h2>`;
            
            validThemes.forEach(theme => {
                finalHtml += `<h3 style="color:#2c3e50; margin-top: 15px;">⏱️ [${theme.time}] - 📌 ${theme.title}</h3>`;
                finalHtml += `<div style="padding-left:15px; border-left: 3px solid #ccc; margin-bottom: 20px;">`;
                
                theme.texts.forEach(textLine => {
                    let text = textLine.rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const colon = text.indexOf(':');
                    if (colon > 0 && colon < 60) text = `<strong>${text.substring(0, colon + 1)}</strong>${text.substring(colon + 1)}`;
                    finalHtml += `<div style="margin-bottom:0.5rem;">${text}</div>`;
                });
                
                finalHtml += `</div>`;
            });
            finalHtml += `<hr style="margin:20px 0;">`;
        });

        if (!hasData) {
            finalHtml = `
            <div style="text-align:center; padding: 50px; color: #666;">
                <i class="ri-time-line" style="font-size: 3rem;"></i>
                <h3>Nenhum tema foi minutado.</h3>
                <p>Volte e adicione horários nas caixas de texto dos temas.</p>
            </div>`;
        }

        finalEditableContent.innerHTML = finalHtml;
        switchView('export');
    }

    // --- CONTROLES GERAIS ---
    document.getElementById('btn-processar').addEventListener('click', () => {
        const text = document.getElementById('raw-text-input').value;
        if (!text.trim()) { alert("Por favor, cole a degravação."); return; }
        processInitialText(text);
        renderWorkspace();
        switchView('workspace');
    });

    document.getElementById('btn-gerar-resumo').addEventListener('click', generateFinalExport);
    
    document.getElementById('btn-voltar-inicio').addEventListener('click', () => {
        if(confirm("Deseja importar um novo texto?")) {
            document.getElementById('raw-text-input').value = '';
            switchView('input');
        }
    });

    document.getElementById('btn-voltar-workspace').addEventListener('click', () => switchView('workspace'));

    document.getElementById('btn-copiar').addEventListener('click', () => {
        const range = document.createRange();
        range.selectNodeContents(finalEditableContent);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        
        try {
            document.execCommand('copy');
            const btn = document.getElementById('btn-copiar');
            const orig = btn.innerHTML;
            btn.innerHTML = `<i class="ri-check-line"></i> Copiado!`;
            btn.style.backgroundColor = "#219653"; 
            setTimeout(() => { btn.innerHTML = orig; btn.style.backgroundColor = ""; window.getSelection().removeAllRanges(); }, 2500);
        } catch (err) { alert('Falha ao copiar. Pressione Ctrl+C.'); }
    });
});