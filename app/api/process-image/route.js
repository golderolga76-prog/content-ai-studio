import sharp from "sharp";
import { verifyAndConsumeAccess } from "../../lib/supabaseServer";

export async function POST(request) {
  try {
    const access = await verifyAndConsumeAccess(request, 0);
    if (!access.allowed) {
      return Response.json(
        { error: access.error },
        { status: access.status || 403 }
      );
    }

    const formData = await request.formData();

    const file = formData.get("file");
    const width = Number(formData.get("width") || 340);
    const height = Number(formData.get("height") || 340);
    const format = String(formData.get("format") || "jpg").toLowerCase();

    if (!file) {
      return Response.json(
        { error: "Файл не передан." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    let image = sharp(inputBuffer)
      .rotate()
      .resize(width, height, {
        fit: "contain",
        background: {
          r: 255,
          g: 255,
          b: 255,
          alpha: 1,
        },
      });

    let outputBuffer;
    let contentType;

    if (format === "png") {
      outputBuffer = await image.png().toBuffer();
      contentType = "image/png";
    } else if (format === "webp") {
      outputBuffer = await image.webp({ quality: 90 }).toBuffer();
      contentType = "image/webp";
    } else {
      outputBuffer = await image.jpeg({ quality: 92 }).toBuffer();
      contentType = "image/jpeg";
    }

    return new Response(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="processed.${format}"`,
      },
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { error: "Не удалось обработать изображение." },
      { status: 500 }
    );
  }
}
