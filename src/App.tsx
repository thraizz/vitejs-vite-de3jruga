import React, { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { Camera, Upload, Loader2 } from 'lucide-react';

const LocalMeterReadingOCR = () => {
  const [extractedReading, setExtractedReading] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage(e.target.result);
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
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
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const performOCR = async (imageDataUrl) => {
    setIsProcessing(true);
    setExtractedReading('');

    try {
      const {
        data: { text },
      } = await Tesseract.recognize(imageDataUrl, 'eng', {
        logger: (m) => console.log(m),
        tessedit_char_whitelist: '0123456789.',
      });

      const meterReadingMatch = text.match(/\d{1,4}\.\d{3}/);
      if (meterReadingMatch) {
        setExtractedReading(meterReadingMatch[0]);
      } else {
        const numericValues = text.match(/\d+\.\d+/g);
        if (numericValues) {
          const sortedValues = numericValues.sort(
            (a, b) => b.length - a.length
          );
          setExtractedReading(sortedValues[0]);
        } else {
          setExtractedReading('No reading detected');
        }
      }
    } catch (error) {
      console.error('OCR Error:', error);
      setExtractedReading('Error processing image');
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-center">
          <h2 className="text-2xl font-bold text-white">Meter Reading OCR</h2>
        </div>

        <div className="p-6 space-y-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            ref={fileInputRef}
            className="hidden"
          />

          {!previewImage ? (
            <div
              onClick={triggerFileInput}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
            >
              <Camera className="mx-auto mb-4 text-gray-400" size={48} />
              <p className="text-gray-500">Click to upload meter image</p>
            </div>
          ) : (
            <div className="relative">
              <img
                src={previewImage}
                alt="Preview"
                className="w-full h-64 object-cover rounded-lg"
              />
              <button
                onClick={triggerFileInput}
                className="absolute top-2 right-2 bg-white/80 p-2 rounded-full hover:bg-white transition-colors"
              >
                <Upload size={20} />
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
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-center">
              <span className="text-2xl font-bold text-green-700">
                {extractedReading}
              </span>
              <p className="text-sm text-green-600 mt-2">Meter Reading</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LocalMeterReadingOCR;
