var socket = io.connect('http://' + document.domain + ':' + location.port);

// SLIDERS

document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll('input[type="range"]').forEach(function(slider) {
        updateSliderValue(slider.id, slider.value);
    });
});

function updateSliderValue(sliderName, value) {
    document.getElementById(sliderName + '-text').value = value;
    socket.emit('slider_change', {sliderName: sliderName, value: value});
}

function updateRangeValue(sliderName, value) {
    var rangeInput = document.getElementById(sliderName);
    var newValue = parseFloat(value);
    if (!isNaN(newValue) && newValue >= parseFloat(rangeInput.min) && newValue <= parseFloat(rangeInput.max)) {
        rangeInput.value = newValue;
        socket.emit('slider_change', {sliderName: sliderName, value: newValue});
    }
}

function submitSliders() {
    var slidersData = {};
    var textData = document.getElementById('text').value;

    var modelSelector = document.getElementById('modelSelector')
    var modelSize = modelSelector.value;

    var audioElement = document.getElementById('audio-preview');
    audioSrc = audioElement.src;

    if (modelSize !== "melody" || audioSrc === "") {
        document.querySelectorAll('input[type="range"]').forEach(function(slider) {
            slidersData[slider.id] = slider.value;
        });
        socket.emit('submit_sliders', {values: slidersData, prompt:textData, model:modelSize});
        return;
    }

    document.querySelectorAll('input[type="range"]').forEach(function(slider) {
        slidersData[slider.id] = slider.value;
    });
    socket.emit('submit_sliders', {values: slidersData, prompt:textData, model:modelSize, melodyUrl:audioSrc});
}

// TOOLTIPS (keep bubbles from overflowing the viewport)

function positionTooltip(icon) {
    const bubble = icon.querySelector('.tooltip-bubble');
    if (!bubble) {
        return;
    }
    bubble.style.transform = 'none';
    const margin = 10;
    const rect = bubble.getBoundingClientRect();
    if (rect.right > window.innerWidth - margin) {
        const shift = rect.right - (window.innerWidth - margin);
        bubble.style.transform = `translateX(-${shift}px)`;
    }
}

document.querySelectorAll('.info-icon').forEach(function(icon) {
    icon.addEventListener('mouseenter', function() { positionTooltip(icon); });
    icon.addEventListener('focus', function() { positionTooltip(icon); });
});

// MELODY MODEL FIELD + DROPZONE

const PROMPT_HINTS = {
    small: 'Describe the music you want, e.g. "upbeat acoustic guitar melody".',
    medium: 'Describe the music you want, e.g. "slow, emotional piano piece".',
    large: 'Describe the music you want, in as much detail as you like - larger models follow complex prompts better.',
    melody: 'Describe the style/instrumentation you want. Optionally drop a melody reference above to guide the pitch and rhythm.',
};

