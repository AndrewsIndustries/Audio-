/**
 * OmniAether.js - The Seeing & Logic Engine
 */

const apiKey = ""; // API Key 

const State = {
    isPowerOn: false,
    selectedBand: 'SW',
    coarseTuning: 50.0,
    fineTuning: 0.0,
    currentFrequency: 10000.00,
    volume: 50,
    antennaCoupling: 75,
    lockedStation: null,
    syntheticTextContent: "",
    audioPlaying: null,
    customStations: JSON.parse(localStorage.getItem('aether_saved_channels') || '{}'),
    physicalHeading: 180, 
    solarWindSpeed: 400, 
    solarFluxIndex: 145, 
    solarIMFField: 6,    
    isMicEnabled: false,
    isScanning: false,
    spectrumZoom: 1.0,
    peakDb: -100,
    squelchEnabled: false,
    squelchThreshold: -40,
    isAfcEnabled: false,
    lastLockPct: 0,
    wifiHistory: Array.from({ length: 32 }, () => Array(14).fill(0)),
    serialHardwareLinked: false
};

const UI = {
    canvas: null,
    ctx: null,
    tempCanvas: null,
    tempCtx: null,
    freqDisplay: null,
    snrDisplay: null,
    peakDisplay: null,
    logBox: null,
    tuningSlider: null,
    wifiCanvas: null
};

const bands = {
    'ELF': { min: 3, max: 30, unit: 'kHz', label: 'Extremely Low Frequency (ELF/VLF)', desc: 'Earth-ionosphere cavity, subterranean waves & sferics' },
    'AM':  { min: 530, max: 1700, unit: 'kHz', label: 'Mediumwave (AM/MW)', desc: 'Commercial broadcasts & night skip skywaves' },
    'SW':  { min: 3000, max: 30000, unit: 'kHz', label: 'Shortwave (HF/SW)', desc: 'Ionospheric hops, espionage transmissions & beacons' },
    'VHF': { min: 108, max: 162, unit: 'MHz', label: 'Very High Frequency (VHF Aero)', desc: 'Line-of-sight aviation tower chatter & weather FM' },
    'DS':  { min: 1420, max: 1421, unit: 'MHz', label: 'Hydrogen Deep Space (SETI)', desc: 'Pulsar rotations, solar magnetism & cosmic microwave background' },
    'BIO': { min: 0.1, max: 50, unit: 'Hz', label: 'Bio-Electromagnetic (Bio-EM)', desc: 'Mycelial oscillations, brainwave leakage & biological induction' },
    'QA':  { min: 90, max: 99, unit: 'qHz', label: 'Quantum Chrono-Aether (QA)', desc: 'Tachyon streams, temporal leakage & parallel realities' }
};

const presetStations = [
    { freq: 7.83, band: 'ELF', name: 'SCHUMANN RESONANCE BEAT', desc: 'Fundamental electromagnetic heartbeat of Earth.' },
    { freq: 4625.00, band: 'SW', name: 'UVB-76 (THE BUZZER)', desc: 'Military repeater. Monotonous buzzer signal.' },
    { freq: 10000.00, band: 'SW', name: 'WWV CHRONOGRAPHIC BEACON', desc: 'Atomic clock ticking and announcements.' },
    { freq: 1420.40, band: 'DS', name: 'PSR B1919+21 PULSAR', desc: 'Rotating neutron star emissions.' },
    { freq: 91.10, band: 'QA', name: 'NEOMACHINA CHRONO-LEAK', desc: 'Telemetry from an alternate cybernetic timeline.' }
];

window.onload = function() {
    UI.canvas = document.getElementById('waterfall-canvas');
    UI.ctx = UI.canvas.getContext('2d', { alpha: false });
    UI.tempCanvas = document.createElement('canvas');
    UI.tempCanvas.width = UI.canvas.width;
    UI.tempCanvas.height = UI.canvas.height;
    UI.tempCtx = UI.tempCanvas.getContext('2d');
    
    UI.freqDisplay = document.getElementById('freq-display');
    UI.snrDisplay = document.getElementById('snr-display');
    UI.peakDisplay = document.getElementById('snr-peak-display');
    UI.logBox = document.getElementById('telemetry-log');
    UI.tuningSlider = document.getElementById('tuning-slider');
    UI.wifiCanvas = document.getElementById('wifi-heatmap-canvas');
    if (UI.wifiCanvas) {
        UI.wifiCanvas.width = 140; UI.wifiCanvas.height = 320;
    }

    lucide.createIcons();
    generateDialScale();
    drawWaterfallFrame();
    setupKnobDragListeners();
    setupCompassSupport();
    fetchNOAASpaceWeather();
    updateFrequency();
    renderMemoryBank();
    setupDragAndDrop();
    setupDialDrag();
};

