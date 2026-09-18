/**
 * AgentFlow — Multi-Agent AI Orchestration Dashboard (v2)
 *
 * Simulates CrewAI (sequential crew) and LangGraph (cyclic graph with a
 * conditional critique→revision edge) agent orchestration.
 *
 * Architecture notes:
 *  - Explicit phase state machine: idle → research → summarize → critic → deliver
 *  - Agents communicate ONLY through the shared memory object (blackboard pattern)
 *  - Canvas nodes are synced to the DOM positions of the agent cards each frame
 *  - LangGraph mode lets the Critic loop the Summarizer back for revision
 */
'use strict';

/* ============================== Configuration ============================== */

const AGENTS = {
    research:  { name: 'Research Agent',  color: '#60a5fa', phase: 1 },
    summarize: { name: 'Summarize Agent', color: '#a78bfa', phase: 2 },
    critic:    { name: 'Critic Agent',    color: '#f472b6', phase: 3 }
};

const PHASES = ['research', 'summarize', 'critic', 'deliver'];

const FRAMEWORKS = {
    crewai: {
        label: 'CrewAI',
        hint: 'Sequential crew: agents hand off through shared memory.',
        tokenMultiplier: 1.0,
        maxRevisions: 0,          // single pass — CrewAI hands off once
        approvalThreshold: 0      // critic never loops the graph back
    },
    langgraph: {
        label: 'LangGraph',
        hint: 'Stateful graph: the Critic can loop the Summarizer back via a conditional edge.',
        tokenMultiplier: 1.15,
        maxRevisions: 2,          // conditional edge may fire up to twice
        approvalThreshold: 82     // quality score required to reach END
    }
};

const MODELS = {
    'gpt-4':   { label: 'GPT-4',    speed: 1.0, tokenScale: 1.0 },
    'claude-3':{ label: 'Claude 3', speed: 0.9, tokenScale: 0.9 },
    'local':   { label: 'Local LLM',speed: 1.6, tokenScale: 1.4 }
};

/* ============================== State ============================== */

const state = {
    isRunning: false,
    phase: 'idle',            // 'idle' | 'research' | 'summarize' | 'critic' | 'deliver' | 'done'
    iteration: 0,             // LangGraph loop counter
    framework: 'crewai',
    model: 'gpt-4',
    tokens: 0,
    startTime: null,
    rafId: null,
    stopRequested: false,
    /** Shared blackboard — the ONLY way agents exchange data. */
    memory: {
        'research.raw':   null,
        'summary.draft':  null,
        'critique.notes': null,
        'output.final':   null
    },
    logs: []
};

/* ============================== DOM ============================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
    taskInput: $('#task-input'),
    frameworkChips: $$('.chip'),
    frameworkHint: $('#framework-hint'),
    modelSelect: $('#model-select'),
    btnRun: $('#btn-run'),
    btnReset: $('#btn-reset'),
    btnClearLogs: $('#btn-clear-logs'),
    console: $('#console'),
    finalOutput: $('#final-output'),
    btnCopyOutput: $('#btn-copy-output'),
    btnExportMd: $('#btn-export-md'),
    statusState: $('#status-state'),
    statusFramework: $('#status-framework'),
    statusModel: $('#status-model'),
    memoryNode: $('#memory-node'),
    canvasContainer: $('#canvas-container'),
    canvas: $('#network-canvas'),
    modal: $('#architecture-modal'),
    btnViewArch: $('#btn-view-architecture'),
    modalClose: $('#modal-close'),
    memorySlots: {
        research: $('#mem-research'),
        summary: $('#mem-summary'),
        critique: $('#mem-critique'),
        final: $('#mem-final')
    },
    steps: {
        research: $('#step-research'),
        summarize: $('#step-summarize'),
        critic: $('#step-critic'),
        final: $('#step-final')
    },
    connectors: $$('.pipeline-connector')
};

const ctx = els.canvas.getContext('2d');

/* ============================== Init ============================== */

