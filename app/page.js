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

            <div style={{ marginTop: "16px" }}>
              <button
                onClick={analyzeTask}
                disabled={loading}
                style={{
                  padding: "12px 18px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Анализирую..." : "Анализировать"}
              </button>
            </div>

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
              {error && <p style={{ margin: 0 }}>{error}</p>}

              {!error && !result && (
                <>
                  <strong>Здесь будет результат:</strong>
                  <p>
                    план работы, стоимость, этапы и подтверждение каждого шага.
                  </p>
                </>
              )}

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
                <h3 style={{ marginTop: 0 }}>Загрузить файлы</h3>

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
                  disabled={files.length === 0}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "10px",
                    border: "none",
                    background: files.length === 0 ? "#aaa" : "#111",
                    color: "#fff",
                    cursor: files.length === 0 ? "default" : "pointer",
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

                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginTop: "16px",
                      }}
                    >
                      <label>
                        Ширина
                        <br />
                        <input
                          type="number"
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                          style={{ width: "90px", padding: "8px" }}
                        />
                      </label>

                      <label>
                        Высота
                        <br />
                        <input
                          type="number"
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          style={{ width: "90px", padding: "8px" }}
                        />
                      </label>

                      <label>
                        Формат
                        <br />
                        <select
                          value={format}
                          onChange={(e) => setFormat(e.target.value)}
                          style={{ padding: "8px" }}
                        >
                          <option value="jpg">JPG</option>
                          <option value="png">PNG</option>
                          <option value="webp">WebP</option>
                        </select>
                      </label>
                    </div>

                    <button
                      onClick={processImages}
                      disabled={processing}
                      style={{
                        marginTop: "18px",
                        padding: "12px 18px",
                        borderRadius: "10px",
                        border: "none",
                        background: "#111",
                        color: "#fff",
                        cursor: processing ? "default" : "pointer",
                        opacity: processing ? 0.6 : 1,
                      }}
                    >
                      {processing
                        ? "Обрабатываю..."
                        : "Запустить обработку"}
                    </button>
                  </div>
                )}

                {processError && (
                  <p style={{ marginTop: "16px" }}>{processError}</p>
                )}

                {processedFiles.length > 0 && (
                  <div style={{ marginTop: "24px" }}>
                    <h3>Готовые файлы</h3>

                    <div style={{ display: "grid", gap: "10px" }}>
                      {processedFiles.map((file) => (
                        <a
                          key={file.url}
                          href={file.url}
                          download={file.name}
                        >
                          Скачать {file.name}
                        </a>
                      ))}
                    </div>
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
