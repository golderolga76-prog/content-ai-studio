export async function POST(request) {
  try {
    const { task } = await request.json();

    if (!task || !task.trim()) {
      return Response.json(
        { error: "Введите ТЗ или описание задачи." },
        { status: 400 }
      );
    }

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
                text:
                  "Ты агент Content AI Studio. Анализируй фриланс-ТЗ. " +
                  "Определи: 1) можно ли выполнить задачу полностью, частично или нельзя; " +
                  "2) какие операции нужны; 3) что потребуется от пользователя; " +
                  "4) какие шаги должны подтверждаться перед выполнением; " +
                  "5) какие операции могут быть платными; " +
                  "6) где возможна бесплатная обработка без AI. " +
                  "Не обещай выполнение того, для чего нет подключенного инструмента. " +
                  "Отвечай кратко и структурировано на русском языке."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: task
              }
            ]
          }
        ]
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