document.addEventListener('DOMContentLoaded', init);

function init() {
    setupCanvas();
    bindEvents();
    drawNetwork();
    setStatusPill('idle');
    log('System initialized. Agents standing by: Research → Summarize → Critic.', 'system');
}

function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = els.canvas.getBoundingClientRect();
    els.canvas.width = rect.width * dpr;
    els.canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function bindEvents() {
    els.btnRun.addEventListener('click', runWorkflow);
    els.btnReset.addEventListener('click', resetWorkflow);
    els.btnClearLogs.addEventListener('click', () => {
        els.console.innerHTML = '';
        state.logs = [];
    });

    els.frameworkChips.forEach(chip => {
        chip.addEventListener('click', () => {
            if (state.isRunning) return;
            els.frameworkChips.forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-checked', 'false');
            });
            chip.classList.add('active');
            chip.setAttribute('aria-checked', 'true');
            state.framework = chip.dataset.framework;
            els.frameworkHint.textContent = FRAMEWORKS[state.framework].hint;
            els.statusFramework.textContent = FRAMEWORKS[state.framework].label;
            log('Switched framework to ' + FRAMEWORKS[state.framework].label + '.', 'system');
        });
    });

    els.modelSelect.addEventListener('change', () => {
        state.model = els.modelSelect.value;
        els.statusModel.textContent = MODELS[state.model].label;
        log('Model set to ' + MODELS[state.model].label + ' (simulated).', 'system');
    });

    els.btnCopyOutput.addEventListener('click', copyOutput);
    els.btnExportMd.addEventListener('click', exportMarkdown);

    els.btnViewArch.addEventListener('click', openModal);
    els.modalClose.addEventListener('click', closeModal);
    els.modal.querySelector('[data-close]').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.modal.classList.contains('active')) closeModal();
    });

    window.addEventListener('resize', () => {
        setupCanvas();
        drawNetwork();
    });
}

function openModal() {
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
}

/* ============================== Shared memory (blackboard) ============================== */

/**
 * Agents never call each other directly — they read/write the blackboard.
 * Writing pulses the memory node on the canvas and updates the sidebar panel.
 */
function writeMemory(key, value) {
    state.memory[key] = value;
    const short = String(value).replace(/\s+/g, ' ').slice(0, 26) + (String(value).length > 26 ? '…' : '');
    const slotKey = key.split('.')[0];
    const slot = els.memorySlots[slotKey === 'output' ? 'final' : slotKey];
    if (slot) {
        slot.textContent = short;
        slot.classList.remove('empty');
        const wrapper = slot.closest('.memory-slot');
        wrapper.classList.add('written');
        setTimeout(() => wrapper.classList.remove('written'), 900);
    }
    els.memoryNode.classList.add('pulse');
    setTimeout(() => els.memoryNode.classList.remove('pulse'), 900);
    log('[memory] write ' + key + ' (' + String(value).length + ' chars)', 'memory');
}

function readMemory(key) {
    log('[memory] read  ' + key, 'memory');
    return state.memory[key];
}

/* ============================== Workflow state machine ============================== */

