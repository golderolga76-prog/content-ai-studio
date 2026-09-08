export default function Home() {
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
                style={{
                  padding: "12px 18px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Анализировать
              </button>
            </div>

            <div
              style={{
                marginTop: "24px",
                padding: "18px",
                background: "#f3f3f3",
                borderRadius: "12px",
              }}
            >
              <strong>Здесь будет результат:</strong>
              <p>план работы, стоимость, этапы и подтверждение каждого шага.</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
