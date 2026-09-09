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
  const [session, setSession] = useState(null);
  const [credits, setCredits] = useState(0);
  const [userRole, setUserRole] = useState("user");
  const [freeAttempts, setFreeAttempts] = useState(1);

  // Auth UI state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const reloadProfile = useCallback(async (currentUser) => {
    if (!currentUser) return;

    try {
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };

      const token = sessionData?.session?.access_token || session?.access_token;

      if (token) {
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const profileData = await res.json();
          setCredits(profileData.credits ?? 0);
          setUserRole(profileData.role || "user");
          setFreeAttempts(profileData.free_attempts ?? 1);
          return;
        }
      }
    } catch (err) {
      console.error("Error fetching /api/me:", err);
    }

    // Fallback if /api/me fails or token is unavailable
    if (supabase) {
      const { data } = await supabase
        .from("profiles")
        .select("credits, role, free_attempts")
        .eq("id", currentUser.id)
        .single();

      if (data) {
        setCredits(data.credits ?? 0);
        setUserRole(data.role || "user");
        setFreeAttempts(data.free_attempts ?? 1);
      }
    }
  }, [session]);

  useEffect(() => {
    if (!supabase) return;

    async function loadUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session ?? null);
      setUser(session?.user ?? null);

      if (session?.user) {
        await reloadProfile(session.user);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession ?? null);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        reloadProfile(currentSession.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [reloadProfile]);

  const getAuthHeaders = useCallback(async () => {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token || session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [session]);

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
      const authHeaders = await getAuthHeaders();
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ task }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка анализа.");
      }

      setResult(data.result);

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
    const authHeaders = await getAuthHeaders();

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
          headers: { ...authHeaders },
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
        headers: { ...authHeaders },
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
        headers: { ...authHeaders },
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
        headers: { ...authHeaders },
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
    headers: { ...authHeaders },
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
        if (user) {
          await reloadProfile(user);
        }

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

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f7f8",
        fontFamily: "Arial, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: "18px",
          padding: "24px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <h1 style={{ margin: 0 }}>Content AI Studio</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {user ? (
              <>
                <span style={{ fontSize: "14px", color: "#333", fontWeight: 500 }}>
                  {user.email}
                </span>

                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    padding: "6px 14px",
                    borderRadius: "20px",
                    background: userRole === "admin" ? "#fef3c7" : "#f3f4f6",
                    color: userRole === "admin" ? "#b45309" : "#374151",
                    border: userRole === "admin" ? "1px solid #fcd34d" : "1px solid #e5e7eb",
                  }}
                >
                  {userRole === "admin"
                    ? "Администратор — безлимитный доступ"
                    : freeAttempts > 0
                    ? `Бесплатная попытка: ${freeAttempts} | Кредиты: ${credits}`
                    : `Кредиты: ${credits}`}
                </div>

                <button
                  onClick={async () => {
                    if (supabase) {
                      await supabase.auth.signOut();
                      setUser(null);
                      setSession(null);
                      setUserRole("user");
                      setCredits(0);
                      setFreeAttempts(1);
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #ccc",
                    background: "#fff",
                    color: "#333",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Выйти
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setShowAuthModal(true);
                  setAuthError("");
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Войти
              </button>
            )}
          </div>
        </div>

        {showAuthModal && !user && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "16px",
                padding: "24px",
                width: "100%",
                maxWidth: "380px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                position: "relative",
              }}
            >
              <button
                onClick={() => setShowAuthModal(false)}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  border: "none",
                  background: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#666",
                }}
              >
                ✕
              </button>

              <h2 style={{ marginTop: 0, marginBottom: "16px" }}>Вход в систему</h2>

              {authError && (
                <div
                  style={{
                    marginBottom: "14px",
                    padding: "10px",
                    borderRadius: "8px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    fontSize: "13px",
                  }}
                >
                  {authError}
                </div>
              )}

              <div style={{ display: "grid", gap: "12px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      color: "#555",
                      marginBottom: "4px",
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="name@example.com"
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      color: "#555",
                      marginBottom: "4px",
                    }}
                  >
                    Пароль
                  </label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    marginTop: "8px",
                  }}
                >
                  <button
                    disabled={authLoading}
                    onClick={async () => {
                      if (!supabase) {
                        setAuthError("Supabase не подключён.");
                        return;
                      }
                      setAuthLoading(true);
                      setAuthError("");
                      const { error } = await supabase.auth.signInWithPassword({
                        email: authEmail,
                        password: authPassword,
                      });
                      setAuthLoading(false);
                      if (error) {
                        setAuthError(error.message);
                      } else {
                        setShowAuthModal(false);
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#111",
                      color: "#fff",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {authLoading ? "Вход..." : "Войти"}
                  </button>

                  <button
                    disabled={authLoading}
                    onClick={async () => {
                      if (!supabase) {
                        setAuthError("Supabase не подключён.");
                        return;
                      }
                      setAuthLoading(true);
                      setAuthError("");
                      const { error } = await supabase.auth.signUp({
                        email: authEmail,
                        password: authPassword,
                      });
                      setAuthLoading(false);
                      if (error) {
                        setAuthError(error.message);
                      } else {
                        setShowAuthModal(false);
                        alert("Регистрация успешна! Если требуется подтверждение по e-mail, проверьте вашу почту.");
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      background: "#fff",
                      color: "#333",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Регистрация
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <p style={{ color: "#555", marginBottom: "24px" }}>
          AI tools for social media, design and freelance work
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            gap: "24px",
          }}
        >
          <aside
            style={{
              borderRight: "1px solid #e5e5e5",
              paddingRight: "18px",
            }}
          >
            <h3>Инструменты</h3>
            <div style={{ display: "grid", gap: "10px" }}>
              <button>Анализ ТЗ</button>
              <button>Изображения</button>
              <button>Карточки товара</button>
              <button>Одностраничный сайт</button>
              <button>Визитки и флаеры</button>
              <button>Видео</button>
            </div>
          </aside>

          <section>
            <h2>Рабочая область</h2>

            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Вставьте ТЗ клиента или опишите задачу..."
              style={{
                width: "100%",
                minHeight: "160px",
                padding: "14px",
                borderRadius: "10px",
                border: "1px solid #ccc",
                fontSize: "16px",
                boxSizing: "border-box",
              }}
            />

            <button
              onClick={analyzeTask}
              disabled={loading}
              style={{
                marginTop: "16px",
                padding: "12px 18px",
                borderRadius: "10px",
                border: "none",
                background: "#111",
                color: "#fff",
              }}
            >
              {loading ? "Анализирую..." : "Анализировать"}
            </button>

            <div
              style={{
                marginTop: "24px",
                padding: "18px",
                background: "#f3f3f3",
                borderRadius: "12px",
                whiteSpace: "pre-wrap",
                lineHeight: "1.5",
              }}
            >
              {error && error}
              {!error && !result && "Здесь будет результат анализа ТЗ."}
              {result && result}
            </div>

            {plan && (
              <div
                style={{
                  marginTop: "20px",
                  border: "1px solid #e5e5e5",
                  borderRadius: "12px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "14px 18px",
                    background: "#fafafa",
                    borderBottom: "1px solid #e5e5e5",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <strong>Структурированный план</strong>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: "20px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#fff",
                      background:
                        plan.status === "executable"
                          ? "#16a34a"
                          : plan.status === "partial"
                          ? "#d97706"
                          : "#dc2626",
                    }}
                  >
                    {STATUS_LABELS[plan.status] || plan.status}
                  </span>
                </div>

                <div style={{ padding: "18px", display: "grid", gap: "16px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(220px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <PlanParam label="Тип задачи" value={plan.taskType} />
                    <PlanParam label="Назначение" value={plan.purpose} />
                    <PlanParam label="Стиль" value={formatValue(plan.style)} />
                    <PlanParam
                      label="Количество файлов"
                      value={formatValue(params?.fileCount)}
                    />
                    <PlanParam
                      label="Размер"
                      value={
                        params?.width && params?.height
                          ? `${params.width} × ${params.height}`
                          : params?.aspectRatio
                          ? params.aspectRatio
                          : "не указан"
                      }
                    />
                    <PlanParam
                      label="Формат"
                      value={formatValue(params?.format)}
                    />
                    <PlanParam
                      label="Фон"
                      value={formatValue(params?.background)}
                    />
                    <PlanParam
                      label="Цвет фона"
                      value={formatValue(params?.backgroundColor)}
                    />
                    <PlanParam
                      label="Платформа"
                      value={formatValue(params?.platform)}
                    />
                    <PlanParam
                      label="Тень"
                      value={formatValue(params?.shadow)}
                    />
                    <PlanParam
                      label="Освещение"
                      value={formatValue(params?.lighting)}
                    />
                    <PlanParam
                      label="Поворот"
                      value={formatValue(params?.rotation)}
                    />
                    <PlanParam
                      label="Масштаб"
                      value={formatValue(params?.scale)}
                    />
                    <PlanParam
                      label="Позиция"
                      value={formatValue(params?.position)}
                    />
                  </div>

                  {plan.steps && plan.steps.length > 0 && (
                    <div>
                      <h4
                        style={{
                          margin: "0 0 12px 0",
                          fontSize: "15px",
                        }}
                      >
                        Этапы выполнения
                      </h4>

                      <div style={{ display: "grid", gap: "10px" }}>
                        {plan.steps.map((step, index) => (
                          <StepCard
                            key={step.id || index}
                            step={step}
                            index={index}
                            execState={stepStates[step.id] || "waiting"}
                            execResult={stepResults[step.id]}
                            onConfirmPaid={() => confirmPaidStep(step.id)}
                            executing={executing}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {plan.costSummary && (
                    <div
                      style={{
                        padding: "14px",
                        background: "#fafafa",
                        borderRadius: "10px",
                        border: "1px solid #e5e5e5",
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#999",
                            marginBottom: "4px",
                          }}
                        >
                          Локальные операции
                        </div>
                        <div style={{ fontWeight: 600 }}>
                          {plan.costSummary.local}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#999",
                            marginBottom: "4px",
                          }}
                        >
                          AI/API операции
                        </div>
                        <div style={{ fontWeight: 600 }}>
                          {plan.costSummary.ai}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#999",
                            marginBottom: "4px",
                          }}
                        >
                          Итого
                        </div>
                        <div style={{ fontWeight: 600 }}>
                          {plan.costSummary.total}
                        </div>
                      </div>
                    </div>
                  )}

                  {plan.needsInput && plan.needsInput.length > 0 && (
                    <div
                      style={{
                        padding: "14px",
                        background: "#fef3c7",
                        borderRadius: "10px",
                        border: "1px solid #fcd34d",
                      }}
                    >
                      <strong>Что нужно от пользователя:</strong>
                      <ul
                        style={{
                          margin: "8px 0 0 0",
                          paddingLeft: "20px",
                        }}
                      >
                        {plan.needsInput.map((item, i) => (
                          <li key={i} style={{ fontSize: "14px" }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {plan.manualReview && allConnectedCompleted && (
                    <div
                      style={{
                        padding: "14px",
                        background: "#fef3c7",
                        borderRadius: "10px",
                        border: "1px solid #fcd34d",
                        fontSize: "14px",
                      }}
                    >
                      <strong>
                        Требуется ручная проверка результата перед выдачей
                        клиенту.
                      </strong>
                    </div>
                  )}

                  {plan.nextStep && (
                    <div
                      style={{
                        padding: "14px",
                        background: "#f0f9ff",
                        borderRadius: "10px",
                        border: "1px solid #bae6fd",
                        fontSize: "14px",
                      }}
                    >
                      <strong>Следующий шаг: </strong>
                      {plan.nextStep}
                    </div>
                  )}
                </div>
              </div>
            )}

            {result && (
              <div
                style={{
                  marginTop: "24px",
                  padding: "18px",
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                }}
              >
                <h3>Файлы</h3>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFiles}
                />

                {files.length > 0 && (
                  <p>
                    Выбрано файлов: <strong>{files.length}</strong>
                  </p>
                )}

                <button
                  onClick={confirmPlan}
                  disabled={!files.length || planConfirmed}
                  style={{
                    marginTop: "8px",
                    padding: "12px 18px",
                    borderRadius: "10px",
                    border: "none",
                    background:
                      files.length && !planConfirmed ? "#dc2626" : "#aaa",
                    color: "#fff",
                  }}
                >
                  {planConfirmed ? "План подтверждён" : "Подтвердить план"}
                </button>

                {planConfirmed && plan && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "16px",
                      background: "#fff5f5",
                      borderRadius: "10px",
                      border: "1px solid #fecaca",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <strong>Запуск выполнения</strong>
                        <p
                          style={{
                            margin: "4px 0 0 0",
                            fontSize: "13px",
                            color: "#666",
                          }}
                        >
                          Бесплатные операции выполняются автоматически.
                          Платные операции требуют подтверждения каждого этапа.
                        </p>
                      </div>

                      <button
                        onClick={executePlan}
                        disabled={executing}
                        style={{
                          padding: "12px 24px",
                          borderRadius: "10px",
                          border: "none",
                          background: executing ? "#999" : "#dc2626",
                          color: "#fff",
                          fontSize: "15px",
                          fontWeight: 600,
                        }}
                      >
                        {executing
                          ? "Выполняю..."
                          : hasPendingPaid
                          ? "Запустить доступные этапы"
                          : "Запустить выполнение"}
                      </button>
                    </div>

                    {globalError && (
                      <p
                        style={{
                          marginTop: "12px",
                          color: "#dc2626",
                          fontWeight: 500,
                        }}
                      >
                        {globalError}
                      </p>
                    )}

                    {allConnectedCompleted && !globalError && (
                      <p
                        style={{
                          marginTop: "12px",
                          color: "#16a34a",
                          fontWeight: 500,
                        }}
                      >
                        Все доступные этапы завершены. Проверьте результаты
                        выше.
                        {plan.manualReview &&
                          " Требуется ручная проверка перед выдачей."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
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
