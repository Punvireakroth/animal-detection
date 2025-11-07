// Main Application Logic
let detector;
let currentImage;
let currentDetections;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Application starting...');
    
    // Initialize detector
    detector = new AnimalDetector();
    
    // Populate class list
    populateClassList();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load model in background
    console.log('Preloading model...');
    await detector.loadModel();
});

function populateClassList() {
    const classList = document.getElementById('classList');
    classList.innerHTML = ''; // Clear existing
    detector.classNames.forEach(cls => {
        const li = document.createElement('li');
        li.textContent = `${cls.emoji} ${cls.km} (${cls.en})`;
        classList.appendChild(li);
    });
}

function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');

    // Upload button click
    uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    
    uploadArea.addEventListener('click', (e) => {
        if (e.target.id !== 'uploadBtn') {
            fileInput.click();
        }
    });

    // File input change
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // Action buttons
    analyzeBtn.addEventListener('click', analyzeImage);
    downloadBtn.addEventListener('click', downloadResult);
    resetBtn.addEventListener('click', reset);
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        loadImage(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        loadImage(files[0]);
    }
}

function loadImage(file) {
    console.log('Loading image:', file.name);
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('សូមជ្រើសរើសឯកសាររូបភាពតែប៉ុណ្ណោះ!\nPlease select an image file only!');
        return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('រូបភាពធំពេក! សូមជ្រើសរើសរូបភាពតូចជាង 10MB\nImage too large! Please select an image smaller than 10MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            console.log('Image loaded:', img.width, 'x', img.height);
            currentImage = img;
            displayImage(img);
            showPreviewSection();
        };
        img.onerror = () => {
            alert('មិនអាចផ្ទុករូបភាពបានទេ!\nCannot load image!');
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        alert('មិនអាចអានឯកសារបានទេ!\nCannot read file!');
    };
    reader.readAsDataURL(file);
}

function displayImage(img) {
    const originalImage = document.getElementById('originalImage');
    originalImage.src = img.src;
    
    // Clear previous canvas
    const canvas = document.getElementById('resultCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function showPreviewSection() {
    document.getElementById('previewSection').style.display = 'grid';
    document.getElementById('actionsSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
}

async function analyzeImage() {
    if (!currentImage) {
        alert('សូមជ្រើសរើសរូបភាពមុនសិន!\nPlease select an image first!');
        return;
    }

    console.log('Starting analysis...');

    // Show loading spinner
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultCanvas = document.getElementById('resultCanvas');
    loadingSpinner.style.display = 'block';
    resultCanvas.style.display = 'none';

    try {
        // Run detection
        currentDetections = await detector.detect(currentImage);

        // Draw results
        detector.drawDetections(
            resultCanvas,
            currentImage,
            currentDetections
        );

        // Hide spinner and show results
        loadingSpinner.style.display = 'none';
        resultCanvas.style.display = 'block';

        // Display results
        displayResults(currentDetections);

    } catch (error) {
        console.error('Detection error:', error);
        alert(`មានបញ្ហាក្នុងការវិភាគរូបភាព។\nError: ${error.message}\n\nសូមពិនិត្យ Console សម្រាប់ព័ត៌មានលម្អិត`);
        loadingSpinner.style.display = 'none';
        resultCanvas.style.display = 'none';
    }
}

function displayResults(detections) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsGrid = document.getElementById('resultsGrid');
    const statsContainer = document.getElementById('statsContainer');

    // Clear previous results
    resultsGrid.innerHTML = '';
    statsContainer.innerHTML = '';

    if (detections.length === 0) {
        resultsGrid.innerHTML = `
            <div class="result-card" style="grid-column: 1 / -1;">
                <h4>❌ រកមិនឃើញសត្វ</h4>
                <p>សូមព្យាយាមជាមួយរូបភាពផ្សេងទៀត ឬបន្ថយកម្រិតជឿជាក់</p>
                <p style="margin-top: 10px; opacity: 0.8;">No animals detected. Try another image or adjust confidence threshold.</p>
            </div>
        `;
    } else {
        // Create result cards
        detections.forEach((detection, index) => {
            const card = createResultCard(detection, index);
            resultsGrid.appendChild(card);
        });

        // Create statistics
        const stats = calculateStatistics(detections);
        const statsDisplay = createStatsDisplay(stats);
        statsContainer.appendChild(statsDisplay);
    }

    resultsSection.style.display = 'block';
}

function createResultCard(detection, index) {
    const card = document.createElement('div');
    card.className = 'result-card';
    
    const confidencePercent = (detection.confidence * 100).toFixed(1);
    const [x1, y1, x2, y2] = detection.bbox.map(Math.round);
    const width = x2 - x1;
    const height = y2 - y1;

    card.innerHTML = `
        <h4>${detection.className.emoji} ${detection.className.km}</h4>
        <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${confidencePercent}%">
                ${confidencePercent}%
            </div>
        </div>
        <div class="result-details">
            <p><strong>ភាសាអង់គ្លេស:</strong> ${detection.className.en}</p>
            <p><strong>ទីតាំង:</strong> (${x1}, ${y1}) → (${x2}, ${y2})</p>
            <p><strong>ទំហំ:</strong> ${width} × ${height} pixels</p>
            <p><strong>កម្រិតជឿជាក់:</strong> ${confidencePercent}%</p>
        </div>
    `;

    return card;
}

function calculateStatistics(detections) {
    const classCounts = {};
    let totalConfidence = 0;

    detections.forEach(det => {
        const className = det.className.km;
        classCounts[className] = (classCounts[className] || 0) + 1;
        totalConfidence += det.confidence;
    });

    return {
        total: detections.length,
        avgConfidence: totalConfidence / detections.length,
        classCounts: classCounts,
        maxConfidence: Math.max(...detections.map(d => d.confidence))
    };
}

function createStatsDisplay(stats) {
    const container = document.createElement('div');
    container.style.display = 'contents';

    const statItems = [
        {
            value: stats.total,
            label: 'ចំនួនសត្វដែលរកឃើញ'
        },
        {
            value: `${(stats.avgConfidence * 100).toFixed(1)}%`,
            label: 'ភាពត្រឹមត្រូវមធ្យម'
        },
        {
            value: `${(stats.maxConfidence * 100).toFixed(1)}%`,
            label: 'ភាពត្រឹមត្រូវខ្ពស់បំផុត'
        },
        {
            value: Object.keys(stats.classCounts).length,
            label: 'ប្រភេទសត្វខុសៗគ្នា'
        }
    ];

    statItems.forEach(item => {
        const statDiv = document.createElement('div');
        statDiv.className = 'stat-item';
        statDiv.innerHTML = `
            <div class="stat-value">${item.value}</div>
            <div class="stat-label">${item.label}</div>
        `;
        container.appendChild(statDiv);
    });

    return container;
}

function downloadResult() {
    const canvas = document.getElementById('resultCanvas');
    
    if (!canvas.width || !canvas.height) {
        alert('សូមវិភាគរូបភាពមុនសិន!\nPlease analyze an image first!');
        return;
    }
    
    // Create download link
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `animal_detection_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.95);
}

function reset() {
    console.log('Resetting application...');
    
    // Clear current data
    currentImage = null;
    currentDetections = null;

    // Reset file input
    document.getElementById('fileInput').value = '';

    // Hide sections
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('actionsSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';

    // Clear images
    document.getElementById('originalImage').src = '';
    const canvas = document.getElementById('resultCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}