async function runWorkflow() {
    const topic = els.taskInput.value.trim();
    if (!topic) {
        log('Please enter a research topic first.', 'error');
        els.taskInput.focus();
        return;
    }
    if (state.isRunning) return;

    prepareRun();

    try {
        /* Phase 1 — Research */
        await enterPhase('research');
        await researchPhase(topic);

        /* LangGraph graph body: summarize → critic → (conditional edge) → summarize… */
        let approved = false;
        while (!approved) {
            /* Phase 2 — Summarize */
            await enterPhase('summarize');
            await summarizePhase(topic);

            /* Phase 3 — Critique */
            await enterPhase('critic');
            const verdict = await criticPhase(topic);

            if (verdict.approved) {
                approved = true;
            } else if (state.iteration < FRAMEWORKS[state.framework].maxRevisions) {
                state.iteration += 1;
                updateMetric('iterations', state.iteration);
                log('[Orchestrator] Conditional edge fired: critic ↛ summarizer (revision ' + state.iteration + ')', 'system');
                setStep('critic', '');       // graph loops back
                setStep('summarize', '');
                setConnector(1, false);
            } else {
                log('[Orchestrator] Max revisions reached — forwarding best effort to deliver.', 'system');
                approved = true;
            }
        }

        /* Phase 4 — Deliver */
        await enterPhase('deliver');
        await deliverPhase(topic);

        finishRun();
    } catch (err) {
        if (state.stopRequested) {
            log('Workflow stopped by user.', 'system');
        } else {
            log('Workflow error: ' + err.message, 'error');
        }
        cleanupRun();
    }
}

function prepareRun() {
    hardReset();
    state.isRunning = true;
    state.stopRequested = false;
    state.startTime = Date.now();
    els.btnRun.disabled = true;
    els.btnRun.innerHTML = '<span class="btn-icon">⏳</span> Running…';
    els.btnReset.textContent = 'Stop';
    setStatusPill('running');
    startAnimation();

    log('Starting ' + FRAMEWORKS[state.framework].label + ' workflow on ' + MODELS[state.model].label + ' (simulated).', 'system');
    log('Task: "' + topicPreview() + '"', 'system');
}

function finishRun() {
    const latency = Date.now() - state.startTime;
    updateMetric('latency', latency + 'ms');
    updateMetric('agents', '3/3');
    setPhase('done');
    setStatusPill('done');
    log('Workflow completed in ' + latency + 'ms — output.final committed to shared memory.', 'success');
    cleanupRun();
}

function cleanupRun() {
    state.isRunning = false;
    stopAnimation();
    els.btnRun.disabled = false;
    els.btnRun.innerHTML = '<span class="btn-icon">▶</span> Deploy Agents';
    els.btnReset.textContent = 'Reset';
    if (state.phase !== 'done' && state.phase !== 'idle') setStatusPill('idle');
}

async function enterPhase(phase) {
    setPhase(phase);
    const idx = PHASES.indexOf(phase);
    setStep(phase === 'deliver' ? 'final' : phase, 'active');
    if (idx > 0) setConnector(idx - 1, true);
    log('[Orchestrator] Entering state: ' + phase.toUpperCase(), 'system');
}

function setPhase(phase) {
    state.phase = phase;
    drawNetwork();
}

/* ============================== Agent phases ============================== */

async function researchPhase(topic) {
    setAgentCard('agent-research', 'active', 'Gathering data…');
    log('[Research Agent] Tools: web_search, arxiv, calculator. Reading memory…', 'research');
    readMemory('research.raw');

    const findings = generateResearch(topic);
    for (const finding of findings) {
        await think(750, 1250);
        if (state.stopRequested) throw new Error('stopped');
        log('[Research Agent] ' + finding, 'research');
        addTokens(40 + Math.floor(Math.random() * 20));
    }

    writeMemory('research.raw', findings.join('\n'));
    await think(400, 700);
    setAgentCard('agent-research', 'done', 'Complete');
    setStep('research', 'done');
    updateMetric('agents', '1/3');
    log('[Research Agent] Handoff: wrote findings to shared memory for Summarize Agent.', 'research');
}