function toggleScan() {
    if (!State.isPowerOn) return logTransmission("Power required for spectral scan.", "system");
    State.isScanning = !State.isScanning;
    const btn = document.getElementById('scan-btn');
    if (State.isScanning) {
        btn.classList.add('bg-red-600', 'text-white', 'animate-pulse');
        logTransmission("Initiating automated spectral sweep...", "system");
        performScanStep();
    } else {
        btn.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
        logTransmission("Spectral sweep suspended.", "system");
    }
}

function performScanStep() {
    if (!State.isScanning) return;
    State.coarseTuning += 0.2;
    if (State.coarseTuning > 100) State.coarseTuning = 0;
    
    UI.tuningSlider.value = State.coarseTuning;
    updateFrequency();
    
    // If we're getting close to a signal, slow down the scan for "fine" detection
    const scanSpeed = State.lockedStation ? 0.05 : 0.2;
    
    if (State.lockedStation) {
        State.isScanning = false;
        document.getElementById('scan-btn').classList.remove('bg-red-600', 'text-white', 'animate-pulse');
        logTransmission(`Scan Halted: Signal detected at ${State.currentFrequency.toFixed(2)} ${bands[State.selectedBand].unit}`, "system");
    } else {
        requestAnimationFrame(performScanStep);
    }
}

function togglePower() {
    initAudio();
    State.isPowerOn = !State.isPowerOn;
    const btn = document.getElementById('power-btn');
    const led = document.getElementById('power-led');
    const txt = document.getElementById('power-text');
    if (State.isPowerOn) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        btn.classList.add('bg-red-600', 'text-black', 'border-red-600');
        btn.classList.remove('bg-black', 'text-zinc-500', 'border-zinc-800');
        led.classList.add('bg-red-500', 'shadow-[0_0_12px_rgba(255,0,0,0.8)]');
        led.classList.remove('bg-zinc-900');
        txt.innerText = "ON";
        logTransmission("Filaments loaded. Omni-Receiver Online.", "system");
    } else {
        btn.classList.remove('bg-red-600', 'text-black', 'border-red-600');
        btn.classList.add('bg-black', 'text-zinc-500', 'border-zinc-800');
        led.classList.remove('bg-red-500', 'shadow-[0_0_12px_rgba(255,0,0,0.8)]');
        led.classList.add('bg-zinc-900');
        txt.innerText = "OFF";
        logTransmission("Powering down. See you in the noise.", "system");
        stopAudio();
        if (AudioNodes.staticGain) AudioNodes.staticGain.gain.setValueAtTime(0, audioCtx.currentTime);
    }
    updateFrequency();
}

function updateFrequency() {
    const bandInfo = bands[State.selectedBand];
    
    // Update UI active states for bands
    Object.keys(bands).forEach(b => {
        const el = document.getElementById(`band-${b.toLowerCase()}`);
        if (el) {
            const isActive = b === State.selectedBand;
            el.classList.toggle('bg-red-950', isActive);
            el.classList.toggle('border-red-600', isActive);
            el.classList.toggle('text-red-400', isActive);
        }
    });

    const scaleWidth = bandInfo.max - bandInfo.min;
    State.currentFrequency = bandInfo.min + (scaleWidth * (State.coarseTuning / 100)) + State.fineTuning;
    State.currentFrequency = Math.max(bandInfo.min, Math.min(bandInfo.max, State.currentFrequency));
    UI.freqDisplay.innerText = State.currentFrequency.toLocaleString(undefined, { minimumFractionDigits: 3 });
    
    const unitDisplay = document.getElementById('unit-display');
    if (unitDisplay) unitDisplay.innerText = bandInfo.unit;

    const percentageOffset = (State.coarseTuning - 50) * -12.5;
    document.getElementById('dial-scale-container').style.transform = `translateX(${percentageOffset}px)`;
    
    updateDensity();
    checkSignalLock();
    updateAudioParameters();
}

