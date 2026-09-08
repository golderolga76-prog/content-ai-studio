import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");
    const prompt = formData.get("prompt");

    if (!file) {
      return Response.json(
        { error: "Изображение не загружено." },
        { status: 400 }
      );
    }

    if (!prompt || !prompt.trim()) {
      return Response.json(
        { error: "Не указана инструкция для обработки изображения." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const mimeType = file.type || "image/jpeg";

    const inputImage = `data:${mimeType};base64,${base64}`;

    const output = await replicate.run(
      "black-forest-labs/flux-kontext-pro",
      {
        input: {
          prompt: prompt.trim(),
          input_image: inputImage,
          aspect_ratio: "match_input_image",
          output_format: "jpg",
          safety_tolerance: 2,
        },
      }
    );

    const outputUrl =
      typeof output?.url === "function"
        ? output.url()
        : String(output);

    return Response.json({
      success: true,
      imageUrl: outputUrl,
    });
  } catch (error) {
    console.error("FLUX Kontext error:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "Не удалось обработать изображение через FLUX Kontext Pro.",
      },
      { status: 500 }
    );
  }
}
