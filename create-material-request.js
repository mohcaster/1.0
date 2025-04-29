// netlify/functions/create-material-request.js
import { supabase, createErrorResponse, createSuccessResponse } from './_common/supabaseClient.js';

export default async (req) => {
  if (req.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const requestData = await req.json();

    // Validation
    if (!requestData.material_type || !requestData.team || !requestData.priority || !requestData.quantity) {
       return createErrorResponse('Missing required material request fields', 400);
    }
     if (typeof requestData.quantity !== 'number' || requestData.quantity <= 0) {
        return createErrorResponse('Invalid quantity', 400);
    }


    const { data, error } = await supabase
      .from('material_requests')
      .insert([
        {
          material_type: requestData.material_type,
          team: requestData.team,
          priority: requestData.priority,
          quantity: requestData.quantity,
          // status defaults to 'pending' in DB
        },
      ])
      .select()
      .single();

    if (error) {
      return createErrorResponse('Database insert error', 500, error);
    }

    return createSuccessResponse({ message: 'Material request created successfully', request: data }, 201);

  } catch (err) {
     if (err instanceof SyntaxError) {
         return createErrorResponse('Invalid JSON body', 400);
    }
    return createErrorResponse('Internal Server Error', 500, err);
  }
};

export const config = { path: "/api/create-material-request" };