document.addEventListener('DOMContentLoaded', function() {
    var modelSelector = document.getElementById('modelSelector');
    var melodyField = document.getElementById('melody-field');
    var audioElement = document.getElementById('audio-preview');
    var fileInput = document.getElementById('melody');
    var dropzone = document.getElementById('melody-dropzone');
    var filenameLabel = document.getElementById('melody-filename');
    var promptHint = document.getElementById('prompt-hint');
    var promptText = document.getElementById('text');
    var submitButton = document.querySelector('.submit-button');

    function updateModelUI() {
        fileInput.value = "";
        audioElement.src = "";
        filenameLabel.textContent = "";
        melodyField.style.display = (modelSelector.value !== 'melody') ? 'none' : 'block';
        promptHint.textContent = PROMPT_HINTS[modelSelector.value] || '';
    }
    modelSelector.addEventListener('change', updateModelUI);
    updateModelUI();

    function updateSubmitState() {
        submitButton.disabled = promptText.value.trim() === '';
    }
    promptText.addEventListener('input', updateSubmitState);
    updateSubmitState();

    async function handleMelodyFile(file) {
        if (!file || !file.type.startsWith('audio/')) {
            return;
        }

        filenameLabel.textContent = file.name;

        var formData = new FormData();
        formData.append('melody', file);

        try {
            const response = await fetch('/upload_melody', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            audioElement.src = data.filePath;
        } catch (error) {
            audioElement.src = "";
            filenameLabel.textContent = "";
        }
    }

    fileInput.addEventListener('change', function(event) {
        var files = event.target.files;
        if (files.length === 0) {
            audioElement.src = "";
            filenameLabel.textContent = "";
            return;
        }
        handleMelodyFile(files[0]);
    });

    ['dragenter', 'dragover'].forEach(function(eventName) {
        dropzone.addEventListener(eventName, function(event) {
            event.preventDefault();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(function(eventName) {
        dropzone.addEventListener(eventName, function(event) {
            event.preventDefault();
            dropzone.classList.remove('dragover');
        });
    });
});

// ADD TO QUEUE

socket.on('add_to_queue', function(data) {
    addPromptToQueue(data.prompt);
});

function addPromptToQueue(prompt_data) {
    const promptListDiv = document.querySelector('.prompt-queue');

    const promptItemDiv = document.createElement('div');
    promptItemDiv.className = 'audio-item';

    const promptItemTextDiv = document.createElement('div');
    promptItemTextDiv.className = 'audio-item-text';
    promptItemTextDiv.textContent = prompt_data;

    const progressTrack = document.createElement('div');
    progressTrack.className = 'progress-track';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressTrack.appendChild(progressFill);

    const promptItemStatusDiv = document.createElement('div');
    promptItemStatusDiv.className = 'audio-item-status';
    promptItemStatusDiv.textContent = 'Queued...';

    promptItemDiv.appendChild(promptItemTextDiv);
    promptItemDiv.appendChild(progressTrack);
    promptItemDiv.appendChild(promptItemStatusDiv);
    promptListDiv.appendChild(promptItemDiv);
}

// STATUS (model loading / melody processing / generating)

const STATUS_LABELS = {
    'loading_model': 'Loading model...',
    'processing_melody': 'Processing melody...',
    'generating': 'Generating...',
    'failed': 'Failed to load model - check the console',
};

socket.on('status', function(data) {
    const promptListDiv = document.querySelector('.prompt-queue');
    const firstPromptItem = promptListDiv.querySelector('.audio-item');
    if (!firstPromptItem) {
        return;
    }

    const statusDiv = firstPromptItem.querySelector('.audio-item-status');
    if (statusDiv) {
        statusDiv.textContent = STATUS_LABELS[data.phase] || data.phase;
    }
});

// AUDIO RENDERED

socket.on('on_finish_audio', function(data) {
    const promptListDiv = document.querySelector('.prompt-queue');
    const firstPromptItem = promptListDiv.querySelector('.audio-item');
    if (firstPromptItem) {
        promptListDiv.removeChild(firstPromptItem);
    }

    addAudioToList(data.filename, data.json_filename);
});

function makeAudioElement(json_data, filename, use_reverse_ordering) {
    const audioListDiv = document.querySelector('.audio-list');

    const audioItemDiv = document.createElement('div');
    audioItemDiv.className = 'audio-item';

    const promptDiv = document.createElement('div');
    promptDiv.className = 'audio-item-text';
    promptDiv.textContent = `${json_data.prompt}`;

    const parametersDiv = document.createElement('div');
    parametersDiv.className = 'audio-item-params';

    const modelDiv = document.createElement('div');
    modelDiv.className = 'audio-item-text';
    modelDiv.textContent = `Model: ${json_data.model}`;
    parametersDiv.appendChild(modelDiv);

    for (const key in json_data.parameters) {
        const paramDiv = document.createElement('div');
        paramDiv.className = 'audio-item-text';
        paramDiv.textContent = `${key}: ${json_data.parameters[key]}`;
        parametersDiv.appendChild(paramDiv);
    }

    const audio = document.createElement('audio');
    audio.controls = true;

    const source = document.createElement('source');
    source.src = filename;
    source.type = 'audio/wav';

    audioItemDiv.appendChild(promptDiv);
    audio.appendChild(source);
    audioItemDiv.appendChild(audio);
    audioItemDiv.appendChild(parametersDiv);

    if(use_reverse_ordering) {
        audioListDiv.appendChild(audioItemDiv);
        return
    }

    if (audioListDiv.firstChild) {
        audioListDiv.insertBefore(audioItemDiv, audioListDiv.firstChild);
    } else {
        audioListDiv.appendChild(audioItemDiv);
    }
}

function addAudioToList(filename, json_filename) {
    fetch(json_filename)
    .then(response => response.json())
    .then(json_data => makeAudioElement(json_data, filename, false))
}

// PROGRESS

socket.on('progress', function(data) {
    const progress_value = data.progress * 100;

    const promptListDiv = document.querySelector('.prompt-queue');
    const firstPromptItem = promptListDiv.querySelector('.audio-item');

    if (firstPromptItem) {
        const fill = firstPromptItem.querySelector('.progress-fill');
        if (fill) {
            fill.style.width = progress_value + '%';
        }

        const statusDiv = firstPromptItem.querySelector('.audio-item-status');
        if (statusDiv) {
            statusDiv.textContent = `Generating... ${Math.round(progress_value)}%`;
        }
    }
});

function addAudiosToList(pairs) {
    // Use map to transform each pair into a fetch promise
    const fetchPromises = pairs.map(pair => {
        const [filename, json_filename] = pair;
        return fetch(json_filename)
            .then(response => {
                const lastModified = response.headers.get("Last-Modified");
                const lastModifiedDate = new Date(lastModified);
                return response.json().then(json_data => {
                    return { json_data, filename, lastModifiedDate };
                });
            });
    });

    const audioListDiv = document.querySelector('.audio-list');
    while (audioListDiv.firstChild) {
        audioListDiv.removeChild(audioListDiv.firstChild);
    }

    Promise.all(fetchPromises)
    .then(results => {
        const sortedResults = results.sort((a, b) => b.lastModifiedDate - a.lastModifiedDate);

        sortedResults.forEach(item => {
            makeAudioElement(item.json_data, item.filename, true);
        });
    })
    .catch(error => {
        console.error("Error fetching data:", error);
    });
}

// INITIALIZE

socket.on('audio_json_pairs', function(data) {
    addAudiosToList(data)
});
