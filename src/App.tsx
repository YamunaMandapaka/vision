
import { useState, useEffect } from 'react';
import { initSDK, getAccelerationMode } from './runanywhere';
import { CropScanTab } from './components/CropScanTab';
import { SoilScanTab } from './components/SoilScanTab';
import { VoiceHelpTab } from './components/VoiceHelpTab';
import { CalendarTab } from './components/CalendarTab';
import './styles/index.css';

type Tab = 'scan-crop' | 'scan-soil' | 'voice' | 'calendar';

// SVG Icons as inline components
const LeafIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.67C7.67 17.53 10 12 17 10.68V19c0 1.1.9 2 2 2s2-.9 2-2V9c0-.55-.45-1-1-1h-3z" />
  </svg>
);

const SoilIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 3H3v18h18V3zM5 19V5h14v14H5z" />
    <circle cx="8" cy="9" r="1.5" />
    <circle cx="12" cy="13" r="1.5" />
    <circle cx="16" cy="9" r="1.5" />
    <circle cx="8" cy="16" r="1.5" />
  </svg>
);

const MicIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z" />
  </svg>
);

const WheatIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
    <path d="M12 3c0 1.66-1.34 3-3 3s-3-1.34-3-3h6m-6 5c0-1.66 1.34-3 3-3s3 1.34 3 3H6m0 5c0-1.66 1.34-3 3-3s3 1.34 3 3H6m6 4l-6 1 1.5-1.5 4.5-.5m3.5-5.5c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3m0 9c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z" />
  </svg>
);

export function App() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('scan-crop');
  const [showHero, setShowHero] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Initialize SDK
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 5;
      });
    }, 100);

    initSDK()
      .then(() => {
        clearInterval(progressInterval);
        setLoadingProgress(100);
        setTimeout(() => setSdkReady(true), 500);
      })
      .catch((err) => {
        clearInterval(progressInterval);
        setSdkError(err instanceof Error ? err.message : String(err));
      });

    return () => clearInterval(progressInterval);
  }, []);

  // Hide hero after first interaction
  useEffect(() => {
    const hideHeroTimeout = setTimeout(() => {
      setShowHero(false);
    }, 5000); // Auto-hide after 5 seconds

    return () => clearTimeout(hideHeroTimeout);
  }, []);

  // Get stats from localStorage
  const getStats = () => {
    const scansToday = localStorage.getItem('farmlens_scans_today') || '0';
    const diseasesFound = localStorage.getItem('farmlens_diseases_found') || '0';
    const soilChecks = localStorage.getItem('farmlens_soil_checks') || '0';

    return {
      scansToday: parseInt(scansToday),
      diseasesFound: parseInt(diseasesFound),
      soilChecks: parseInt(soilChecks),
    };
  };

  const stats = getStats();
  const accel = getAccelerationMode();

  // Loading Screen
  if (sdkError) {
    return (
      <div className="app-loading">
        <div className="loading-illustration">
          <WheatIcon />
        </div>
        <h2>SDK Error</h2>
        <p className="error-text">{sdkError}</p>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className="app-loading">
        <div className="loading-illustration">
          <WheatIcon />
        </div>
        <h2>Loading FarmLens AI</h2>
        <p>Initializing on-device AI engine</p>

        <div className="loading-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${loadingProgress}%` }} />
          </div>
        </div>

        <div className="loading-tips">
          <p className="loading-tip">
            {loadingProgress < 30 && "FarmLens works completely offline"}
            {loadingProgress >= 30 && loadingProgress < 60 && "Your data never leaves your device"}
            {loadingProgress >= 60 && loadingProgress < 90 && "Supports all crop types"}
            {loadingProgress >= 90 && "Get expert advice instantly"}
          </p>
        </div>
      </div>
    );
  }

  // Main App
  return (
    <div className="app">
      {/* Header */}

      <header className="app-header">
        <div>
          <h1>
            <div className="app-logo">
              <WheatIcon />
            </div>
            <div>
              FarmLens AI
              <span className="app-tagline">Smart Farming Assistant</span>
            </div>
          </h1>
        </div>

        <div className="header-right">
          {accel && (
            <div className="offline-badge">
              <div className="status-dot" />
              Offline Ready
            </div>
          )}
        </div>
      </header>

      {/* Hero Banner (shown on first load) */}

      {showHero && (
        <section className="hero-banner">
          <div className="hero-content">
            <h2 className="hero-title">AI-Powered Crop Intelligence</h2>
            <p className="hero-subtitle">Identify diseases, analyze soil, get expert advice</p>

            <div className="hero-features">
              <div className="hero-feature-pill">Disease Detection</div>
              <div className="hero-feature-pill">Soil Analysis</div>
              <div className="hero-feature-pill">Voice Assistant</div>
            </div>
          </div>
        </section>
      )}


      {/* Dashboard Stats Bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-value">{stats.scansToday}</div>
          <div className="stat-label">Scans Today</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔍</div>
          <div className="stat-value">{stats.diseasesFound}</div>
          <div className="stat-label">Diseases Found</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🌱</div>
          <div className="stat-value">{stats.soilChecks}</div>
          <div className="stat-label">Soil Checks</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-value">12</div>
          <div className="stat-label">Calendar Weeks</div>
        </div>
      </div>

      {/* Tab Content */}
      <main className="tab-content">
        {activeTab === 'scan-crop' && <CropScanTab language="en" />}
        {activeTab === 'scan-soil' && <SoilScanTab />}
        {activeTab === 'voice' && <VoiceHelpTab />}
        {activeTab === 'calendar' && <CalendarTab />}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="tab-bar">
        <button
          className={activeTab === 'scan-crop' ? 'active' : ''}
          onClick={() => setActiveTab('scan-crop')}
        >
          <div className="tab-icon icon-leaf">
            <LeafIcon />
          </div>
          <span className="tab-label">Scan Crop</span>
        </button>

        <button
          className={activeTab === 'scan-soil' ? 'active' : ''}
          onClick={() => setActiveTab('scan-soil')}
        >
          <div className="tab-icon icon-soil">
            <SoilIcon />
          </div>
          <span className="tab-label">Soil Check</span>
        </button>

        <button
          className={activeTab === 'voice' ? 'active' : ''}
          onClick={() => setActiveTab('voice')}
        >
          <div className="tab-icon icon-mic">
            <MicIcon />
          </div>
          <span className="tab-label">Voice Help</span>
        </button>

        <button
          className={activeTab === 'calendar' ? 'active' : ''}
          onClick={() => setActiveTab('calendar')}
        >
          <div className="tab-icon icon-calendar">
            <CalendarIcon />
          </div>
          <span className="tab-label">Calendar</span>
          {/* Optional: Show badge for upcoming tasks */}
          {/* <span className="tab-badge">3</span> */}
        </button>
      </nav>
    </div>
  );
}
