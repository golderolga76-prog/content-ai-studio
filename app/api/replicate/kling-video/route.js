import Replicate from "replicate";

export const maxDuration = 300;

function getOutputUrl(output) {
  if (typeof output === "string") return output;
  if (output && typeof output.url === "function") return output.url().toString();
  if (Array.isArray(output) && output[0]) return getOutputUrl(output[0]);
  return null;
}

export async function POST(request) {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      return Response.json({ error: "REPLICATE_API_TOKEN не настроен." }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const prompt = String(formData.get("prompt") || "").trim();
    const duration = Number(formData.get("duration") || 5);
    const resolution = String(formData.get("resolution") || "720p");

    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return Response.json({ error: "Загрузите исходное изображение." }, { status: 400 });
    }
    if (!prompt) return Response.json({ error: "Опишите движение или сцену." }, { status: 400 });
    if (![5, 10].includes(duration)) {
      return Response.json({ error: "Kling поддерживает длительность 5 или 10 секунд." }, { status: 400 });
    }
    if (!["720p", "1080p"].includes(resolution)) {
      return Response.json({ error: "Kling поддерживает разрешение 720p или 1080p." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const image = `data:${file.type};base64,${bytes.toString("base64")}`;
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    const output = await replicate.run("kwaivgi/kling-v2.1", {
      input: { image, prompt, duration, resolution },
    });
    const videoUrl = getOutputUrl(output);

    if (!videoUrl) return Response.json({ error: "Kling не вернул ссылку на видео." }, { status: 502 });
    return Response.json({ videoUrl, duration, resolution });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка генерации видео." }, { status: 500 });
  }
}
