"use client";

import { useEffect, useRef, useState } from "react";

// Runs on the user's device only. No OpenAI, Replicate or server API calls.
// ISNet by Ko033: Apache-2.0; ONNX Runtime Web: MIT.
const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const MODEL_URL = "https://huggingface.co/Ko033/isnet-general-use-onnx/resolve/main/onnx/model_quantized.onnx";
const SIDE = 1024;
let ortPromise;
let modelPromise;

function getOrt() {
  if (window.ort) return Promise.resolve(window.ort);
  if (!ortPromise) {
    ortPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = ORT_BASE + "ort.min.js";
      script.async = true;
      script.onload = () => window.ort ? resolve(window.ort) : reject(new Error("ONNX Runtime не загрузился."));
      script.onerror = () => reject(new Error("Библиотека недоступна. Проверьте подключение к интернету."));
      document.head.appendChild(script);
    }).catch((error) => { ortPromise = null; throw error; });
  }
  return ortPromise;
}

async function loadModel(report) {
  const ort = await getOrt();
  ort.env.wasm.wasmPaths = ORT_BASE;
  ort.env.wasm.numThreads = 1;
  if (!modelPromise) {
    report("Загружается модель. Первый запуск может занять несколько минут…");
    modelPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "basic",
    }).catch((error) => { modelPromise = null; throw error; });
  }
  return { ort, session: await modelPromise };
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Не удалось создать PNG.")),
    "image/png"
  ));
}

async function removeBackground(file, report) {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 20000000) {
      throw new Error("Фотография слишком большая (максимум 20 Мп).");
    }

    report("Подготовка изображения…");
    const resized = document.createElement("canvas");
    resized.width = resized.height = SIDE;
    const prep = resized.getContext("2d", { willReadFrequently: true });
    if (!prep) throw new Error("Canvas 2D не поддерживается.");
    prep.drawImage(bitmap, 0, 0, SIDE, SIDE);
    const rgba = prep.getImageData(0, 0, SIDE, SIDE).data;
    const pixels = SIDE * SIDE;
    const channels = new Float32Array(pixels * 3);
    for (let i = 0; i < pixels; i++) {
      channels[i] = rgba[i * 4] / 255 - 0.5;
      channels[i + pixels] = rgba[i * 4 + 1] / 255 - 0.5;
      channels[i + pixels * 2] = rgba[i * 4 + 2] / 255 - 0.5;
    }

    const { ort, session } = await loadModel(report);
    report("Модель выделяет предмет. Пожалуйста, подождите…");
    const output = await session.run({
      [session.inputNames[0]]: new ort.Tensor("float32", channels, [1, 3, SIDE, SIDE]),
    });
    const prediction = output.output_image || output[session.outputNames[0]];
    const values = prediction?.data;
    if (!values || values.length !== pixels) {
      throw new Error("Неверный формат результата модели.");
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pixels; i++) {
      min = Math.min(min, values[i]);
      max = Math.max(max, values[i]);
    }
    if (max - min < 0.001) throw new Error("Не удалось выделить предмет.");

    report("Формирование прозрачного фона…");
    const matteCanvas = document.createElement("canvas");
    matteCanvas.width = matteCanvas.height = SIDE;
    const matteCtx = matteCanvas.getContext("2d", { willReadFrequently: true });
    const matte = matteCtx.createImageData(SIDE, SIDE);
    for (let i = 0; i < pixels; i++) {
      const intensity = Math.round(Math.max(0, Math.min(1, (values[i] - min) / (max - min))) * 255);
      const offset = i * 4;
      matte.data[offset] = matte.data[offset + 1] = matte.data[offset + 2] = intensity;
      matte.data[offset + 3] = 255;
    }
    matteCtx.putImageData(matte, 0, 0);

    const scaledMask = document.createElement("canvas");
    scaledMask.width = bitmap.width;
    scaledMask.height = bitmap.height;
    const maskCtx = scaledMask.getContext("2d", { willReadFrequently: true });
    maskCtx.imageSmoothingEnabled = true;
    maskCtx.imageSmoothingQuality = "high";
    maskCtx.drawImage(matteCanvas, 0, 0, bitmap.width, bitmap.height);
    const alphaMask = maskCtx.getImageData(0, 0, bitmap.width, bitmap.height).data;

    const resultCanvas = document.createElement("canvas");
    resultCanvas.width = bitmap.width;
    resultCanvas.height = bitmap.height;
    const resultCtx = resultCanvas.getContext("2d", { willReadFrequently: true });
    resultCtx.drawImage(bitmap, 0, 0);
    const image = resultCtx.getImageData(0, 0, bitmap.width, bitmap.height);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i + 3] = Math.round(image.data[i + 3] * alphaMask[i] / 255);
    }
    resultCtx.putImageData(image, 0, 0);
    return resultCanvas;
  } finally {
    bitmap.close();
  }
}

const buttonStyle = {
  padding: "12px 18px", border: "none", borderRadius: 10,
  background: "#2563eb", color: "white", fontWeight: 600, cursor: "pointer"
};

