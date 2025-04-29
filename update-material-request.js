// netlify/functions/update-material-request.js
import { supabase, createErrorResponse, createSuccessResponse } from './_common/supabaseClient.js';

export default async (req) => {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const { id, updates } = await req.json();

    if (!id || typeof id !== 'number' || !updates || typeof updates !== 'object') {
        return createErrorResponse('Missing or invalid request ID or update data', 400);
    }

    // Prepare sanitized updates (only allow status for now)
    const sanitizedUpdates = {};
    let hasUpdates = false;

    if (updates.hasOwnProperty('status')) {
        if (updates.status === 'delivered' || updates.status === 'pending') {
             sanitizedUpdates.status = updates.status;
             // Set/clear delivered_at timestamp based on status
             sanitizedUpdates.delivered_at = (updates.status === 'delivered') ? new Date().toISOString() : null;
             hasUpdates = true;
        } else {
            return createErrorResponse('Invalid status value', 400);
        }
    }

    if (!hasUpdates) {
        return createErrorResponse('No valid fields provided for update (only status allowed)', 400);
    }

    const { data, error } = await supabase
      .from('material_requests')
      .update(sanitizedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
         return createErrorResponse('Material request not found', 404);
      }
      return createErrorResponse('Database update error', 500, error);
    }

    if (!data) {
         return createErrorResponse('Request not found after update', 404);
    }

    return createSuccessResponse({ message: 'Material request updated successfully', request: data });

  } catch (err) {
    if (err instanceof SyntaxError) {
         return createErrorResponse('Invalid JSON body', 400);
    }
    return createErrorResponse('Internal Server Error', 500, err);
  }
};

export const config = { path: "/api/update-material-request" };