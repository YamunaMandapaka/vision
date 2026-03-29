import { useState, useCallback, useRef, useEffect } from 'react';
import { ModelManager, ModelCategory, AudioCapture, AudioPlayback, SpeechActivity } from '@runanywhere/web';
import { VAD, STT, TTS } from '@runanywhere/web-onnx';
import { TextGeneration } from '@runanywhere/web-llamacpp';

const SYSTEM_PROMPT = `You are FarmLens AI, an expert agricultural advisor helping farmers solve crop and pest problems.
The farmer will describe their problem by voice.
Always respond with:
1. PROBLEM IDENTIFIED: What you understood
2. DIAGNOSIS: What is likely causing this
3. IMMEDIATE ACTION: What to do right now today
4. TREATMENT: Step by step solution
5. PREVENTION: How to avoid this in future
Keep responses clear and simple for a farmer.
Maximum 150 words per response.
Respond in English.`;

type VoiceState = 'idle' | 'loading' | 'listening' | 'processing-stt' | 'generating-llm' | 'synthesizing-tts' | 'speaking' | 'error';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  audioData?: Float32Array;
  sampleRate?: number;
}

export function VoiceHelpTab() {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processingStep, setProcessingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<Record<string, number>>({});

  const micRef = useRef<AudioCapture | null>(null);
  const vadUnsubRef = useRef<(() => void) | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentPlayerRef = useRef<AudioPlayback | null>(null);
  const isHoldingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      stopListening();
      stopPlayback();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const checkModelsReady = useCallback(async () => {
    const categories = [
      ModelCategory.Audio,
      ModelCategory.SpeechRecognition,
      ModelCategory.Language,
      ModelCategory.SpeechSynthesis,
    ];
    const allReady = categories.every((cat) => ModelManager.getLoadedModel(cat) !== null);
    setModelsReady(allReady);
    return allReady;
  }, []);

  const loadModels = useCallback(async () => {
    setVoiceState('loading');
    setError(null);

    try {
      const modelCategories = [
        { category: ModelCategory.Audio, name: 'VAD' },
        { category: ModelCategory.SpeechRecognition, name: 'STT' },
        { category: ModelCategory.Language, name: 'LLM' },
        { category: ModelCategory.SpeechSynthesis, name: 'TTS' },
      ];

      for (const { category, name } of modelCategories) {
        if (!ModelManager.getLoadedModel(category)) {
          const models = ModelManager.getModels().filter((m) => m.modality === category);
          if (models[0]) {
            setLoadingProgress((prev) => ({ ...prev, [name]: 0 }));
            await ModelManager.downloadModel(models[0].id);
            setLoadingProgress((prev) => ({ ...prev, [name]: 0.9 }));
            await ModelManager.loadModel(models[0].id, { coexist: true });
            setLoadingProgress((prev) => ({ ...prev, [name]: 1 }));
          } else {
            throw new Error(`No ${name} model registered`);
          }
        }
      }

      setModelsReady(true);
      setVoiceState('idle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load models: ${msg}`);
      setVoiceState('error');
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (currentPlayerRef.current) {
      currentPlayerRef.current.stop();
      currentPlayerRef.current.dispose();
      currentPlayerRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    vadUnsubRef.current?.();
    vadUnsubRef.current = null;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingTime(0);
    setAudioLevel(0);
    isHoldingRef.current = false;
  }, []);

  const startListening = useCallback(async () => {
    if (!modelsReady) {
      await loadModels();
      return;
    }

    isHoldingRef.current = true;
    setError(null);
    setVoiceState('listening');
    setRecordingTime(0);

    const startTime = Date.now();
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 100);

    try {
      const mic = new AudioCapture({ sampleRate: 16000 });
      micRef.current = mic;
      VAD.reset();

      vadUnsubRef.current = VAD.onSpeechActivity(async (activity) => {
        if (activity === SpeechActivity.Ended && !isHoldingRef.current) {
          const segment = VAD.popSpeechSegment();
          if (!segment || segment.samples.length < 1600) {
            setVoiceState('idle');
            stopListening();
            return;
          }
          await processVoiceTurn(segment.samples);
        }
      });

      await mic.start(
        (chunk) => { VAD.processSamples(chunk); },
        (level) => { setAudioLevel(level); }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setError('Please allow microphone access');
      } else {
        setError(`Microphone error: ${msg}`);
      }
      setVoiceState('error');
      stopListening();
    }
  }, [modelsReady, loadModels]);

  const handleStopListening = useCallback(() => {
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;
    
    setTimeout(() => {
      if (voiceState === 'listening') {
        const segment = VAD.popSpeechSegment();
        if (segment && segment.samples.length >= 1600) {
          processVoiceTurn(segment.samples);
        } else {
          setError('No speech detected. Please try again.');
          setVoiceState('error');
          stopListening();
        }
      }
    }, 500);
  }, [voiceState]);

  const processVoiceTurn = useCallback(async (audioSamples: Float32Array) => {
    stopListening();

    try {
      setVoiceState('processing-stt');
      setProcessingStep('Understanding your problem...');

      const sttModel = ModelManager.getLoadedModel(ModelCategory.SpeechRecognition);
      if (!sttModel) throw new Error('STT model not loaded');

      const sttResult = await STT.transcribe(audioSamples);
      const transcriptionText = typeof sttResult === 'string' ? sttResult : sttResult.text || '';

      if (!transcriptionText || transcriptionText.trim().length === 0) {
        throw new Error('Could not understand speech. Please try again.');
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        text: transcriptionText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      setVoiceState('generating-llm');
      setProcessingStep('Finding solution...');

      const llmModel = ModelManager.getLoadedModel(ModelCategory.Language);
      if (!llmModel) throw new Error('LLM model not loaded');

      let accumulatedResponse = '';
      const assistantMessageId = (Date.now() + 1).toString();

      const { stream } = await TextGeneration.generateStream(transcriptionText, {
        maxTokens: 150,
        temperature: 0.7,
        systemPrompt: SYSTEM_PROMPT,
      });

      for await (const token of stream) {
        accumulatedResponse += token;
        
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === assistantMessageId);
          if (existing) {
            return prev.map((m) =>
              m.id === assistantMessageId ? { ...m, text: accumulatedResponse } : m
            );
          } else {
            return [
              ...prev,
              {
                id: assistantMessageId,
                role: 'assistant' as const,
                text: accumulatedResponse,
                timestamp: new Date(),
              },
            ];
          }
        });
      }

      setVoiceState('synthesizing-tts');
      setProcessingStep('Preparing voice response...');

      const ttsModel = ModelManager.getLoadedModel(ModelCategory.SpeechSynthesis);
      if (!ttsModel) throw new Error('TTS model not loaded');

      const ttsResult = await TTS.synthesize(accumulatedResponse, { speed: 1.0 });
      const audioData = ttsResult.audio;
      const audioSampleRate = ttsResult.sampleRate;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, audioData: audioData as Float32Array, sampleRate: audioSampleRate }
            : m
        )
      );

      setVoiceState('speaking');
      setProcessingStep('');

      const player = new AudioPlayback({ sampleRate: audioSampleRate });
      currentPlayerRef.current = player;
      await player.play(audioData as Float32Array, audioSampleRate);
      player.dispose();
      currentPlayerRef.current = null;

      setVoiceState('idle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setVoiceState('error');
      setTimeout(() => {
        setVoiceState('idle');
        setError(null);
      }, 3000);
    }
  }, [stopListening]);

  const replayMessage = useCallback(async (message: Message) => {
    if (!message.audioData || !message.sampleRate) return;
    stopPlayback();

    try {
      setVoiceState('speaking');
      const player = new AudioPlayback({ sampleRate: message.sampleRate });
      currentPlayerRef.current = player;
      await player.play(message.audioData, message.sampleRate);
      player.dispose();
      currentPlayerRef.current = null;
      setVoiceState('idle');
    } catch (err) {
      console.error('Replay error:', err);
      setVoiceState('idle');
    }
  }, [stopPlayback]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    stopPlayback();
  }, [stopPlayback]);

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // Render Functions
  if (messages.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#F0F7F4' }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          background: 'linear-gradient(135deg, #1B4332, #2D6A4F)',
          color: 'white',
          textAlign: 'center'
        }}>
          <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>Voice Farm Assistant</h3>
          <p style={{ fontSize: '13px', fontWeight: '500', opacity: 0.9 }}>Speak your farming problem</p>
          
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '12px',
            padding: '8px 16px',
            background: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: modelsReady ? '#52B788' : '#888888',
              animation: modelsReady ? 'pulseRing 2s ease-in-out infinite' : 'none'
            }} />
            {modelsReady ? 'Ready to listen' : 'Loading...'}
          </div>
        </div>

        {/* Welcome Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          textAlign: 'center',
          flex: 1
        }}>
          <div style={{ fontSize: '80px', marginBottom: '24px', animation: 'float 3s ease-in-out infinite' }}>🎤</div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#1B4332', marginBottom: '8px' }}>
            Voice Farm Assistant
          </h2>
          <p style={{ fontSize: '15px', color: '#888888', marginBottom: '32px', maxWidth: '300px' }}>
            Speak your crop problem, get instant expert advice
          </p>

          {!modelsReady && Object.keys(loadingProgress).length === 0 ? (
            <button onClick={loadModels} style={{
              padding: '16px 32px',
              background: 'linear-gradient(135deg, #52B788, #40916C)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontSize: '16px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(82, 183, 136, 0.4)'
            }}>Load Voice Models</button>
          ) : !modelsReady ? (
            <div style={{ width: '100%', maxWidth: '400px', padding: '24px', background: 'white', borderRadius: '16px', border: '2px solid #D8EAE0' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1B4332', marginBottom: '16px' }}>Loading voice models...</p>
              {Object.entries(loadingProgress).map(([name, progress]) => (
                <div key={name} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1B4332', marginBottom: '8px' }}>{name}</div>
                  <div style={{ height: '8px', background: '#D8EAE0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #52B788, #95D5B2)',
                      borderRadius: '999px',
                      width: `${progress * 100}%`,
                      transition: 'width 0.3s'
                    }} />
                  </div>
                  <div style={{ fontSize: '12px', color: '#888888', textAlign: 'right', marginTop: '4px' }}>
                    {Math.round(progress * 100)}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                marginBottom: '32px',
                padding: '24px',
                background: 'white',
                borderRadius: '16px',
                border: '2px solid #D8EAE0',
                maxWidth: '400px',
                textAlign: 'left'
              }}>
                {[
                  { icon: '📌', title: 'Press and Hold', desc: 'Hold the mic button to speak' },
                  { icon: '🗣️', title: 'Describe Problem', desc: 'Explain your crop issue clearly' },
                  { icon: '🎧', title: 'Get Advice', desc: 'Listen to expert recommendations' }
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '24px', flexShrink: 0 }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#1B4332', marginBottom: '4px' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '13px', color: '#888888', lineHeight: 1.5 }}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div style={{
                padding: '12px 24px',
                background: '#52B788',
                color: 'white',
                borderRadius: '999px',
                fontSize: '14px',
                fontWeight: '700',
                animation: 'glowPulse 2s ease-in-out infinite'
              }}>
                ✈️ Offline Ready - All models loaded
              </div>
            </>
          )}
        </div>

        {/* Mic Button */}
        {modelsReady && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '24px',
            background: 'white',
            borderTop: '1px solid #D8EAE0'
          }}>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <button
                onMouseDown={startListening}
                onMouseUp={handleStopListening}
                onMouseLeave={handleStopListening}
                onTouchStart={(e) => { e.preventDefault(); startListening(); }}
                onTouchEnd={(e) => { e.preventDefault(); handleStopListening(); }}
                disabled={voiceState !== 'idle' && voiceState !== 'error'}
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  background: voiceState === 'listening' ? 'linear-gradient(135deg, #E76F51, #F4A261)' : 'linear-gradient(135deg, #52B788, #40916C)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '56px',
                  color: 'white',
                  boxShadow: '0 8px 32px rgba(82, 183, 136, 0.4)',
                  animation: voiceState === 'listening' ? 'pulseRing 1.5s ease-in-out infinite' : 'none',
                  transition: 'all 0.3s'
                }}
              >
                🎤
              </button>
              
              {voiceState === 'listening' && (
                <>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      position: 'absolute',
                      inset: `-${20 + i * 20}px`,
                      border: '3px solid #E76F51',
                      borderRadius: '50%',
                      opacity: 0,
                      animation: `expandRing 2s ease-out ${i * 0.7}s infinite`,
                      pointerEvents: 'none'
                    }} />
                  ))}
                </>
              )}
            </div>

            {voiceState === 'listening' && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '16px', fontWeight: '600', color: '#1B4332', marginBottom: '4px' }}>
                  Listening... {recordingTime}s
                </p>
                <p style={{ fontSize: '13px', color: '#888888' }}>Release button when done</p>
                
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  height: '60px',
                  marginTop: '16px'
                }}>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} style={{
                      width: '4px',
                      height: '20px',
                      background: '#52B788',
                      borderRadius: '2px',
                      animation: `waveform 1s ease-in-out ${i * 0.1}s infinite`
                    }} />
                  ))}
                </div>
              </div>
            )}

            {processingStep && (
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  border: '4px solid #D8EAE0',
                  borderTopColor: '#52B788',
                  borderRadius: '50%',
                  animation: 'rotateSpin 1s linear infinite',
                  margin: '0 auto 12px'
                }} />
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#1B4332' }}>{processingStep}</p>
              </div>
            )}

            {!voiceState.includes('listening') && !processingStep && (
              <p style={{ fontSize: '16px', fontWeight: '600', color: '#1B4332', textAlign: 'center' }}>
                Hold to speak
              </p>
            )}
          </div>
        )}

        {error && (
          <div style={{
            padding: '16px 20px',
            margin: '16px 20px',
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
      </div>
    );
  }

  // Conversation View
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F0F7F4' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #1B4332, #2D6A4F)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '2px' }}>Voice Assistant</h3>
          <p style={{ fontSize: '12px', opacity: 0.9 }}>
            {voiceState === 'speaking' ? 'Speaking...' : voiceState === 'listening' ? 'Listening...' : 'Ready'}
          </p>
        </div>
        <button onClick={clearConversation} style={{
          padding: '8px 16px',
          background: 'rgba(255, 255, 255, 0.2)',
          border: 'none',
          borderRadius: '8px',
          color: 'white',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer'
        }}>Clear Chat</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((message) => (
          <div key={message.id} style={{
            display: 'flex',
            gap: '12px',
            flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
            animation: message.role === 'user' ? 'slideInRight 0.4s ease-out' : 'slideInLeft 0.4s ease-out'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: message.role === 'user' ? '#40916C' : '#52B788',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              flexShrink: 0
            }}>
              {message.role === 'user' ? '👤' : '🤖'}
            </div>
            
            <div style={{ flex: 1, maxWidth: '75%' }}>
              <div style={{
                padding: '14px 18px',
                borderRadius: '18px',
                fontSize: '14px',
                lineHeight: 1.6,
                wordWrap: 'break-word',
                background: message.role === 'user' ? '#40916C' : 'white',
                color: message.role === 'user' ? 'white' : '#1B1B1B',
                border: message.role === 'user' ? 'none' : '2px solid #D8EAE0',
                borderBottomLeftRadius: message.role === 'user' ? '18px' : '4px',
                borderBottomRightRadius: message.role === 'user' ? '4px' : '18px'
              }}>
                {message.text}
              </div>
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '6px',
                padding: '0 4px',
                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
              }}>
                <span style={{ fontSize: '11px', color: '#888888', fontWeight: '500' }}>
                  {formatTime(message.timestamp)}
                </span>
                {message.role === 'assistant' && message.audioData && (
                  <button
                    onClick={() => replayMessage(message)}
                    disabled={voiceState === 'speaking'}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#52B788',
                      border: 'none',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.3s'
                    }}
                  >
                    🔊
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Mic Button */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 24px',
        background: 'white',
        borderTop: '1px solid #D8EAE0'
      }}>
        <button
          onMouseDown={startListening}
          onMouseUp={handleStopListening}
          onMouseLeave={handleStopListening}
          onTouchStart={(e) => { e.preventDefault(); startListening(); }}
          onTouchEnd={(e) => { e.preventDefault(); handleStopListening(); }}
          disabled={voiceState !== 'idle' && voiceState !== 'error'}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: voiceState === 'listening' ? 'linear-gradient(135deg, #E76F51, #F4A261)' : 'linear-gradient(135deg, #52B788, #40916C)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '40px',
            color: 'white',
            boxShadow: '0 4px 16px rgba(82, 183, 136, 0.4)',
            transition: 'all 0.3s'
          }}
        >
          🎤
        </button>
      </div>
    </div>
  );
}
