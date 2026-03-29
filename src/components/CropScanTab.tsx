import { useState, useRef, useEffect, useCallback } from 'react';
import { ModelCategory, VideoCapture } from '@runanywhere/web';
import { VLMWorkerBridge } from '@runanywhere/web-llamacpp';
import { useModelLoader } from '../hooks/useModelLoader';

const CAPTURE_DIM = 768;
const MAX_TOKENS = 600;

const ANALYSIS_PROMPT = `You are an expert agricultural scientist analyzing a crop image.

LANGUAGE: Respond ONLY in English.

Follow this EXACT format:

DISEASE NAME: [Disease name or "Healthy Crop"]
SEVERITY: [Critical, High, Medium, Low, or Healthy]
AFFECTED AREA: [percentage or area description]

TREATMENT STEPS:
1. [First treatment step]
2. [Second treatment step]
3. [Third treatment step]
4. [Fourth treatment step]
5. [Fifth treatment step]

PRODUCTS TO USE:
- [Product 1]
- [Product 2]
- [Product 3]

PREVENTION TIPS:
- [Prevention tip 1]
- [Prevention tip 2]
- [Prevention tip 3]

Be specific and practical.`;

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Healthy';

interface AnalysisResult {
  diseaseName: string;
  severity: Severity;
  affectedArea: string;
  treatmentSteps: string[];
  products: string[];
  preventionTips: string[];
  rawResponse: string;
}

type ViewState = 'camera' | 'analyzing' | 'results';

interface CropScanTabProps {
  language: string;
}

