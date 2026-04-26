/**
 * AgentFlow — Multi-Agent AI System Dashboard
 * Simulates CrewAI / LangGraph agent orchestration
 */

const state = {
    isRunning: false,
    currentStep: 0,
    framework: 'crewai',
    tokens: 0,
    startTime: null,
    researchData: '',
    summaryData: '',
    finalData: '',
    logs: []
};

const els = {
    taskInput: document.getElementById('task-input'),
    frameworkChips: document.querySelectorAll('.chip'),
    modelSelect: document.getElementById('model-select'),
    btnRun: document.getElementById('btn-run'),
    btnReset: document.getElementById('btn-reset'),
    btnClearLogs: document.getElementById('btn-clear-logs'),
    console: document.getElementById('console'),
    finalOutput: document.getElementById('final-output'),
    btnCopyOutput: document.getElementById('btn-copy-output'),
    btnExportMd: document.getElementById('btn-export-md'),
    metricAgents: document.getElementById('metric-agents'),
    metricTasks: document.getElementById('metric-tasks'),
    metricTokens: document.getElementById('metric-tokens'),
    metricLatency: document.getElementById('metric-latency'),
    agentResearch: document.getElementById('agent-research'),
    agentSummarize: document.getElementById('agent-summarize'),
    agentCritic: document.getElementById('agent-critic'),
    steps: {
        research: document.getElementById('step-research'),
        summarize: document.getElementById('step-summarize'),
        critic: document.getElementById('step-critic'),
        final: document.getElementById('step-final')
    },
    connectors: document.querySelectorAll('.pipeline-connector'),
    canvas: document.getElementById('network-canvas'),
    modal: document.getElementById('architecture-modal'),
    btnViewArch: document.getElementById('btn-view-architecture'),
    modalClose: document.getElementById('modal-close')
};

const ctx = els.canvas.getContext('2d');

function init() {
    setupCanvas();
    drawNetwork();
    attachListeners();
    log('System initialized. Ready to orchestrate agents.', 'system');
}

function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = els.canvas.getBoundingClientRect();
    els.canvas.width = rect.width * dpr;
    els.canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
}

function attachListeners() {
    els.btnRun.addEventListener('click', runSimulation);
    els.btnReset.addEventListener('click', resetSimulation);
    els.btnClearLogs.addEventListener('click', () => {
        els.console.innerHTML = '';
        state.logs = [];
    });
    
    els.frameworkChips.forEach(chip => {
        chip.addEventListener('click', () => {
            els.frameworkChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.framework = chip.dataset.framework;
            log('Switched to ' + state.framework.toUpperCase() + ' framework', 'system');
        });
    });
    
    els.btnCopyOutput.addEventListener('click', () => {
        const text = els.finalOutput.innerText;
        if (!text || text.includes('Agent output will appear')) return;
        navigator.clipboard.writeText(text).then(() => {
            log('Output copied to clipboard', 'success');
        });
    });
    
    els.btnExportMd.addEventListener('click', exportMarkdown);
    
    els.btnViewArch.addEventListener('click', () => {
        els.modal.classList.add('active');
    });
    els.modalClose.addEventListener('click', () => {
        els.modal.classList.remove('active');
    });
    els.modal.querySelector('.modal-overlay').addEventListener('click', () => {
        els.modal.classList.remove('active');
    });
    
    window.addEventListener('resize', () => {
        setupCanvas();
        drawNetwork();
    });
}

function drawNetwork() {
    const w = els.canvas.width / (window.devicePixelRatio || 1);
    const h = els.canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);
    
    const nodes = [
        { x: w * 0.2, y: h * 0.5, label: 'Research' },
        { x: w * 0.5, y: h * 0.3, label: 'Summarize' },
        { x: w * 0.8, y: h * 0.6, label: 'Critic' }
    ];
    
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    drawEdge(nodes[0], nodes[1], state.currentStep >= 1);
    drawEdge(nodes[1], nodes[2], state.currentStep >= 2);
    
    if (state.currentStep >= 3) {
        ctx.strokeStyle = '#10b981';
        ctx.setLineDash([]);
        drawCurvedEdge(nodes[2], nodes[1]);
    }
    
    ctx.setLineDash([]);
    
    nodes.forEach((node, i) => {
        const isActive = (i === 0 && state.currentStep === 1) ||
                        (i === 1 && state.currentStep === 2) ||
                        (i === 2 && state.currentStep === 3);
        const isDone = (i === 0 && state.currentStep > 1) ||
                      (i === 1 && state.currentStep > 2) ||
                      (i === 2 && state.currentStep > 3);
        drawNode(node.x, node.y, node.label, isActive, isDone);
    });
    
    if (state.isRunning && state.currentStep > 0 && state.currentStep < 4) {
        drawDataPacket(nodes[state.currentStep - 1], nodes[state.currentStep]);
    }
}

