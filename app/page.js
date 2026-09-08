"use client";

import { useCallback, useMemo, useRef, useState } from "react";

const STATUS_LABELS = {
  executable: "Выполнимо",
  partial: "Частично выполнимо",
  needs_clarification: "Нужно уточнение",
};

const STATUS_TONES = {
  AVAILABLE: { label: "Доступно", color: "#177245", bg: "#e8f5ee" },
  NOT_CONNECTED: { label: "Не подключено", color: "#a33b32", bg: "#fff0ee" },
  MANUAL_REVIEW: { label: "Ручная проверка", color: "#93651f", bg: "#fff7e6" },
  NEEDS_INPUT: { label: "Нужны данные", color: "#2867a8", bg: "#eef6ff" },
};

const EXEC_LABELS = {
  waiting: "Ожидание",
  running: "Выполняется",
  completed: "Готово",
  failed: "Ошибка",
  skipped: "Пропущено",
  waiting_confirmation: "Нужно подтверждение",
};

const EXEC_TONES = {
  waiting: { color: "#68727c", bg: "#f0f2f3" },
  running: { color: "#2867a8", bg: "#eef6ff" },
  completed: { color: "#177245", bg: "#e8f5ee" },
  failed: { color: "#a33b32", bg: "#fff0ee" },
  skipped: { color: "#68727c", bg: "#f0f2f3" },
  waiting_confirmation: { color: "#93651f", bg: "#fff7e6" },
};

const HANDLER_LABELS = {
  "sharp:resize": "Sharp / локально",
  "replicate:remove-background": "Replicate / удаление фона",
  "replicate:segment": "Replicate / выделение объекта",
  "replicate:flux-edit": "Replicate / FLUX edit",
  "compose:scene": "Композиция / не подключено",
};

const CONNECTED_HANDLERS = new Set([
  "sharp:resize",
  "replicate:remove-background",
  "replicate:segment",
  "replicate:flux-edit",
]);

function formatValue(value) {
  return value === null || value === undefined || value === "" ? "не указан" : String(value);
}

function fileBaseName(name = "image") {
  return name.replace(/\.[^/.]+$/, "") || "image";
}

async function blobToFile(blob, name, fallbackType = "image/png") {
  const type = blob.type || fallbackType;
  const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([blob], `${fileBaseName(name)}-processed.${extension}`, { type });
}

