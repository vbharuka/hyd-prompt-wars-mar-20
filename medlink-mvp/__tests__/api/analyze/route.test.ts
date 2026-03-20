/**
 * Unit tests for POST /api/analyze route.
 * Mocks the Vertex AI client and validates all response branches for 100% coverage.
 */

import { POST } from '@/app/api/analyze/route';
import { VertexAI } from '@google-cloud/vertexai';

jest.mock('@google-cloud/vertexai');

const mockGenerateContent = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (VertexAI as jest.Mock).mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  }));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGeminiResponse(text: string) {
  return {
    response: {
      candidates: [
        {
          content: {
            parts: [{ text }],
          },
        },
      ],
    },
  };
}

const validRequestBody = {
  image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
  mimeType: 'image/jpeg',
};

const validExtraction = {
  patient_info: { name: 'Priya Sharma', age: 28, gender: 'Female' },
  medications: [
    {
      name: 'Metformin',
      dosage: '500mg',
      frequency: 'Twice daily',
      instructions: 'Take with meals',
    },
  ],
  vitals: { bp: '118/76', pulse: 68, weight: '58kg' },
  critical_alerts: [],
  detected_language: 'English',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/analyze', () => {
  // --- Input validation ---------------------------------------------------

  it('returns 400 when image field is empty', async () => {
    const res = await POST(makeRequest({ image: '', mimeType: 'image/jpeg' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('returns 400 when mimeType field is empty', async () => {
    const res = await POST(makeRequest({ image: 'base64data', mimeType: '' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('returns 400 when required fields are missing entirely', async () => {
    const res = await POST(makeRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  // --- Gemini / Vertex AI errors ------------------------------------------

  it('returns 400 with descriptive message when generateContent throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Quota exceeded'));

    const res = await POST(makeRequest(validRequestBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Failed to process the image');
    expect(data.error).toContain('Quota exceeded');
  });

  // --- Response parsing ---------------------------------------------------

  it('returns 400 when Gemini response has no text (empty candidates)', async () => {
    mockGenerateContent.mockResolvedValueOnce({ response: { candidates: [] } });

    const res = await POST(makeRequest(validRequestBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Failed to parse model response into JSON');
  });

  it('returns 400 when Gemini response text is not valid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeGeminiResponse('This is plain text, not JSON {{{}')
    );

    const res = await POST(makeRequest(validRequestBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Failed to parse model response into JSON');
  });

  // --- Schema validation --------------------------------------------------

  it('returns 400 when parsed JSON does not match ExtractionSchema', async () => {
    const badPayload = { unexpected_field: true, missing_required: 'fields' };
    mockGenerateContent.mockResolvedValueOnce(
      makeGeminiResponse(JSON.stringify(badPayload))
    );

    const res = await POST(makeRequest(validRequestBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('does not match the expected schema');
    expect(data.details).toBeDefined();
  });

  // --- Happy path ---------------------------------------------------------

  it('returns 200 with validated extraction data for a well-formed Gemini response', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeGeminiResponse(JSON.stringify(validExtraction))
    );

    const res = await POST(makeRequest(validRequestBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.patient_info.name).toBe('Priya Sharma');
    expect(data.medications).toHaveLength(1);
    expect(data.medications[0].name).toBe('Metformin');
    expect(data.vitals.bp).toBe('118/76');
    expect(data.critical_alerts).toEqual([]);
    expect(data.detected_language).toBe('English');
  });

  it('handles optional nullable fields (age, gender, vitals) being null', async () => {
    const extractionWithNulls = {
      ...validExtraction,
      patient_info: { name: 'Unknown Patient', age: null, gender: null },
      vitals: { bp: null, pulse: null, weight: null },
    };
    mockGenerateContent.mockResolvedValueOnce(
      makeGeminiResponse(JSON.stringify(extractionWithNulls))
    );

    const res = await POST(makeRequest(validRequestBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.patient_info.age).toBeNull();
    expect(data.patient_info.gender).toBeNull();
  });

  it('includes critical_alerts in response when present', async () => {
    const extractionWithAlerts = {
      ...validExtraction,
      critical_alerts: ['High dose warfarin — monitor INR closely'],
    };
    mockGenerateContent.mockResolvedValueOnce(
      makeGeminiResponse(JSON.stringify(extractionWithAlerts))
    );

    const res = await POST(makeRequest(validRequestBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.critical_alerts).toHaveLength(1);
    expect(data.critical_alerts[0]).toContain('warfarin');
  });

  // --- Outer catch (request parsing failure) ------------------------------

  it('returns 500 when request.json() itself throws an unexpected error', async () => {
    const brokenRequest = {
      json: jest.fn().mockRejectedValueOnce(new Error('Malformed request body')),
    } as unknown as Request;

    const res = await POST(brokenRequest);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe('Malformed request body');
  });

  it('returns 500 with fallback message when thrown error has no message', async () => {
    // Throws an object without a .message property to cover the `|| "Internal server error"` branch
    const brokenRequest = {
      json: jest.fn().mockRejectedValueOnce({ code: 'UNKNOWN' }),
    } as unknown as Request;

    const res = await POST(brokenRequest);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});