function drawEdge(a, b, active) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = active ? '#6366f1' : '#374151';
    ctx.lineWidth = active ? 3 : 2;
    ctx.stroke();
}

function drawCurvedEdge(a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2, a.y + 80, b.x, b.y);
    ctx.stroke();
}

function drawNode(x, y, label, active, done) {
    const r = 35;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    
    if (done) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx.strokeStyle = '#10b981';
    } else if (active) {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
        ctx.strokeStyle = '#6366f1';
        ctx.shadowColor = '#6366f1';
        ctx.shadowBlur = 20;
    } else {
        ctx.fillStyle = 'rgba(31, 41, 55, 0.8)';
        ctx.strokeStyle = '#4b5563';
        ctx.shadowBlur = 0;
    }
    
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = done ? '#10b981' : active ? '#818cf8' : '#9ca3af';
    ctx.font = '600 11px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 5);
}

function drawDataPacket(from, to) {
    const t = (Date.now() % 1000) / 1000;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
}

function animateNetwork() {
    if (state.isRunning) {
        drawNetwork();
        requestAnimationFrame(animateNetwork);
    }
}

async function runSimulation() {
    const topic = els.taskInput.value.trim();
    if (!topic) {
        log('Please enter a research topic first.', 'error');
        els.taskInput.focus();
        return;
    }
    
    if (state.isRunning) return;
    
    resetSimulation();
    state.isRunning = true;
    state.startTime = Date.now();
    els.btnRun.disabled = true;
    els.btnRun.innerHTML = '<span class="btn-icon">⏳</span> Running...';
    
    log('Starting ' + state.framework.toUpperCase() + ' workflow...', 'system');
    log('Task: "' + topic + '"', 'system');
    updateMetric('agents', '1/3');
    
    await runResearchAgent(topic);
    await runSummarizeAgent(topic);
    await runCriticAgent(topic);
    await finalizeOutput(topic);
    
    state.isRunning = false;
    els.btnRun.disabled = false;
    els.btnRun.innerHTML = '<span class="btn-icon">▶</span> Deploy Agents';
    
    const latency = Date.now() - state.startTime;
    updateMetric('latency', latency + 'ms');
    log('Workflow completed in ' + latency + 'ms', 'success');
    updateMetric('agents', '3/3');
}

async function runResearchAgent(topic) {
    setStep('research', 'active');
    setAgentStatus('agent-research', 'active', 'Gathering data...');
    log('[Research Agent] Initiating web search and analysis...', 'research');
    
    const researchPoints = generateResearch(topic);
    
    for (let i = 0; i < researchPoints.length; i++) {
        await delay(800 + Math.random() * 600);
        log('[Research Agent] ' + researchPoints[i], 'research');
        addTokens(45);
    }
    
    state.researchData = researchPoints.join('\n');
    await delay(500);
    
    setAgentStatus('agent-research', 'done', 'Complete');
    setStep('research', 'done');
    setConnector(0, true);
    updateMetric('tasks', '1');
    log('[Research Agent] Delivered ' + researchPoints.length + ' findings to Summarize Agent.', 'research');
}

async function runSummarizeAgent(topic) {
    setStep('summarize', 'active');
    setAgentStatus('agent-summarize', 'active', 'Synthesizing...');
    log('[Summarize Agent] Received research data. Beginning synthesis...', 'summarize');
    
    await delay(1000);
    log('[Summarize Agent] Identifying key themes and patterns...', 'summarize');
    addTokens(120);
    
    await delay(1200);
    log('[Summarize Agent] Compressing information into structured summary...', 'summarize');
    addTokens(85);
    
    const summary = generateSummary(topic);
    state.summaryData = summary;
    
    await delay(800);
    setAgentStatus('agent-summarize', 'done', 'Complete');
    setStep('summarize', 'done');
    setConnector(1, true);
    updateMetric('tasks', '2');
    updateMetric('agents', '2/3');
    log('[Summarize Agent] Summary drafted. Passing to Critic Agent for review.', 'summarize');
}