async function summarizePhase(topic) {
    setAgentCard('agent-summarize', 'active', 'Synthesizing…');
    const raw = readMemory('research.raw');
    const critique = readMemory('critique.notes');

    if (critique) {
        log('[Summarize Agent] Revision requested. Applying critique notes…', 'summarize');
    } else {
        log('[Summarize Agent] Read research.raw (' + (raw ? raw.length : 0) + ' chars). Beginning synthesis…', 'summarize');
    }

    await think(900, 1500);
    log('[Summarize Agent] Identifying key themes and patterns…', 'summarize');
    addTokens(Math.round(110 * MODELS[state.model].tokenScale));

    await think(1000, 1600);
    log('[Summarize Agent] Compressing into structured summary…', 'summarize');
    addTokens(Math.round(80 * MODELS[state.model].tokenScale));

    const summary = generateSummary(topic, critique);
    writeMemory('summary.draft', summary);

    await think(500, 900);
    setAgentCard('agent-summarize', 'done', 'Complete');
    setStep('summarize', 'done');
    updateMetric('agents', '2/3');
    log('[Summarize Agent] Handoff: draft committed for Critic Agent review.', 'summarize');
}

async function criticPhase(topic) {
    setAgentCard('agent-critic', 'active', 'Reviewing…');
    log('[Critic Agent] Read summary.draft. Initiating quality assurance…', 'critic');
    readMemory('summary.draft');

    await think(800, 1300);
    log('[Critic Agent] Checking factual consistency and source coverage…', 'critic');
    addTokens(Math.round(55 * MODELS[state.model].tokenScale));

    await think(900, 1400);
    log('[Critic Agent] Verifying logical coherence and scanning for bias…', 'critic');
    addTokens(Math.round(40 * MODELS[state.model].tokenScale));

    const { critique, score } = generateCritique(topic, state.iteration);
    await think(500, 900);
    log('[Critic Agent] Quality score: ' + score + '/100', 'critic');
    log('[Critic Agent] ' + critique, 'critic');
    writeMemory('critique.notes', critique);

    const threshold = FRAMEWORKS[state.framework].approvalThreshold;
    const approved = score >= threshold;
    await think(400, 800);

    if (approved) {
        setAgentCard('agent-critic', 'done', 'Approved · ' + score + '/100');
        log('[Critic Agent] Approved. Routing to END.', 'critic');
    } else {
        setAgentCard('agent-critic', 'active', 'Revise needed · ' + score + '/100');
        log('[Critic Agent] Below threshold (' + threshold + '). Requesting revision via conditional edge.', 'critic');
    }

    setStep('critic', 'done');
    updateMetric('agents', '3/3');
    return { approved, score, critique };
}

async function deliverPhase(topic) {
    const research = readMemory('research.raw') || '';
    const summary = readMemory('summary.draft') || '';
    const critique = readMemory('critique.notes') || '';

    await think(500, 900);
    const finalText = generateFinalOutput(topic, research, summary, critique, state.iteration);
    writeMemory('output.final', finalText);

    const safeTopic = escapeHtml(topic);
    els.finalOutput.innerHTML =
        '<h4 style="margin-bottom:0.75rem;color:#818cf8;">Executive Summary: ' + safeTopic + '</h4>' +
        '<div style="white-space:pre-wrap;line-height:1.7;">' + escapeHtml(finalText) + '</div>' +
        '<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #374151;font-size:0.8125rem;color:#6b7280;">' +
            'Generated by AgentFlow · Framework: ' + FRAMEWORKS[state.framework].label +
            ' · Model: ' + MODELS[state.model].label +
            ' · Graph iterations: ' + (state.iteration + 1) +
            ' · ' + new Date().toLocaleString() +
        '</div>';

    setStep('final', 'done');
    log('Final output rendered from output.final.', 'success');
}

/* ============================== Reset / stop ============================== */

function resetWorkflow() {
    if (state.isRunning) {
        state.stopRequested = true;   // graceful stop — phases check this flag
        log('Stop requested — halting after current step…', 'system');
        return;
    }
    hardReset();
    log('System reset. Ready.', 'system');
}

