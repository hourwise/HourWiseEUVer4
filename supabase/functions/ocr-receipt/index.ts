import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const OCR_API_KEY = Deno.env.get('OCR_API_KEY');

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(
    JSON.stringify(body),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    }
  );

serve(async (req) => {
  // This is needed to handle a CORS preflight request.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!OCR_API_KEY) {
      return jsonResponse({ error: 'OCR service is not configured. Set the OCR_API_KEY Supabase secret.' }, 500);
    }

    const { image } = await req.json();
    if (!image) {
      return jsonResponse({ error: 'No image data provided.' }, 400);
    }

    if (typeof image !== 'string') {
      return jsonResponse({ error: 'Invalid image data provided.' }, 400);
    }

    const formData = new FormData();
    formData.append('base64Image', `data:image/jpeg;base64,${image}`);
    formData.append('isOverlayRequired', 'false');
    formData.append('apikey', OCR_API_KEY);
    formData.append('language', 'eng');
    formData.append('scale', 'true');
    formData.append('detectOrientation', 'true');

    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    if (!ocrResponse.ok) {
      return jsonResponse(
        { error: `OCR provider returned HTTP ${ocrResponse.status}.` },
        502
      );
    }

    const ocrData = await ocrResponse.json();

    if (ocrData.IsErroredOnProcessing) {
      const message = Array.isArray(ocrData.ErrorMessage)
        ? ocrData.ErrorMessage.join(', ')
        : ocrData.ErrorMessage;
      return jsonResponse(
        { error: message || 'Failed to process image with OCR service.' },
        422
      );
    }

    const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || '';

    return jsonResponse({ text: extractedText }, 200);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected OCR error.';
    return jsonResponse({ error: message }, 500);
  }
});
