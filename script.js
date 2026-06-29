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

    // --- NOVO PARSER "RELAXADO" (Linha a Linha) ---
    function parseRawText(text) {
        const lines = text.split('\n');
        const result = [];
        let currentPerson = null;
        let currentTheme = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            // TRAVA DE SEGURANÇA: Se chegar na Etapa 2, para de extrair (evita sujeira)
            if (line.includes('ETAPA 2') || line.includes('RELATÓRIO ANALÍTICO')) {
                break;
            }

            // 1. Encontrou a prancheta? É um novo participante.
            if (line.includes('📋')) {
                // Limpa tudo que não interessa, pegando só o nome
                let name = line.replace(/📋/g, '')
                               .replace(/Depoimento de/gi, '')
                               .replace(/[\*\*>]/g, '') // remove asteriscos e sinais de maior
                               .trim();
                
                // Remove dois pontos ou hífens no começo, se houver
                name = name.replace(/^[:-]/, '').trim();

                currentPerson = { participant: name, themes: [] };
                result.push(currentPerson);
                currentTheme = null; // Reseta o tema pois mudou a pessoa
                continue;
            }

            // 2. Encontrou o alfinete? É um novo tema.
            if (line.includes('📌')) {
                if (!currentPerson) continue; // Ignora se a IA colocou tema antes da pessoa

                // Limpa sujeiras do título do tema
                let title = line.replace(/📌/g, '')
                                .replace(/Tema:/gi, '')
                                .replace(/[\*\*>]/g, '')
                                .trim();
                
                // Cria um ID único para salvar o tempo
                const uniqueId = btoa(unescape(encodeURIComponent(currentPerson.participant + title))).substring(0, 15);

                currentTheme = {
                    id: uniqueId,
                    title: title,
                    rawDialogue: [] // Vai guardar as falas temporariamente
                };
                currentPerson.themes.push(currentTheme);
                continue;
            }

            // 3. Se não é participante nem tema, e tem um tema aberto, é fala (diálogo)!
            if (currentTheme) {
                // Ignora linhas que são só tracinhos "---"
                if (line.match(/^---+$/)) continue;
                
                currentTheme.rawDialogue.push(line);
            }
        }

        // Processa os diálogos brutos para HTML formatado
        result.forEach(person => {
            person.themes.forEach(theme => {
                theme.content = formatDialogue(theme.rawDialogue);
            });
        });

        // Retorna apenas participantes que tenham pelo menos 1 tema
        return result.filter(p => p.themes.length > 0);
    }

    // Estiliza os diálogos (deixa o nome do falante em destaque)
    function formatDialogue(linesArray) {
        return linesArray.map(line => {
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
                <div style="background: #fee; color: #c00; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #fcc;">
                    <i class="ri-error-warning-line" style="font-size: 2rem;"></i>
                    <h3>Nenhum dado encontrado!</h3>
                    <p>Certifique-se de que o texto colado contém os emojis <strong>📋</strong> para as partes e <strong>📌</strong> para os temas.</p>
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
            btnCopiar.innerHTML = `<i class="ri-check-line"></i> Copiado!`;
            btnCopiar.style.backgroundColor = "#219653";
            setTimeout(() => {
                btnCopiar.innerHTML = `<i class="ri-clipboard-line"></i> Copiar para Área de Transferência`;
                btnCopiar.style.backgroundColor = "";
            }, 3000);
        } catch (err) {
            alert('Falha ao copiar. Pressione Ctrl+C para copiar o texto selecionado.');
        }
    });
});
