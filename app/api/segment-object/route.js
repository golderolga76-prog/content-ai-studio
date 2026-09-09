import Replicate from "replicate";
import { verifyAndConsumeAccess } from "../../lib/supabaseServer";

export const runtime = "nodejs";

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
    const objectPrompt = formData.get("objectPrompt");

    if (!file) {
      return Response.json(
        { error: "Изображение не загружено." },
        { status: 400 }
      );
    }

    if (!objectPrompt || !objectPrompt.trim()) {
      return Response.json(
        { error: "Не указан объект для выделения." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const imageBuffer = Buffer.from(bytes);

    const output = await replicate.run(
      "schananas/grounded_sam:ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c",
      {
        input: {
          image: imageBuffer,
          mask_prompt: objectPrompt.trim(),
          negative_mask_prompt: "",
          adjustment_factor: 0,
        },
      }
    );

    const items = Array.isArray(output) ? output : [output];

    const urls = items
      .map((item) => {
        if (item && typeof item.url === "function") {
          return item.url();
        }

        return item ? String(item) : null;
      })
      .filter(Boolean);

    if (!urls.length) {
      throw new Error("Модель не вернула результат.");
    }

    return Response.json({
      success: true,
      urls,
    });
  } catch (error) {
    console.error("Grounded SAM error:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "Не удалось выделить объект на изображении.",
      },
      { status: 500 }
    );
  }
}
