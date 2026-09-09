"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "./lib/supabaseClient";

const STATUS_LABELS = {
  executable: "Выполнимо",
  partial: "Частично выполнимо",
  needs_clarification: "Требуется уточнение",
};

const STEP_STATUS_COLORS = {
  AVAILABLE: "#16a34a",
  NOT_CONNECTED: "#dc2626",
  MANUAL_REVIEW: "#d97706",
  NEEDS_INPUT: "#2563eb",
};

const STEP_STATUS_LABELS = {
  AVAILABLE: "Доступно",
  NOT_CONNECTED: "Не подключено",
  MANUAL_REVIEW: "Ручная проверка",
  NEEDS_INPUT: "Нужны данные",
};

const HANDLER_LABELS = {
  "sharp:resize": "Sharp — локально, бесплатно",
  "replicate:remove-background": "Replicate — удаление фона, платно",
  "replicate:segment": "Replicate — Grounded SAM, платно",
  "replicate:flux-edit": "Replicate — FLUX Kontext, платно (creative)",
  "replicate:kling-video": "Replicate — Kling v2.1 image-to-video, платно",
  "compose:scene": "Композиция (не подключено)",
  not_connected: "Не подключено",
  manual_review: "Ручная проверка",
};

const COST_LABELS = {
  free: "Бесплатно",
  paid: "Платно",
  unknown: "Стоимость уточняется",
};

const EXEC_COLORS = {
  waiting: "#6b7280",
  running: "#2563eb",
  completed: "#16a34a",
  failed: "#dc2626",
  skipped: "#9ca3af",
  waiting_confirmation: "#d97706",
};

const EXEC_LABELS = {
  waiting: "Ожидание",
  running: "Выполнение...",
  completed: "Готово",
  failed: "Ошибка",
  skipped: "Пропущено",
  waiting_confirmation: "Ожидает подтверждения",
};

const CONNECTED_HANDLERS = new Set([
  "sharp:resize",
  "replicate:remove-background",
  "replicate:segment",
  "replicate:flux-edit",
  "replicate:kling-video",
]);

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "не указан";
  }
  return String(value);
}