export function CropScanTab({ language }: CropScanTabProps) {
  const loader = useModelLoader(ModelCategory.Multimodal);
  
  const [viewState, setViewState] = useState<ViewState>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const videoMountRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<VideoCapture | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera Setup
  const startCamera = useCallback(async () => {
    if (captureRef.current?.isCapturing) return;
    setError(null);

    try {
      const cam = new VideoCapture({ facingMode: 'environment' });
      await cam.start();
      captureRef.current = cam;

      await new Promise<void>((resolve, reject) => {
        const video = cam.videoElement;
        const timeout = setTimeout(() => reject(new Error('Camera timeout')), 10000);
        
        const checkReady = () => {
          if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
            clearTimeout(timeout);
            setTimeout(() => resolve(), 300);
          }
        };
        
        if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
          clearTimeout(timeout);
          setTimeout(() => resolve(), 300);
        } else {
          video.addEventListener('loadedmetadata', checkReady, { once: true });
          video.addEventListener('loadeddata', checkReady, { once: true });
          video.addEventListener('canplay', checkReady, { once: true });
        }
      });

      const mount = videoMountRef.current;
      if (mount) {
        const el = cam.videoElement;
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.objectFit = 'cover';
        el.style.borderRadius = '24px';
        mount.appendChild(el);
      }

      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setError('Camera permission denied. Please allow camera access.');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setError('No camera found on this device.');
      } else if (msg.includes('NotReadable') || msg.includes('TrackStartError')) {
        setError('Camera is in use by another application.');
      } else {
        setError(`Camera error: ${msg}`);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      const cam = captureRef.current;
      if (cam) {
        cam.stop();
        cam.videoElement.parentNode?.removeChild(cam.videoElement);
        captureRef.current = null;
      }
    };
  }, []);

  // File Upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedImage(dataUrl);
      
      const img = new Image();
      img.onload = () => analyzeImage(img);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  // Capture Photo
  const capturePhoto = useCallback(async () => {
    const cam = captureRef.current;
    if (!cam?.isCapturing) return;

    await new Promise(resolve => setTimeout(resolve, 100));

    const frame = cam.captureFrame(CAPTURE_DIM);
    if (!frame || frame.width === 0 || frame.height === 0) {
      setError('Camera not ready. Please wait and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const imageData = ctx.createImageData(frame.width, frame.height);
      for (let i = 0; i < frame.width * frame.height; i++) {
        imageData.data[i * 4] = frame.rgbPixels[i * 3];
        imageData.data[i * 4 + 1] = frame.rgbPixels[i * 3 + 1];
        imageData.data[i * 4 + 2] = frame.rgbPixels[i * 3 + 2];
        imageData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      setCapturedImage(canvas.toDataURL('image/jpeg', 0.95));
    }

    cam.stop();
    cam.videoElement.parentNode?.removeChild(cam.videoElement);
    captureRef.current = null;
    setCameraActive(false);

    await analyzeCapturedFrame(frame.rgbPixels, frame.width, frame.height);
  }, []);

  // Analyze Image from Upload
  const analyzeImage = useCallback(async (img: HTMLImageElement) => {
    if (loader.state !== 'ready') {
      const ok = await loader.ensure();
      if (!ok) {
        setError('Failed to load AI model');
        return;
      }
    }

    setViewState('analyzing');
    setError(null);

    try {
      const canvas = document.createElement('canvas');
      const maxDim = CAPTURE_DIM;
      const scale = Math.min(maxDim / img.width, maxDim / img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      const rgbPixels = new Uint8Array(canvas.width * canvas.height * 3);
      for (let i = 0; i < imageData.data.length / 4; i++) {
        rgbPixels[i * 3] = imageData.data[i * 4];
        rgbPixels[i * 3 + 1] = imageData.data[i * 4 + 1];
        rgbPixels[i * 3 + 2] = imageData.data[i * 4 + 2];
      }

      await analyzeCapturedFrame(rgbPixels, canvas.width, canvas.height);
    } catch (err) {
      setError('Analysis failed. Please try again.');
      setViewState('camera');
      console.error(err);
    }
  }, [loader]);

  // Core Analysis
  const analyzeCapturedFrame = useCallback(
    async (rgbPixels: Uint8Array, width: number, height: number) => {
      if (loader.state !== 'ready') {
        const ok = await loader.ensure();
        if (!ok) {
          setError('Failed to load AI model');
          setViewState('camera');
          return;
        }
      }

      setViewState('analyzing');
      setError(null);

      try {
        const bridge = VLMWorkerBridge.shared;
        if (!bridge.isModelLoaded) {
          throw new Error('VLM model not loaded');
        }

        const result = await bridge.process(
          rgbPixels,
          width,
          height,
          ANALYSIS_PROMPT,
          { maxTokens: MAX_TOKENS, temperature: 0.7 }
        );

        const parsed = parseAnalysisResponse(result.text);
        setAnalysisResult(parsed);
        setViewState('results');
        
        // Update stats
        const scans = parseInt(localStorage.getItem('farmlens_scans_today') || '0');
        localStorage.setItem('farmlens_scans_today', String(scans + 1));
        
        if (parsed.severity !== 'Healthy') {
          const diseases = parseInt(localStorage.getItem('farmlens_diseases_found') || '0');
          localStorage.setItem('farmlens_diseases_found', String(diseases + 1));
        }
      } catch (err) {
        setError('Analysis error. Please try again.');
        setViewState('camera');
        console.error(err);
      }
    },
    [loader]
  );

  // Parse Response
  const parseAnalysisResponse = (text: string): AnalysisResult => {
    const lines = text.split('\n').filter((l) => l.trim());

    let diseaseName = 'Unknown';
    let severity: Severity = 'Medium';
    let affectedArea = 'Unknown';
    const treatmentSteps: string[] = [];
    const products: string[] = [];
    const preventionTips: string[] = [];

    const diseaseKeywords = ['disease name'];
    const severityKeywords = ['severity'];
    const areaKeywords = ['affected area'];
    const treatmentKeywords = ['treatment'];
    const productsKeywords = ['products', 'product'];
    const preventionKeywords = ['prevention'];
    
    const severityValues: Record<string, Severity> = {
      'critical': 'Critical',
      'high': 'High',
      'medium': 'Medium',
      'low': 'Low',
      'healthy': 'Healthy'
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lower = line.toLowerCase();

      if (diseaseKeywords.some(kw => lower.includes(kw))) {
        const value = line.split(':').slice(1).join(':').trim();
        if (value) diseaseName = value;
      }
      else if (severityKeywords.some(kw => lower.includes(kw))) {
        const value = line.split(':').slice(1).join(':').trim();
        for (const [key, val] of Object.entries(severityValues)) {
          if (value.toLowerCase().includes(key)) {
            severity = val;
            break;
          }
        }
      }
      else if (areaKeywords.some(kw => lower.includes(kw))) {
        const value = line.split(':').slice(1).join(':').trim();
        if (value) affectedArea = value;
      }
      else if (treatmentKeywords.some(kw => lower.includes(kw))) {
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const step = lines[j].trim();
          if (step && step.match(/^\d+[.)]/)) {
            treatmentSteps.push(step.replace(/^\d+[.)]?\s*/, ''));
          }
        }
      }
      else if (productsKeywords.some(kw => lower.includes(kw)) && !preventionKeywords.some(kw => lower.includes(kw))) {
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const prod = lines[j].trim();
          if (prod && prod.startsWith('-')) {
            products.push(prod.replace(/^[-•*]\s*/, ''));
          }
        }
      }
      else if (preventionKeywords.some(kw => lower.includes(kw))) {
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const tip = lines[j].trim();
          if (tip && tip.startsWith('-')) {
            preventionTips.push(tip.replace(/^[-•*]\s*/, ''));
          }
        }
      }
    }

    return {
      diseaseName: diseaseName || 'Analysis Complete',
      severity,
      affectedArea,
      treatmentSteps: treatmentSteps.slice(0, 5),
      products: products.slice(0, 5),
      preventionTips: preventionTips.slice(0, 3),
      rawResponse: text,
    };
  };

  const resetToCamera = useCallback(() => {
    setViewState('camera');
    setCapturedImage(null);
    setAnalysisResult(null);
    setError(null);
  }, []);

  const saveToCalendar = useCallback(() => {
    if (!analysisResult) return;
    alert('Saved to calendar successfully!');
  }, [analysisResult]);

  const getSeverityColor = (severity: Severity): string => {
    switch (severity) {
      case 'Critical': return '#E76F51';
      case 'High': return '#F4A261';
      case 'Medium': return '#FFB703';
      case 'Low': return '#52B788';
      case 'Healthy': return '#40916C';
      default: return '#888888';
    }
  };

  const getSeverityIcon = (severity: Severity): string => {
    switch (severity) {
      case 'Critical': return '⚠️';
      case 'High': return '🔶';
      case 'Medium': return '🟡';
      case 'Low': return '✅';
      case 'Healthy': return '✅';
      default: return '○';
    }
  };

  // Render Camera View
  const renderCameraView = () => (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Model Status Banner */}
      {loader.state !== 'ready' && (
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(82, 183, 136, 0.2), rgba(149, 213, 178, 0.2))',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          {loader.state === 'downloading' && (
            <>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1B4332', marginBottom: '8px' }}>
                Downloading AI Model... {Math.round(loader.progress * 100)}%
              </div>
              <div style={{ height: '8px', background: 'rgba(0,0,0,0.1)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #52B788, #95D5B2)',
                  borderRadius: '999px',
                  width: `${loader.progress * 100}%`,
                  transition: 'width 0.3s'
                }} />
              </div>
            </>
          )}
          {loader.state === 'loading' && (
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1B4332' }}>
              Loading AI Model...
            </div>
          )}
          {loader.state === 'error' && (
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#E76F51' }}>
              ❌ {loader.error}
            </div>
          )}
          {loader.state === 'idle' && (
            <button
              onClick={loader.ensure}
              style={{
                padding: '8px 16px',
                background: '#52B788',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Load AI Model
            </button>
          )}
        </div>
      )}

      {loader.state === 'ready' && (
        <div style={{
          padding: '12px 20px',
          background: 'linear-gradient(135deg, #52B788, #40916C)',
          color: 'white',
          borderRadius: '12px',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: '700',
          boxShadow: '0 0 20px rgba(82, 183, 136, 0.4)'
        }}>
          ✈️ Offline Ready - AI Model Loaded
        </div>
      )}

      {/* Top Banner */}
      <div style={{
        padding: '24px 20px',
        background: 'linear-gradient(135deg, #40916C, #52B788)',
        borderRadius: '16px',
        textAlign: 'center',
        color: 'white',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, #52B788, #95D5B2, #52B788)',
          animation: 'shimmer 3s infinite'
        }} />
        <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>
          Crop Disease Scanner
        </h3>
        <p style={{ fontSize: '13px', fontWeight: '500', opacity: 0.9 }}>
          Point camera at affected leaves
        </p>
      </div>

      {/* Camera Container */}
      <div style={{
        position: 'relative',
        borderRadius: '24px',
        background: 'white',
        border: '3px solid #D8EAE0',
        minHeight: '320px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(27, 67, 50, 0.15)'
      }}>
        {/* Corner Brackets */}
        <div style={{ position: 'absolute', inset: '12px', pointerEvents: 'none', zIndex: 10 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '24px', height: '24px', borderTop: '3px solid #52B788', borderLeft: '3px solid #52B788', animation: 'pulseRing 2s infinite' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: '24px', height: '24px', borderTop: '3px solid #52B788', borderRight: '3px solid #52B788', animation: 'pulseRing 2s 0.5s infinite' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '24px', height: '24px', borderBottom: '3px solid #52B788', borderLeft: '3px solid #52B788', animation: 'pulseRing 2s 1s infinite' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '24px', height: '24px', borderBottom: '3px solid #52B788', borderRight: '3px solid #52B788', animation: 'pulseRing 2s 1.5s infinite' }} />
        </div>

        {!cameraActive && !capturedImage && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#888888' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.5 }}>📸</div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#4A4A4A', marginBottom: '8px' }}>
              Ready to Scan
            </h3>
            <p style={{ fontSize: '14px', maxWidth: '300px', margin: '0 auto' }}>
              Take a clear photo of the affected crop leaves for AI analysis
            </p>
          </div>
        )}

        {capturedImage && (
          <img src={capturedImage} alt="Captured" style={{ width: '100%', height: 'auto', display: 'block' }} />
        )}
        
        <div ref={videoMountRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '16px 20px',
          background: 'rgba(231, 111, 81, 0.1)',
          border: '2px solid #E76F51',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#E76F51' }}>{error}</span>
        </div>
      )}

      {/* Control Buttons */}
      {!cameraActive && !capturedImage ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={startCamera}
            disabled={loader.state !== 'ready'}
            style={{
              padding: '16px 32px',
              background: loader.state === 'ready' ? 'linear-gradient(135deg, #52B788, #40916C)' : '#D8EAE0',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontSize: '16px',
              fontWeight: '700',
              cursor: loader.state === 'ready' ? 'pointer' : 'not-allowed',
              boxShadow: loader.state === 'ready' ? '0 4px 20px rgba(82, 183, 136, 0.4)' : 'none',
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            📸 Open Camera
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loader.state !== 'ready'}
            style={{
              padding: '14px 28px',
              background: 'white',
              border: '2px solid #D8EAE0',
              borderRadius: '12px',
              color: '#1B4332',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loader.state === 'ready' ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s'
            }}
          >
            🖼️ Upload Photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </div>
      ) : cameraActive ? (
        <button
          onClick={capturePhoto}
          style={{
            padding: '16px 32px',
            background: 'linear-gradient(135deg, #52B788, #40916C)',
            border: 'none',
            borderRadius: '12px',
            color: 'white',
            fontSize: '16px',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(82, 183, 136, 0.4)',
            animation: 'pulseRing 2s infinite'
          }}
        >
          📸 Capture Photo
        </button>
      ) : null}
    </div>
  );

  // Render Analyzing View
  const renderAnalyzingView = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      textAlign: 'center',
      minHeight: '400px'
    }}>
      <div style={{ position: 'relative', marginBottom: '24px' }}>
        <div style={{
          width: '80px',
          height: '80px',
          border: '5px solid #D8EAE0',
          borderTopColor: '#52B788',
          borderRadius: '50%',
          animation: 'rotateSpin 1s linear infinite'
        }} />
      </div>
      <h3 style={{ fontSize: '22px', fontWeight: '700', color: '#1B4332', marginBottom: '8px' }}>
        AI Analyzing Crop...
      </h3>
      <p style={{ fontSize: '14px', color: '#888888', marginBottom: '4px' }}>
        Identifying diseases and treatments
      </p>
      <p style={{ fontSize: '12px', color: '#888888', fontStyle: 'italic' }}>
        Usually takes 3-5 seconds
      </p>
    </div>
  );

  // Render Results View
  const renderResultsView = () => {
    if (!analysisResult) return null;

    const severityColor = getSeverityColor(analysisResult.severity);
    const severityIcon = getSeverityIcon(analysisResult.severity);

    return (
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Result Image */}
        {capturedImage && (
          <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(27, 67, 50, 0.15)' }}>
            <img src={capturedImage} alt="Analyzed" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
        )}

        {/* Disease Card */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '20px',
          borderLeft: `6px solid ${severityColor}`,
          boxShadow: '0 2px 12px rgba(27, 67, 50, 0.15)',
          animation: 'slideInLeft 0.5s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1B4332', flex: 1 }}>
              {analysisResult.diseaseName}
            </h3>
            <div style={{
              padding: '6px 16px',
              borderRadius: '999px',
              background: severityColor,
              color: 'white',
              fontSize: '12px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {severityIcon} {analysisResult.severity}
            </div>
          </div>
          
          <div style={{ fontSize: '14px', color: '#4A4A4A', marginBottom: '12px' }}>
            <strong>Affected Area:</strong> {analysisResult.affectedArea}
          </div>

          {/* Progress Bar */}
          <div>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#4A4A4A',
              marginBottom: '8px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>Severity Level</span>
              <span>{analysisResult.severity}</span>
            </div>
            <div style={{
              height: '10px',
              background: '#D8EAE0',
              borderRadius: '999px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                background: `linear-gradient(90deg, ${severityColor}, ${severityColor})`,
                width: analysisResult.severity === 'Critical' ? '100%' : 
                       analysisResult.severity === 'High' ? '75%' :
                       analysisResult.severity === 'Medium' ? '50%' : '25%',
                borderRadius: '999px',
                transition: 'width 1s ease-out'
              }} />
            </div>
          </div>
        </div>

        {/* Treatment Card */}
        {analysisResult.treatmentSteps.length > 0 && (
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            borderTop: '3px solid #52B788',
            boxShadow: '0 2px 12px rgba(27, 67, 50, 0.15)',
            animation: 'slideInRight 0.6s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>💊</span>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1B4332', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Treatment Plan
              </h4>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {analysisResult.treatmentSteps.map((step, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '14px',
                  background: '#F0F7F4',
                  borderRadius: '12px',
                  border: '1px solid #D8EAE0',
                  animation: `scaleIn 0.5s ease-out ${idx * 0.1}s backwards`
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    flexShrink: 0,
                    borderRadius: '50%',
                    background: '#52B788',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: '14px'
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1, fontSize: '14px', lineHeight: '1.6', color: '#4A4A4A' }}>
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Products Card */}
        {analysisResult.products.length > 0 && (
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 2px 12px rgba(27, 67, 50, 0.15)',
            animation: 'slideInLeft 0.7s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>🛒</span>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1B4332', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Recommended Products
              </h4>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '8px 0' }}>
              {analysisResult.products.map((product, idx) => (
                <div key={idx} style={{
                  flexShrink: 0,
                  padding: '10px 18px',
                  background: 'white',
                  border: '2px solid #52B788',
                  borderRadius: '999px',
                  color: '#1B4332',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  whiteSpace: 'nowrap'
                }}>
                  {product}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prevention Card */}
        {analysisResult.preventionTips.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(149, 213, 178, 0.15), rgba(82, 183, 136, 0.15))',
            borderRadius: '16px',
            padding: '20px',
            border: '2px solid #95D5B2',
            boxShadow: '0 2px 12px rgba(27, 67, 50, 0.15)',
            animation: 'slideInRight 0.8s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>🛡️</span>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1B4332', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Prevention Tips
              </h4>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {analysisResult.preventionTips.map((tip, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px',
                  background: 'white',
                  borderRadius: '12px',
                  border: '1px solid #D8EAE0'
                }}>
                  <span style={{ fontSize: '20px', flexShrink: 0 }}>🌿</span>
                  <div style={{ flex: 1, fontSize: '14px', lineHeight: '1.6', color: '#4A4A4A' }}>
                    {tip}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px', animation: 'fadeInUp 0.9s ease-out' }}>
          <button
            onClick={resetToCamera}
            style={{
              padding: '16px 32px',
              background: 'linear-gradient(135deg, #52B788, #40916C)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontSize: '16px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(82, 183, 136, 0.3)',
              transition: 'all 0.3s'
            }}
          >
            🔄 Scan Another Crop
          </button>
          <button
            onClick={saveToCalendar}
            style={{
              padding: '14px 28px',
              background: 'white',
              border: '2px solid #52B788',
              borderRadius: '12px',
              color: '#1B4332',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            💾 Save to Calendar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#F0F7F4' }}>
      {viewState === 'camera' && renderCameraView()}
      {viewState === 'analyzing' && renderAnalyzingView()}
      {viewState === 'results' && renderResultsView()}
    </div>
  );
}
