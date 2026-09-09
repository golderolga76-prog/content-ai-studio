import Replicate from "replicate";
import { verifyAndConsumeAccess } from "../../lib/supabaseServer";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(request) {
  try {
    const access = await verifyAndConsumeAccess(request, 1);
    if (!access.allowed) {
      return Response.json(
        { error: access.error },
        { status: access.status || 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json(
        { error: "Файл не передан." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";

    const imageDataUrl = `data:${mimeType};base64,${base64}`;

    const output = await replicate.run(
      "recraft-ai/recraft-remove-background",
      {
        input: {
          image: imageDataUrl,
        },
      }
    );

    const outputUrl =
      typeof output === "string"
        ? output
        : output?.url
        ? output.url()
        : Array.isArray(output)
        ? output[0]
        : null;

    if (!outputUrl) {
      return Response.json(
        { error: "Replicate не вернул готовое изображение." },
        { status: 500 }
      );
    }

    return Response.json({
      url: outputUrl,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { error: error?.message || "Не удалось удалить фон." },
      { status: 500 }
    );
  }
}
