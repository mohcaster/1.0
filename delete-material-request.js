// netlify/functions/delete-material-request.js
import { supabase, createErrorResponse, createSuccessResponse } from './_common/supabaseClient.js';

export default async (req) => {
  if (req.method !== 'DELETE') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const idParam = url.searchParams.get('id');
    const id = idParam ? parseInt(idParam, 10) : null;

    if (!id || isNaN(id)) {
      return createErrorResponse('Missing or invalid request ID query parameter', 400);
    }

    const { error, count } = await supabase
      .from('material_requests')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      return createErrorResponse('Database delete error', 500, error);
    }

    if (count === 0) {
       return createErrorResponse('Material request not found', 404);
    }

    return createSuccessResponse({ message: 'Material request deleted successfully' });

  } catch (err) {
    return createErrorResponse('Internal Server Error', 500, err);
  }
};

 export const config = { path: "/api/delete-material-request" };