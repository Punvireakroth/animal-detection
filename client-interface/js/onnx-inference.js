// ONNX Model Inference Handler
class AnimalDetector {
    constructor() {
        this.session = null;
        this.modelPath = 'models/best.onnx';
        this.inputSize = 640;
        this.confidenceThreshold = 0.25;
        this.iouThreshold = 0.45;
        
        // IMPORTANT: Match the exact classes from your training data.yaml
        // From your training: ['cane', 'cavallo', 'elefante', 'farfalla', 'gallina']
        this.classNames = [
            { km: 'ឆ្កែ', en: 'cane', emoji: '🐕' },        // dog (cane in Italian)
            { km: 'សេះ', en: 'cavallo', emoji: '🐎' },      // horse (cavallo in Italian)
            { km: 'ដំរី', en: 'elefante', emoji: '🐘' },    // elephant (elefante in Italian)
            { km: 'មេអំបៅ', en: 'farfalla', emoji: '🦋' },  // butterfly (farfalla in Italian)
            { km: 'មាន់', en: 'gallina', emoji: '🐔' }      // chicken (gallina in Italian)
        ];
        
        // Class colors for visualization
        this.colors = [
            [255, 0, 0],      // Red
            [0, 255, 0],      // Green
            [0, 0, 255],      // Blue
            [255, 255, 0],    // Yellow
            [255, 0, 255]     // Magenta
        ];
    }

    async loadModel() {
        try {
            console.log('Loading ONNX model from:', this.modelPath);
            
            // Check if model file exists by attempting to fetch it
            const response = await fetch(this.modelPath);
            if (!response.ok) {
                throw new Error(`Model file not found at ${this.modelPath}`);
            }
            
            this.session = await ort.InferenceSession.create(this.modelPath, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            
            console.log('Model loaded successfully!');
            console.log('Input names:', this.session.inputNames);
            console.log('Output names:', this.session.outputNames);
            
            return true;
        } catch (error) {
            console.error('Error loading model:', error);
            alert(`មិនអាចផ្ទុក Model បានទេ។\nError: ${error.message}\n\nសូមពិនិត្យមើល:\n1. ឯកសារ best.onnx នៅក្នុងថត models/\n2. កំពុងដំណើរការតាមរយៈ web server\n3. Console សម្រាប់ព័ត៌មានលម្អិត`);
            return false;
        }
    }

    preprocessImage(image) {
        const canvas = document.createElement('canvas');
        canvas.width = this.inputSize;
        canvas.height = this.inputSize;
        const ctx = canvas.getContext('2d');

        // Calculate scaling to maintain aspect ratio
        const scale = Math.min(
            this.inputSize / image.width,
            this.inputSize / image.height
        );
        const scaledWidth = image.width * scale;
        const scaledHeight = image.height * scale;
        const x = (this.inputSize - scaledWidth) / 2;
        const y = (this.inputSize - scaledHeight) / 2;

        // Fill with gray background and draw image
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, this.inputSize, this.inputSize);
        ctx.drawImage(image, x, y, scaledWidth, scaledHeight);

        // Get image data and convert to tensor
        const imageData = ctx.getImageData(0, 0, this.inputSize, this.inputSize);
        const pixels = imageData.data;

        // Convert to CHW format (channels, height, width) and normalize to [0, 1]
        const red = [];
        const green = [];
        const blue = [];

        for (let i = 0; i < pixels.length; i += 4) {
            red.push(pixels[i] / 255.0);
            green.push(pixels[i + 1] / 255.0);
            blue.push(pixels[i + 2] / 255.0);
        }

        const inputTensor = new Float32Array([...red, ...green, ...blue]);
        
        return {
            tensor: inputTensor,
            scale: scale,
            offsetX: x,
            offsetY: y
        };
    }

    async detect(image) {
        if (!this.session) {
            const loaded = await this.loadModel();
            if (!loaded) {
                throw new Error('Failed to load model');
            }
        }

        console.log('Starting detection...');
        
        // Preprocess image
        const { tensor, scale, offsetX, offsetY } = this.preprocessImage(image);

        // Create input tensor
        const inputTensor = new ort.Tensor('float32', tensor, [1, 3, this.inputSize, this.inputSize]);

        // Run inference
        const feeds = { images: inputTensor };
        const startTime = performance.now();
        const results = await this.session.run(feeds);
        const endTime = performance.now();
        
        console.log(`Inference time: ${(endTime - startTime).toFixed(2)}ms`);
        console.log('Output keys:', Object.keys(results));

        // Get output tensor (YOLOv8 output is typically named "output0")
        const outputName = this.session.outputNames[0];
        const output = results[outputName];
        
        console.log('Output shape:', output.dims);
        console.log('Output data length:', output.data.length);

        // Process output
        const detections = this.processOutput(
            output.data, 
            output.dims,
            image.width, 
            image.height, 
            scale, 
            offsetX, 
            offsetY
        );

        console.log(`Found ${detections.length} detections`);
        return detections;
    }