export default function Home() {
  const [task, setTask] = useState("");
  const [result, setResult] = useState("");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [files, setFiles] = useState([]);
  const [planConfirmed, setPlanConfirmed] = useState(false);

  const [stepStates, setStepStates] = useState({});
  const [stepResults, setStepResults] = useState({});
  const [executing, setExecuting] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [activeTool, setActiveTool] = useState("Анализ ТЗ");
  const [history, setHistory] = useState([]);

useEffect(() => {
  if (!supabase) return;

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user ?? null);

    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", user.id)
        .single();

      setCredits(data?.credits ?? 0);
    }
  }

  loadUser();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
  });

  return () => subscription.unsubscribe();
}, []);

  const fileInputRef = useRef(null);

  const resetExecution = useCallback(() => {
    setStepStates({});
    setStepResults({});
    setGlobalError("");
  }, []);

  async function analyzeTask() {
    if (!task.trim()) {
      setError("Введите ТЗ или описание задачи.");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");
    setPlan(null);
    setPlanConfirmed(false);
    resetExecution();

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка анализа.");
      }

      setResult(data.result);
      setHistory((prev) => [{ title: task.slice(0, 52), tool: activeTool, status: "Готово", time: "Только что" }, ...prev].slice(0, 8));

      if (data.plan) {
        setPlan(data.plan);

        const initialStates = {};
        for (const step of data.plan.steps || []) {
          if (!CONNECTED_HANDLERS.has(step.handler)) {
            initialStates[step.id] = "skipped";
          } else if (step.status === "NOT_CONNECTED") {
            initialStates[step.id] = "skipped";
          } else if (step.requiresConfirmation) {
            initialStates[step.id] = "waiting_confirmation";
          } else {
            initialStates[step.id] = "waiting";
          }
        }
        setStepStates(initialStates);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleFiles(event) {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles(selectedFiles);
    setPlanConfirmed(false);
    resetExecution();
  }

  function confirmPlan() {
    if (!files.length || !plan) return;
    setPlanConfirmed(true);
    setGlobalError("");
  }

  function updateStepState(stepId, state) {
    setStepStates((prev) => ({ ...prev, [stepId]: state }));
  }

  function setStepResult(stepId, result) {
    setStepResults((prev) => ({ ...prev, [stepId]: result }));
  }

  async function runStep(step, inputFiles) {
    const p = step.params || {};

    if (step.handler === "sharp:resize") {
      const w = p.width || plan?.parameters?.width || 340;
      const h = p.height || plan?.parameters?.height || 340;
      const fmt = p.format || plan?.parameters?.format || "jpg";

      const results = [];
      for (let i = 0; i < inputFiles.length; i++) {
        const file = inputFiles[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("width", String(w));
        formData.append("height", String(h));
        formData.append("format", String(fmt));

        const response = await fetch("/api/process-image", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || `Ошибка обработки файла ${file.name}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const originalName = file.name.replace(/\.[^/.]+$/, "") || `image-${i + 1}`;
        results.push({ name: `${originalName}-processed.${fmt}`, url, blob });
      }

      return { type: "files", items: results };
    }

    if (step.handler === "replicate:remove-background") {
      const formData = new FormData();
      formData.append("file", inputFiles[0]);

      const response = await fetch("/api/remove-background", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка удаления фона.");
      }
      if (!data.url) {
        throw new Error("Не получена ссылка на готовое изображение.");
      }

      return { type: "url", url: data.url };
    }

    if (step.handler === "replicate:segment") {
      const objectPrompt = p.objectPrompt || "";
      if (!objectPrompt) {
        throw new Error("Не указан объект для выделения в плане.");
      }

      const formData = new FormData();
      formData.append("file", inputFiles[0]);
      formData.append("objectPrompt", objectPrompt);

      const response = await fetch("/api/segment-object", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка выделения объекта.");
      }
      if (!data.urls || !data.urls.length) {
        throw new Error("Модель не вернула результат.");
      }

      return { type: "urls", urls: data.urls };
    }
    if (step.handler === "replicate:kling-video") {
      const formData = new FormData();
      formData.append("file", inputFiles[0]);
      formData.append("prompt", p.prompt || step.description || "Плавное рекламное движение камеры");
      formData.append("duration", String([5, 10].includes(Number(p.duration)) ? p.duration : 5));
      formData.append("resolution", p.resolution === "1080p" ? "1080p" : "720p");

      const response = await fetch("/api/replicate/kling-video", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка генерации видео.");
      if (!data.videoUrl) throw new Error("Kling не вернул готовое видео.");
      return { type: "video", url: data.videoUrl };
    }

    if (step.handler === "replicate:flux-edit") {
  const prompt = p.prompt || step.description || step.operation || "";

  if (!prompt.trim()) {
    throw new Error("Не указана инструкция для AI-редактирования изображения.");
  }

  const formData = new FormData();
  formData.append("file", inputFiles[0]);
  formData.append("prompt", prompt);

  const response = await fetch("/api/edit-image", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Ошибка AI-редактирования изображения.");
  }

  if (!data.imageUrl) {
    throw new Error("Не получено готовое изображение.");
  }

  return { type: "url", url: data.imageUrl };
}

    throw new Error(`Обработчик ${step.handler} не подключён.`);
  }

  async function executePlan() {
    if (!plan || !files.length || !planConfirmed) return;

    setExecuting(true);
    setGlobalError("");

    const steps = plan.steps || [];
    let currentFiles = [...files];

    for (const step of steps) {
      if (!CONNECTED_HANDLERS.has(step.handler)) {
        updateStepState(step.id, "skipped");
        continue;
      }

      if (step.status === "NOT_CONNECTED") {
        updateStepState(step.id, "skipped");
        continue;
      }

      if (step.requiresConfirmation && stepStates[step.id] !== "confirmed") {
        updateStepState(step.id, "waiting_confirmation");
        continue;
      }

      updateStepState(step.id, "running");

      try {
        const res = await runStep(step, currentFiles);
        setStepResult(step.id, res);
        updateStepState(step.id, "completed");

        if (res.type === "video" && res.url) {
          currentFiles = currentFiles;
        } else if (res.type === "files" && res.items?.length) {
          const blobs = res.items.map((item) => item.blob);
          currentFiles = blobs.length ? blobs : currentFiles;
        } else if (res.type === "url" && res.url) {
          const response = await fetch(res.url);
          if (!response.ok) {
            throw new Error("Не удалось получить результат предыдущего шага.");
          }
          const blob = await response.blob();
          const sourceName = currentFiles[0]?.name || "image";
          const extension = blob.type.split("/")[1] || "png";
          currentFiles = [
            new File([blob], `${sourceName.replace(/\.[^/.]+$/, "")}-processed.${extension}`, {
              type: blob.type,
            }),
          ];
        } else if (res.type === "urls" && res.urls?.length) {
          const nextFiles = [];
          for (let i = 0; i < res.urls.length; i++) {
            const response = await fetch(res.urls[i]);
            if (!response.ok) {
              throw new Error("Не удалось получить результат предыдущего шага.");
            }
            const blob = await response.blob();
            const sourceName = currentFiles[i]?.name || currentFiles[0]?.name || `image-${i + 1}`;
            const extension = blob.type.split("/")[1] || "png";
            nextFiles.push(
              new File([blob], `${sourceName.replace(/\.[^/.]+$/, "")}-processed.${extension}`, {
                type: blob.type,
              })
            );
          }
          if (nextFiles.length) {
            currentFiles = nextFiles;
          }
        }
      } catch (err) {
        setStepResult(step.id, { type: "error", message: err.message });
        updateStepState(step.id, "failed");
        setGlobalError(err.message);
        break;
      }
    }

    setExecuting(false);
  }

  function confirmPaidStep(stepId) {
    setStepStates((prev) => ({ ...prev, [stepId]: "confirmed" }));
  }

  const connectedSteps = (plan?.steps || []).filter((s) =>
    CONNECTED_HANDLERS.has(s.handler)
  );
  const allConnectedCompleted = connectedSteps.every(
    (s) => stepStates[s.id] === "completed" || stepStates[s.id] === "skipped"
  );
  const hasPendingPaid = connectedSteps.some(
    (s) => stepStates[s.id] === "waiting_confirmation"
  );

  const params = plan?.parameters;

  const tools = [
    { name: "Анализ ТЗ", icon: "✦", description: "Разбор задачи и план" },
    { name: "Изображения", icon: "◈", description: "Обработка и улучшение" },
    { name: "Карточки товара", icon: "▣", description: "Визуал для маркетплейса" },
    { name: "Одностраничный сайт", icon: "▤", description: "Структура и контент" },
    { name: "Визитки и флаеры", icon: "▧", description: "Печатные материалы" },
    { name: "Видео", icon: "▷", description: "Движение из изображения" },
  ];
  const presets = {
    "Изображения": ["Удалить фон товара", "Улучшить качество фото", "Подготовить 1:1 для соцсетей"],
    "Карточки товара": ["Карточка для Wildberries", "Инфографика товара", "Главный слайд каталога"],
    "Одностраничный сайт": ["Лендинг нового продукта", "Страница услуги", "Продающий экран"],
    "Визитки и флаеры": ["Минималистичная визитка", "Флаер акции", "Постер мероприятия"],
    "Видео": ["Плавное движение камеры", "Видео для Reels", "Анимировать товар"],
  };
  const currentPresets = presets[activeTool] || ["Разобрать ТЗ клиента", "Проверить реализуемость", "Составить план работ"];

  return (
    <main className="studio-shell">
      <aside className="studio-sidebar">
        <div className="brand"><div className="brand-mark">C</div><div><strong>Content AI</strong><span>STUDIO</span></div></div>
        <div className="workspace-label">РАБОЧАЯ ОБЛАСТЬ</div>
        <nav className="tool-nav">
          {tools.map((tool) => <button key={tool.name} className={`tool-link ${activeTool === tool.name ? "active" : ""}`} onClick={() => { setActiveTool(tool.name); setError(""); }}><span className="tool-icon">{tool.icon}</span><span><b>{tool.name}</b><small>{tool.description}</small></span>{activeTool === tool.name && <i>›</i>}</button>)}
        </nav>
        <div className="sidebar-bottom"><button className="secondary-link" onClick={() => setActiveTool("История")}><span>◷</span> История задач</button><button className="secondary-link"><span>?</span> Помощь и поддержка</button><div className="user-card"><div className="avatar">{user?.email?.[0]?.toUpperCase() || "G"}</div><div><b>{user?.email || "Гостевой режим"}</b><small>{user ? "Аккаунт подключён" : "Войдите для сохранения"}</small></div><span>•••</span></div></div>
      </aside>

      <section className="studio-main">
        <header className="topbar"><div><p className="eyebrow">CONTENT AI STUDIO / WORKSPACE</p><h1>{activeTool === "История" ? "История задач" : activeTool}</h1><p className="muted">Создавайте контент быстрее с помощью готовых AI-инструментов.</p></div><div className="top-actions"><div className="credit-pill"><span className="credit-dot"/><div><small>Баланс</small><b>{user ? `${credits} кредитов` : "1 бесплатная попытка"}</b></div></div><button className="icon-button" aria-label="Уведомления">◌</button><button className="mobile-menu" onClick={() => document.querySelector('.studio-sidebar')?.classList.toggle('open')}>☰</button></div></header>

        {activeTool === "История" ? <div className="history-panel"><div className="section-heading"><div><h2>Последние задачи</h2><p>Здесь будут появляться ваши готовые результаты.</p></div><span className="badge neutral">{history.length} задач</span></div>{history.length ? history.map((item, i) => <div className="history-row" key={i}><div className="history-symbol">✦</div><div><b>{item.title}</b><small>{item.tool} · {item.time}</small></div><span className="badge success">{item.status}</span></div>) : <div className="empty-state"><div className="empty-icon">◷</div><h3>История пока пуста</h3><p>Запустите первый инструмент, и результат появится здесь.</p></div>}</div> : <div className="workspace-grid">
          <div className="composer-column">
            <div className="card prompt-card"><div className="card-title"><div><span className="step-number">01</span><div><h2>Опишите задачу</h2><p>Чем подробнее ТЗ, тем точнее результат</p></div></div><span className="badge neutral">AI-помощник</span></div>
              <div className="prompt-wrap"><textarea value={task} onChange={(e) => setTask(e.target.value)} placeholder={activeTool === "Анализ ТЗ" ? "Вставьте ТЗ клиента или опишите задачу..." : `Опишите, что нужно сделать в разделе «${activeTool}»...`} /><span className="char-count">{task.length} / 2000</span></div>
              <div className="quick-prompts"><span>Быстрые шаблоны:</span>{currentPresets.map((preset) => <button key={preset} onClick={() => setTask(preset)}>{preset}</button>)}</div>
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()}><div className="upload-icon">↑</div><div><b>Перетащите файлы сюда</b><p>или нажмите, чтобы выбрать · PNG, JPG, WEBP до 20 МБ</p></div><input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} hidden /></div>
              {files.length > 0 && <div className="file-list">{files.map((file) => <span key={file.name}>◈ {file.name}</span>)}</div>}
              <button className="primary-action" onClick={analyzeTask} disabled={loading}>{loading ? "Анализируем..." : `Запустить ${activeTool.toLowerCase()}  →`}</button>
              {error && <div className="inline-error">{error}</div>}
            </div>
            {result && <div className="card result-card"><div className="section-heading"><div><h2>Результат анализа</h2><p>Проверьте план перед запуском операций</p></div><span className="badge success">Готово</span></div><div className="result-copy">{result}</div></div>}
          </div>
          <aside className="details-column">
            <div className="card tips-card"><div className="card-title"><div><span className="step-number violet">✦</span><div><h2>Популярные шаблоны</h2><p>Начните с готового сценария</p></div></div></div><div className="template-list">{currentPresets.map((preset, i) => <button key={preset} onClick={() => setTask(preset)}><span className="template-icon">{["◈", "▣", "✧"][i % 3]}</span><span><b>{preset}</b><small>{activeTool}</small></span><span>→</span></button>)}</div></div>
            <div className="card balance-card"><div className="section-heading"><div><h2>Ваш баланс</h2><p>Используйте кредиты для AI-операций</p></div><span className="balance-number">{credits}</span></div><div className="balance-line"><span>Бесплатная попытка</span><span className="badge violet-badge">Доступна</span></div><button className="outline-action" onClick={() => alert("Пополнение баланса будет доступно после подключения тарифа.")}>Пополнить баланс</button></div>
            {plan && <div className="card plan-mini"><div className="section-heading"><div><h2>План готов</h2><p>{plan.steps?.length || 0} этапов · стоимость до запуска</p></div><span className="badge warning">Проверка</span></div><div className="cost-preview"><span>AI/API операции</span><b>{plan.costSummary?.ai || "Уточняется"}</b></div><button className="outline-action" onClick={() => document.querySelector('.result-card')?.scrollIntoView({ behavior: 'smooth' })}>Посмотреть детали ↓</button></div>}
          </aside>
        </div>}
      </section>
    </main>
  );
}

function PlanParam({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontSize: "12px",
          color: "#999",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "14px", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function StepCard({ step, index, execState, execResult, onConfirmPaid, executing }) {
  const isPaid = step.cost === "paid";
  const isNotConnected = !CONNECTED_HANDLERS.has(step.handler) ||
    step.status === "NOT_CONNECTED";
  const isWaitingConfirmation = execState === "waiting_confirmation";
  const isRunning = execState === "running";
  const isCompleted = execState === "completed";
  const isFailed = execState === "failed";
  const isSkipped = execState === "skipped";

  return (
    <div
      style={{
        padding: "14px",
        border: `1px solid ${
          isFailed ? "#fecaca" :
          isCompleted ? "#d1fae5" :
          isRunning ? "#bfdbfe" :
          isSkipped ? "#f3f4f6" :
          isWaitingConfirmation ? "#fed7aa" :
          "#e5e5e5"
        }`,
        borderRadius: "10px",
        background: isSkipped ? "#fafafa" : "#fff",
        opacity: isSkipped ? 0.65 : 1,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: "12px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "#f0f0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: 700,
            color: "#333",
            flexShrink: 0,
          }}
        >
          {index + 1}
        </div>

        <div>
          <div style={{ fontWeight: 600, fontSize: "14px" }}>
            {step.operation}
          </div>

          <div
            style={{
              fontSize: "13px",
              color: "#666",
              marginTop: "4px",
            }}
          >
            {step.description}
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#999",
              marginTop: "6px",
            }}
          >
            {HANDLER_LABELS[step.handler] || step.handler}
          </div>

          {step.params &&
            Object.entries(step.params).some(
              ([, v]) => v !== null && v !== undefined && v !== ""
            ) && (
              <div
                style={{
                  marginTop: "8px",
                  display: "flex",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                {Object.entries(step.params).map(([key, value]) => {
                  if (value === null || value === undefined || value === "") {
                    return null;
                  }
                  return (
                    <span
                      key={key}
                      style={{
                        padding: "2px 8px",
                        background: "#f5f5f5",
                        borderRadius: "6px",
                        fontSize: "12px",
                        color: "#555",
                      }}
                    >
                      {key}: {String(value)}
                    </span>
                  );
                })}
              </div>
            )}

          {isWaitingConfirmation && (
            <div
              style={{
                marginTop: "10px",
                padding: "10px",
                background: "#fff7ed",
                borderRadius: "8px",
                border: "1px solid #fed7aa",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "13px",
                  color: "#9a3412",
                }}
              >
                Это платная операция. Подтвердите запуск.
              </p>
              <button
                onClick={onConfirmPaid}
                disabled={executing}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#dc2626",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Подтвердить платный этап
              </button>
            </div>
          )}

          {isCompleted && execResult && <StepResult result={execResult} />}

          {isFailed && execResult?.message && (
            <div
              style={{
                marginTop: "8px",
                fontSize: "13px",
                color: "#dc2626",
              }}
            >
              {execResult.message}
            </div>
          )}

          {isSkipped && (
            <div
              style={{
                marginTop: "8px",
                fontSize: "13px",
                color: "#9ca3af",
              }}
            >
              {isNotConnected
                ? "Операция не подключена — выполнение пропущено."
                : "Этап пропущен."}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            alignItems: "flex-end",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              padding: "3px 10px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#fff",
              background:
                EXEC_COLORS[execState] ||
                STEP_STATUS_COLORS[step.status] ||
                "#999",
            }}
          >
            {EXEC_LABELS[execState] ||
              STEP_STATUS_LABELS[step.status] ||
              step.status}
          </span>

          <span
            style={{
              fontSize: "12px",
              color: step.cost === "free" ? "#16a34a" : "#dc2626",
              fontWeight: 600,
            }}
          >
            {COST_LABELS[step.cost] || step.cost}
          </span>

          {step.requiresConfirmation && !isWaitingConfirmation && (
            <span
              style={{
                fontSize: "11px",
                color: "#d97706",
              }}
            >
              требует подтверждения
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StepResult({ result }) {
  if (result.type === "video" && result.url) {
    return (
      <div style={{ marginTop: "10px" }}>
        <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#16a34a", fontWeight: 600 }}>
          Готовое видео:
        </p>
        <video controls src={result.url} style={{ width: "100%", maxWidth: "520px", borderRadius: "8px" }} />
        <br />
        <a href={result.url} download="kling-video.mp4" target="_blank" rel="noreferrer" style={{ fontSize: "13px" }}>
          Скачать готовое видео
        </a>
      </div>
    );
  }

  if (result.type === "files" && result.items?.length) {
    return (
      <div style={{ marginTop: "10px" }}>
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: "13px",
            color: "#16a34a",
            fontWeight: 600,
          }}
        >
          Готовые файлы:
        </p>
        {result.items.map((file, i) => (
          <div key={i} style={{ marginBottom: "6px" }}>
            <a
              href={file.url}
              download={file.name}
              style={{ fontSize: "13px" }}
            >
              Скачать {file.name}
            </a>
          </div>
        ))}
      </div>
    );
  }

  if (result.type === "url" && result.url) {
    return (
      <div style={{ marginTop: "10px" }}>
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: "13px",
            color: "#16a34a",
            fontWeight: 600,
          }}
        >
          Результат:
        </p>
        <img
          src={result.url}
          alt="Результат"
          style={{
            maxWidth: "340px",
            width: "100%",
            border: "1px solid #ddd",
            borderRadius: "8px",
          }}
        />
        <br />
        <a
          href={result.url}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: "13px" }}
        >
          Открыть изображение
        </a>
      </div>
    );
  }

  if (result.type === "urls" && result.urls?.length) {
    return (
      <div style={{ marginTop: "10px" }}>
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: "13px",
            color: "#16a34a",
            fontWeight: 600,
          }}
        >
          Результат выделения:
        </p>
        {result.urls.map((url, i) => (
          <div key={i} style={{ marginBottom: "12px" }}>
            <img
              src={url}
              alt={`Результат ${i + 1}`}
              style={{
                maxWidth: "340px",
                width: "100%",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return null;
}
