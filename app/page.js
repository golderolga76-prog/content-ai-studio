"use client";

import { useState } from "react";

export default function Home() {
  const [task, setTask] = useState("");
  const [result, setResult] = useState("");
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

  async function analyzeTask() {
    if (!task.trim()) {
      setError("Введите ТЗ или описание задачи.");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");
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

      // Пока тестируем только первое выбранное изображение
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
