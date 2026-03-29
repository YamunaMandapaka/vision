
import { useState, useCallback, useEffect } from 'react';
import { ModelManager, ModelCategory } from '@runanywhere/web';
import { TextGeneration } from '@runanywhere/web-llamacpp';

/* ================= TYPES ================= */

type TaskType = 'watering' | 'fertilizing' | 'pesticide' | 'harvesting' | 'pruning' | 'monitoring' | 'general';

interface WeekTask {
  week: number;
  title: string;
  task_type: TaskType;
  instructions: string;
  warning: string | null;
  days: string;
  completed?: boolean;
}

type GrowingStage = 'seedling' | 'vegetative' | 'flowering' | 'fruiting' | 'harvesting';

/* ================= CONSTANTS ================= */

const GROWING_STAGES = [
  { value: 'seedling', label: 'Seedling (0-2 weeks)' },
  { value: 'vegetative', label: 'Vegetative (2-6 weeks)' },
  { value: 'flowering', label: 'Flowering (6-10 weeks)' },
  { value: 'fruiting', label: 'Fruiting (10-14 weeks)' },
  { value: 'harvesting', label: 'Harvesting (14+ weeks)' },
];

const TASK_COLORS: Record<TaskType, string> = {
  watering: '#3B82F6',
  fertilizing: '#22C55E',
  pesticide: '#EF4444',
  harvesting: '#EAB308',
  pruning: '#A855F7',
  monitoring: '#F97316',
  general: '#6B7280',
};

const TASK_LABELS: Record<TaskType, string> = {
  watering: '💧 Watering',
  fertilizing: '🌱 Fertilizing',
  pesticide: '🚫 Pesticide',
  harvesting: '🌾 Harvesting',
  pruning: '✂️ Pruning',
  monitoring: '👁️ Monitoring',
  general: '📋 General',
};

/* ================= COMPONENT ================= */

export function CalendarTab() {
  const [cropName, setCropName] = useState('');
  const [growingStage, setGrowingStage] = useState<GrowingStage>('seedling');
  const [calendar, setCalendar] = useState<WeekTask[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ================= SIMPLE GENERATOR (UI FOCUS) ================= */
  const generateCalendar = async () => {
    if (!cropName) {
      setError('Enter crop name');
      return;
    }

    setIsGenerating(true);
    setError(null);

    // Dummy UI data (you can keep your LLM logic)
    const data: WeekTask[] = Array.from({ length: 12 }, (_, i) => ({
      week: i + 1,
      title: 'Care Task',
      task_type: 'watering',
      instructions: 'Water plants regularly',
      warning: null,
      days: 'Mon Thu',
      completed: false,
    }));

    setTimeout(() => {
      setCalendar(data);
      setIsGenerating(false);
    }, 1000);
  };

  /* ================= UI ================= */

  return (
    <div className="tab-panel p-2">

      {/* HEADER */}
      <div className="card mb-2 text-center">
        <h2 className="card-title">🗓️ Smart Crop Calendar</h2>
        <p className="text-muted">AI-powered weekly farming schedule</p>
      </div>

      {/* INPUT SECTION */}
      <div className="card mb-2">
        <div className="flex flex-col gap-2">

          <input
            className="calendar-input"
            placeholder="Enter crop (Tomato, Rice...)"
            value={cropName}
            onChange={(e) => setCropName(e.target.value)}
          />

          <select
            className="calendar-select"
            value={growingStage}
            onChange={(e) => setGrowingStage(e.target.value as GrowingStage)}
          >
            {GROWING_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <button className="btn btn-primary" onClick={generateCalendar}>
            {isGenerating ? 'Generating...' : 'Generate Calendar'}
          </button>

          {error && <p className="error-text">{error}</p>}
        </div>
      </div>

      {/* LOADING */}
      {isGenerating && (
        <div className="card text-center">
          <div className="spinner" />
          <p>Generating schedule...</p>
        </div>
      )}

      {/* GRID */}
      {calendar.length > 0 && (
        <div className="card">
          <h3 className="mb-2">📅 12 Week Plan</h3>

          <div className="calendar-grid">
            {calendar.map((task) => (
              <div
                key={task.week}
                className={`calendar - card ${task.completed ? 'done' : ''} `}
                onClick={() => setSelectedWeek(task.week)}
              >
                <h4>Week {task.week}</h4>
                <p>{task.title}</p>
                <span
                  className="badge"
                  style={{ background: TASK_COLORS[task.task_type] }}
                >
                  {task.task_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DETAILS */}
      {selectedWeek && (
        <div className="card">
          {calendar
            .filter((t) => t.week === selectedWeek)
            .map((task) => (
              <div key={task.week}>
                <h3>Week {task.week}</h3>
                <p><strong>{task.title}</strong></p>
                <p>{task.instructions}</p>
                <p>📅 {task.days}</p>

                {task.warning && (
                  <p className="error-text">⚠ {task.warning}</p>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