export default function FreeBackgroundPage() {
  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [message, setMessage] = useState("Выберите фотографию для обработки.");
  const [busy, setBusy] = useState(false);
  const [white, setWhite] = useState(true);
  const outputCanvas = useRef(null);

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);
  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  function selectFile(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(chosen.type)) {
      setMessage("Поддерживаются только JPG, PNG и WebP.");
      return;
    }
    if (chosen.size > 20 * 1024 * 1024) {
      setMessage("Размер файла не должен превышать 20 МБ.");
      return;
    }
    setFile(chosen);
    setSourceUrl(URL.createObjectURL(chosen));
    setResultUrl("");
    outputCanvas.current = null;
    setMessage("Фото загружено. Теперь нажмите «Удалить фон бесплатно».");
  }

  async function processFile() {
    if (!file || busy) return;
    setBusy(true);
    setResultUrl("");
    try {
      const canvas = await removeBackground(file, setMessage);
      outputCanvas.current = canvas;
      const blob = await canvasToBlob(canvas);
      setResultUrl(URL.createObjectURL(blob));
      setMessage("Готово! Проверьте края, ремень и фурнитуру перед отправкой клиенту.");
    } catch (error) {
      setMessage("Ошибка обработки: " + (error?.message || "Неизвестная ошибка"));
    } finally {
      setBusy(false);
    }
  }

  async function downloadResult() {
    if (!outputCanvas.current || busy) return;
    const original = outputCanvas.current;
    const output = document.createElement("canvas");
    output.width = original.width;
    output.height = original.height;
    const ctx = output.getContext("2d");
    if (white) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, output.width, output.height);
    }
    ctx.drawImage(original, 0, 0);
    const blob = await canvasToBlob(output);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = (file?.name?.replace(/\.[^.]+$/, "") || "photo") + "-no-background.png";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const frameStyle = {
    minHeight: 260, padding: 8, border: "1px solid #ddd", borderRadius: 12,
    backgroundColor: "#fafafa", display: "flex", alignItems: "center",
    justifyContent: "center", overflow: "hidden"
  };
  return (
    <main style={{ maxWidth: 1060, margin: "30px auto", padding: "0 18px", fontFamily: "Arial,sans-serif", color: "#171717" }}>
      <a href="/" style={{ color: "#2563eb" }}>← Content AI Studio</a>
      <h1>Удалить фон бесплатно</h1>
      <p style={{ lineHeight: 1.6, color: "#555" }}>
        Фото обрабатывается в вашем браузере, без OpenAI и Replicate. При первом запуске
        скачивается модель с Hugging Face. На некоторых устройствах обработка может быть медленной.
      </p>
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20 }}>
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={selectFile} />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 18 }}>
          <button disabled={!file || busy} onClick={processFile}
            style={{ ...buttonStyle, opacity: !file || busy ? 0.5 : 1 }}>
            {busy ? "Удаляется фон…" : "Удалить фон бесплатно"}
          </button>
          <label style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <input type="checkbox" checked={white} onChange={(e) => setWhite(e.target.checked)} />
            Белый фон при сохранении (иначе прозрачный)
          </label>
          <button disabled={!resultUrl || busy} onClick={downloadResult}
            style={{ ...buttonStyle, background: "#15803d", opacity: !resultUrl || busy ? 0.5 : 1 }}>
            Скачать PNG
          </button>
        </div>
        <p role="status" aria-live="polite" style={{ color: message.startsWith("Ошибка") ? "#b91c1c" : "#555" }}>{message}</p>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20, marginTop: 22 }}>
        <div>
          <h3>Оригинал</h3>
          <div style={frameStyle}>
            {sourceUrl ? <img src={sourceUrl} alt="Исходная фотография" style={{ maxWidth: "100%", maxHeight: 500, objectFit: "contain" }} /> : "Фото не загружено"}
          </div>
        </div>
        <div>
          <h3>Результат</h3>
          <div style={{ ...frameStyle, backgroundImage: "linear-gradient(45deg,#e7e7e7 25%,transparent 25%),linear-gradient(-45deg,#e7e7e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e7e7e7 75%),linear-gradient(-45deg,transparent 75%,#e7e7e7 75%)", backgroundSize: "20px 20px", backgroundPosition: "0 0,0 10px,10px -10px,-10px 0" }}>
            {resultUrl ? <img src={resultUrl} alt="Результат без фона" style={{ maxWidth: "100%", maxHeight: 500, objectFit: "contain" }} /> : "Результат появится здесь"}
          </div>
        </div>
      </section>
      <p style={{ fontSize: 13, color: "#666", marginTop: 20 }}>
        Внимание: модель может удалить часть ремня или оставить подставку. Она не восстанавливает закрытые детали.
        Проверяйте результат перед коммерческим использованием. ISNet: Apache-2.0; ONNX Runtime: MIT.
      </p>
    </main>
  );
}
