/**
 * OmniSound.js - The Hearing Engine
 * Handles Web Audio API DSP, synthesis, and induction simulation.
 */

let audioCtx = null;
const AudioNodes = {
    analyser: null,
    staticNoise: null,
    staticGain: null,
    feedbackHum: null,
    fadingLFO: null,
    fadingGain: null,
    spatialChorus: null,
    periodicPulsar: null,
    bioPulse: null,
    masterFilter: null,
    limiter: null,
    mic: { source: null, bandpass: null, delay: null, gain: null },
    fileSource: null
};

let micStream = null;

// Doppler state for frequency modulation based on movement
let dopplerFactor = 1.0;
let lastMotionTime = performance.now();
let currentVelocityZ = 0;

function updateDopplerMotion(event) {
    const now = performance.now();
    const dt = (now - lastMotionTime) / 1000;
    lastMotionTime = now;

    if (event.acceleration && dt > 0) {
        // Accumulate velocity based on Z-axis acceleration (depth)
        currentVelocityZ += (event.acceleration.z || 0) * dt;
        // Apply damping to return to zero velocity over time
        currentVelocityZ *= 0.85;
        // Calculate factor: f' = f * (1 + v/c). Speed of aether set to 25 for audible shifts.
        dopplerFactor = 1 + (currentVelocityZ / 25);
    }
}

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // White Noise Base
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    AudioNodes.staticNoise = audioCtx.createBufferSource();
    AudioNodes.staticNoise.buffer = noiseBuffer;
    AudioNodes.staticNoise.loop = true;

    AudioNodes.staticGain = audioCtx.createGain();
    AudioNodes.staticGain.gain.setValueAtTime(0, audioCtx.currentTime);

    AudioNodes.fadingGain = audioCtx.createGain();
    AudioNodes.fadingGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

    AudioNodes.fadingLFO = audioCtx.createOscillator();
    AudioNodes.fadingLFO.type = 'sine';
    AudioNodes.fadingLFO.frequency.setValueAtTime(0.15, audioCtx.currentTime);
    
    const lfoDepth = audioCtx.createGain();
    lfoDepth.gain.setValueAtTime(0.4, audioCtx.currentTime);
    
    AudioNodes.fadingLFO.connect(lfoDepth);
    lfoDepth.connect(AudioNodes.fadingGain.gain);

    // Low Hum
    AudioNodes.feedbackHum = audioCtx.createOscillator();
    AudioNodes.feedbackHum.type = 'sawtooth';
    AudioNodes.feedbackHum.frequency.setValueAtTime(60, audioCtx.currentTime);
    const humGain = audioCtx.createGain();
    humGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    AudioNodes.feedbackHum.connect(humGain);

    // Pulsar
    AudioNodes.periodicPulsar = audioCtx.createOscillator();
    AudioNodes.periodicPulsar.type = 'triangle';
    AudioNodes.periodicPulsar.frequency.setValueAtTime(120, audioCtx.currentTime);
    const pulsarGain = audioCtx.createGain();
    pulsarGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    AudioNodes.periodicPulsar.connect(pulsarGain);

    // Bio
    AudioNodes.bioPulse = audioCtx.createOscillator();
    AudioNodes.bioPulse.type = 'sine';
    AudioNodes.bioPulse.frequency.setValueAtTime(15, audioCtx.currentTime);
    const bioGain = audioCtx.createGain();
    bioGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    AudioNodes.bioPulse.connect(bioGain);

    // Chorus phase network
    AudioNodes.spatialChorus = audioCtx.createDelay(1.0);
    AudioNodes.spatialChorus.delayTime.setValueAtTime(0.04, audioCtx.currentTime);
    const chorusLFO = audioCtx.createOscillator();
    chorusLFO.type = 'sine';
    chorusLFO.frequency.setValueAtTime(0.5, audioCtx.currentTime); // Slower, more atmospheric phase shift
    const chorusLFODepth = audioCtx.createGain();
    chorusLFODepth.gain.setValueAtTime(0.005, audioCtx.currentTime);
    chorusLFO.connect(chorusLFODepth);
    chorusLFODepth.connect(AudioNodes.spatialChorus.delayTime);

    AudioNodes.analyser = audioCtx.createAnalyser();
    AudioNodes.analyser.fftSize = 1024; // Increased resolution for better waterfall detail

    AudioNodes.masterFilter = audioCtx.createBiquadFilter();
    AudioNodes.masterFilter.type = 'lowpass';
    AudioNodes.masterFilter.frequency.setValueAtTime(6000, audioCtx.currentTime);

    AudioNodes.staticNoise.connect(AudioNodes.fadingGain);
    AudioNodes.fadingGain.connect(AudioNodes.staticGain);
    humGain.connect(AudioNodes.staticGain);
    pulsarGain.connect(AudioNodes.staticGain);
    bioGain.connect(AudioNodes.staticGain);

    AudioNodes.staticGain.connect(AudioNodes.masterFilter);
    AudioNodes.masterFilter.connect(AudioNodes.analyser);
    AudioNodes.staticGain.connect(AudioNodes.spatialChorus);
    AudioNodes.spatialChorus.connect(AudioNodes.masterFilter);

    // Request motion permissions for Doppler effect (required for modern browsers)
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(response => {
                if (response === 'granted') window.addEventListener('devicemotion', updateDopplerMotion);
            })
            .catch(err => console.error("Motion permission denied:", err));
    } else {
        window.addEventListener('devicemotion', updateDopplerMotion);
    }

    // Soft-clipping Limiter to prevent digital distortion
    AudioNodes.limiter = audioCtx.createDynamicsCompressor();
    AudioNodes.limiter.threshold.setValueAtTime(-3.0, audioCtx.currentTime); 
    AudioNodes.limiter.knee.setValueAtTime(30, audioCtx.currentTime);        
    AudioNodes.limiter.ratio.setValueAtTime(20, audioCtx.currentTime);      
    AudioNodes.limiter.attack.setValueAtTime(0.003, audioCtx.currentTime);  
    AudioNodes.limiter.release.setValueAtTime(0.25, audioCtx.currentTime);  

    AudioNodes.analyser.connect(AudioNodes.limiter);
    AudioNodes.limiter.connect(audioCtx.destination);

    AudioNodes.staticNoise.start();
    AudioNodes.fadingLFO.start();
    AudioNodes.feedbackHum.start();
    AudioNodes.periodicPulsar.start();
    AudioNodes.bioPulse.start();
    chorusLFO.start();

    setupMicNodes();
}