function hardReset() {
    state.phase = 'idle';
    state.iteration = 0;
    state.tokens = 0;
    state.stopRequested = false;
    Object.keys(state.memory).forEach(k => { state.memory[k] = null; });

    els.console.innerHTML = '';
    els.finalOutput.innerHTML = '<p class="placeholder">Agent output will appear here...</p>';

    Object.keys(els.steps).forEach(k => setStep(k, ''));
    els.connectors.forEach(c => c.classList.remove('active'));

    ['agent-research', 'agent-summarize', 'agent-critic'].forEach(id => setAgentCard(id, '', 'Idle'));

    Object.values(els.memorySlots).forEach(slot => {
        slot.textContent = '—';
        slot.classList.add('empty');
    });

    updateMetric('agents', '0/3');
    updateMetric('iterations', '0');
    updateMetric('tokens', '0');
    updateMetric('latency', '0ms');
    setStatusPill('idle');
    drawNetwork();
}

/* ============================== Canvas visualization ============================== */

/**
 * Node positions are read from the actual DOM agent cards, so the graph and
 * the cards can never drift apart (a bug in v1, where they were hardcoded
 * separately).
 */
function getNodes() {
    const containerRect = els.canvasContainer.getBoundingClientRect();
    const center = (id) => {
        const el = document.getElementById(id);
        if (!el) return { x: 0, y: 0 };
        const r = el.getBoundingClientRect();
        return {
            x: r.left - containerRect.left + r.width / 2,
            y: r.top - containerRect.top + r.height / 2
        };
    };
    return {
        research: center('agent-research'),
        summarize: center('agent-summarize'),
        critic: center('agent-critic'),
        memory: center('memory-node')
    };
}

function drawNetwork() {
    const dpr = window.devicePixelRatio || 1;
    const w = els.canvas.width / dpr;
    const h = els.canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const nodes = getNodes();
    const flow = ['research', 'summarize', 'critic'];
    const phaseIdx = PHASES.indexOf(state.phase);   // -1 idle, 0..3 running

    /* Handoff edges between agents */
    flow.forEach((id, i) => {
        const reached = state.phase === 'done' || phaseIdx > i;
        drawEdge(nodes[id], nodes[flow[i + 1]], reached, AGENTS[id].color);
    });

    /* Blackboard edges: each agent talks to shared memory */
    flow.forEach((id, i) => {
        const active = state.phase === id;
        drawEdge(nodes[id], nodes.memory, active, active ? AGENTS[id].color : '#374151', active);
    });

    /* LangGraph conditional edge: critic ↛ summarize (revision loop) */
    if (FRAMEWORKS[state.framework].maxRevisions > 0) {
        drawCurvedEdge(nodes.critic, nodes.summarize, '#f59e0b');
    }

    /* Memory node */
    const memActive = state.phase !== 'idle' && state.phase !== 'done';
    drawMemoryNode(nodes.memory, memActive);

    /* Agent nodes */
    flow.forEach((id, i) => {
        const active = state.phase === id;
        const done = state.phase === 'done' || phaseIdx > i;
        drawNode(nodes[id], AGENTS[id], active, done);
    });

    /* Data packet: travels active agent ↔ shared memory */
    if (state.isRunning && state.phase !== 'deliver') {
        const activeId = flow[Math.min(Math.max(phaseIdx, 0), flow.length - 1)];
        drawDataPacket(nodes[activeId], nodes.memory, AGENTS[activeId].color);
    }
}

function drawEdge(a, b, active, color, glow) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = active ? color : '#374151';
    ctx.lineWidth = active ? 2.5 : 1.5;
    if (!active) ctx.setLineDash([5, 5]);
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
    ctx.stroke();
    ctx.restore();
}

function drawCurvedEdge(a, b, color) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2 + 60, a.y + 110, b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.restore();
}

function drawMemoryNode(pos, active) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
    if (active) {
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 14;
    } else {
        ctx.fillStyle = '#4b5563';
    }
    ctx.fill();
    ctx.restore();
}