function updateAudioParameters() {
    if (!State.isPowerOn || !audioCtx) return;
    const doppler = getDopplerFactor();
    const solarStaticIntensity = Math.min(1.2, (State.solarIMFField / 10) + (State.solarWindSpeed / 800));
    let baseStaticGain = (State.volume / 100) * (State.antennaCoupling / 100) * 0.35 * solarStaticIntensity;
    
    let signalLockFactor = 0;
    if (State.lockedStation) {
        const diff = Math.abs(State.currentFrequency - State.lockedStation.freq);
        const lockWindow = (bands[State.selectedBand].max - bands[State.selectedBand].min) * 0.05;
        signalLockFactor = Math.max(0, 1 - (diff / lockWindow)) * Math.max(0.1, 1 - (Math.abs(State.physicalHeading - 180) / 180));
    }

    // Simulated AGC: Noise recedes when signal is found
    const agcStatic = baseStaticGain * (1 - (signalLockFactor * 0.85));

    // Apply Squelch Logic
    const currentSquelch = (State.squelchEnabled && State.peakDb < State.squelchThreshold) ? 0 : 1;
    const finalGain = agcStatic * currentSquelch;

    AudioNodes.staticGain.gain.setTargetAtTime(finalGain, audioCtx.currentTime, 0.05);

    // Modulate synthesis oscillators based on Doppler shift
    if (AudioNodes.feedbackHum) {
        AudioNodes.feedbackHum.frequency.setTargetAtTime(60 * doppler, audioCtx.currentTime, 0.1);
    }
    if (AudioNodes.periodicPulsar) {
        AudioNodes.periodicPulsar.frequency.setTargetAtTime(120 * doppler, audioCtx.currentTime, 0.1);
    }
    if (AudioNodes.bioPulse) {
        AudioNodes.bioPulse.frequency.setTargetAtTime(15 * doppler, audioCtx.currentTime, 0.1);
    }

    // Adjust playback rate of loaded audio file signals
    if (AudioNodes.fileSource) {
        AudioNodes.fileSource.playbackRate.setTargetAtTime(doppler, audioCtx.currentTime, 0.1);
    }

    if (State.isMicEnabled && AudioNodes.mic.gain) {
        AudioNodes.mic.gain.gain.setTargetAtTime((State.volume / 100) * 0.5, audioCtx.currentTime, 0.05);
        // Shift the bandpass resonance for microphone induction
        const baseBandHz = 1000;
        AudioNodes.mic.bandpass.frequency.setTargetAtTime(baseBandHz * doppler, audioCtx.currentTime, 0.1);
    } else if (AudioNodes.mic.gain) {
        AudioNodes.mic.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    }

    // Animate Vacuum Tube Filaments based on Power and Volume
    const filamentOpacity = State.isPowerOn ? 0.3 + (State.volume / 100) * 0.7 : 0.05;
    ['filament-1', 'filament-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.backgroundColor = `rgba(255, 60, 0, ${filamentOpacity})`;
            el.style.boxShadow = `0 0 ${15 * filamentOpacity}px rgba(255, 60, 0, ${filamentOpacity})`;
        }
    });
}

