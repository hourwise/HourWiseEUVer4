import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// IMPORTANT: Paste your OCR.space API key here
const OCR_API_KEY = Deno.env.get('OCR_API_KEY');

serve(async (req) => {
  // This is needed to handle a CORS preflight request.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();
    if (!image) {
      throw new Error('No image data provided.');
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

    const ocrData = await ocrResponse.json();

    if (ocrData.IsErroredOnProcessing) {
      throw new Error(ocrData.ErrorMessage || 'Failed to process image with OCR service.');
    }

    const extractedText = ocrData.ParsedResults[0]?.ParsedText || '';

    return new Response(
      JSON.stringify({ text: extractedText }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