function drawNode(pos, agent, active, done) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2);
    if (done) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx.strokeStyle = '#10b981';
    } else if (active) {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
        ctx.strokeStyle = agent.color;
        ctx.shadowColor = agent.color;
        ctx.shadowBlur = 18;
    } else {
        ctx.fillStyle = 'rgba(31, 41, 55, 0.8)';
        ctx.strokeStyle = '#4b5563';
    }
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = done ? '#10b981' : active ? agent.color : '#9ca3af';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(agent.name.replace(' Agent', ''), pos.x, pos.y - 38);
    ctx.restore();
}

function drawDataPacket(from, to, color) {
    const t = (Date.now() % 1200) / 1200;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
}

/* Animation loop — started on run, cancelled on cleanup (was dead code in v1). */
function startAnimation() {
    stopAnimation();
    const loop = () => {
        if (!state.isRunning) return;
        drawNetwork();
        state.rafId = requestAnimationFrame(loop);
    };
    state.rafId = requestAnimationFrame(loop);
}

function stopAnimation() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    drawNetwork();
}

/* ============================== Simulated content ============================== */

function generateResearch(topic) {
    const t = topic.toLowerCase();
    if (t.includes('quantum') || t.includes('computing')) {
        return [
            'Identified 12 peer-reviewed papers on quantum cryptography (2024–2026)',
            'NIST post-quantum cryptography standards finalized in 2025',
            "Shor's algorithm threatens RSA-2048 at ~4000 logical qubits",
            'Quantum security market projected at $12B by 2028',
            'Emerging trend: lattice-based cryptography adoption in banking'
        ];
    }
    if (t.includes('climate') || t.includes('warming') || t.includes('energy')) {
        return [
            'IPCC 2025 assessment: 1.5°C pathway narrowing but still open',
            '8 critical tipping points flagged, incl. AMOC collapse risk',
            'Renewable adoption accelerated 340% since 2020',
            'Carbon capture constrained by $/ton scalability ceiling',
            'Policy shift: 47 countries committed to net-zero by 2035'
        ];
    }
    if (t.includes('ai') || t.includes('artificial intelligence') || t.includes('agent')) {
        return [
            'Transformer architecture evolution mapped (2023–2026)',
            '15 major LLM releases logged with parameter counts and benchmarks',
            'EU AI Act enforcement began 2025; compliance tooling surging',
            'Training costs dropped ~60% via optimization and distillation',
            'Multi-modal agents now dominate enterprise adoption surveys'
        ];
    }
    return [
        'Retrieved 24 relevant sources on "' + topic + '" from academic databases',
        'Key stakeholders and primary market drivers identified',
        'Historical trends analyzed; growth curves projected',
        '3 conflicting viewpoints flagged for synthesis',
        'Emerging sub-topic detected with high citation velocity'
    ];
}

function generateSummary(topic, priorCritique) {
    const revisionNote = priorCritique
        ? ' The prior draft was revised to address reviewer feedback: ' + priorCritique
        : '';
    return 'Based on comprehensive research, ' + topic + ' represents a significant paradigm shift with broad stakeholder implications. Findings indicate accelerating adoption, regulation lagging behind capability, and emerging risks that demand proactive mitigation.' + revisionNote;
}

function generateCritique(topic, iteration) {
    const pool = [
        { text: 'Gap: limited coverage of edge-case scenarios in developing markets.', penalty: 14 },
        { text: 'Strength: quantitative claims well-sourced; add comparative frameworks.', penalty: 8 },
        { text: 'Bias risk: sources skew Western; diversify geographic representation.', penalty: 18 },
        { text: 'Solid structure; deepen the counter-argument section.', penalty: 10 }
    ];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    /* Later iterations trend better — revision actually improves the score. */
    const score = Math.min(99, 88 + Math.floor(Math.random() * 10) - pick.penalty + iteration * 6);
    return { critique: pick.text, score };
}

