document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const recordBtn = document.getElementById('recordBtn');
    const recordText = document.getElementById('recordText');
    const audioUpload = document.getElementById('audioUpload');
    const fileNameDisplay = document.getElementById('fileName');
    const recordingStatus = document.getElementById('recordingStatus');
    const recordingTime = document.getElementById('recordingTime');
    const transcriptionOutput = document.getElementById('transcriptionOutput');
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('submitBtn');
    const copyBtn = document.getElementById('copyBtn');
    const audioPlayer = document.getElementById('audioPlayer');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const inputActions = document.getElementById('inputActions');
    const outputContainer = document.getElementById('outputContainer');

    // State
    let isRecording = false;
    let isPaused = false;
    let audioBlob = null;
    let timerInterval;
    let seconds = 0;
    let wavesurfer = null;
    let currentObjectUrl = null;
    
    // Web Audio API variables for WAV recording
    let audioContext = null;
    let analyser = null;
    let scriptProcessor = null;
    let audioSource = null;
    let audioData = [];
    let sampleRate = 44100;

    // Additional DOM
    const pauseRecordBtn = document.getElementById('pauseRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');

    
    const API_URL = "https://rudrakalariya-shrutilekhan-backend.hf.space/transcribe"; 

    // --- Wavesurfer Initialization ---
    wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#a0aec0',
        progressColor: '#2e7d32',
        cursorColor: '#1b5e20',
        barWidth: 2,
        barRadius: 2,
        height: 60,
        normalize: true
    });

    wavesurfer.on('finish', () => {
        playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    });



    playPauseBtn.addEventListener('click', () => {
        wavesurfer.playPause();
        if (wavesurfer.isPlaying()) {
            playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        } else {
            playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
    });

    function loadAudioToPlayer(blob) {
        if (!blob) return;
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
        }
        currentObjectUrl = URL.createObjectURL(blob);
        wavesurfer.load(currentObjectUrl);
        
        inputActions.classList.add('hidden');
        audioPlayer.classList.remove('hidden');
        playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    // --- Audio Recording Logic ---

    recordBtn.addEventListener('click', async () => {
        if (!isRecording) {
            await startRecording();
        }
    });

    stopRecordBtn.addEventListener('click', stopRecording);

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    noiseSuppression: true,
                    echoCancellation: true,
                    autoGainControl: true
                } 
            });
            
            isRecording = true;
            isPaused = false;
            audioData = [];
            
            // UI Updates
            inputActions.classList.add('hidden');
            recordingStatus.classList.remove('hidden');
            pauseRecordBtn.innerHTML = '<i class="fa-solid fa-pause"></i><span id="pauseRecordText">Pause</span>';
            
            // Web Audio API for Live Visualizer & WAV Recording
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            sampleRate = audioContext.sampleRate;
            audioSource = audioContext.createMediaStreamSource(stream);
            
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 64; 
            audioSource.connect(analyser);
            
            scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
            audioSource.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);
            
            scriptProcessor.onaudioprocess = function(e) {
                if (isRecording && !isPaused) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    audioData.push(new Float32Array(inputData));
                }
            };
            
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const canvas = document.getElementById('liveWaveform');
            const canvasCtx = canvas.getContext('2d');
            
            function drawVisualizer() {
                if (!isRecording) return;
                requestAnimationFrame(drawVisualizer);
                
                if (!isPaused) {
                    analyser.getByteFrequencyData(dataArray);
                }
                
                canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
                
                const barWidth = (canvas.width / bufferLength) * 1.5;
                let x = 0;
                
                for(let i = 0; i < bufferLength; i++) {
                    const barHeight = (dataArray[i] / 255) * canvas.height;
                    const y = (canvas.height - barHeight) / 2;
                    
                    canvasCtx.fillStyle = '#e53e3e';
                    canvasCtx.beginPath();
                    canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
                    canvasCtx.fill();
                    x += barWidth + 2;
                }
            }
            drawVisualizer();

            // Start Timer
            seconds = 0;
            updateTimerDisplay();
            timerInterval = setInterval(() => {
                seconds++;
                updateTimerDisplay();
            }, 1000);

        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please check your permissions.");
        }
    }

    pauseRecordBtn.addEventListener('click', () => {
        if (!isRecording) return;
        
        if (isPaused) {
            // Resume
            isPaused = false;
            pauseRecordBtn.innerHTML = '<i class="fa-solid fa-pause"></i><span id="pauseRecordText">Pause</span>';
            document.querySelector('.pulse-ring').style.animationPlayState = 'running';
            timerInterval = setInterval(() => {
                seconds++;
                updateTimerDisplay();
            }, 1000);
        } else {
            // Pause
            isPaused = true;
            pauseRecordBtn.innerHTML = '<i class="fa-solid fa-play"></i><span id="pauseRecordText">Resume</span>';
            document.querySelector('.pulse-ring').style.animationPlayState = 'paused';
            clearInterval(timerInterval);
        }
    });

    function stopRecording() {
        isRecording = false;
        isPaused = false;
        clearInterval(timerInterval);
        
        if (scriptProcessor) {
            scriptProcessor.disconnect();
        }
        if (audioSource) {
            audioSource.disconnect();
            if (audioSource.mediaStream) {
                audioSource.mediaStream.getTracks().forEach(track => track.stop());
            }
        }
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }
        
        if (audioData.length > 0) {
            const trimmedSamples = trimSilence(audioData, sampleRate);
            if (trimmedSamples.length > 0) {
                audioBlob = encodeWAV(trimmedSamples, sampleRate);
                console.log("Recording stopped. WAV Blob created.", audioBlob);
                fileNameDisplay.textContent = "Recorded Audio";
                audioUpload.value = ""; 
                loadAudioToPlayer(audioBlob);
            } else {
                alert("Audio was entirely silence. Please try again.");
            }
        }
        
        // UI Updates
        recordingStatus.classList.add('hidden');
        document.querySelector('.pulse-ring').style.animationPlayState = 'running';
    }

    function trimSilence(audioData, sampleRate, threshold = 0.02, paddingMs = 300) {
        let totalLength = 0;
        for (let i = 0; i < audioData.length; i++) {
            totalLength += audioData[i].length;
        }
        
        let samples = new Float32Array(totalLength);
        let offset = 0;
        for (let i = 0; i < audioData.length; i++) {
            samples.set(audioData[i], offset);
            offset += audioData[i].length;
        }

        let startIndex = 0;
        for (let i = 0; i < samples.length; i++) {
            if (Math.abs(samples[i]) > threshold) {
                startIndex = i;
                break;
            }
        }

        let endIndex = samples.length - 1;
        for (let i = samples.length - 1; i >= 0; i--) {
            if (Math.abs(samples[i]) > threshold) {
                endIndex = i;
                break;
            }
        }

        const paddingSamples = Math.floor((paddingMs / 1000) * sampleRate);
        startIndex = Math.max(0, startIndex - paddingSamples);
        endIndex = Math.min(samples.length - 1, endIndex + paddingSamples);

        if (startIndex >= endIndex) return new Float32Array(0);
        return samples.slice(startIndex, endIndex + 1);
    }

    function encodeWAV(result, sampleRate) {
        let buffer = new ArrayBuffer(44 + result.length * 2);
        let view = new DataView(buffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + result.length * 2, true);
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
        view.setUint32(40, result.length * 2, true);

        let idx = 44;
        for (let i = 0; i < result.length; i++, idx += 2) {
            let s = Math.max(-1, Math.min(1, result[i]));
            view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    function updateTimerDisplay() {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        recordingTime.textContent = `${mins}:${secs}`;
    }

    // --- File Upload Logic ---

    audioUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            audioBlob = file;
            fileNameDisplay.textContent = file.name;
            // Clear recording state if any
            if (isRecording) stopRecording();
            loadAudioToPlayer(audioBlob);
        } else {
            fileNameDisplay.textContent = "No file selected";
            audioBlob = null;
        }
    });

    // --- Action Buttons ---

    clearBtn.addEventListener('click', () => {
        if (isRecording) stopRecording();
        audioBlob = null;
        fileNameDisplay.textContent = "No file selected";
        audioUpload.value = "";
        transcriptionOutput.value = "";
        outputContainer.classList.add('hidden');
        
        audioPlayer.classList.add('hidden');
        inputActions.classList.remove('hidden');
        
        if (wavesurfer) {
            wavesurfer.stop();
            wavesurfer.empty();
        }
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }
    });

    let progressInterval;
    function startProgress() {
        const fill = document.getElementById('progressBarFill');
        const container = document.getElementById('progressBarContainer');
        container.classList.remove('hidden');
        submitBtn.classList.add('hidden'); 
        clearBtn.classList.add('hidden');
        
        fill.style.width = '0%';
        let progress = 0;
        
        progressInterval = setInterval(() => {
            if (progress < 90) {
                const increment = Math.random() * 3 + 1; 
                progress += increment;
                if(progress > 90) progress = 90;
                fill.style.width = `${progress}%`;
            }
        }, 500);
    }
    
    function stopProgress() {
        clearInterval(progressInterval);
        const fill = document.getElementById('progressBarFill');
        const container = document.getElementById('progressBarContainer');
        
        fill.style.width = '100%';
        
        return new Promise(resolve => {
            setTimeout(() => {
                container.classList.add('hidden');
                submitBtn.classList.remove('hidden');
                clearBtn.classList.remove('hidden');
                resolve();
            }, 600); 
        });
    }

    function typeText(element, text, speed = 40) {
        element.value = "";
        let i = 0;
        return new Promise(resolve => {
            function type() {
                if (i < text.length) {
                    element.value += text.charAt(i);
                    element.scrollTop = element.scrollHeight;
                    i++;
                    setTimeout(type, speed);
                } else {
                    resolve();
                }
            }
            if (text && text.length > 0) {
                type();
            } else {
                resolve();
            }
        });
    }

    submitBtn.addEventListener('click', async () => {
        if (!audioBlob) {
            alert("Please record or upload audio first.");
            return;
        }

        submitBtn.disabled = true;

        try {
            startProgress();
            const formData = new FormData();
            formData.append("audio", audioBlob, audioBlob.name || "recording.wav");

            const response = await fetch(
                "https://rudrakalariya-shrutilekhan-backend.hf.space/transcribe",
                {
                    method: "POST",
                    body: formData
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Backend Response:", data); 
            
            await stopProgress();
            
            outputContainer.classList.remove('hidden');
            const resultText = data.transcription || data.text || (typeof data === 'string' ? data : JSON.stringify(data));
            await typeText(transcriptionOutput, resultText, 45); 

        } catch (error) {
            console.error("Error during submission:", error);
            await stopProgress();
            outputContainer.classList.remove('hidden');
            transcriptionOutput.value = "Error processing audio. Please try again.";
        } finally {
            submitBtn.disabled = false;
        }
    });

    copyBtn.addEventListener('click', () => {
        const text = transcriptionOutput.value;
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                const tooltip = copyBtn.querySelector('.tooltip-text');
                const originalText = tooltip.textContent;
                tooltip.textContent = "Copied!";
                setTimeout(() => {
                    tooltip.textContent = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        }
    });
});