function drawWaterfallFrame() {
    UI.tempCtx.drawImage(UI.canvas, 0, 0);
    UI.ctx.drawImage(UI.tempCanvas, 0, -1.5);

    const width = UI.canvas.width;
    const rowData = UI.ctx.createImageData(width, 1);
    let dataArray = new Uint8Array(0);
    if (State.isPowerOn && AudioNodes.analyser) {
        // Refresh parameters in render loop to enable motion Doppler modulation
        updateAudioParameters();

        dataArray = new Uint8Array(AudioNodes.analyser.frequencyBinCount);
        AudioNodes.analyser.getByteFrequencyData(dataArray);

        // Calculate RMS for Redline Alert
        const timeData = new Uint8Array(AudioNodes.analyser.fftSize);
        AudioNodes.analyser.getByteTimeDomainData(timeData);
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
            const sample = (timeData[i] - 128) / 128;
            sumSq += sample * sample;
        }
        const rms = Math.sqrt(sumSq / timeData.length);
        const rmsDb = 20 * Math.log10(rms || 0.0001);

        if (rmsDb > State.peakDb) State.peakDb = rmsDb;

        if (UI.snrDisplay) UI.snrDisplay.innerText = `${rmsDb.toFixed(1)} dB`;
        if (UI.peakDisplay) UI.peakDisplay.innerText = `PEAK: ${State.peakDb.toFixed(1)} dB`;

        document.body.classList.toggle('redline-active', rmsDb > -3);
        
        if (State.lastLockPct > 0 || rmsDb > -80) {
            const eyeValue = (State.lastLockPct / 100) * 0.8 + (Math.max(0, rmsDb + 60) / 60) * 0.2;
            const beamAngle = 90 - (eyeValue * 85); 
            const rad = (beamAngle * Math.PI) / 180;
            const ex = 50 + 40 * Math.cos(rad);
            const ey = 50 + 40 * Math.sin(rad);
            const eyeBeam = document.getElementById('magic-eye-beam');
            eyeBeam.setAttribute('d', `M 50 50 L 90 50 A 40 40 0 0 1 ${ex} ${ey} Z`);
        }
    }

    // Calculate spectral window based on zoom and tuning
    const spectralRange = dataArray.length * 0.6; // Focus on the audible range
    const centerBin = (State.coarseTuning / 100) * spectralRange;
    const span = spectralRange / State.spectrumZoom;
    let startBin = centerBin - span / 2;

    // Clamp viewing window
    if (startBin < 0) startBin = 0;
    if (startBin + span > spectralRange) startBin = spectralRange - span;

    for (let x = 0; x < width; x++) {
        let intensity = 10;
        if (State.isPowerOn && dataArray.length > 0) {
            const binIndex = Math.floor(startBin + (x / width) * span);
            intensity = dataArray[binIndex] || 10;
        }
        let r = 0, g = 0, b = 0;
        if (State.selectedBand === 'DS') { r = intensity * 0.2; g = intensity * 0.4; b = intensity * 0.9; }
        else if (State.selectedBand === 'QA') { r = intensity; g = 0; b = intensity; }
        else { r = intensity; g = 0; b = 0; } // Electric Red

        const idx = x * 4;
        rowData.data[idx] = r; rowData.data[idx+1] = g; rowData.data[idx+2] = b; rowData.data[idx+3] = 255;
    }
    UI.ctx.putImageData(rowData, 0, UI.canvas.height - 1);

    // Draw tuning line overlay at the bottom of the waterfall
    if (State.isPowerOn) {
        const cursorX = ((centerBin - startBin) / span) * width;
        UI.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        UI.ctx.fillRect(Math.floor(cursorX) - 1, UI.canvas.height - 6, 2, 6);
    }

    drawWifiHeatMap();
    requestAnimationFrame(drawWaterfallFrame);
}

function drawWifiHeatMap() {
    if (!UI.wifiCanvas || !State.isPowerOn) return;
    const ctx = UI.wifiCanvas.getContext('2d');
    const w = UI.wifiCanvas.width;
    const h = UI.wifiCanvas.height;
    
    // Shift history and inject new simulated noise based on Coupling
    State.wifiHistory.shift();
    const newRow = Array.from({ length: 14 }, () => Math.random() * (State.antennaCoupling / 100) * 255);
    State.wifiHistory.push(newRow);

    const cellW = w / 14;
    const cellH = h / 32;

    State.wifiHistory.forEach((row, y) => {
        row.forEach((val, x) => {
            // Electric Red palette
            ctx.fillStyle = `rgb(${val}, ${val * 0.1}, ${val * 0.1})`;
            ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        });
    });
}