function generateFinalOutput(topic, research, summary, critique, iterations) {
    const numbered = research.split('\n').filter(Boolean).map((l, i) => (i + 1) + '. ' + l).join('\n');
    return 'EXECUTIVE SUMMARY\n==================\nTopic: ' + topic + '\n\nFINDINGS:\n' + numbered +
        '\n\nSYNTHESIS:\n' + summary +
        '\n\nCRITIQUE & REVISIONS:\n' + critique +
        '\nThe draft passed quality review after ' + (iterations + 1) + ' graph iteration(s).' +
        '\n\nCONCLUSION:\nThe multi-agent analysis confirms that ' + topic + ' demands strategic attention: prioritize adaptive frameworks, cross-functional collaboration, and continuous monitoring.' +
        '\n\n---\nGenerated via AgentFlow · Agents: Research → Summarize → Critic\nFramework: ' + FRAMEWORKS[state.framework].label;
}

/* ============================== UI helpers ============================== */

function setStep(id, status) {
    const step = els.steps[id];
    if (step) step.className = 'pipeline-step' + (status ? ' ' + status : '');
}

function setConnector(index, active) {
    if (els.connectors[index]) els.connectors[index].classList.toggle('active', active);
}

function setAgentCard(id, status, text) {
    const card = document.getElementById(id);
    if (!card) return;
    card.classList.remove('active', 'done');
    if (status) card.classList.add(status);
    const statusEl = card.querySelector('.agent-status');
    if (statusEl) statusEl.textContent = text;
}

function setStatusPill(kind) {
    els.statusState.classList.remove('status-idle', 'status-running', 'status-done');
    if (kind === 'running') { els.statusState.textContent = 'Running'; els.statusState.classList.add('status-running'); }
    else if (kind === 'done') { els.statusState.textContent = 'Done'; els.statusState.classList.add('status-done'); }
    else { els.statusState.textContent = 'Idle'; els.statusState.classList.add('status-idle'); }
}

function updateMetric(id, value) {
    const el = $('#metric-' + id);
    if (el) el.textContent = value;
}

function addTokens(n) {
    const scaled = Math.round(n * FRAMEWORKS[state.framework].tokenMultiplier);
    state.tokens += scaled;
    updateMetric('tokens', state.tokens.toLocaleString());
}

function log(message, type) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const line = document.createElement('div');
    line.className = 'console-line ' + type;
    const ts = document.createElement('span');
    ts.className = 'timestamp';
    ts.textContent = '[' + time + ']';
    line.appendChild(ts);
    line.appendChild(document.createTextNode(message));
    els.console.appendChild(line);
    els.console.scrollTop = els.console.scrollHeight;
    state.logs.push({ time, message, type });
}

function copyOutput() {
    const text = els.finalOutput.innerText;
    if (!text || text.includes('Agent output will appear')) return;
    navigator.clipboard.writeText(text).then(
        () => log('Output copied to clipboard.', 'success'),
        () => log('Clipboard unavailable (non-secure context?).', 'error')
    );
}

function exportMarkdown() {
    const text = els.finalOutput.innerText;
    if (!text || text.includes('Agent output will appear')) {
        log('Nothing to export yet.', 'error');
        return;
    }
    const md = '# AgentFlow Output\n\n**Topic:** ' + els.taskInput.value.trim() +
        '\n**Framework:** ' + FRAMEWORKS[state.framework].label +
        '\n**Model:** ' + MODELS[state.model].label +
        '\n**Date:** ' + new Date().toISOString() +
        '\n\n---\n\n' + text + '\n\n---\n\n*Generated by AgentFlow Multi-Agent AI System*';
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agentflow-output.md';
    a.click();
    URL.revokeObjectURL(url);
    log('Exported as Markdown.', 'success');
}

/* ============================== Utilities ============================== */

function think(min, max) {
    const speed = MODELS[state.model].speed;
    return delay((min + Math.random() * (max - min)) * speed);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function topicPreview() {
    const t = els.taskInput.value.trim();
    return t.length > 60 ? t.slice(0, 60) + '…' : t;
}