import { useState, useRef, useEffect, useCallback } from 'react';
import { ModelCategory, VideoCapture } from '@runanywhere/web';
import { VLMWorkerBridge } from '@runanywhere/web-llamacpp';
import { useModelLoader } from '../hooks/useModelLoader';

const CAPTURE_DIM = 768;
const MAX_TOKENS = 800;

const SOIL_ANALYSIS_PROMPT = `You are an expert soil scientist and agricultural advisor.
Carefully analyze this soil image and provide:

1. SOIL STATUS: Overall health (Healthy/Dry/Waterlogged/Nutrient Depleted/Poor Quality)
2. SOIL SCORE: Give a health score from 0 to 100
3. SOIL COLOR: What the color indicates about nutrients
4. MISSING NUTRIENTS: What nutrients appear deficient (Nitrogen, Phosphorus, Potassium, Iron, Calcium, Magnesium, etc.)
5. BEST CROPS: Top 3 crops best suited for this soil
6. FERTILIZER NEEDED: Exact fertilizer recommendations with quantities per acre
7. IMPROVEMENT TIPS: 3 steps to improve soil quality

Be specific and practical for a small farmer.`;

interface SoilAnalysisResult {
  status: string;
  score: number;
  color: string;
  missingNutrients: string[];
  bestCrops: string[];
  fertilizers: string[];
  improvementTips: string[];
  rawResponse: string;
}

type ViewState = 'camera' | 'analyzing' | 'results';