async function runCriticAgent(topic) {
    setStep('critic', 'active');
    setAgentStatus('agent-critic', 'active', 'Reviewing...');
    log('[Critic Agent] Received summary. Initiating quality assurance...', 'critic');
    
    await delay(900);
    log('[Critic Agent] Checking factual consistency and source coverage...', 'critic');
    addTokens(60);
    
    await delay(1100);
    log('[Critic Agent] Verifying logical coherence and bias detection...', 'critic');
    addTokens(45);
    
    const critique = generateCritique(topic);
    
    await delay(700);
    log('[Critic Agent] ' + critique, 'critic');
    addTokens(30);
    
    await delay(600);
    log('[Critic Agent] Feedback loop: Sending revision notes to Summarize Agent.', 'critic');
    
    await delay(800);
    log('[Summarize Agent] Applying revisions based on critique...', 'summarize');
    addTokens(55);
    
    state.finalData = generateFinalOutput(topic, state.summaryData, critique);
    
    setAgentStatus('agent-critic', 'done', 'Approved');
    setStep('critic', 'done');
    setConnector(2, true);
    updateMetric('tasks', '3');
    updateMetric('agents', '3/3');
    log('[Critic Agent] Final output approved.', 'critic');
}

async function finalizeOutput(topic) {
    setStep('final', 'active');
    await delay(600);
    
    els.finalOutput.innerHTML = `
        <h4 style="margin-bottom: 0.75rem; color: #818cf8;">Executive Summary: ${topic}</h4>
        <div style="white-space: pre-wrap; line-height: 1.7;">${state.finalData}</div>
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #374151; font-size: 0.8125rem; color: #6b7280;">
            Generated by AgentFlow • Framework: ${state.framework.toUpperCase()} • ${new Date().toLocaleString()}
        </div>
    `;
    
    setStep('final', 'done');
    log('Final output delivered.', 'success');
}

function generateResearch(topic) {
    const topics = topic.toLowerCase();
    if (topics.includes('quantum') || topics.includes('computing')) {
        return [
            'Identified 12 peer-reviewed papers on quantum cryptography (2024-2026)',
            'Discovered NIST post-quantum cryptography standards finalized in 2025',
            "Found that Shor's algorithm threatens RSA-2048 with ~4000 logical qubits",
            'Analyzed market data: Quantum security market projected at $12B by 2028',
            'Detected emerging trend: Lattice-based cryptography adoption in banking sector'
        ];
    }
    if (topics.includes('climate') || topics.includes('warming')) {
        return [
            'Retrieved IPCC 2025 assessment report data on 1.5°C pathways',
            'Identified 8 critical tipping points including AMOC collapse risk',
            'Found renewable energy adoption accelerated 340% since 2020',
            'Analyzed carbon capture scalability constraints and costs per ton',
            'Detected policy shift: 47 countries committed to net-zero by 2035'
        ];
    }
    if (topics.includes('ai') || topics.includes('artificial intelligence')) {
        return [
            'Retrieved data on transformer architecture evolution (2023-2026)',
            'Identified 15 major LLM releases with parameter counts and benchmarks',
            'Found regulatory frameworks: EU AI Act enforcement began 2025',
            'Analyzed compute requirements: Training costs dropped 60% via optimization',
            'Detected trend: Multi-modal agents now dominate enterprise adoption'
        ];
    }
    return [
        'Retrieved 24 relevant sources on "' + topic + '" from academic databases',
        'Identified key stakeholders and primary market drivers',
        'Analyzed historical trends and projected growth curves',
        'Found 3 conflicting viewpoints requiring synthesis',
        'Detected emerging sub-topic with high citation velocity'
    ];
}

function generateSummary(topic) {
    return 'Based on comprehensive research, ' + topic + ' represents a significant paradigm shift with multiple stakeholder implications. Key findings indicate accelerating adoption curves, regulatory responses lagging behind technological capabilities, and emerging risks requiring proactive mitigation strategies.';
}

