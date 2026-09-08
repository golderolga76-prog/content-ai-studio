"use client";

import { useState } from "react";

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
  "compose:scene": "Композиция (не подключено)",
  not_connected: "Не подключено",
  manual_review: "Ручная проверка",
};

const COST_LABELS = {
  free: "Бесплатно",
  paid: "Платно",
  unknown: "Стоимость уточняется",
};

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
  const [confirmed, setConfirmed] = useState(false);

  const [width, setWidth] = useState(340);
  const [height, setHeight] = useState(340);
  const [format, setFormat] = useState("jpg");

  const [processing, setProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState([]);
  const [processError, setProcessError] = useState("");

  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgResult, setBgResult] = useState("");
  const [bgError, setBgError] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editProcessing, setEditProcessing] = useState(false);
  const [editResult, setEditResult] = useState("");
  const [editError, setEditError] = useState("");
  const [segmentPrompt, setSegmentPrompt] = useState("");
  const [segmentProcessing, setSegmentProcessing] = useState(false);
  const [segmentResults, setSegmentResults] = useState([]);
  const [segmentError, setSegmentError] = useState("");

  async function analyzeTask() {
    if (!task.trim()) {
      setError("Введите ТЗ или описание задачи.");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");
    setPlan(null);
    setConfirmed(false);
    setProcessedFiles([]);
    setBgResult("");
    setBgError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

        const resizeStep = data.plan.steps?.find(
          (s) => s.handler === "sharp:resize"
        );

        if (resizeStep) {
          if (resizeStep.params?.width) {
            setWidth(resizeStep.params.width);
          }
          if (resizeStep.params?.height) {
            setHeight(resizeStep.params.height);
          }
          if (resizeStep.params?.format) {
            setFormat(resizeStep.params.format);
          }
        }
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
    setConfirmed(false);
    setProcessedFiles([]);
    setProcessError("");
    setBgResult("");
    setBgError("");
  }

  async function processImages() {
    if (!files.length) return;

    setProcessing(true);
    setProcessError("");
    setProcessedFiles([]);

    try {
      const results = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        const formData = new FormData();
        formData.append("file", file);
        formData.append("width", String(width));
        formData.append("height", String(height));
        formData.append("format", format);

        const response = await fetch("/api/process-image", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(
            data?.error || `Ошибка обработки файла ${file.name}`
          );
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const originalName =
          file.name.replace(/\.[^/.]+$/, "") || `image-${i + 1}`;

        results.push({
          name: `${originalName}-processed.${format}`,
          url,
        });
      }

      setProcessedFiles(results);
    } catch (err) {
      setProcessError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function removeBackground() {
    if (!files.length) return;

    setBgProcessing(true);
    setBgError("");
    setBgResult("");

    try {
      const formData = new FormData();

      formData.append("file", files[0]);

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

      setBgResult(data.url);
    } catch (err) {
      setBgError(err.message);
    } finally {
      setBgProcessing(false);
    }
  }

  async function editImage() {
    if (!files.length) {
      setEditError("Сначала выберите изображение.");
      return;
    }

    if (!editPrompt.trim()) {
      setEditError("Введите инструкцию для AI-редактирования.");
      return;
    }

    setEditProcessing(true);
    setEditError("");
    setEditResult("");

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("prompt", editPrompt.trim());

      const response = await fetch("/api/edit-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка AI-редактирования.");
      }

      if (!data.imageUrl) {
        throw new Error("Не получена ссылка на готовое изображение.");
      }

      setEditResult(data.imageUrl);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditProcessing(false);
    }
  }

  async function segmentObject() {
    if (!files.length) {
      setSegmentError("Сначала выберите изображение.");
      return;
    }

    if (!segmentPrompt.trim()) {
      setSegmentError("Укажите объект для выделения.");
      return;
    }

    setSegmentProcessing(true);
    setSegmentError("");
    setSegmentResults([]);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("objectPrompt", segmentPrompt.trim());

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

      setSegmentResults(data.urls);
    } catch (err) {
      setSegmentError(err.message);
    } finally {
      setSegmentProcessing(false);
    }
  }

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
        <h1 style={{ marginTop: 0 }}>Content AI Studio</h1>

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

                <div
                  style={{
                    padding: "18px",
                    display: "grid",
                    gap: "16px",
                  }}
                >
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
                    <PlanParam
                      label="Стиль"
                      value={formatValue(plan.style)}
                    />
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
                          <div
                            key={step.id || index}
                            style={{
                              padding: "14px",
                              border: "1px solid #e5e5e5",
                              borderRadius: "10px",
                              background: "#fff",
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
                                    {Object.entries(step.params).map(
                                      ([key, value]) => {
                                        if (
                                          value === null ||
                                          value === undefined ||
                                          value === ""
                                        ) {
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
                                      }
                                    )}
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
                                    STEP_STATUS_COLORS[step.status] ||
                                    "#999",
                                }}
                              >
                                {STEP_STATUS_LABELS[step.status] ||
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

                              {step.requiresConfirmation && (
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

                  {plan.manualReview && (
                    <div
                      style={{
                        padding: "14px",
                        background: "#fef3c7",
                        borderRadius: "10px",
                        border: "1px solid #fcd34d",
                        fontSize: "14px",
                      }}
                    >
                      <strong>Требуется ручная проверка результата.</strong>
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
                <h3>Загрузить файлы</h3>

                <input
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
                  onClick={() => setConfirmed(true)}
                  disabled={!files.length}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "10px",
                    border: "none",
                    background: files.length ? "#111" : "#aaa",
                    color: "#fff",
                  }}
                >
                  Подтвердить план
                </button>

                {confirmed && (
                  <div
                    style={{
                      marginTop: "20px",
                      padding: "16px",
                      background: "#eef7ee",
                      borderRadius: "10px",
                    }}
                  >
                    <strong>План подтверждён.</strong>

                    <h4>Локальная обработка — $0</h4>

                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="number"
                        value={width}
                        onChange={(e) => setWidth(e.target.value)}
                        style={{ width: "90px", padding: "8px" }}
                      />

                      <input
                        type="number"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        style={{ width: "90px", padding: "8px" }}
                      />

                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        style={{ padding: "8px" }}
                      >
                        <option value="jpg">JPG</option>
                        <option value="png">PNG</option>
                        <option value="webp">WebP</option>
                      </select>
                    </div>

                    <button
                      onClick={processImages}
                      disabled={processing}
                      style={{
                        marginTop: "14px",
                        padding: "12px 18px",
                      }}
                    >
                      {processing
                        ? "Обрабатываю..."
                        : "Изменить размер / формат"}
                    </button>

                    <hr style={{ margin: "24px 0" }} />

                    <h4>AI/API обработка</h4>

                    <p>
                      Удаление фона через Replicate. Пока тестируем только
                      первое выбранное изображение.
                    </p>

                    <button
                      onClick={removeBackground}
                      disabled={bgProcessing}
                      style={{
                        padding: "12px 18px",
                        background: "#111",
                        color: "#fff",
                        border: "none",
                        borderRadius: "10px",
                      }}
                    >
                      {bgProcessing
                        ? "Удаляю фон..."
                        : "Удалить фон — тест 1 фото"}
                    </button>

                    {bgError && (
                      <p style={{ marginTop: "14px" }}>{bgError}</p>
                    )}

                    {bgResult && (
                      <div style={{ marginTop: "18px" }}>
                        <p>
                          <strong>Фон удалён:</strong>
                        </p>

                        <img
                          src={bgResult}
                          alt="Результат"
                          style={{
                            maxWidth: "340px",
                            width: "100%",
                            border: "1px solid #ddd",
                          }}
                        />

                        <br />

                        <a
                          href={bgResult}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть готовое изображение
                        </a>
                      </div>
                    )}

                    <hr style={{ margin: "24px 0" }} />

                    <h4>AI-редактирование изображения</h4>

                    <p>
                      Введите инструкцию для FLUX Kontext Pro.
                      Пока тестируем только первое выбранное изображение.
                    </p>

                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="Например: слегка наклони баночку вправо, расположи рядом с коробкой, добавь мягкую естественную тень и студийное освещение"
                      style={{
                        width: "100%",
                        minHeight: "110px",
                        padding: "12px",
                        marginTop: "10px",
                        marginBottom: "12px",
                        border: "1px solid #ddd",
                        borderRadius: "10px",
                        resize: "vertical",
                      }}
                    />

                    <button
                      onClick={editImage}
                      disabled={editProcessing}
                      style={{
                        padding: "12px 18px",
                        background: "#111",
                        color: "#fff",
                        border: "none",
                        borderRadius: "10px",
                      }}
                    >
                      {editProcessing
                        ? "AI обрабатывает..."
                        : "AI-редактирование — тест 1 фото"}
                    </button>

                    {editError && (
                      <p style={{ marginTop: "14px" }}>{editError}</p>
                    )}

                    {editResult && (
                      <div style={{ marginTop: "18px" }}>
                        <p>
                          <strong>AI-редактирование готово:</strong>
                        </p>

                        <img
                          src={editResult}
                          alt="AI результат"
                          style={{
                            maxWidth: "340px",
                            width: "100%",
                            border: "1px solid #ddd",
                            borderRadius: "10px",
                          }}
                        />

                        <p style={{ marginTop: "10px" }}>
                          <a
                            href={editResult}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Открыть готовое изображение
                          </a>
                        </p>
                      </div>
                    )}

                    <hr style={{ margin: "24px 0" }} />

                    <h4>Выделение объекта</h4>

                    <p>
                      Введите объект, который нужно найти на первом изображении.
                    </p>

                    <input
                      value={segmentPrompt}
                      onChange={(e) => setSegmentPrompt(e.target.value)}
                      placeholder="Например: jar или box"
                      style={{
                        width: "100%",
                        padding: "12px",
                        marginBottom: "12px",
                        border: "1px solid #ddd",
                        borderRadius: "10px",
                      }}
                    />

                    <button
                      onClick={segmentObject}
                      disabled={segmentProcessing}
                    >
                      {segmentProcessing
                        ? "Ищу объект..."
                        : "Выделить объект — тест"}
                    </button>

                    {segmentError && (
                      <p style={{ marginTop: "14px" }}>
                        {segmentError}
                      </p>
                    )}

                    {segmentResults.length > 0 && (
                      <div style={{ marginTop: "18px" }}>
                        <p>
                          <strong>Результат выделения:</strong>
                        </p>

                        {segmentResults.map((url, index) => (
                          <div key={index} style={{ marginBottom: "16px" }}>
                            <img
                              src={url}
                              alt={`Результат ${index + 1}`}
                              style={{
                                maxWidth: "340px",
                                width: "100%",
                                border: "1px solid #ddd",
                                borderRadius: "10px",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {processError && <p>{processError}</p>}

                {processedFiles.length > 0 && (
                  <div style={{ marginTop: "24px" }}>
                    <h3>Готовые файлы</h3>

                    {processedFiles.map((file) => (
                      <div key={file.url}>
                        <a href={file.url} download={file.name}>
                          Скачать {file.name}
                        </a>
                      </div>
                    ))}
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