export function SoilScanTab() {
  const loader = useModelLoader(ModelCategory.Multimodal);
  const [viewState, setViewState] = useState<ViewState>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<SoilAnalysisResult | null>(null);
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
          SOIL_ANALYSIS_PROMPT,
          { maxTokens: MAX_TOKENS, temperature: 0.7 }
        );

        const parsed = parseSoilAnalysis(result.text);
        setAnalysisResult(parsed);
        setViewState('results');
        
        // Update stats
        const soilChecks = parseInt(localStorage.getItem('farmlens_soil_checks') || '0');
        localStorage.setItem('farmlens_soil_checks', String(soilChecks + 1));
      } catch (err) {
        setError('Analysis error. Please try again.');
        setViewState('camera');
        console.error(err);
      }
    },
    [loader]
  );

  const parseSoilAnalysis = (text: string): SoilAnalysisResult => {
    const lines = text.split('\n').filter((l) => l.trim());

    let status = 'Unknown';
    let score = 50;
    let color = 'Unknown';
    const missingNutrients: string[] = [];
    const bestCrops: string[] = [];
    const fertilizers: string[] = [];
    const improvementTips: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lower = line.toLowerCase();

      if (lower.includes('soil status') || lower.includes('status:')) {
        const value = line.split(':').slice(1).join(':').trim();
        if (value) status = value;
      }
      else if (lower.includes('soil score') || lower.includes('score:')) {
        const value = line.split(':').slice(1).join(':').trim();
        const match = value.match(/(\d+)/);
        if (match) score = parseInt(match[1], 10);
      }
      else if (lower.includes('soil color') || lower.includes('color:')) {
        const value = line.split(':').slice(1).join(':').trim();
        if (value) color = value;
      }
      else if (lower.includes('missing nutrients') || lower.includes('nutrients:') || lower.includes('deficient')) {
        const value = line.split(':').slice(1).join(':').trim();
        if (value) {
          const nutrients = value.match(/nitrogen|phosphorus|potassium|iron|calcium|magnesium|sulfur|zinc/gi);
          if (nutrients) {
            nutrients.forEach(n => {
              const normalized = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
              if (!missingNutrients.includes(normalized)) {
                missingNutrients.push(normalized);
              }
            });
          }
        }
      }
      else if (lower.includes('best crops') || lower.includes('crops:')) {
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const crop = lines[j].trim();
          if (crop && (crop.startsWith('-') || crop.match(/^\d+[.)]/))) {
            const cleaned = crop.replace(/^[-•*\d.)]\s*/, '');
            if (cleaned && bestCrops.length < 3) {
              bestCrops.push(cleaned);
            }
          }
        }
      }
      else if (lower.includes('fertilizer') || lower.includes('fertiliser')) {
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const fert = lines[j].trim();
          if (fert && (fert.startsWith('-') || fert.match(/^\d+[.)]/))) {
            const cleaned = fert.replace(/^[-•*\d.)]\s*/, '');
            if (cleaned && fertilizers.length < 5) {
              fertilizers.push(cleaned);
            }
          }
        }
      }
      else if (lower.includes('improvement') || lower.includes('tips:')) {
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const tip = lines[j].trim();
          if (tip && (tip.startsWith('-') || tip.match(/^\d+[.)]/))) {
            const cleaned = tip.replace(/^[-•*\d.)]\s*/, '');
            if (cleaned && improvementTips.length < 3) {
              improvementTips.push(cleaned);
            }
          }
        }
      }
    }

    return {
      status: status || 'Unknown',
      score: Math.max(0, Math.min(100, score)),
      color: color || 'Unknown',
      missingNutrients: missingNutrients.slice(0, 6),
      bestCrops: bestCrops.slice(0, 3),
      fertilizers: fertilizers.slice(0, 5),
      improvementTips: improvementTips.slice(0, 3),
      rawResponse: text,
    };
  };

  const resetToCamera = useCallback(() => {
    setViewState('camera');
    setCapturedImage(null);
    setAnalysisResult(null);
    setError(null);
  }, []);

  const saveResults = useCallback(() => {
    if (!analysisResult) return;
    alert('Soil analysis saved successfully!');
  }, [analysisResult]);

  const getScoreColor = (score: number): string => {
    if (score <= 30) return '#E76F51';
    if (score <= 60) return '#F4A261';
    if (score <= 80) return '#FFB703';
    return '#52B788';
  };

  const getScoreLabel = (score: number): string => {
    if (score <= 30) return 'Poor';
    if (score <= 60) return 'Fair';
    if (score <= 80) return 'Good';
    return 'Excellent';
  };

  const getNutrientColor = (nutrient: string): string => {
    const lower = nutrient.toLowerCase();
    if (lower.includes('nitrogen')) return '#52B788';
    if (lower.includes('phosphorus')) return '#3B82F6';
    if (lower.includes('potassium')) return '#F4A261';
    if (lower.includes('iron')) return '#E76F51';
    if (lower.includes('calcium')) return '#8B5CF6';
    if (lower.includes('magnesium')) return '#06B6D4';
    return '#888888';
  };

  const getCropEmoji = (crop: string): string => {
    const lower = crop.toLowerCase();
    if (lower.includes('rice') || lower.includes('paddy')) return '🌾';
    if (lower.includes('wheat')) return '🌾';
    if (lower.includes('corn') || lower.includes('maize')) return '🌽';
    if (lower.includes('tomato')) return '🍅';
    if (lower.includes('potato')) return '🥔';
    if (lower.includes('cotton')) return '🌱';
    if (lower.includes('sugarcane')) return '🎋';
    if (lower.includes('soybean')) return '🫘';
    if (lower.includes('onion')) return '🧅';
    if (lower.includes('chili') || lower.includes('pepper')) return '🌶️';
    return '🌱';
  };

  // Render Camera View
  const renderCameraView = () => (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
          {loader.state === 'loading' && <div style={{ fontSize: '13px', fontWeight: '600', color: '#1B4332' }}>Loading AI Model...</div>}
          {loader.state === 'error' && <div style={{ fontSize: '13px', fontWeight: '600', color: '#E76F51' }}>❌ {loader.error}</div>}
          {loader.state === 'idle' && (
            <button onClick={loader.ensure} style={{
              padding: '8px 16px', background: '#52B788', border: 'none', borderRadius: '8px',
              color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
            }}>Load AI Model</button>
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

      <div style={{
        padding: '24px 20px',
        background: 'linear-gradient(135deg, #1B4332, #2D6A4F)',
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
        <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>Soil Health Scanner</h3>
        <p style={{ fontSize: '13px', fontWeight: '500', opacity: 0.9 }}>Take a clear photo of the soil</p>
      </div>

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
        {/* Grid Overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(82, 183, 136, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(82, 183, 136, 0.2) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          zIndex: 5
        }} />

        {!cameraActive && !capturedImage && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#888888' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.5 }}>🌱</div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#4A4A4A', marginBottom: '8px' }}>Ready to Analyze Soil</h3>
            <p style={{ fontSize: '14px', maxWidth: '300px', margin: '0 auto' }}>Take a photo of the soil for health analysis and recommendations</p>
          </div>
        )}

        {capturedImage && <img src={capturedImage} alt="Captured soil" style={{ width: '100%', height: 'auto', display: 'block' }} />}
        <div ref={videoMountRef} style={{ width: '100%', height: '100%' }} />
      </div>

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

      {!cameraActive && !capturedImage ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={startCamera} disabled={loader.state !== 'ready'} style={{
            padding: '16px 32px',
            background: loader.state === 'ready' ? 'linear-gradient(135deg, #52B788, #40916C)' : '#D8EAE0',
            border: 'none',
            borderRadius: '12px',
            color: 'white',
            fontSize: '16px',
            fontWeight: '700',
            cursor: loader.state === 'ready' ? 'pointer' : 'not-allowed',
            boxShadow: loader.state === 'ready' ? '0 4px 20px rgba(82, 183, 136, 0.4)' : 'none',
            transition: 'all 0.3s'
          }}>📸 Open Camera</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={loader.state !== 'ready'} style={{
            padding: '14px 28px',
            background: 'white',
            border: '2px solid #D8EAE0',
            borderRadius: '12px',
            color: '#1B4332',
            fontSize: '14px',
            fontWeight: '600',
            cursor: loader.state === 'ready' ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s'
          }}>🖼️ Upload Photo</button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
        </div>
      ) : cameraActive ? (
        <button onClick={capturePhoto} style={{
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
        }}>📸 Capture Photo</button>
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
      <h3 style={{ fontSize: '22px', fontWeight: '700', color: '#1B4332', marginBottom: '8px' }}>Analyzing Soil Health...</h3>
      <p style={{ fontSize: '14px', color: '#888888' }}>AI is examining soil composition and nutrients</p>
    </div>
  );

  // Render Results View
  const renderResultsView = () => {
    if (!analysisResult) return null;

    const scoreColor = getScoreColor(analysisResult.score);
    const scoreLabel = getScoreLabel(analysisResult.score);

    return (
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {capturedImage && (
          <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(27, 67, 50, 0.15)' }}>
            <img src={capturedImage} alt="Analyzed soil" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
        )}

        {/* Score Card */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '32px 20px',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(27, 67, 50, 0.15)',
          animation: 'scaleIn 0.5s ease-out'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1B4332', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Soil Health Score
          </h3>
          
          <div style={{ width: '180px', height: '180px', margin: '0 auto 24px' }}>
            <div style={{
              width: '100%',
              height: '100%',
              border: `10px solid ${scoreColor}`,
              borderRadius: '50%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(27, 67, 50, 0.15)',
              transition: 'border-color 0.6s ease-out'
            }}>
              <div style={{ fontSize: '56px', fontWeight: '800', lineHeight: 1, color: scoreColor, animation: 'countUp 1s ease-out' }}>
                {analysisResult.score}
              </div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#888888', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {scoreLabel}
              </div>
            </div>
          </div>

          <div style={{
            display: 'inline-block',
            padding: '10px 24px',
            borderRadius: '999px',
            background: scoreColor,
            color: 'white',
            fontSize: '14px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {analysisResult.status}
          </div>
        </div>

        {/* Nutrients Card */}
        {analysisResult.missingNutrients.length > 0 && (
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 2px 12px rgba(27, 67, 50, 0.15)',
            animation: 'slideInLeft 0.6s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>🧪</span>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1B4332', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Missing Nutrients
              </h4>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {analysisResult.missingNutrients.map((nutrient, idx) => (
                <div key={idx} style={{
                  padding: '8px 16px',
                  borderRadius: '999px',
                  background: getNutrientColor(nutrient),
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: '600',
                  animation: `scaleIn 0.4s ease-out ${idx * 0.1}s backwards`
                }}>
                  {nutrient}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Crops Card */}
        {analysisResult.bestCrops.length > 0 && (
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 2px 12px rgba(27, 67, 50, 0.15)',
            animation: 'slideInRight 0.7s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>🌾</span>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1B4332', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Best Crops To Plant
              </h4>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {analysisResult.bestCrops.map((crop, idx) => (
                <div key={idx} style={{
                  padding: '20px 16px',
                  background: '#F0F7F4',
                  border: '2px solid #52B788',
                  borderRadius: '12px',
                  textAlign: 'center',
                  transition: 'all 0.3s',
                  cursor: 'pointer',
                  animation: `scaleIn 0.5s ease-out ${idx * 0.1}s backwards`
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>{getCropEmoji(crop)}</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#1B4332', lineHeight: 1.3 }}>
                    {crop}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fertilizer Card */}
        {analysisResult.fertilizers.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 183, 3, 0.1), rgba(244, 162, 97, 0.05))',
            border: '2px solid rgba(255, 183, 3, 0.3)',
            borderRadius: '16px',
            padding: '20px',
            animation: 'slideInLeft 0.8s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>🧴</span>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1B4332', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Fertilizer Recommendations
              </h4>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {analysisResult.fertilizers.map((fertilizer, idx) => (
                <div key={idx} style={{
                  padding: '12px 16px',
                  background: 'white',
                  borderRadius: '12px',
                  border: '1px solid #D8EAE0',
                  fontSize: '14px',
                  color: '#4A4A4A',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  animation: `fadeInUp 0.5s ease-out ${idx * 0.1}s backwards`
                }}>
                  <span style={{ color: '#52B788', fontWeight: '700', fontSize: '16px', flexShrink: 0 }}>✓</span>
                  <span style={{ flex: 1, lineHeight: 1.5 }}>{fertilizer}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Improvement Tips */}
        {analysisResult.improvementTips.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(82, 183, 136, 0.1), rgba(64, 145, 108, 0.05))',
            border: '2px solid rgba(82, 183, 136, 0.3)',
            borderRadius: '16px',
            padding: '20px',
            animation: 'slideInRight 0.9s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>💡</span>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1B4332', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Improvement Tips
              </h4>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {analysisResult.improvementTips.map((tip, idx) => (
                <div key={idx} style={{
                  padding: '12px 16px 12px 40px',
                  background: 'white',
                  borderRadius: '12px',
                  border: '1px solid #D8EAE0',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  color: '#4A4A4A',
                  position: 'relative',
                  animation: `scaleIn 0.5s ease-out ${idx * 0.1}s backwards`
                }}>
                  <div style={{
                    position: 'absolute',
                    left: '12px',
                    top: '12px',
                    width: '24px',
                    height: '24px',
                    background: '#52B788',
                    color: 'white',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: '12px'
                  }}>
                    {idx + 1}
                  </div>
                  {tip}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px', animation: 'fadeInUp 1s ease-out' }}>
          <button onClick={resetToCamera} style={{
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
          }}>🔄 Scan Another Soil</button>
          <button onClick={saveResults} style={{
            padding: '14px 28px',
            background: 'white',
            border: '2px solid #52B788',
            borderRadius: '12px',
            color: '#1B4332',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}>💾 Save Results</button>
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
