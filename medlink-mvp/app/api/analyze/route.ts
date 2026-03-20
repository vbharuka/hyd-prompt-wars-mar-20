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

    const vertex_ai = new VertexAI({ project: projectId, location: location });
    const model = vertex_ai.getGenerativeModel({
      model: "gemini-2.0-flash-lite-preview-02-05", // Using Gemini 2.0 Flash Lite for ultra-fast latency with preview identifier
      systemInstruction: {
        role: "system",
        parts: [{ text: `You are an expert Indian Medical Scribe. 
Extract the following information from handwritten prescriptions and lab reports:
1. patient_info (name, age, gender)
2. medications (name, dosage, frequency, instructions)
3. vitals (bp, pulse, weight)
4. critical_alerts
5. detected_language (the language of the original document)

Rules:
- Handwriting Analysis: Decipher messy and overlapping text carefully.
- Regional Translation: Translate Hindi, Tamil, or any local medical terms into standard clinical English.
- Safety First: If a medication dosage is ambiguous, flag it as 'UNVERIFIED_AMBIGUOUS'—never guess.
- Formatting: ALWAYS return valid JSON following the schema. If data is missing for a field, leave it null or as an empty array as appropriate.` }]
      },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2, // Lower temperature for more deterministic JSON output
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