// Telemetry, Tuning, and Log functions... (rest of the logic here)
function logTransmission(message, type = "data") {
    const logBox = document.getElementById('telemetry-log');
    const entry = document.createElement('div');
    entry.className = `flex gap-2 border-b border-zinc-900/50 pb-1 ${type === "system" ? "text-zinc-500 italic" : "text-red-500"}`;
    entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${message}`;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
}

function setBand(band) {
    State.selectedBand = band;
    const bandInfo = bands[band];
    document.getElementById('dial-indicator-band-mode').innerText = `Band Mode: ${bandInfo.label}`;
    document.getElementById('current-band-label').innerText = bandInfo.desc;
    updateFrequency();
}

async function fetchNOAASpaceWeather() {
    try {
        const speedRes = await fetch('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json');
        const speedData = await speedRes.json();
        State.solarWindSpeed = parseFloat(speedData.wind_speed || 400);
        
        // Sync all weather telemetry to UI
        document.getElementById('solar-wind-val').innerText = `${State.solarWindSpeed.toFixed(0)} km/s`;
        document.getElementById('solar-flux-val').innerText = `${State.solarFluxIndex} SFU`;
        document.getElementById('imf-bz-val').innerText = `${State.solarIMFField} nT`;
        
        const badge = document.getElementById('noaa-status-badge');
        badge.innerText = "NOAA DATA SYNCED";
        badge.className = "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-900 border border-emerald-800 text-emerald-400";
    } catch (e) { 
        console.warn("NOAA Offline"); 
        document.getElementById('noaa-status-badge').innerText = "NOAA OFFLINE (SIMULATED)";
    }
}

function generateDialScale() {
    const container = document.getElementById('dial-scale-container');
    container.innerHTML = '';
    for (let i = 0; i <= 100; i++) {
        const tick = document.createElement('div');
        tick.className = 'flex flex-col items-center justify-between h-full flex-shrink-0';
        tick.style.width = '60px';
        tick.innerHTML = `<div class="w-[2px] h-6 bg-red-600/50"></div><span class="text-[9px] text-zinc-500 font-mono">${i%5===0?i:''}</span>`;
        container.appendChild(tick);
    }
}

function checkSignalLock() {
    if (!State.isPowerOn) return;
    const allStations = [...presetStations, ...Object.values(State.customStations)];
    let bestLock = 0; let target = null;
    allStations.forEach(st => {
        if (st.band === State.selectedBand) {
            const diff = Math.abs(State.currentFrequency - st.freq);
            const win = (bands[State.selectedBand].max - bands[State.selectedBand].min) * 0.05;
            if (diff < win) {
                let lock = (1 - (diff / win)) * 100;
                if (lock > bestLock) { bestLock = lock; target = st; }
            }
        }
    });

    State.lastLockPct = bestLock;
    const lockLabel = document.getElementById('lock-percent');
    if (lockLabel) {
        lockLabel.innerText = `LOCKED: ${Math.round(bestLock)}%`;
    }

    const statusBadge = document.getElementById('signal-status-badge');
    const eyeBeam = document.getElementById('magic-eye-beam');
    
    if (bestLock > 65) {
        statusBadge.innerText = "CARRIER LOCK";
        statusBadge.classList.add('text-red-500', 'border-red-500/50', 'animate-pulse');
        eyeBeam.setAttribute('fill', '#ff0000');
        State.lockedStation = target;
        document.getElementById('tuned-station-id').innerText = target.name;
        document.getElementById('tuned-station-desc').innerText = target.desc;
        document.getElementById('demodulate-btn').disabled = false;
    } else {
        statusBadge.innerText = "NO LOCK";
        statusBadge.classList.remove('text-red-500', 'border-red-500/50', 'animate-pulse');
        eyeBeam.setAttribute('fill', 'rgba(255, 0, 0, 0.2)');
        State.lockedStation = null;
        document.getElementById('tuned-station-id').innerText = "AETHER STATIC";
        document.getElementById('tuned-station-desc').innerText = "Adjust dials to lock carrier...";
        document.getElementById('demodulate-btn').disabled = true;
    }
}

function stopAudio() {
    if (audioPlaying) { audioPlaying.pause(); audioPlaying = null; }
}

function updateZoom(v) { State.spectrumZoom = parseFloat(v); }

function updateDensity() {
    const density = Math.min(100, (State.solarFluxIndex / 250) * 50 + (State.antennaCoupling / 2));
    const el = document.getElementById('density-display');
    if (el) el.innerText = `${density.toFixed(2)} %`;
}

function resetPeak() { State.peakDb = -100; }

function setSquelch(enabled) {
    State.squelchEnabled = enabled;
    logTransmission(`Digital Squelch: ${enabled ? 'ACTIVE' : 'OFF'}`, "system");
}

function updateSquelchThreshold(val) {
    State.squelchThreshold = parseFloat(val);
    document.getElementById('squelch-val').innerText = `${State.squelchThreshold} dB`;
}

function setFilterBW(bw) {
    const freqs = { 'narrow': 2400, 'medium': 6000, 'wide': 12000 };
    setFilterBandwidth(freqs[bw]);
    logTransmission(`IF Bandwidth set to ${bw.toUpperCase()} (${freqs[bw]/1000}kHz)`, "system");
}

function snapToSignal() {
    if (State.lockedStation) {
        const bandInfo = bands[State.selectedBand];
        const scaleWidth = bandInfo.max - bandInfo.min;
        State.coarseTuning = ((State.lockedStation.freq - bandInfo.min) / scaleWidth) * 100;
        State.fineTuning = 0;
        UI.tuningSlider.value = State.coarseTuning;
        document.getElementById('fine-tuning-slider').value = 0;
        updateFrequency();
        logTransmission(`AFC: Synced to carrier center ${State.lockedStation.freq} ${bandInfo.unit}`, "system");
    }
}

function updateTuning(v) { 
    State.coarseTuning = parseFloat(v); 
    document.getElementById('coarse-val').innerText = `${State.coarseTuning.toFixed(1)}%`;
    updateFrequency(); 
}
function updateFineTuning(v) { 
    State.fineTuning = parseFloat(v); 
    document.getElementById('fine-val').innerText = State.fineTuning.toFixed(2);
    updateFrequency(); 
}
function toggleHelpModal() { document.getElementById('help-modal').classList.toggle('hidden'); }

function setupDialDrag() {
    const dialWindow = document.getElementById('dial-window');
    let isDragging = false;
    let lastX = 0;

    dialWindow.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastX = e.clientX;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = (e.clientX - lastX) * 0.1;
        State.coarseTuning = Math.min(100, Math.max(0, State.coarseTuning - deltaX));
        UI.tuningSlider.value = State.coarseTuning;
        updateFrequency();
        lastX = e.clientX;
    });

    window.addEventListener('mouseup', () => isDragging = false);
}

function setupKnobDragListeners() {
    const setupKnob = (id, stateKey, labelId, pointerId) => {
        const knob = document.getElementById(id);
        const label = document.getElementById(labelId);
        const pointer = document.getElementById(pointerId);
        let isDragging = false;
        let startY = 0;
        let startVal = State[stateKey];

        knob.addEventListener('mousedown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startVal = State[stateKey];
            document.body.style.cursor = 'ns-resize';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const delta = (startY - e.clientY) * 0.5;
            const newVal = Math.min(100, Math.max(0, startVal + delta));
            State[stateKey] = newVal;
            
            if (label) label.innerText = `${Math.round(newVal)}%`;
            if (pointer) pointer.style.transform = `rotate(${(newVal - 50) * 2.4}deg)`;
            updateAudioParameters();
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            document.body.style.cursor = 'default';
        });
    };
    setupKnob('knob-volume', 'volume', 'volume-val', 'vol-pointer');
    setupKnob('knob-coupling', 'antennaCoupling', 'coupling-val', 'coupling-pointer');
}

function updateCompass(v) { State.physicalHeading = v; updateFrequency(); }
function setupCompassSupport() {
    window.addEventListener('deviceorientation', (e) => { if(e.alpha) State.physicalHeading = Math.round(e.alpha); updateFrequency(); });
}

async function demodulateCurrent() {
    if (!State.isPowerOn || !State.lockedStation) return;
    const loader = document.getElementById('ai-loading');
    
    if (!apiKey) {
        logTransmission("Error: API Key missing in OmniAether.js. Please provide a Gemini API Key.", "system");
        return;
    }

    loader.classList.remove('hidden');
    try {
        const prompt = `Transcribe the ${State.selectedBand} broadcast at ${State.currentFrequency} ${bands[State.selectedBand].unit}: ${State.lockedStation.desc}. Keep it under 50 words and very atmospheric.`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const res = await response.json();
        State.syntheticTextContent = res.candidates[0].content.parts[0].text;
        logTransmission(State.syntheticTextContent, "decoded");
        document.getElementById('tts-btn').disabled = false;
    } catch (e) { logTransmission("Demodulation Failed.", "system"); }
    finally { loader.classList.add('hidden'); }
}

async function speakBroadcast() {
    if (!State.isPowerOn || !State.syntheticTextContent) return;
    stopAudio();
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-tts:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: State.syntheticTextContent }] }], 
                generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } } } 
            })
        });
        const res = await response.json();
        const pcmData = res.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
        audioPlaying = new Audio(pcmToWav(pcmData));
        audioPlaying.play();
    } catch (e) { logTransmission("TTS Failure.", "system"); }
}

function saveStation() {
    const name = prompt("Enter Channel Identity:", `SGNL-${State.currentFrequency.toFixed(1)}`);
    if (!name) return;
    const id = `${State.selectedBand}-${State.currentFrequency.toFixed(2)}`;
    State.customStations[id] = { freq: State.currentFrequency, band: State.selectedBand, name: name.toUpperCase(), desc: "Saved user frequency." };
    localStorage.setItem('aether_saved_channels', JSON.stringify(State.customStations));
    logTransmission(`Frequency ${State.currentFrequency} saved to memory.`, "system");
    renderMemoryBank();
}

function renderMemoryBank() {
    const container = document.getElementById('memory-bank-list');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(State.customStations).forEach(([id, station]) => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 border-b border-zinc-900 hover:bg-red-950/10 cursor-pointer group";
        div.innerHTML = `
            <div onclick="tuneToStation('${id}')" class="flex-1">
                <span class="text-[10px] text-red-600 font-bold">${station.freq} ${bands[station.band].unit}</span>
                <span class="block text-[9px] text-zinc-500">${station.name}</span>
            </div>
            <button onclick="deleteStation('${id}')" class="text-zinc-800 group-hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function tuneToStation(id) {
    const station = State.customStations[id];
    setBand(station.band);
    const bandInfo = bands[station.band];
    State.coarseTuning = ((station.freq - bandInfo.min) / (bandInfo.max - bandInfo.min)) * 100;
    UI.tuningSlider.value = State.coarseTuning;
    updateFrequency();
    logTransmission(`Tuned to Memory: ${station.name}`, "system");
}