export default function Home() {
  const [task, setTask] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState([]);
  const [planConfirmed, setPlanConfirmed] = useState(false);
  const [stepStates, setStepStates] = useState({});
  const [stepResults, setStepResults] = useState({});
  const [executing, setExecuting] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [activeSection, setActiveSection] = useState("workspace");
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
    setAnalysisText("");
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
      if (!response.ok) throw new Error(data.error || "Ошибка анализа.");
      setAnalysisText(data.result || data.analysisText || "");
      if (data.plan) {
        setPlan(data.plan);
        const initial = {};
        for (const step of data.plan.steps || []) {
          if (!CONNECTED_HANDLERS.has(step.handler) || step.status === "NOT_CONNECTED") initial[step.id] = "skipped";
          else if (step.requiresConfirmation) initial[step.id] = "waiting_confirmation";
          else initial[step.id] = "waiting";
        }
        setStepStates(initial);
      }
      setActiveSection("plan");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleFiles(event) {
    const selected = Array.from(event.target.files || []);
    setFiles(selected);
    setPlanConfirmed(false);
    resetExecution();
    setActiveSection("files");
  }

  function updateStepState(id, state) {
    setStepStates((prev) => ({ ...prev, [id]: state }));
  }

  function confirmPlan() {
    if (!files.length || !plan) return;
    setPlanConfirmed(true);
    setGlobalError("");
    setActiveSection("execution");
  }

  function confirmPaidStep(id) {
    setStepStates((prev) => ({ ...prev, [id]: "confirmed" }));
  }

  async function runStep(step, inputFiles) {
    const p = step.params || {};
    if (step.handler === "sharp:resize") {
      const width = p.width || plan?.parameters?.width || 1000;
      const height = p.height || plan?.parameters?.height || 1000;
      const format = String(p.format || plan?.parameters?.format || "jpg").toLowerCase();
      const output = [];
      for (let i = 0; i < inputFiles.length; i += 1) {
        let file = inputFiles[i];
        if (format === "jpg" || format === "jpeg") {
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          context.fillStyle = "#FFFFFF";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const flattened = await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось подготовить JPG."))), "image/jpeg", 0.92));
          file = new File([flattened], `${fileBaseName(file.name)}.jpg`, { type: "image/jpeg" });
        }
        const formData = new FormData();
        formData.append("file", file);
        formData.append("width", String(width));
        formData.append("height", String(height));
        formData.append("format", format);
        const response = await fetch("/api/process-image", { method: "POST", body: formData });
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `Ошибка обработки ${file.name}`);
        const blob = await response.blob();
        output.push({ name: `${fileBaseName(file.name)}-processed.${format}`, url: URL.createObjectURL(blob), blob });
      }
      return { type: "files", items: output };
    }

    if (step.handler === "replicate:remove-background") {
      const output = [];
      for (let i = 0; i < inputFiles.length; i += 1) {
        const formData = new FormData();
        formData.append("file", inputFiles[i]);
        const response = await fetch("/api/remove-background", { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error || "Ошибка удаления фона.");
        output.push({ url: data.url, name: `${fileBaseName(inputFiles[i].name)}-no-background.png` });
      }
      return { type: "urls", urls: output.map((item) => item.url), names: output.map((item) => item.name) };
    }

    if (step.handler === "replicate:segment") {
      const prompt = p.objectPrompt || "";
      if (!prompt) throw new Error("Не указан объект для выделения в плане.");
      const formData = new FormData();
      formData.append("file", inputFiles[0]);
      formData.append("objectPrompt", prompt);
      const response = await fetch("/api/segment-object", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || !data.urls?.length) throw new Error(data.error || "Модель не вернула результат.");
      return { type: "urls", urls: data.urls };
    }

    if (step.handler === "replicate:flux-edit") {
      const prompt = p.prompt || step.description;
      const output = [];
      for (let i = 0; i < inputFiles.length; i += 1) {
        const formData = new FormData();
        formData.append("file", inputFiles[i]);
        formData.append("prompt", prompt);
        const response = await fetch("/api/edit-image", { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok || !data.imageUrl) throw new Error(data.error || "Ошибка AI-редактирования.");
        output.push({ url: data.imageUrl, name: `${fileBaseName(inputFiles[i].name)}-edited.jpg` });
      }
      return { type: "urls", urls: output.map((item) => item.url), names: output.map((item) => item.name) };
    }

    throw new Error(`Обработчик ${step.handler} не подключён.`);
  }

  async function materializeResult(result, currentFiles) {
    if (result.type === "files" && result.items?.length) return result.items.map((item) => item.blob).map((blob, i) => new File([blob], result.items[i].name, { type: blob.type }));
    if (result.type === "url" && result.url) {
      const response = await fetch(result.url);
      if (!response.ok) throw new Error("Не удалось получить результат предыдущего шага.");
      return [await blobToFile(await response.blob(), currentFiles[0]?.name)];
    }
    if (result.type === "urls" && result.urls?.length) {
      const next = [];
      for (let i = 0; i < result.urls.length; i += 1) {
        const response = await fetch(result.urls[i]);
        if (!response.ok) throw new Error("Не удалось получить результат предыдущего шага.");
        const blob = await response.blob();
        next.push(new File([blob], result.names?.[i] || `${fileBaseName(currentFiles[i]?.name || `image-${i + 1}`)}-processed.${blob.type.split("/")[1] || "png"}`, { type: blob.type }));
      }
      return next;
    }
    return currentFiles;
  }

  async function executePlan() {
    if (!plan || !files.length || !planConfirmed) return;
    setExecuting(true);
    setGlobalError("");
    let currentFiles = [...files];
    try {
      for (const step of plan.steps || []) {
        if (!CONNECTED_HANDLERS.has(step.handler) || step.status === "NOT_CONNECTED") {
          updateStepState(step.id, "skipped");
          continue;
        }
        if (step.requiresConfirmation && stepStates[step.id] !== "confirmed") {
          updateStepState(step.id, "waiting_confirmation");
          continue;
        }
        updateStepState(step.id, "running");
        try {
          const result = await runStep(step, currentFiles);
          setStepResult(step.id, result);
          currentFiles = await materializeResult(result, currentFiles);
          updateStepState(step.id, "completed");
        } catch (err) {
          setStepResult(step.id, { type: "error", message: err.message });
          updateStepState(step.id, "failed");
          setGlobalError(err.message);
          break;
        }
      }
    } finally {
      setExecuting(false);
      setActiveSection("results");
    }
  }

  const connectedSteps = (plan?.steps || []).filter((step) => CONNECTED_HANDLERS.has(step.handler));
  const completedCount = connectedSteps.filter((step) => stepStates[step.id] === "completed").length;
  const pendingPaid = connectedSteps.some((step) => stepStates[step.id] === "waiting_confirmation");
  const allComplete = connectedSteps.length > 0 && connectedSteps.every((step) => ["completed", "skipped"].includes(stepStates[step.id]));
  const resultFiles = useMemo(() => Object.values(stepResults).flatMap((result) => result?.items || []), [stepResults]);
  const visibleSection = activeSection === "workspace" ? "workspace" : activeSection;

  return (
    <main style={styles.app}>
      <header style={styles.topbar}>
        <div style={styles.brand}><div style={styles.brandMark}>C</div><div><strong>Content AI Studio</strong><span>операционный workspace</span></div></div>
        <div style={styles.headerMeta}><span style={styles.liveDot} /> рабочая сессия <span style={styles.headerDivider} /> {files.length ? `${files.length} файла` : "файлы не выбраны"}</div>
      </header>
      <div style={styles.shell}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarLabel}>Рабочий процесс</div>
          <NavButton active={visibleSection === "workspace"} onClick={() => setActiveSection("workspace")} number="01" label="ТЗ и анализ" />
          <NavButton active={visibleSection === "plan"} onClick={() => setActiveSection("plan")} number="02" label="План выполнения" disabled={!plan} />
          <NavButton active={visibleSection === "files"} onClick={() => setActiveSection("files")} number="03" label="Исходные файлы" disabled={!plan} />
          <NavButton active={visibleSection === "execution"} onClick={() => setActiveSection("execution")} number="04" label="Исполнение" disabled={!planConfirmed} />
          <NavButton active={visibleSection === "results"} onClick={() => setActiveSection("results")} number="05" label="Результат" disabled={!Object.keys(stepResults).length} />
          <div style={styles.sidebarBottom}><div style={styles.sidebarLabel}>Подключённые handlers</div><span>● Sharp / локально</span><span>● Replicate / изображения</span><span style={{ color: "#9aa2a8" }}>○ Композиция / ожидает</span></div>
        </aside>

        <section style={styles.content}>
          <div style={styles.contentHeader}><div><div style={styles.eyebrow}>CONTENT OPERATIONS / IMAGE</div><h1 style={styles.title}>Соберите задачу<br /><em>в управляемый результат.</em></h1></div><div style={styles.headerStatus}>{plan ? <><span style={styles.statusPill}>ПЛАН СОЗДАН</span><small>{completedCount}/{connectedSteps.length || 0} этапов</small></> : <><span style={styles.statusPillMuted}>ГОТОВ К ЗАДАЧЕ</span><small>анализатор ожидает ТЗ</small></>}</div></div>

          {visibleSection === "workspace" && <section style={styles.heroGrid}>
            <div style={styles.inputPanel}><label style={styles.fieldLabel}>Техническое задание</label><textarea value={task} onChange={(event) => setTask(event.target.value)} placeholder="Например: слегка наклонить баночку вправо, сохранить надписи, сделать белый фон и итог 1000×1000 JPG" style={styles.textarea} /><div style={styles.inputFooter}><span>{task.length ? `${task.length} символов` : "Поддерживается русский язык"}</span><button onClick={analyzeTask} disabled={loading} style={styles.primaryButton}>{loading ? "Анализируем..." : "Запустить анализ  →"}</button></div></div>
            <div style={styles.guidePanel}><div style={styles.panelKicker}>КАК ЭТО РАБОТАЕТ</div><div style={styles.guideLine}><b>01</b><span>AI разбирает цель, параметры и порядок операций</span></div><div style={styles.guideLine}><b>02</b><span>Вы подтверждаете план и платные этапы</span></div><div style={styles.guideLine}><b>03</b><span>Результаты последовательно переходят между handlers</span></div></div>
          </section>}

          {error && <div style={styles.errorBox}>{error}</div>}
          {analysisText && <section style={styles.analysisCard}><div style={styles.cardHeader}><div><div style={styles.panelKicker}>AI ANALYSIS</div><h2 style={styles.sectionTitle}>Разбор задания</h2></div><button onClick={() => setActiveSection("plan")} style={styles.textButton}>Перейти к плану →</button></div><div style={styles.analysisText}>{analysisText}</div></section>}

          {plan && <section style={{ ...styles.planCard, display: visibleSection === "plan" || visibleSection === "workspace" ? "block" : "none" }}><div style={styles.cardHeader}><div><div style={styles.panelKicker}>STRUCTURED PLAN</div><h2 style={styles.sectionTitle}>План выполнения</h2></div><span style={{ ...styles.planStatus, background: plan.status === "executable" ? "#e8f5ee" : "#fff7e6", color: plan.status === "executable" ? "#177245" : "#93651f" }}>{STATUS_LABELS[plan.status] || plan.status}</span></div><div style={styles.paramsGrid}><Info label="Тип задачи" value={plan.taskType} /><Info label="Назначение" value={plan.purpose} /><Info label="Размер" value={plan.parameters?.width && plan.parameters?.height ? `${plan.parameters.width} × ${plan.parameters.height}` : formatValue(plan.parameters?.aspectRatio)} /><Info label="Формат" value={formatValue(plan.parameters?.format)} /><Info label="Фон" value={formatValue(plan.parameters?.background)} /><Info label="Позиция" value={formatValue(plan.parameters?.position)} /></div><div style={styles.stepsHeader}><span>Этапы</span><span>{plan.steps?.length || 0} операции</span></div><div style={styles.stepsList}>{(plan.steps || []).map((step, index) => <StepCard key={step.id || index} step={step} index={index} execState={stepStates[step.id] || "waiting"} execResult={stepResults[step.id]} onConfirmPaid={() => confirmPaidStep(step.id)} executing={executing} />)}</div></section>}

          {plan && <section style={{ ...styles.filesCard, display: visibleSection === "files" || visibleSection === "workspace" ? "block" : "none" }}><div style={styles.cardHeader}><div><div style={styles.panelKicker}>INPUT ASSETS</div><h2 style={styles.sectionTitle}>Исходные файлы</h2></div><span style={styles.fileCount}>{files.length || 0} выбрано</span></div><div style={styles.uploadRow}><input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} style={styles.fileInput} /><button onClick={() => fileInputRef.current?.click()} style={styles.secondaryButton}>Выбрать изображения</button><span>PNG, JPG, WEBP · можно выбрать несколько</span></div>{files.length > 0 && <div style={styles.fileList}>{files.map((file) => <div style={styles.fileRow} key={`${file.name}-${file.size}`}><span style={styles.fileThumb}>IMG</span><span style={{ flex: 1 }}><b>{file.name}</b><small>{Math.round(file.size / 1024)} KB</small></span><span style={styles.readyTag}>готов</span></div>)}</div>}<div style={styles.confirmRow}><span><b>Перед запуском:</b> проверьте порядок и подтвердите план</span><button onClick={confirmPlan} disabled={!files.length || planConfirmed} style={planConfirmed ? styles.confirmedButton : styles.primaryButton}>{planConfirmed ? "План подтверждён" : "Подтвердить план"}</button></div></section>}

          {plan && <section style={{ ...styles.executionCard, display: visibleSection === "execution" || visibleSection === "results" ? "block" : "none" }}><div style={styles.cardHeader}><div><div style={styles.panelKicker}>EXECUTION CONTROL</div><h2 style={styles.sectionTitle}>Исполнение и результат</h2></div><div style={styles.progressWrap}><b>{completedCount}/{connectedSteps.length || 0}</b><div style={styles.progressTrack}><div style={{ ...styles.progressBar, width: `${connectedSteps.length ? (completedCount / connectedSteps.length) * 100 : 0}%` }} /></div></div></div><div style={styles.executionBanner}><div><b>{pendingPaid ? "Есть платные этапы" : executing ? "Выполнение цепочки" : allComplete ? "Цепочка завершена" : "Готово к запуску"}</b><span>{pendingPaid ? "Каждый платный handler запускается только после подтверждения." : "Результат каждого шага становится входом для следующего."}</span></div><button onClick={executePlan} disabled={executing || !planConfirmed} style={styles.primaryButton}>{executing ? "Выполняем..." : pendingPaid ? "Запустить доступные этапы" : "Запустить выполнение  →"}</button></div>{globalError && <div style={styles.errorBox}>{globalError}</div>}{Object.keys(stepResults).length > 0 && <ResultGallery results={stepResults} />}</section>}
        </section>
      </div>
    </main>
  );
}

