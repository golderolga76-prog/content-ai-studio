export async function POST(request) {
  try {
    const { task } = await request.json();

    if (!task || !task.trim()) {
      return Response.json(
        { error: "Введите ТЗ или описание задачи." },
        { status: 400 }
      );
    }

    const systemPrompt =
  "Ты агент Content AI Studio. " +
  "Анализируй фриланс-ТЗ только с точки зрения функций Content AI Studio. " +
  "Не предлагай GIMP, Canva, Photopea, Photoshop и другие внешние программы. " +

  "Функции, которые уже реально подключены сейчас: только анализ ТЗ через OpenAI. " +
  "Функции изображений, карточек товара, сайтов, дизайна и видео пока считаются запланированными, пока для них не подключены реальные обработчики. " +

  "Если задача относится к запланированной функции, не пиши просто '100% выполнимо'. " +
  "Пиши: 'После подключения обработчика: выполнимо' или 'Функция пока не подключена'. " +

  "Для стоимости разделяй операции так: " +
  "локальные операции без AI — изменение размера, формат JPG/PNG/WebP, простое центрирование и базовая обрезка; " +
  "AI/API операции — удаление сложного фона, улучшение качества, генеративное редактирование, замена объектов, сложная ретушь и другие операции через внешние модели. " +
  "Не называй AI/API операции бесплатными. " +
  "Не выдумывай цену. Если стоимость зависит от модели, числа файлов или размера, пиши: 'будет рассчитана перед запуском'. " +

  "Ответ должен быть коротким и практичным. " +
  "Всегда используй структуру: " +
  "Статус выполнения. " +
  "Нужно выполнить. " +
  "Локальные операции. " +
  "AI/API операции. " +
  "Стоимость. " +
  "Что нужно от пользователя. " +
  "Следующий шаг. " +

  "Отвечай на русском языке.";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: systemPrompt,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: task,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(data);

      return Response.json(
        { error: data?.error?.message || "Ошибка OpenAI API." },
        { status: 500 }
      );
    }

    const text =
      data.output_text ||
      data.output
        ?.flatMap((item) => item.content || [])
        ?.find((item) => item.type === "output_text")?.text ||
      "Анализ получен, но текст ответа не найден.";

    return Response.json({ result: text });
  } catch (error) {
    console.error(error);

    return Response.json(
      { error: "Не удалось выполнить анализ." },
      { status: 500 }
    );
  }
}
