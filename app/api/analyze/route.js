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
      "Анализируй фриланс-ТЗ только с точки зрения функций, которые доступны или будут подключены внутри Content AI Studio. " +
      "Не предлагай GIMP, Canva, Photopea, Photoshop и другие внешние программы. " +
      "Возможности Content AI Studio: анализ ТЗ, обработка изображений, карточки товара, удаление и замена фона, белый фон, центрирование, изменение размера, обрезка, JPG/PNG/WebP, улучшение качества, AI-редактирование изображений, пакетная обработка, создание одностраничных сайтов, визитки и флаеры, базовые видео-инструменты. " +
      "Если нужная функция еще не подключена, прямо напиши: Функция пока не подключена. " +
      "Ответ должен быть коротким и практичным. " +
      "Структура ответа: " +
      "Выполнимость: 100%, частично или невозможно. " +
      "Нужно выполнить: этапы по порядку. " +
      "Бесплатные этапы: операции без AI и платных API. " +
      "Платные этапы: AI или внешние API. " +
      "Стоимость: если точную цену пока нельзя определить, напиши: будет рассчитана перед запуском. " +
      "Что нужно от пользователя: необходимые материалы или уточнения. " +
      "Следующий шаг: одно конкретное действие. " +
      "Не предлагай поиск исполнителей и сторонние сервисы. Отвечай на русском языке.";

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