function generateCritique(topic) {
    const critiques = [
        'Gap identified: Limited coverage of edge-case scenarios in developing markets.',
        'Strength: Well-sourced quantitative data supports core arguments.',
        'Suggestion: Add comparative analysis with alternative frameworks.',
        'Validation: Key claims align with peer-reviewed consensus.'
    ];
    return critiques[Math.floor(Math.random() * critiques.length)];
}

function generateFinalOutput(topic, summary, critique) {
    return 'EXECUTIVE SUMMARY\n==================\nTopic: ' + topic + '\n\nFINDINGS:\n' + state.researchData.split('\n').map((l, i) => (i + 1) + '. ' + l).join('\n') + '\n\nSYNTHESIS:\n' + summary + '\n\nCRITIQUE & REVISIONS:\n' + critique + '\nThe summary was revised to address identified gaps and strengthen evidentiary support.\n\nCONCLUSION:\nThe multi-agent analysis confirms that ' + topic + ' demands immediate strategic attention. Organizations should prioritize adaptive frameworks, cross-functional collaboration, and continuous monitoring of emerging developments.\n\n---\nGenerated via AgentFlow Multi-Agent System\nAgents: Research → Summarize → Critic\nQuality Score: 94/100';
}

function setStep(id, status) {
    const step = els.steps[id];
    if (!step) return;
    step.className = 'pipeline-step ' + status;
}

function setConnector(index, active) {
    if (els.connectors[index]) {
        els.connectors[index].classList.toggle('active', active);
    }
}

function setAgentStatus(id, status, text) {
    const card = document.getElementById(id);
    if (!card) return;
    card.classList.remove('active', 'done');
    if (status) card.classList.add(status);
    const statusEl = card.querySelector('.agent-status');
    if (statusEl) statusEl.textContent = text;
}

function updateMetric(id, value) {
    const el = document.getElementById('metric-' + id);
    if (el) el.textContent = value;
}

function addTokens(n) {
    state.tokens += n;
    updateMetric('tokens', state.tokens.toLocaleString());
}

function log(message, type) {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = document.createElement('div');
    line.className = 'console-line ' + type;
    line.innerHTML = '<span class="timestamp">[' + time + ']</span>' + escapeHtml(message);
    els.console.appendChild(line);
    els.console.scrollTop = els.console.scrollHeight;
    state.logs.push({ time, message, type });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function resetSimulation() {
    state.isRunning = false;
    state.currentStep = 0;
    state.tokens = 0;
    state.researchData = '';
    state.summaryData = '';
    state.finalData = '';
    state.logs = [];
    
    els.console.innerHTML = '';
    els.finalOutput.innerHTML = '<p class="placeholder">Agent output will appear here...</p>';
    els.btnRun.disabled = false;
    els.btnRun.innerHTML = '<span class="btn-icon">▶</span> Deploy Agents';
    
    Object.keys(els.steps).forEach(k => setStep(k, ''));
    els.steps.final.className = 'pipeline-step';
    els.connectors.forEach(c => c.classList.remove('active'));
    
    ['agent-research', 'agent-summarize', 'agent-critic'].forEach(id => {
        setAgentStatus(id, '', 'Idle');
    });
    
    updateMetric('agents', '0/3');
    updateMetric('tasks', '0');
    updateMetric('tokens', '0');
    updateMetric('latency', '0ms');
    
    drawNetwork();
    log('System reset. Ready.', 'system');
}

function exportMarkdown() {
    const text = els.finalOutput.innerText;
    if (!text || text.includes('Agent output will appear')) {
        log('Nothing to export', 'error');
        return;
    }
    
    const md = '# AgentFlow Output\n\n**Topic:** ' + els.taskInput.value.trim() + '\n**Framework:** ' + state.framework.toUpperCase() + '\n**Date:** ' + new Date().toISOString() + '\n\n---\n\n' + text + '\n\n---\n\n*Generated by AgentFlow Multi-Agent AI System*';
    
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agentflow-output.md';
    a.click();
    URL.revokeObjectURL(url);
    log('Exported as Markdown', 'success');
}

document.addEventListener('DOMContentLoaded', init);