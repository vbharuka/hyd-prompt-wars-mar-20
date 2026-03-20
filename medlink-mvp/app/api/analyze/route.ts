import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  image: z.string().min(1, "Base64 image data is required"),
  mimeType: z.string().min(1, "MIME type is required (e.g., image/jpeg)"),
});

const ExtractionSchema = z.object({
  patient_info: z.object({
    name: z.string(),
    age: z.number().nullable().optional(),
    gender: z.string().nullable().optional(),
  }),
  medications: z.array(
    z.object({
      name: z.string(),
      dosage: z.string(),
      frequency: z.string(),
      instructions: z.string(),
    })
  ),
  vitals: z.object({
    bp: z.string().nullable().optional(),
    pulse: z.number().nullable().optional(),
    weight: z.string().nullable().optional(),
  }),
  critical_alerts: z.array(z.string()),
  detected_language: z.string(),
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY environment variable is not configured" },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.0-flash",
      systemInstruction: "You are an expert Indian Medical Scribe. Your task is to extract data from handwritten prescriptions or lab reports. Decipher messy handwriting. Translate Hindi/regional terms to English. If a dosage looks dangerous or a common interaction is present, add it to critical_alerts. If data is missing, leave it null—do not hallucinate.",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    let responseResult;
    try {
      responseResult = await model.generateContent([
        {
          inlineData: {
            data: image,
            mimeType: mimeType,
          },
        },
      ]);
    } catch (genError: any) {
      // 4. Error Handling: If Gemini fails or the image is unreadable, return a clear 400 error
      return NextResponse.json(
        { error: "Failed to process the image. The image might be unreadable or too complex." },
        { status: 400 }
      );
    }

    const responseText = responseResult.response.text();

    let parsedJson;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (parseError) {
      return NextResponse.json(
        { error: "Failed to parse model response into JSON. The image might be unreadable." },
        { status: 400 }
      );
    }

    // Parse the result using the Zod schema
    const extractionValidation = ExtractionSchema.safeParse(parsedJson);

    if (!extractionValidation.success) {
      return NextResponse.json(
        {
          error: "Extracted data does not match the expected schema structure. The image might be unreadable or missing required sections.",
          details: extractionValidation.error.format(),
        },
        { status: 400 }
      );
    }

    // return the validated JSON
    return NextResponse.json(extractionValidation.data);
  } catch (error: any) {
    console.error("Error processing medical document:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
