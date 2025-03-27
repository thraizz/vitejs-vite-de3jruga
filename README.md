# Browser-based Meter Reading OCR

A web application that performs Optical Character Recognition (OCR) on utility meter readings directly in your browser. Built with React, TypeScript, and Vite.

## Features

- 📸 Real-time meter reading capture using device camera
- 🔍 Browser-based OCR processing - no external API calls needed
- 🚀 Fast and efficient number recognition
- 🔒 Privacy-focused - all processing happens locally
- 📱 Mobile-friendly responsive design
- ⚡ Zero server dependencies for OCR functionality

## Technology Stack

- React + TypeScript for the frontend
- Vite for build tooling and development
- TensorFlow.js for OCR processing
- Modern browser APIs for camera access

## Getting Started

### Prerequisites

- Node.js (version 18 or higher)
- npm or yarn package manager

### Installation

```bash
# Clone the repository
git clone [your-repo-url]

# Install dependencies
npm install

# Start development server
npm run dev
```

### Usage

1. Open the application in your browser
2. Grant camera access when prompted
3. Position your utility meter in the camera view
4. The application will automatically detect and display the meter reading

## Privacy

This application processes all meter readings locally in your browser. No images or data are sent to external servers, ensuring your utility information remains private and secure.

## License

MIT License - See LICENSE file for details
