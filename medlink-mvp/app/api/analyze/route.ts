import { VertexAI } from "@google-cloud/vertexai";
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

    // Utilize Vertex AI natively securely authenticated inside Cloud Run Environment Service Identity.
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "prompt-wars-hyd-mar-20";
    const location = "us-central1"; // Routing AI API specifically to us-central1 where next-generation models launch first

    const vertex_ai = new VertexAI({ project: projectId, location: "us-central1" });
    const model = vertex_ai.getGenerativeModel({
      model: "gemini-1.5-flash", // Reverting to Google Cloud Vertex universal stable structure since 3.0 lacks publisher integration
      systemInstruction: "You are an expert Indian Medical Scribe. Your task is to extract data from handwritten prescriptions or lab reports. Decipher messy handwriting. Translate Hindi/regional terms to English. If a dosage looks dangerous or a common interaction is present, add it to critical_alerts. If data is missing, leave it null—do not hallucinate.",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    let responseResult;
    try {
      responseResult = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: image,
                  mimeType: mimeType,
                },
              },
            ],
          },
        ],
      });
    } catch (genError: any) {
      return NextResponse.json(
        { error: "Failed to process the image. " + genError.message },
        { status: 400 }
      );
    }

    let responseText = "";
    if (responseResult.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = responseResult.response.candidates[0].content.parts[0].text;
    }
    
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