/**
 * Returns the current frequency multiplier based on device movement.
 */
function getDopplerFactor() {
    return dopplerFactor;
}

async function loadAudioFileAsSignal(file) {
    try {
        if (!audioCtx) initAudio();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        if (AudioNodes.fileSource) {
            try { AudioNodes.fileSource.stop(); } catch(e) {}
        }
        
        AudioNodes.fileSource = audioCtx.createBufferSource();
        AudioNodes.fileSource.buffer = audioBuffer;
        AudioNodes.fileSource.loop = true;
        
        AudioNodes.fileSource.connect(AudioNodes.fadingGain);
        AudioNodes.fileSource.start();
        
        logTransmission(`Audio signal injected: ${file.name}.`, "system");
    } catch (err) {
        logTransmission("Failed to decode audio file as carrier signal.", "system");
    }
}

function setupMicNodes() {
    if (!audioCtx) return;
    AudioNodes.mic.bandpass = audioCtx.createBiquadFilter();
    AudioNodes.mic.bandpass.type = 'bandpass';
    AudioNodes.mic.bandpass.Q.setValueAtTime(25.0, audioCtx.currentTime);
    AudioNodes.mic.delay = audioCtx.createDelay(1.0);
    AudioNodes.mic.delay.delayTime.setValueAtTime(0.08, audioCtx.currentTime);
    const delayGain = audioCtx.createGain();
    delayGain.gain.setValueAtTime(0.65, audioCtx.currentTime);
    AudioNodes.mic.bandpass.connect(AudioNodes.mic.delay);
    AudioNodes.mic.delay.connect(delayGain);
    delayGain.connect(AudioNodes.mic.bandpass);
    AudioNodes.mic.gain = audioCtx.createGain();
    AudioNodes.mic.gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    AudioNodes.mic.bandpass.connect(AudioNodes.mic.gain);
    AudioNodes.mic.gain.connect(AudioNodes.analyser);
}

function setFilterBandwidth(hz) {
    if (AudioNodes.masterFilter) {
        AudioNodes.masterFilter.frequency.setTargetAtTime(hz, audioCtx.currentTime, 0.1);
    }
}

function pcmToWav(pcmBase64, sampleRate = 24000) {
    const binaryString = atob(pcmBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    const buffer = bytes.buffer;
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    const writeString = (v, o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.byteLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true); 
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.byteLength, true);
    return URL.createObjectURL(new Blob([wavHeader, buffer], { type: 'audio/wav' }));
}