    processOutput(output, dims, imgWidth, imgHeight, scale, offsetX, offsetY) {
        const boxes = [];
        
        // YOLOv8 output format: [batch, 84, 8400] or [batch, num_classes + 4, num_boxes]
        // dims[0] = batch (1)
        // dims[1] = 4 + num_classes (4 bbox coords + class scores)
        // dims[2] = number of predictions
        
        const numClasses = this.classNames.length;
        const numBoxes = dims[2];
        const numChannels = dims[1];
        
        console.log(`Processing ${numBoxes} boxes with ${numClasses} classes`);

        for (let i = 0; i < numBoxes; i++) {
            // Get bounding box coordinates (x_center, y_center, width, height)
            const x = output[i];
            const y = output[numBoxes + i];
            const w = output[2 * numBoxes + i];
            const h = output[3 * numBoxes + i];

            // Get class scores (starting after the 4 bbox coordinates)
            const classScores = [];
            for (let c = 0; c < numClasses; c++) {
                classScores.push(output[(4 + c) * numBoxes + i]);
            }

            const maxScore = Math.max(...classScores);
            const classId = classScores.indexOf(maxScore);

            // Filter by confidence threshold
            if (maxScore > this.confidenceThreshold) {
                // Convert from scaled coordinates back to original image coordinates
                const x1 = ((x - w / 2 - offsetX) / scale);
                const y1 = ((y - h / 2 - offsetY) / scale);
                const x2 = ((x + w / 2 - offsetX) / scale);
                const y2 = ((y + h / 2 - offsetY) / scale);

                boxes.push({
                    classId: classId,
                    className: this.classNames[classId],
                    confidence: maxScore,
                    bbox: [
                        Math.max(0, Math.min(imgWidth, x1)),
                        Math.max(0, Math.min(imgHeight, y1)),
                        Math.max(0, Math.min(imgWidth, x2)),
                        Math.max(0, Math.min(imgHeight, y2))
                    ]
                });
            }
        }

        console.log(`Filtered to ${boxes.length} boxes above threshold`);

        // Apply Non-Maximum Suppression
        const finalBoxes = this.nms(boxes);
        console.log(`After NMS: ${finalBoxes.length} boxes`);
        
        return finalBoxes;
    }

    nms(boxes) {
        if (boxes.length === 0) return [];
        
        // Sort by confidence
        boxes.sort((a, b) => b.confidence - a.confidence);

        const selected = [];
        const active = new Array(boxes.length).fill(true);

        for (let i = 0; i < boxes.length; i++) {
            if (!active[i]) continue;

            selected.push(boxes[i]);

            for (let j = i + 1; j < boxes.length; j++) {
                if (!active[j]) continue;

                // Calculate IoU
                const iou = this.calculateIoU(boxes[i].bbox, boxes[j].bbox);

                if (iou > this.iouThreshold) {
                    active[j] = false;
                }
            }
        }

        return selected;
    }

    calculateIoU(box1, box2) {
        const [x1_1, y1_1, x2_1, y2_1] = box1;
        const [x1_2, y1_2, x2_2, y2_2] = box2;

        const xA = Math.max(x1_1, x1_2);
        const yA = Math.max(y1_1, y1_2);
        const xB = Math.min(x2_1, x2_2);
        const yB = Math.min(y2_1, y2_2);

        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const box1Area = (x2_1 - x1_1) * (y2_1 - y1_1);
        const box2Area = (x2_2 - x1_2) * (y2_2 - y1_2);
        const unionArea = box1Area + box2Area - interArea;

        return interArea / (unionArea + 1e-6);
    }

    drawDetections(canvas, image, detections) {
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');

        // Draw original image
        ctx.drawImage(image, 0, 0);

        // Draw detections
        detections.forEach(detection => {
            const [x1, y1, x2, y2] = detection.bbox;
            const color = this.colors[detection.classId % this.colors.length];
            const colorStr = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

            // Draw bounding box
            ctx.strokeStyle = colorStr;
            ctx.lineWidth = 4;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

            // Draw label background
            const label = `${detection.className.km} ${(detection.confidence * 100).toFixed(1)}%`;
            ctx.font = 'bold 18px Arial';
            const textMetrics = ctx.measureText(label);
            const textWidth = textMetrics.width;
            const textHeight = 24;

            ctx.fillStyle = colorStr;
            ctx.fillRect(x1, y1 - textHeight - 8, textWidth + 16, textHeight + 8);

            // Draw label text
            ctx.fillStyle = 'white';
            ctx.fillText(label, x1 + 8, y1 - 10);
        });

        return canvas;
    }
}