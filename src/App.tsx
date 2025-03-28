import { Camera, Loader2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Tesseract, { WorkerOptions } from 'tesseract.js';

interface CustomWorkerOptions extends WorkerOptions {
  tessedit_char_whitelist?: string;
  tessedit_pageseg_mode?: string;
  tessedit_ocr_engine_mode?: string;
}

const LocalMeterReadingOCR = () => {
  const [extractedReading, setExtractedReading] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [ocrDebug, setOcrDebug] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      setDebugMessage('Video element initialized');
    } else {
      setDebugMessage('Video element not available');
    }
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup: stop the camera stream when component unmounts
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      setDebugMessage('Starting camera setup...');

      // Wait briefly for video element to be available
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setDebugMessage('Error: Camera API not available on this device/browser');
        return;
      }

      if (!videoRef.current) {
        setDebugMessage('Error: Video element not available after delay');
        return;
      }

      // iOS Safari specific setup
      const videoElement = videoRef.current;
      videoElement.setAttribute('autoplay', '');
      videoElement.setAttribute('muted', '');
      videoElement.setAttribute('playsinline', '');
      videoElement.muted = true;

      setDebugMessage('Requesting camera access...');

      // Start with basic constraints for iOS
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
      } catch (error) {
        // Check if this is an iOS Safari permission issue
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        if (isIOS && isSafari) {
          setDebugMessage('Camera access denied. To enable:\n1. Go to Settings > Safari > Camera\n2. Find this website\n3. Set to "Allow"\n\nThen refresh this page.');
        } else {
          setDebugMessage('Camera access denied or not available. Please check camera permissions in your browser settings.');
        }
        return;
      }

      setDebugMessage('Camera access granted, setting up video...');

      // Ensure clean state
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Set up video stream
      videoElement.srcObject = stream;
      streamRef.current = stream;

      setDebugMessage('Stream assigned to video element...');

      // Log stream tracks
      const tracks = stream.getVideoTracks();
      setDebugMessage(`Found ${tracks.length} video tracks. Active: ${tracks[0]?.enabled}`);

      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        videoElement.onloadedmetadata = async () => {
          setDebugMessage(`Video dimensions: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
          try {
            await videoElement.play();
            setDebugMessage('Video playback started');
            resolve();
          } catch (_playError) {
            setDebugMessage('Attempting alternate play method...');
            // iOS sometimes needs a user gesture, we'll handle this in the UI
            resolve();
          }
        };

        videoElement.onerror = () => {
          setDebugMessage(`Video error: ${videoElement.error?.message || 'Unknown error'}`);
          resolve();
        };
      });

      setIsCameraActive(true);
      setDebugMessage('Camera initialized');

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setDebugMessage(`Camera error: ${errorMessage}`);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      streamRef.current = null;
      setIsCameraActive(false);
    }
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the current video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to data URL and set as preview
    const imageDataUrl = canvas.toDataURL('image/jpeg');
    setPreviewImage(imageDataUrl);
    stopCamera();

    // Process the captured image
    performOCR(imageDataUrl);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          setPreviewImage(result);
          const img = new Image();
          img.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            canvas.width = img.width;
            canvas.height = img.height;

            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const brightness =
                0.34 * data[i] + 0.5 * data[i + 1] + 0.16 * data[i + 2];
              const threshold = 127;
              const newValue = brightness > threshold ? 255 : 0;
              data[i] = newValue;
              data[i + 1] = newValue;
              data[i + 2] = newValue;
            }
            ctx.putImageData(imageData, 0, 0);

            performOCR(canvas.toDataURL());
          };
          img.src = result;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const performOCR = async (imageDataUrl: string) => {
    setIsProcessing(true);
    setExtractedReading('');

    try {
      // Pre-process the image
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = imageDataUrl;
      });

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas dimensions
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // Calculate the red box dimensions (75% width, fixed height of 64px)
      const cropWidth = Math.floor(canvas.width * 0.75);
      const cropHeight = Math.floor(canvas.height * 0.25); // Adjust based on red box height
      const cropX = Math.floor((canvas.width - cropWidth) / 2);
      const cropY = Math.floor((canvas.height - cropHeight) / 2);

      // Get the cropped image data
      const croppedImageData = ctx.getImageData(cropX, cropY, cropWidth, cropHeight);

      // Clear canvas and draw only the cropped portion
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      ctx.putImageData(croppedImageData, 0, 0);

      // Enhanced preprocessing for LCD digits
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Enhance contrast specifically for LCD digits
      for (let i = 0; i < data.length; i += 4) {
        const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const contrast = 3.0; // Higher contrast for LCD
        const threshold = 160; // Adjusted threshold for LCD

        const adjustedBrightness = contrast * (brightness - 128) + 128;
        const newValue = adjustedBrightness > threshold ? 255 : 0;

        data[i] = newValue;     // R
        data[i + 1] = newValue; // G
        data[i + 2] = newValue; // B
      }

      ctx.putImageData(imageData, 0, 0);

      // Scale up the image to help with small character detection
      const scaleFactor = 2.5; // Increased scale factor
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width * scaleFactor;
      tempCanvas.height = canvas.height * scaleFactor;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      // Use better scaling algorithm
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';
      tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);

      const processedImageDataUrl = tempCanvas.toDataURL('image/jpeg', 1.0);

      // Configure Tesseract with optimized settings for LCD digits
      const result = await Tesseract.recognize(processedImageDataUrl, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setDebugMessage(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
        tessedit_char_whitelist: '0123456789.',
        tessedit_pageseg_mode: '7', // Treat the image as a single line of text
        tessedit_ocr_engine_mode: '1', // Use neural nets mode
      } as CustomWorkerOptions);

      const { text } = result.data;
      const debugInfo = [];
      debugInfo.push(`Raw text: ${text}`);
      debugInfo.push(`Confidence: ${result.data.confidence}%`);

      // Clean up the recognized text
      const cleanedText = text.replace(/[^\d,.]/g, '');
      debugInfo.push(`Cleaned text: ${cleanedText}`);

      // Try different patterns to match the meter reading
      let reading = null;

      // Pattern 1: Look for exact format with comma
      const pattern1 = cleanedText.match(/(\d{7}),(\d)/);
      if (pattern1) {
        reading = `${pattern1[1]},${pattern1[2]}`;
        debugInfo.push(`Matched exact pattern: ${reading}`);
      }

      // Pattern 2: Find 8 consecutive digits and insert comma
      if (!reading) {
        const pattern2 = cleanedText.match(/(\d{7})(\d)/);
        if (pattern2) {
          reading = `${pattern2[1]},${pattern2[2]}`;
          debugInfo.push(`Matched 8 digits: ${reading}`);
        }
      }

      // Pattern 3: Find 7 digits and look for a following digit
      if (!reading) {
        const pattern3 = cleanedText.match(/(\d{7})[,.]?(\d)?/);
        if (pattern3) {
          reading = pattern3[2] ? `${pattern3[1]},${pattern3[2]}` : pattern3[1];
          debugInfo.push(`Matched 7 digits + optional: ${reading}`);
        }
      }

      // Format the reading: remove leading zeros
      if (reading) {
        const [intPart, decPart] = reading.split(/[,.]/);
        const formattedInt = intPart.replace(/^0+/, '') || '0';
        reading = decPart ? `${formattedInt},${decPart}` : formattedInt;
        debugInfo.push(`Final reading: ${reading}`);
      }

      setOcrDebug(debugInfo);
      setExtractedReading(reading || 'No reading detected');

    } catch (error) {
      console.error('OCR Error:', error);
      setExtractedReading('Error processing image');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-center">
          <h2 className="text-2xl font-bold text-white">Meter Reading OCR</h2>
        </div>

        <div className="p-6 space-y-4">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            ref={fileInputRef}
            className="hidden"
          />

          {/* Always render video element but hide it when not active */}

          <div className={`relative z-10 w-full ${!isCameraActive && 'hidden'}`}>
            <div className="absolute z-10 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 border-2 border-red-500 rounded w-3/4 h-16 pointer-events-none"></div>
            <div className="absolute top-0 left-0 right-0 bg-black/70 text-white p-2 text-sm">
              {debugMessage}
            </div>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="w-full h-64 object-cover inset-0 z-40 rounded-lg"
            />
            <div className="flex justify-center mt-4">
              <button
                onClick={captureImage}
                className="bg-white rounded-full mx-auto p-4 shadow-lg flex items-center space-x-2"
              >
                <span className="text-blue-500">Capture</span>
                <Camera size={24} className="text-blue-500" />
              </button>
            </div>
          </div>

          {!previewImage && !isCameraActive ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 bg-gray-100 p-2 rounded mb-2">{debugMessage || 'Tap the box below to start camera'}</p>
              <div
                onClick={() => {
                  setDebugMessage('Starting camera from click...');
                  startCamera();
                }}
                className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
              >
                <Camera className="mx-auto mb-4 text-gray-400" size={48} />
                <p className="text-gray-500">Tap to start camera</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-blue-500 text-white rounded-lg p-3 flex items-center justify-center space-x-2 hover:bg-blue-600 transition-colors"
              >
                <Upload size={20} />
                <span>Upload Image</span>
              </button>
            </div>
          ) : isCameraActive ? (
            <div className="relative" />
          ) : (
            <div className="relative">
              <img
                src={previewImage || undefined}
                alt="Preview"
                className="w-full h-64 object-cover rounded-lg"
              />
              <button
                onClick={() => {
                  setPreviewImage(null);
                  startCamera();
                }}
                className="absolute top-2 right-2 bg-white/80 p-2 rounded-full hover:bg-white transition-colors"
              >
                <Camera size={20} />
              </button>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />

          {isProcessing && (
            <div className="flex items-center justify-center space-x-2 text-blue-600">
              <Loader2 className="animate-spin" />
              <span>Processing image...</span>
            </div>
          )}

          {extractedReading && !isProcessing && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-center">
                <span className="text-2xl font-bold text-green-700">
                  {extractedReading}
                </span>
                <p className="text-sm text-green-600 mt-2">Meter Reading</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-2">Debug Information:</p>
                {ocrDebug.map((debug, index) => (
                  <p key={index} className="text-xs text-gray-600">{debug}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LocalMeterReadingOCR;