function deleteStation(id) {
    delete State.customStations[id];
    localStorage.setItem('aether_saved_channels', JSON.stringify(State.customStations));
    renderMemoryBank();
}

function exportPresets() {
    const data = JSON.stringify(State.customStations, null, 2);
    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'aether_presets.json'; a.click();
}

function importPresets(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        State.customStations = JSON.parse(e.target.result);
        localStorage.setItem('aether_saved_channels', JSON.stringify(State.customStations));
        logTransmission("Channel database updated from file.", "system");
        renderMemoryBank();
    };
    reader.readAsText(file);
}

function setupDragAndDrop() {
    const dropZone = document.body;
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        document.body.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => document.body.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        document.body.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('audio/')) loadAudioFileAsSignal(file);
    });
}

async function toggleMicAntenna() {
    if (!State.isPowerOn) {
        logTransmission("Receiver power required for hardware coupling.", "system");
        return;
    }

    const btn = document.getElementById('mic-antenna-btn');
    const led = document.getElementById('antenna-status-led');
    const txt = document.getElementById('antenna-status-txt');

    if (!State.isMicEnabled) {
        const success = await enableMicStream();
        if (success) {
            State.isMicEnabled = true;
            btn.innerHTML = `<i data-lucide="radio-receiver" class="w-3.5 h-3.5 inline mr-1 text-red-600"></i> MIC COIL: ACTIVE`;
            btn.classList.add('border-red-900');
            txt.innerText = "ANTENNA: MICROPHONE COIL";
            logTransmission("Hardware coupled: Internal microphone active as induction pickup.", "system");
        } else {
            logTransmission("Hardware failure: Microphone access denied.", "system");
        }
    } else {
        disableMicStream();
        State.isMicEnabled = false;
        btn.innerHTML = `<i data-lucide="radio-receiver" class="w-3.5 h-3.5 inline mr-1"></i> MIC COIL: OFF`;
        btn.classList.remove('border-red-900');
        txt.innerText = "ANTENNA: ACTIVE LOOP";
        logTransmission("Decoupled hardware induction loop.", "system");
    }
    lucide.createIcons();
    updateAudioParameters();
}

async function toggleSerialLink() {
    // Placeholder for Web Serial API integration for Uniden/SDR hardware
    State.serialHardwareLinked = !State.serialHardwareLinked;
    logTransmission(`Hardware Serial Bridge: ${State.serialHardwareLinked ? 'LINKED' : 'DISCONNECTED'}`, "system");
    document.getElementById('serial-status-btn').classList.toggle('text-red-600', State.serialHardwareLinked);
}

function clearLogs() { document.getElementById('telemetry-log').innerHTML = ''; }
function injectCustomTransmitter() {
    const text = document.getElementById('custom-prompt-input').value;
    State.customStations[`${State.selectedBand}-${State.currentFrequency}`] = { freq: State.currentFrequency, band: State.selectedBand, name: "CUSTOM INJECTED", desc: text };
    logTransmission("Transmitter Injected.", "system");
}