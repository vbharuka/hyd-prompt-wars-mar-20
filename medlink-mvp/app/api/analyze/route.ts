import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  image: z.string().min(1, "Base64 image data is required"),
  mimeType: z.string().min(1, "MIME type is required (e.g., image/jpeg)"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = RequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.format() },
        { status: 400 }
      );
    }

    const { image, mimeType } = validationResult.data;

    // Initialize Generative AI SDK, using GEMINI_API_KEY env var
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY environment variable is not configured" },
        { status: 500 }
      );
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); // Multimodal model

    const systemPrompt = `You are a Medical Scribe Agent specializing in Indian healthcare. Your goal is to process messy, handwritten prescriptions and lab reports.

Handwriting Analysis: Use Multimodal reasoning to decipher doctor handwriting.
Regional Translation: Translate Hindi/Tamil/local terms into standard clinical English.
Structure: Always output valid JSON using the FHIR (Fast Healthcare Interoperability Resources) standard where possible.
Safety First: If a medication dosage is ambiguous, flag it as 'UNVERIFIED_AMBIGUOUS'—never guess.

Analyze the provided image and output the requested FHIR standard JSON. Do not include markdown blocks or any other text outside the JSON.`;

    const responseResult = await model.generateContent([
      systemPrompt,
      {
        inlineData: {
          data: image,
          mimeType: mimeType,
        },
      },
    ]);

    const responseText = responseResult.response.text();
    
    let parsedJson;
    try {
      // Clean up markdown syntax if accidentally produced
      const cleanText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
      parsedJson = JSON.parse(cleanText);
    } catch (parseError) {
      console.warn("Could not parse output as JSON, returning raw text", parseError);
      parsedJson = { rawOutput: responseText };
    }

    return NextResponse.json({ success: true, data: parsedJson });
  } catch (error: any) {
    console.error("Error processing medical document:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
