export const MEDICAL_PROMPT = `
Analyze this medical document (Prescription/Lab Report). 
1. Extract: Patient Name, Date, Clinic Name.
2. Medications: List Name, Dosage, and Frequency (e.g., 1-0-1).
3. Symptoms: List mentioned complaints (e.g., Fever, Cough).
4. Language: If written in Hindi/Tamil/Telugu, translate medical terms to English.
5. Formatting: Return ONLY a valid JSON object matching the requested schema.
`;