function NavButton({ active, onClick, number, label, disabled }) { return <button onClick={onClick} disabled={disabled} style={{ ...styles.navButton, ...(active ? styles.navActive : {}), ...(disabled ? styles.navDisabled : {}) }}><span>{number}</span>{label}</button>; }
function Info({ label, value }) { return <div><span style={styles.infoLabel}>{label}</span><b style={styles.infoValue}>{formatValue(value)}</b></div>; }
function StepCard({ step, index, execState, execResult, onConfirmPaid, executing }) { const tone = EXEC_TONES[execState] || STATUS_TONES[step.status] || EXEC_TONES.waiting; const unavailable = !CONNECTED_HANDLERS.has(step.handler) || step.status === "NOT_CONNECTED"; return <article style={{ ...styles.step, borderColor: tone.color + "55" }}><div style={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</div><div style={{ flex: 1 }}><div style={styles.stepTop}><b>{step.operation}</b><span style={{ ...styles.stepPill, color: tone.color, background: tone.bg }}>{EXEC_LABELS[execState] || STATUS_TONES[step.status]?.label || step.status}</span></div><p style={styles.stepDescription}>{step.description}</p><small style={styles.handler}>{HANDLER_LABELS[step.handler] || step.handler} · {step.cost === "paid" ? "платно" : "бесплатно"}</small>{step.params?.prompt && <div style={styles.promptBox}>{step.params.prompt}</div>}{execState === "waiting_confirmation" && <button onClick={onConfirmPaid} disabled={executing} style={styles.confirmPaid}>Подтвердить платный этап</button>}{execState === "failed" && <div style={styles.stepError}>{execResult?.message || "Этап завершился с ошибкой."}</div>}{unavailable && <div style={styles.stepNotice}>Операция распознана, но handler ещё не подключён.</div>}</div></article>; }
function ResultGallery({ results }) { const items = Object.entries(results).flatMap(([stepId, result]) => result?.items?.map((item) => ({ ...item, stepId })) || []); return <div style={styles.resultArea}><div style={styles.stepsHeader}><span>Готовый результат</span><span>{items.length ? `${items.length} файла` : "ссылки шагов"}</span></div>{items.length ? <div style={styles.resultGrid}>{items.map((item) => <div style={styles.resultItem} key={`${item.stepId}-${item.name}`}><img src={item.url} alt={item.name} style={styles.resultImage} /><div style={styles.resultMeta}><b>{item.name}</b><a href={item.url} download={item.name} style={styles.downloadLink}>Скачать</a></div></div>)}</div> : <div style={styles.resultLinks}>{Object.entries(results).map(([id, result]) => result?.urls?.map((url, index) => <a key={`${id}-${index}`} href={url} target="_blank" rel="noreferrer" style={styles.resultLink}>Открыть результат {index + 1}</a>))}</div>}</div>; }

const styles = {
  app: { minHeight: "100vh", background: "#eef1f2", color: "#1d252b", fontFamily: "Arial, sans-serif" },
  topbar: { height: 68, boxSizing: "border-box", padding: "0 34px", background: "#172127", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { display: "flex", alignItems: "center", gap: 12 }, brandMark: { width: 30, height: 30, background: "#c9483d", display: "grid", placeItems: "center", fontWeight: 800 },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandMark: { width: 30, height: 30, background: "#c9483d", display: "grid", placeItems: "center", fontWeight: 800 },
  topbarStrong: {}, headerMeta: { fontSize: 12, color: "#a9b3b8", display: "flex", alignItems: "center", gap: 9 }, liveDot: { width: 7, height: 7, borderRadius: "50%", background: "#6cd19a" }, headerDivider: { height: 16, borderLeft: "1px solid #425057" },
  shell: { display: "grid", gridTemplateColumns: "224px minmax(0, 1fr)", maxWidth: 1440, margin: "0 auto", minHeight: "calc(100vh - 68px)" }, sidebar: { background: "#e5e9ea", padding: "36px 18px 24px", display: "flex", flexDirection: "column", gap: 6 }, sidebarLabel: { textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 10, fontWeight: 800, color: "#7d898f", padding: "0 12px 10px" }, navButton: { border: 0, background: "transparent", color: "#526068", textAlign: "left", display: "flex", gap: 12, alignItems: "center", padding: "12px", fontSize: 13, cursor: "pointer" }, navActive: { background: "#fff", color: "#1d252b", fontWeight: 700, boxShadow: "0 1px 0 rgba(0,0,0,.04)" }, navDisabled: { opacity: 0.45, cursor: "not-allowed" }, sidebarBottom: { marginTop: "auto", display: "flex", flexDirection: "column", gap: 9, fontSize: 11, color: "#68747b", padding: "20px 12px 0", borderTop: "1px solid #cbd2d4" },
  content: { padding: "54px 64px 80px", maxWidth: 1040, width: "100%", boxSizing: "border-box" }, contentHeader: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", marginBottom: 40 }, eyebrow: { color: "#c9483d", fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", marginBottom: 14 }, title: { fontSize: "clamp(32px, 5vw, 58px)", lineHeight: 1.02, letterSpacing: "-0.055em", margin: 0, fontWeight: 700 }, titleEm: { fontStyle: "normal", color: "#69757b" }, headerStatus: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, paddingTop: 6 }, statusPill: { color: "#177245", background: "#dff3e7", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", padding: "7px 10px" }, statusPillMuted: { color: "#68727c", background: "#e2e6e8", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", padding: "7px 10px" },
  heroGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(240px, .8fr)", gap: 16, marginBottom: 18 }, inputPanel: { background: "#fff", padding: 22, border: "1px solid #d6dcde" }, fieldLabel: { display: "block", fontWeight: 700, fontSize: 13, marginBottom: 12 }, textarea: { width: "100%", boxSizing: "border-box", minHeight: 154, resize: "vertical", border: "0", outline: "none", background: "#f5f7f7", padding: 16, color: "#1d252b", font: "inherit", lineHeight: 1.55 }, inputFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingTop: 16, fontSize: 11, color: "#7b878d" }, guidePanel: { background: "#172127", color: "#fff", padding: 22, display: "flex", flexDirection: "column", gap: 22 }, panelKicker: { fontSize: 10, fontWeight: 800, letterSpacing: "0.15em", color: "#9ba6ab" }, guideLine: { display: "flex", gap: 14, alignItems: "flex-start", fontSize: 13, lineHeight: 1.45 }, guideLineB: {},
  primaryButton: { border: 0, background: "#c9483d", color: "#fff", padding: "12px 16px", fontWeight: 800, fontSize: 12, cursor: "pointer" }, secondaryButton: { border: "1px solid #aeb8bc", background: "#fff", color: "#29353b", padding: "11px 14px", fontWeight: 700, cursor: "pointer" }, confirmedButton: { border: "1px solid #b7d9c4", background: "#e8f5ee", color: "#177245", padding: "12px 16px", fontWeight: 800, fontSize: 12 }, textButton: { border: 0, background: "transparent", color: "#c9483d", fontWeight: 700, cursor: "pointer" }, errorBox: { padding: 14, marginBottom: 16, color: "#a33b32", background: "#fff0ee", border: "1px solid #f0c5c0", fontSize: 13 },
  analysisCard: { background: "#fff", border: "1px solid #d6dcde", padding: 22, marginBottom: 18 }, planCard: { background: "#fff", border: "1px solid #d6dcde", padding: 22, marginBottom: 18 }, filesCard: { background: "#fff", border: "1px solid #d6dcde", padding: 22, marginBottom: 18 }, executionCard: { background: "#fff", border: "1px solid #d6dcde", padding: 22, marginBottom: 18 }, cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 22 }, sectionTitle: { margin: "7px 0 0", fontSize: 21, letterSpacing: "-0.03em" }, analysisText: { whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 14, color: "#46535a", background: "#f5f7f7", padding: 18 }, planStatus: { padding: "7px 10px", fontSize: 11, fontWeight: 800 }, paramsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "18px 20px", paddingBottom: 24, borderBottom: "1px solid #e3e7e8" }, infoLabel: { display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#8a969b", marginBottom: 6 }, infoValue: { display: "block", fontSize: 13, lineHeight: 1.4 }, stepsHeader: { display: "flex", justifyContent: "space-between", color: "#59666d", fontSize: 12, fontWeight: 800, padding: "18px 0 12px" }, stepsList: { display: "grid", gap: 8 }, step: { display: "flex", gap: 14, padding: 16, border: "1px solid", background: "#fbfcfc" }, stepIndex: { color: "#c9483d", fontWeight: 800, fontSize: 12, paddingTop: 2 }, stepTop: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", fontSize: 14 }, stepPill: { padding: "5px 8px", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }, stepDescription: { margin: "8px 0", color: "#56636a", fontSize: 13, lineHeight: 1.5 }, handler: { color: "#849096", fontSize: 11 }, promptBox: { marginTop: 10, padding: "9px 11px", background: "#f0f2f3", color: "#56636a", fontSize: 12, lineHeight: 1.45 }, confirmPaid: { marginTop: 12, border: 0, background: "#c9483d", color: "#fff", padding: "9px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }, stepError: { marginTop: 10, color: "#a33b32", fontSize: 12 }, stepNotice: { marginTop: 10, color: "#93651f", fontSize: 12 },
  uploadRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: 16, background: "#f5f7f7", color: "#7b878d", fontSize: 11 }, fileInput: { display: "none" }, fileCount: { color: "#68727c", fontSize: 12 }, fileList: { display: "grid", gap: 6, marginTop: 12 }, fileRow: { display: "flex", alignItems: "center", gap: 12, padding: 10, border: "1px solid #e3e7e8", fontSize: 12 }, fileThumb: { width: 34, height: 34, display: "grid", placeItems: "center", background: "#e8ecee", color: "#7d898f", fontSize: 9, fontWeight: 800 }, fileRowSmall: {}, readyTag: { color: "#177245", fontSize: 10, fontWeight: 800 }, confirmRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingTop: 18, marginTop: 12, borderTop: "1px solid #e3e7e8", fontSize: 12, color: "#68727c" },
  progressWrap: { display: "flex", alignItems: "center", gap: 10, color: "#68727c", fontSize: 12 }, progressTrack: { width: 90, height: 5, background: "#e2e6e8" }, progressBar: { height: "100%", background: "#c9483d" }, executionBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: 18, background: "#172127", color: "#fff" }, executionBannerSpan: {}, resultArea: { marginTop: 20, borderTop: "1px solid #e3e7e8" }, resultGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }, resultItem: { border: "1px solid #e3e7e8", background: "#f5f7f7" }, resultImage: { width: "100%", aspectRatio: "1", objectFit: "contain", display: "block", background: "#fff" }, resultMeta: { display: "flex", justifyContent: "space-between", gap: 8, padding: 10, fontSize: 11 }, downloadLink: { color: "#c9483d", fontWeight: 800, textDecoration: "none" }, resultLinks: { display: "flex", flexDirection: "column", gap: 8 }, resultLink: { color: "#c9483d", fontSize: 13 },
};

styles.guideLine["& b"] = { color: "#c9483d" };
styles.executionBanner["& span"] = { display: "block", color: "#a9b3b8", fontSize: 12, marginTop: 6 };
styles.brand["& span"] = { display: "block", color: "#a9b3b8", fontSize: 10, marginTop: 3 };
styles.brand["& strong"] = { display: "block", fontSize: 13 };
styles.fileRow["& small"] = { display: "block", color: "#849096", marginTop: 3 };
styles.sidebarBottom["& span"] = { display: "block" };
styles.guideLine["& b"] = { color: "#c9483d", minWidth: 22 };
styles.executionBanner["& span"] = { display: "block", color: "#a9b3b8", fontSize: 12, marginTop: 6 };
styles.brand["& span"] = { display: "block", color: "#a9b3b8", fontSize: 10, marginTop: 3 };
styles.brand["& strong"] = { display: "block", fontSize: 13 };
styles.fileRow["& small"] = { display: "block", color: "#849096", marginTop: 3 };
styles.sidebarBottom["& span"] = { display: "block" };
